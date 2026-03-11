import { getDb } from "./db";
import { historicalCandleCache, cacheMetadata } from "../drizzle/schema";
import { fetchHistoricalCandles, fetchAlpacaBatchCandles } from "./marketData";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import type { Timeframe } from "./indicators";

export interface Candle {
  time: number; // ms timestamp
  date?: string; // optional for backward compatibility
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 缓存的时间级别（基准周期，聚合周期由 marketData 在内存中完成）
const CACHE_TIMEFRAMES: Timeframe[] = ["1d", "1h", "15m"];

// 每个时间级别的默认历史深度（年）
const HISTORY_YEARS: Record<string, number> = {
  "1d":  10,
  "1h":  5,
  "15m": 5,
};

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ============================================================
// 基础读写
// ============================================================

/**
 * 从缓存中获取 K 线数据
 */
export async function getCandlesFromCache(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string
): Promise<Candle[] | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const candles = await db
      .select({
        date: historicalCandleCache.date,
        open: historicalCandleCache.open,
        high: historicalCandleCache.high,
        low: historicalCandleCache.low,
        close: historicalCandleCache.close,
        volume: historicalCandleCache.volume,
      })
      .from(historicalCandleCache)
      .where(
        and(
          eq(historicalCandleCache.symbol, symbol),
          eq(historicalCandleCache.timeframe, timeframe),
          gte(historicalCandleCache.date, startDate),
          lte(historicalCandleCache.date, endDate)
        )
      )
      .orderBy(historicalCandleCache.date);

    if (candles.length === 0) return null;

    return candles.map((c) => ({
      time: new Date(c.date).getTime(),
      date: c.date,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
    }));
  } catch (error) {
    console.error(`[Cache] Error fetching from cache for ${symbol}/${timeframe}:`, error);
    return null;
  }
}

/**
 * 将 K 线数据保存到缓存（忽略重复）
 */
export async function saveCandlesToCache(
  symbol: string,
  timeframe: string,
  candles: Candle[]
): Promise<void> {
  if (candles.length === 0) return;

  try {
    const db = await getDb();
    if (!db) return;

    // 批量插入（分批处理，忽略重复 key）
    const batchSize = 500;
    for (let i = 0; i < candles.length; i += batchSize) {
      const batch = candles.slice(i, i + batchSize);
      await db
        .insert(historicalCandleCache)
        .values(
          batch.map((c) => ({
            symbol,
            timeframe,
            date: c.date ?? new Date(c.time).toISOString().split("T")[0],
            open: c.open.toString(),
            high: c.high.toString(),
            low: c.low.toString(),
            close: c.close.toString(),
            volume: c.volume,
          }))
        )
        .onDuplicateKeyUpdate({
          set: {
            open: candles[i].open.toString(),
            high: candles[i].high.toString(),
            low: candles[i].low.toString(),
            close: candles[i].close.toString(),
            volume: candles[i].volume,
          },
        });
    }

    // 更新元数据
    const sortedDates = candles.map((c) => c.date ?? new Date(c.time).toISOString().split("T")[0]).sort();
    const earliestDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];

    await db
      .insert(cacheMetadata)
      .values({
        symbol,
        status: "completed",
        earliestDate,
        latestDate,
        totalCandles: candles.length,
      })
      .onDuplicateKeyUpdate({
        set: {
          lastUpdated: new Date(),
          status: "completed",
          latestDate,
          totalCandles: candles.length,
          errorMessage: null,
        },
      });

    console.log(`[Cache] Saved ${candles.length} candles for ${symbol}/${timeframe}`);
  } catch (error) {
    console.error(`[Cache] Error saving candles for ${symbol}/${timeframe}:`, error);
  }
}

// ============================================================
// 增量缓存：检查已缓存范围，只请求新数据
// ============================================================

/**
 * 获取某股票某时间级别的已缓存日期范围
 */
async function getCachedDateRange(
  symbol: string,
  timeframe: string
): Promise<{ earliest: string | null; latest: string | null }> {
  try {
    const db = await getDb();
    if (!db) return { earliest: null, latest: null };

    const rows = await db
      .select({
        date: historicalCandleCache.date,
      })
      .from(historicalCandleCache)
      .where(
        and(
          eq(historicalCandleCache.symbol, symbol),
          eq(historicalCandleCache.timeframe, timeframe)
        )
      )
      .orderBy(historicalCandleCache.date)
      .limit(1);

    const lastRows = await db
      .select({
        date: historicalCandleCache.date,
      })
      .from(historicalCandleCache)
      .where(
        and(
          eq(historicalCandleCache.symbol, symbol),
          eq(historicalCandleCache.timeframe, timeframe)
        )
      )
      .orderBy(historicalCandleCache.date)
      .limit(1);

    // 用 SQL 直接获取 min/max
    const { sql: sqlFn } = await import("drizzle-orm");
    const result = await db
      .select({
        earliest: sqlFn<string>`MIN(date)`,
        latest: sqlFn<string>`MAX(date)`,
      })
      .from(historicalCandleCache)
      .where(
        and(
          eq(historicalCandleCache.symbol, symbol),
          eq(historicalCandleCache.timeframe, timeframe)
        )
      );

    return {
      earliest: result[0]?.earliest ?? null,
      latest: result[0]?.latest ?? null,
    };
  } catch {
    return { earliest: null, latest: null };
  }
}

/**
 * 增量缓存单个股票：只请求未缓存的日期范围
 * - 如果从未缓存：请求全量（5-10年）
 * - 如果已缓存：只请求 latestDate+1 到今天的新数据
 */
export async function incrementalCacheStock(
  symbol: string,
  timeframe: Timeframe,
  forceFullHistory = false
): Promise<{ symbol: string; timeframe: string; newCandles: number; skipped: boolean }> {
  const today = formatDate(new Date());
  const { latest } = await getCachedDateRange(symbol, timeframe);

  // 如果已缓存到今天，跳过
  if (!forceFullHistory && latest && latest >= today) {
    return { symbol, timeframe, newCandles: 0, skipped: true };
  }

  // 确定请求范围
  let startDate: string;
  if (!forceFullHistory && latest) {
    // 增量：从最后缓存日期的下一天开始
    const nextDay = new Date(latest);
    nextDay.setDate(nextDay.getDate() + 1);
    startDate = formatDate(nextDay);
  } else {
    // 全量：从 N 年前开始
    const years = HISTORY_YEARS[timeframe] || 5;
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    startDate = formatDate(d);
  }

  if (startDate > today) {
    return { symbol, timeframe, newCandles: 0, skipped: true };
  }

  try {
    const candles = await fetchHistoricalCandles(symbol, timeframe, startDate, today);
    if (candles.length > 0) {
      const formatted = candles.map((c) => ({
        time: c.time,
        date: new Date(c.time).toISOString().split("T")[0],
        open: typeof c.open === "string" ? parseFloat(c.open) : c.open,
        high: typeof c.high === "string" ? parseFloat(c.high) : c.high,
        low: typeof c.low === "string" ? parseFloat(c.low) : c.low,
        close: typeof c.close === "string" ? parseFloat(c.close) : c.close,
        volume: typeof c.volume === "string" ? parseFloat(c.volume) : c.volume,
      }));
      await saveCandlesToCache(symbol, timeframe, formatted);
      return { symbol, timeframe, newCandles: candles.length, skipped: false };
    }
    return { symbol, timeframe, newCandles: 0, skipped: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Cache] incrementalCacheStock failed for ${symbol}/${timeframe}: ${msg}`);
    throw err;
  }
}

// ============================================================
// Alpaca 批量增量缓存：多股票一次 API 调用
// ============================================================

/**
 * 批量增量缓存：对一批股票，用 Alpaca 批量 API 一次请求
 * 每批最多 50 支股票
 */
export async function batchIncrementalCacheAlpaca(
  symbols: string[],
  timeframe: Timeframe
): Promise<Map<string, { newCandles: number; error?: string }>> {
  const today = formatDate(new Date());
  const results = new Map<string, { newCandles: number; error?: string }>();

  // 查询每个 symbol 的最新缓存日期
  const latestDates = new Map<string, string | null>();
  for (const sym of symbols) {
    const { latest } = await getCachedDateRange(sym, timeframe);
    latestDates.set(sym, latest);
  }

  // 按 startDate 分组（相同 startDate 的可以一批请求）
  const years = HISTORY_YEARS[timeframe] || 5;
  const fullHistoryStart = formatDate(new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000));

  // 筛选需要更新的 symbols
  const needUpdate: string[] = [];
  for (const sym of symbols) {
    const latest = latestDates.get(sym);
    if (!latest || latest < today) {
      needUpdate.push(sym);
    } else {
      results.set(sym, { newCandles: 0 });
    }
  }

  if (needUpdate.length === 0) return results;

  // 确定统一的 startDate（取所有需要更新的 symbol 中最早的 latestDate）
  // 为简化，统一用全量历史起点（Alpaca 会自动只返回有数据的部分）
  // 对于已有缓存的 symbol，只请求增量
  const incrementalSymbols: string[] = [];
  const fullSymbols: string[] = [];

  for (const sym of needUpdate) {
    const latest = latestDates.get(sym);
    if (latest) {
      incrementalSymbols.push(sym);
    } else {
      fullSymbols.push(sym);
    }
  }

  // 处理全量请求（从未缓存的）
  if (fullSymbols.length > 0) {
    try {
      const batchResult = await fetchAlpacaBatchCandles(fullSymbols, timeframe, fullHistoryStart, today);
      for (const sym of fullSymbols) {
        const candles = batchResult.get(sym) || [];
        if (candles.length > 0) {
          const formatted = candles.map((c) => ({
            ...c,
            date: new Date(c.time).toISOString().split("T")[0],
          }));
          await saveCandlesToCache(sym, timeframe, formatted);
          results.set(sym, { newCandles: candles.length });
        } else {
          results.set(sym, { newCandles: 0 });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const sym of fullSymbols) {
        results.set(sym, { newCandles: 0, error: msg });
      }
    }
  }

  // 处理增量请求（已有缓存，只请求最新数据）
  // 按 latestDate 分组，相同 latestDate 的一批请求
  const byLatestDate = new Map<string, string[]>();
  for (const sym of incrementalSymbols) {
    const latest = latestDates.get(sym) || fullHistoryStart;
    const nextDay = new Date(latest);
    nextDay.setDate(nextDay.getDate() + 1);
    const startDate = formatDate(nextDay);
    if (startDate > today) {
      results.set(sym, { newCandles: 0 });
      continue;
    }
    const existing = byLatestDate.get(startDate) || [];
    existing.push(sym);
    byLatestDate.set(startDate, existing);
  }

  for (const [startDate, syms] of Array.from(byLatestDate.entries())) {
    try {
      const batchResult = await fetchAlpacaBatchCandles(syms, timeframe, startDate, today);
      for (const sym of syms) {
        const candles = batchResult.get(sym) || [];
        if (candles.length > 0) {
          const formatted = candles.map((c) => ({
            ...c,
            date: new Date(c.time).toISOString().split("T")[0],
          }));
          await saveCandlesToCache(sym, timeframe, formatted);
          results.set(sym, { newCandles: candles.length });
        } else {
          results.set(sym, { newCandles: 0 });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const sym of syms) {
        results.set(sym, { newCandles: 0, error: msg });
      }
    }
  }

  return results;
}

// ============================================================
// 后台持续缓存任务（全量，限速自动恢复）
// ============================================================

export interface WarmupProgress {
  running: boolean;
  total: number;
  completed: number;
  failed: number;
  currentSymbol: string;
  currentTimeframe: string;
  startedAt: Date | null;
  estimatedFinishAt: Date | null;
  errors: Array<{ symbol: string; timeframe: string; error: string }>;
  paused: boolean;
  pauseUntil: Date | null;
}

const warmupState: WarmupProgress = {
  running: false,
  total: 0,
  completed: 0,
  failed: 0,
  currentSymbol: "",
  currentTimeframe: "",
  startedAt: null,
  estimatedFinishAt: null,
  errors: [],
  paused: false,
  pauseUntil: null,
};

let warmupAbortFlag = false;

export function getWarmupProgress(): WarmupProgress {
  return { ...warmupState };
}

export function stopWarmup(): void {
  warmupAbortFlag = true;
  warmupState.running = false;
}

/**
 * 后台全量缓存任务
 * - 使用 Alpaca 批量 API（每批 50 支）
 * - 遇到 429 自动等待 60 秒后继续
 * - 支持增量（只缓存未缓存或过期的数据）
 * - 可跨天运行，直到全部完成
 */
export async function startBackgroundWarmup(
  symbols: string[],
  timeframes: Timeframe[] = ["1d", "1h", "15m"],
  batchSize = 50
): Promise<void> {
  if (warmupState.running) {
    console.log("[Warmup] Already running");
    return;
  }

  warmupAbortFlag = false;
  warmupState.running = true;
  warmupState.total = symbols.length * timeframes.length;
  warmupState.completed = 0;
  warmupState.failed = 0;
  warmupState.errors = [];
  warmupState.startedAt = new Date();
  warmupState.paused = false;
  warmupState.pauseUntil = null;

  console.log(`[Warmup] Starting background warmup: ${symbols.length} symbols × ${timeframes.length} timeframes`);

  try {
    for (const timeframe of timeframes) {
      if (warmupAbortFlag) break;

      // 按批次处理
      for (let i = 0; i < symbols.length; i += batchSize) {
        if (warmupAbortFlag) break;

        const batch = symbols.slice(i, i + batchSize);
        warmupState.currentTimeframe = timeframe;
        warmupState.currentSymbol = batch[0];

        let retries = 0;
        const maxRetries = 10;

        while (retries < maxRetries) {
          try {
            const batchResults = await batchIncrementalCacheAlpaca(batch, timeframe);

            for (const sym of batch) {
              const r = batchResults.get(sym);
              if (r?.error) {
                warmupState.failed++;
                warmupState.errors.push({ symbol: sym, timeframe, error: r.error });
                if (warmupState.errors.length > 100) warmupState.errors.shift();
              } else {
                warmupState.completed++;
              }
            }

            // 更新预计完成时间
            const elapsed = Date.now() - warmupState.startedAt!.getTime();
            const rate = warmupState.completed / elapsed; // items/ms
            const remaining = warmupState.total - warmupState.completed - warmupState.failed;
            if (rate > 0) {
              warmupState.estimatedFinishAt = new Date(Date.now() + remaining / rate);
            }

            break; // 成功，退出重试循环
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const is429 = msg.includes("429") || msg.includes("rate limit") || msg.includes("Too Many");

            if (is429) {
              const waitSec = Math.min(60 * Math.pow(2, retries), 3600); // 指数退避，最长 1 小时
              console.warn(`[Warmup] Rate limited (429), waiting ${waitSec}s before retry ${retries + 1}/${maxRetries}...`);
              warmupState.paused = true;
              warmupState.pauseUntil = new Date(Date.now() + waitSec * 1000);
              await new Promise((r) => setTimeout(r, waitSec * 1000));
              warmupState.paused = false;
              warmupState.pauseUntil = null;
              retries++;
            } else {
              // 非限速错误，记录并继续
              for (const sym of batch) {
                warmupState.failed++;
                warmupState.errors.push({ symbol: sym, timeframe, error: msg });
                if (warmupState.errors.length > 100) warmupState.errors.shift();
              }
              break;
            }
          }
        }

        // 批次间短暂休眠（避免触发限速）
        if (!warmupAbortFlag) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }
  } finally {
    warmupState.running = false;
    warmupState.currentSymbol = "";
    warmupState.currentTimeframe = "";
    console.log(`[Warmup] Completed: ${warmupState.completed} success, ${warmupState.failed} failed`);
  }
}

// ============================================================
// 兼容旧接口
// ============================================================

/**
 * 缓存单个股票的历史数据（5 年）- 兼容旧接口
 */
export async function cacheStockHistoricalData(symbol: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db
      .insert(cacheMetadata)
      .values({ symbol, status: "caching" })
      .onDuplicateKeyUpdate({ set: { status: "caching" } });

    let totalCandles = 0;
    for (const tf of CACHE_TIMEFRAMES) {
      try {
        await incrementalCacheStock(symbol, tf);
        totalCandles++;
      } catch (error) {
        console.warn(`[Cache] Failed to cache ${symbol}/${tf}:`, error);
      }
    }

    if (totalCandles > 0) {
      return true;
    } else {
      throw new Error("No candles fetched for any timeframe");
    }
  } catch (error) {
    console.error(`[Cache] Failed to cache ${symbol}:`, error);
    try {
      const db = await getDb();
      if (db) {
        await db
          .insert(cacheMetadata)
          .values({ symbol, status: "failed", errorMessage: String(error) })
          .onDuplicateKeyUpdate({ set: { status: "failed", errorMessage: String(error) } });
      }
    } catch {}
    return false;
  }
}

/**
 * 获取缓存状态
 */
export async function getCacheStatus(symbol: string) {
  try {
    const db = await getDb();
    if (!db) return null;
    const metadata = await db
      .select()
      .from(cacheMetadata)
      .where(eq(cacheMetadata.symbol, symbol));
    return metadata[0] || null;
  } catch (error) {
    console.error(`[Cache] Error getting cache status for ${symbol}:`, error);
    return null;
  }
}

/**
 * 获取所有待缓存的股票
 */
export async function getPendingCacheStocks() {
  try {
    const db = await getDb();
    if (!db) return [];
    const pending = await db
      .select({ symbol: cacheMetadata.symbol })
      .from(cacheMetadata)
      .where(eq(cacheMetadata.status, "pending"));
    return pending.map((p: any) => p.symbol);
  } catch (error) {
    console.error("[Cache] Error getting pending stocks:", error);
    return [];
  }
}

/**
 * 清除过期缓存（可选）
 */
export async function clearExpiredCache(symbol: string, daysOld: number = 30): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];
    await db
      .delete(historicalCandleCache)
      .where(
        and(
          eq(historicalCandleCache.symbol, symbol),
          lte(historicalCandleCache.date, cutoffDateStr)
        )
      );
    console.log(`[Cache] Cleared cache for ${symbol} older than ${daysOld} days`);
  } catch (error) {
    console.error(`[Cache] Error clearing cache for ${symbol}:`, error);
  }
}

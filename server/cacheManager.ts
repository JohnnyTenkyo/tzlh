import { getDb } from "./db";
import { historicalCandleCache, cacheMetadata } from "../drizzle/schema";
import { fetchHistoricalCandles } from "./marketData";
import { eq, and, gte, lte } from "drizzle-orm";

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
 * 将 K 线数据保存到缓存
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
    
    // 批量插入（分批处理，避免一次插入太多）
    const batchSize = 1000;
    for (let i = 0; i < candles.length; i += batchSize) {
      const batch = candles.slice(i, i + batchSize);
      await db.insert(historicalCandleCache).values(
        batch.map((c) => ({
          symbol,
          timeframe,
          date: c.date,
          open: c.open.toString(),
          high: c.high.toString(),
          low: c.low.toString(),
          close: c.close.toString(),
          volume: c.volume,
        }))
      );
    }

    // 更新元数据
    const sortedDates = candles.map((c) => c.date).sort();
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
          earliestDate,
          latestDate,
          totalCandles: candles.length,
          errorMessage: null,
        },
      });

    console.log(`[Cache] Saved ${candles.length} candles for ${symbol}/${timeframe}`);
  } catch (error) {
    console.error(`[Cache] Error saving candles for ${symbol}/${timeframe}:`, error);
    try {
      const db = await getDb();
      if (db) {
        await db
          .insert(cacheMetadata)
          .values({
            symbol,
            status: "failed",
            errorMessage: String(error),
          })
          .onDuplicateKeyUpdate({
            set: {
              status: "failed",
              errorMessage: String(error),
            },
          });
      }
    } catch (dbError) {
      console.error(`[Cache] Failed to update metadata:`, dbError);
    }
  }
}

/**
 * 缓存单个股票的历史数据（5 年）
 */
export async function cacheStockHistoricalData(symbol: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // 更新状态为 "caching"
    await db
      .insert(cacheMetadata)
      .values({
        symbol,
        status: "caching",
      })
      .onDuplicateKeyUpdate({
        set: {
          status: "caching",
        },
      });

    // 计算 5 年前的日期
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 5);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    console.log(`[Cache] Caching ${symbol} from ${startDateStr} to ${endDateStr}`);

    // 为每个时间级别获取数据
    const timeframes = ["1d", "4h", "1h", "30m", "15m"];
    let totalCandles = 0;

    for (const tf of timeframes) {
      try {
        const candles = await fetchHistoricalCandles(symbol, tf as any, startDateStr, endDateStr);
        if (candles && candles.length > 0) {
          const formattedCandles = candles.map((c: any) => ({
            date: c.date || (c.time ? new Date(c.time).toISOString().split('T')[0] : ''),
            open: typeof c.open === 'string' ? parseFloat(c.open) : c.open,
            high: typeof c.high === 'string' ? parseFloat(c.high) : c.high,
            low: typeof c.low === 'string' ? parseFloat(c.low) : c.low,
            close: typeof c.close === 'string' ? parseFloat(c.close) : c.close,
            volume: typeof c.volume === 'string' ? parseFloat(c.volume) : c.volume,
          }));
          await saveCandlesToCache(symbol, tf, formattedCandles);
          totalCandles += formattedCandles.length;
        }
      } catch (error) {
        console.warn(`[Cache] Failed to fetch ${symbol}/${tf}:`, error);
      }
    }

    if (totalCandles > 0) {
      console.log(`[Cache] Successfully cached ${symbol} with ${totalCandles} total candles`);
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
          .values({
            symbol,
            status: "failed",
            errorMessage: String(error),
          })
          .onDuplicateKeyUpdate({
            set: {
              status: "failed",
              errorMessage: String(error),
            },
          });
      }
    } catch (dbError) {
      console.error(`[Cache] Failed to update cache metadata for ${symbol}:`, dbError);
    }
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
      .where(
        and(
          eq(cacheMetadata.status, "pending"),
          eq(cacheMetadata.status, "failed")
        )
      );

    return pending.map((p) => p.symbol);
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

    // 删除指定日期之前的缓存
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

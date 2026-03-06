/**
 * 股票推荐扫描服务
 * 4321打法：多级别CD信号 + 30分钟蓝梯突破黄梯
 */
import { fetchCandles } from "./marketData";
import {
  calculate4321Score,
  TimeframeCandles,
  Strategy4321Score,
} from "./indicators";
import { getDb } from "./db";
import { stockRecommendations } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { US_STOCKS } from "../shared/stockPool";

let isScanning = false;
const scanCache: Map<string, Strategy4321Score> = new Map();
let lastScanDate = "";

/**
 * 扫描单只股票的4321信号
 */
async function scanStock(symbol: string): Promise<Strategy4321Score | null> {
  try {
    // 并行获取多时间级别K线
    const [c4h, c3h, c2h, c1h, c30m, c1d] = await Promise.all([
      fetchCandles(symbol, "4h"),
      fetchCandles(symbol, "3h"),
      fetchCandles(symbol, "2h"),
      fetchCandles(symbol, "1h"),
      fetchCandles(symbol, "30m"),
      fetchCandles(symbol, "1d"),
    ]);

    const candles: TimeframeCandles = {
      "4h": c4h,
      "3h": c3h,
      "2h": c2h,
      "1h": c1h,
      "30m": c30m,
      "1d": c1d,
    };

    return calculate4321Score(symbol, candles, 5);
  } catch (err) {
    console.error(`[Screener] Error scanning ${symbol}:`, err);
    return null;
  }
}

/**
 * 批量扫描股票池
 */
export async function runDailyScan(forceRefresh = false): Promise<Strategy4321Score[]> {
  const today = new Date().toISOString().split("T")[0];

  if (!forceRefresh && lastScanDate === today && scanCache.size > 0) {
    return Array.from(scanCache.values()).sort((a, b) => b.totalScore - a.totalScore);
  }

  if (isScanning) {
    console.log("[Screener] Scan already in progress, returning cached results");
    return Array.from(scanCache.values()).sort((a, b) => b.totalScore - a.totalScore);
  }

  isScanning = true;
  console.log(`[Screener] Starting daily scan for ${today}...`);

  const results: Strategy4321Score[] = [];
  const batchSize = 5;
  const stocksToScan = US_STOCKS.slice(0, 200).map(s => s.symbol); // 扫描前200只

  for (let i = 0; i < stocksToScan.length; i += batchSize) {
    const batch = stocksToScan.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((symbol: string) => scanStock(symbol))
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) {
        results.push(r.value);
        scanCache.set(r.value.symbol, r.value);
      }
    }

    // 避免API限流
    if (i + batchSize < stocksToScan.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // 保存到数据库
  try {
    const db = await getDb();
    if (db && results.length > 0) {
      for (const score of results) {
        // 检查今天是否已有记录
        const existing = await db.select().from(stockRecommendations)
          .where(and(
            eq(stockRecommendations.symbol, score.symbol),
            eq(stockRecommendations.date, today)
          )).limit(1);

        if (existing.length === 0) {
          await db.insert(stockRecommendations).values({
            symbol: score.symbol,
            date: today,
            totalScore: String(score.totalScore),
            matchLevel: score.matchLevel,
            cdSignalLevels: JSON.stringify(score.cdLevels),
            ladderBreakLevel: score.ladderBreakLevel,
            reason: score.reason,
            details: JSON.stringify(score.details),
          });
        }
      }
    }
  } catch (err) {
    console.error("[Screener] Failed to save results to DB:", err);
  }

  lastScanDate = today;
  isScanning = false;
  console.log(`[Screener] Scan complete. Found ${results.length} signals.`);

  return results.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * 获取今日推荐（优先从数据库读取）
 */
export async function getTodayRecommendations(): Promise<{
  results: Strategy4321Score[];
  fromCache: boolean;
  scanDate: string;
}> {
  const today = new Date().toISOString().split("T")[0];

  try {
    const db = await getDb();
    if (db) {
      const dbResults = await db.select().from(stockRecommendations)
        .where(eq(stockRecommendations.date, today));

      if (dbResults.length > 0) {
        const results: Strategy4321Score[] = dbResults.map(r => ({
          symbol: r.symbol,
          totalScore: Number(r.totalScore),
          matchLevel: r.matchLevel || "1h",
          cdLevels: r.cdSignalLevels ? JSON.parse(r.cdSignalLevels) : [],
          ladderBreakLevel: r.ladderBreakLevel || "30m",
          reason: r.reason || "",
          details: r.details ? JSON.parse(r.details) : {},
        }));

        return {
          results: results.sort((a, b) => b.totalScore - a.totalScore),
          fromCache: true,
          scanDate: today,
        };
      }
    }
  } catch (err) {
    console.error("[Screener] DB read error:", err);
  }

  // 触发实时扫描
  const results = await runDailyScan();
  return { results, fromCache: false, scanDate: today };
}

/**
 * 获取扫描状态
 */
export function getScanStatus() {
  return {
    isScanning,
    lastScanDate,
    cachedCount: scanCache.size,
  };
}

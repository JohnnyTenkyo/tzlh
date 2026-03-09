/**
 * 股票推荐扫描服务
 * 4321打法：多级别CD信号 + 30分钟蓝梯突破黄梯
 * 激进策略：CD信号出现后，30分钟收盘价站上蓝梯即买入
 */
import { fetchCandles } from "./marketData";
import {
  calculate4321Score,
  calculateAggressiveScore,
  TimeframeCandles,
  Strategy4321Score,
  AggressiveScore,
} from "./indicators";
import { getDb } from "./db";
import { stockRecommendations } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { US_STOCKS } from "@shared/stockPool";
import { notifyOwner } from "./_core/notification";

let isScanning = false;
const scanCache: Map<string, AggressiveScore> = new Map();
let lastScanDate = "";

export interface ScanResult extends AggressiveScore {
  // AggressiveScore already extends Strategy4321Score
}

/**
 * 扫描单只股票（标准4321 + 激进策略）
 */
async function scanStock(symbol: string): Promise<AggressiveScore | null> {
  try {
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

    return calculateAggressiveScore(symbol, candles, 5);
  } catch (err) {
    console.error(`[Screener] Error scanning ${symbol}:`, err);
    return null;
  }
}

/**
 * 批量扫描股票池
 */
export async function runDailyScan(forceRefresh = false): Promise<AggressiveScore[]> {
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

  const results: AggressiveScore[] = [];
  const batchSize = 5;
  const stocksToScan = US_STOCKS.map(s => s.symbol);

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

    if (i + batchSize < stocksToScan.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // 保存到数据库（保存激进策略信息到details字段）
  try {
    const db = await getDb();
    if (db && results.length > 0) {
      for (const score of results) {
        const existing = await db.select().from(stockRecommendations)
          .where(and(
            eq(stockRecommendations.symbol, score.symbol),
            eq(stockRecommendations.date, today)
          )).limit(1);

        const detailsWithAggressive = {
          ...score.details,
          aggressiveSignal: score.aggressiveSignal,
          aggressiveType: score.aggressiveType,
          aggressiveReason: score.aggressiveReason,
        };

        if (existing.length === 0) {
          await db.insert(stockRecommendations).values({
            symbol: score.symbol,
            date: today,
            totalScore: String(score.totalScore),
            matchLevel: score.matchLevel,
            cdSignalLevels: JSON.stringify(score.cdLevels),
            ladderBreakLevel: score.ladderBreakLevel,
            reason: score.reason,
            details: JSON.stringify(detailsWithAggressive),
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

  // 推送扫描完成通知
  try {
    const standardSignals = results.filter(r => !r.aggressiveSignal);
    const aggressiveSignals = results.filter(r => r.aggressiveSignal);
    
    const summary = `今日扫描完成：找到 ${results.length} 个信号\n📊 标准策略: ${standardSignals.length} 个\n⚡ 激进策略: ${aggressiveSignals.length} 个`;
    
    const topStandard = standardSignals.slice(0, 3).map(s => `${s.symbol}(${s.totalScore.toFixed(1)})`).join(", ");
    const topAggressive = aggressiveSignals.slice(0, 3).map(s => `${s.symbol}(${s.totalScore.toFixed(1)})`).join(", ");
    
    let content = summary + "\n\n";
    if (topStandard) content += `📊 标准信号TOP3: ${topStandard}\n`;
    if (topAggressive) content += `⚡ 激进信号TOP3: ${topAggressive}`;
    
    await notifyOwner({
      title: `📊 量化扫描 - ${today}`,
      content,
    });
  } catch (err) {
    console.error("[Screener] Failed to send notification:", err);
  }

  return results.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * 获取今日推荐（优先从数据库读取）
 */
export async function getTodayRecommendations(sendNotification = false): Promise<{
  results: AggressiveScore[];
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
        const results: AggressiveScore[] = dbResults.map(r => {
          const details = r.details ? JSON.parse(r.details) : {};
          return {
            symbol: r.symbol,
            totalScore: Number(r.totalScore),
            matchLevel: r.matchLevel || "",
            cdLevels: r.cdSignalLevels ? JSON.parse(r.cdSignalLevels) : [],
            ladderBreakLevel: r.ladderBreakLevel || "",
            reason: r.reason || "",
            details,
            aggressiveSignal: details.aggressiveSignal || false,
            aggressiveType: details.aggressiveType || "",
            aggressiveReason: details.aggressiveReason || "",
          };
        });

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

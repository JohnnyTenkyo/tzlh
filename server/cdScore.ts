/**
 * CD 抄底分数计算引擎
 * 
 * 分数机制（总分 100 分，严格递增）：
 * - 5m 有抄底 → 2 分
 * - 15m 有抄底 → 4 分
 * - 30m 有抄底 → 6 分
 * - 1h 有抄底 → 8 分
 * - 2h 有抄底 → 10 分
 * - 3h 有抄底 → 12 分
 * - 4h 有抄底 → 14 分
 * - 1d 有抄底 → 16 分
 * - 1w 有抄底 → 18 分
 * - 1M 有抄底 → 10 分
 * 总计：100 分
 */

import { Candle, Timeframe, calculateCDSignal } from "./indicators";

export interface CDScoreResult {
  // 各级别的 CD 抄底分数
  score5m: number;
  score15m: number;
  score30m: number;
  score1h: number;
  score2h: number;
  score3h: number;
  score4h: number;
  score1d: number;
  score1w: number;
  score1M: number;
  // 总分数（0-100）
  totalScore: number;
  // 各级别是否有抄底信号
  hasCD5m: boolean;
  hasCD15m: boolean;
  hasCD30m: boolean;
  hasCD1h: boolean;
  hasCD2h: boolean;
  hasCD3h: boolean;
  hasCD4h: boolean;
  hasCD1d: boolean;
  hasCD1w: boolean;
  hasCD1M: boolean;
}

/**
 * 计算 CD 抄底分数
 * @param timeframeCandles 各时间级别的 K 线数据
 * @returns CD 抄底分数结果
 */
export function calculateCDScore(
  timeframeCandles: Partial<Record<Timeframe | "1M", Candle[]>>
): CDScoreResult {
  const result: CDScoreResult = {
    score5m: 0,
    score15m: 0,
    score30m: 0,
    score1h: 0,
    score2h: 0,
    score3h: 0,
    score4h: 0,
    score1d: 0,
    score1w: 0,
    score1M: 0,
    totalScore: 0,
    hasCD5m: false,
    hasCD15m: false,
    hasCD30m: false,
    hasCD1h: false,
    hasCD2h: false,
    hasCD3h: false,
    hasCD4h: false,
    hasCD1d: false,
    hasCD1w: false,
    hasCD1M: false,
  };

  // 定义各级别的分数权重（严格递增）
  const scoreWeights: Record<string, [number, keyof CDScoreResult, keyof CDScoreResult]> = {
    "5m": [2, "score5m", "hasCD5m"],
    "15m": [4, "score15m", "hasCD15m"],
    "30m": [6, "score30m", "hasCD30m"],
    "1h": [8, "score1h", "hasCD1h"],
    "2h": [10, "score2h", "hasCD2h"],
    "3h": [12, "score3h", "hasCD3h"],
    "4h": [14, "score4h", "hasCD4h"],
    "1d": [16, "score1d", "hasCD1d"],
    "1w": [18, "score1w", "hasCD1w"],
    "1M": [10, "score1M", "hasCD1M"],
  };

  // 检查各级别的 CD 抄底信号
  for (const [tf, [score, scoreKey, hasKey]] of Object.entries(scoreWeights)) {
    const candles = timeframeCandles[tf as Timeframe | "1M"];
    if (!candles || candles.length < 60) continue;

    const cdSignal = calculateCDSignal(candles);
    const n = candles.length;

    // 检查最近 10 根 K 线内是否有抄底信号
    let hasCD = false;
    for (let i = Math.max(0, n - 10); i < n; i++) {
      if (cdSignal.dxdx[i]) {
        hasCD = true;
        break;
      }
    }

    // 更新分数
    if (hasCD) {
      (result as any)[scoreKey] = score;
      (result as any)[hasKey] = true;
    }
  }

  // 计算总分数
  result.totalScore =
    result.score5m +
    result.score15m +
    result.score30m +
    result.score1h +
    result.score2h +
    result.score3h +
    result.score4h +
    result.score1d +
    result.score1w +
    result.score1M;

  return result;
}

/**
 * 判断是否应该买入
 * @param cdScore CD 分数
 * @param threshold 分数阈值（用户设定）
 * @returns 是否应该买入
 */
export function shouldBuyByCDScore(cdScore: CDScoreResult, threshold: number): boolean {
  return cdScore.totalScore >= threshold;
}

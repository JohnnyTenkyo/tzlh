/**
 * 基于 CD 分数的买入信号检测
 */

import { Candle, Timeframe, calculateLadder } from "./indicators";
import { calculateCDScore } from "./cdScore";

export interface BuySignalWithScore {
  type: "first_buy" | "second_buy";
  timeframe: Timeframe;
  cdScore: number;
  reason: string;
}

const TF_ORDER: Timeframe[] = ["15m", "30m", "1h", "2h", "3h", "4h", "1d", "1w"];

/**
 * 基于 CD 分数检测买入信号
 * @param candles 各时间级别的 K 线数据
 * @param ladderTimeframes 梯子检测的时间级别
 * @param cdScoreThreshold CD 分数阈值（越高越谨慎，越低越激进）
 * @returns 买入信号，如果没有则返回 null
 */
export function detectBuySignalWithCDScore(
  candles: Partial<Record<Timeframe, Candle[]>>,
  ladderTimeframes: Timeframe[],
  cdScoreThreshold: number
): BuySignalWithScore | null {
  /**
   * 买入逻辑：
   * 1. 蓝梯突破黄梯（任意级别）
   * 2. 当前 CD 分数 >= 用户设定的阈值
   * 分数越高 = 越谨慎，分数越低 = 越激进
   */

  // 步骤1：计算 CD 分数
  const cdScore = calculateCDScore(candles);

  // 检查 CD 分数是否满足阈值
  if (cdScore.totalScore < cdScoreThreshold) return null;

  // 步骤2：检查蓝梯是否突破黄梯
  const sortedLadderTfs = [...ladderTimeframes].sort(
    (a, b) => TF_ORDER.indexOf(a) - TF_ORDER.indexOf(b)
  );

  for (const tf of sortedLadderTfs) {
    const c = candles[tf];
    if (!c || c.length < 90) continue;

    const ladder = calculateLadder(c);
    const n = c.length - 1;
    const blueUp = ladder.blueUp[n];
    const yellowUp = ladder.yellowUp[n];
    const blueDn = ladder.blueDn[n];

    // 第二买点优先级更高：蓝梯下边缘 > 黄梯上边缘（强势突破）
    if (blueDn > yellowUp) {
      return {
        type: "second_buy",
        timeframe: tf,
        cdScore: cdScore.totalScore,
        reason: `蓝梯强势突破 + CD分数 ${cdScore.totalScore.toFixed(1)}/25 >= ${cdScoreThreshold} （蓝梯下边缘 ${blueDn.toFixed(2)} > 黄梯上边缘 ${yellowUp.toFixed(2)}，买入100%仓位）`,
      };
    }

    // 第一买点：蓝梯上边缘 > 黄梯上边缘（普通突破）
    if (blueUp > yellowUp) {
      return {
        type: "first_buy",
        timeframe: tf,
        cdScore: cdScore.totalScore,
        reason: `蓝梯突破黄梯 + CD分数 ${cdScore.totalScore.toFixed(1)}/25 >= ${cdScoreThreshold} （蓝梯上边缘 ${blueUp.toFixed(2)} > 黄梯上边缘 ${yellowUp.toFixed(2)}，买入50%仓位）`,
      };
    }
  }

  return null;
}

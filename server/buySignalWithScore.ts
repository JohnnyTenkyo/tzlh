/**
 * 基于 CD 分数和梯子级别的买卖信号检测
 * 
 * 策略逻辑：
 * 1. CD 分数 >= 阈值
 * 2. 在 10 根 K 线内，梯子级收盘价 > 蓝梯下边缘 → 第一买点（50% 仓位）
 * 3. 持有标准：梯子级收盘价不跌破蓝梯下边缘 → 继续持有
 * 4. 梯子级蓝梯下边缘 > 黄梯上边缘 → 第二买点（加仓 50%）
 * 5. 新的持有标准：梯子级蓝梯在黄梯之上 → 继续持有
 * 6. 新的止损：梯子级蓝梯上边缘 < 黄梯下边缘 → 清仓
 */

import { Candle, Timeframe, calculateLadder, calculateCDSignal } from "./indicators";
import { calculateCDScore } from "./cdScore";

export interface BuySignalWithScore {
  type: "first_buy" | "second_buy";
  timeframe: Timeframe;
  cdScore: number;
  blueUp: number;
  blueDn: number;
  yellowUp: number;
  yellowDn: number;
  closePrice: number;
  reason: string;
}

export interface SellSignalWithScore {
  type: "first_sell" | "second_sell";
  timeframe: Timeframe;
  reason: string;
}

/**
 * 检测第一买点：CD 分数满足 + 梯子级收盘价 > 蓝梯下边缘
 */
export function detectFirstBuySignal(
  candles: Partial<Record<Timeframe, Candle[]>>,
  ladderTimeframe: Timeframe,
  cdScoreThreshold: number
): BuySignalWithScore | null {
  // 计算 CD 分数
  const cdScore = calculateCDScore(candles);

  // 检查 CD 分数是否满足阈值
  if (cdScore.totalScore < cdScoreThreshold) return null;

  // 获取梯子级 K 线
  const ladderCandles = candles[ladderTimeframe];
  if (!ladderCandles || ladderCandles.length < 90) return null;

  // 计算梯子
  const ladder = calculateLadder(ladderCandles);
  const n = ladderCandles.length;

  // 获取最新的梯子值和收盘价
  const blueUp = ladder.blueUp[n - 1];
  const blueDn = ladder.blueDn[n - 1];
  const yellowUp = ladder.yellowUp[n - 1];
  const yellowDn = ladder.yellowDn[n - 1];
  const closePrice = ladderCandles[n - 1].close;

  // 检查最近 10 根 K 线内是否有收盘价 > 蓝梯下边缘的 K 线
  let hasFirstBuySignal = false;
  for (let i = Math.max(0, n - 10); i < n; i++) {
    if (ladderCandles[i].close > blueDn) {
      hasFirstBuySignal = true;
      break;
    }
  }

  if (!hasFirstBuySignal) return null;

  return {
    type: "first_buy",
    timeframe: ladderTimeframe,
    cdScore: cdScore.totalScore,
    blueUp,
    blueDn,
    yellowUp,
    yellowDn,
    closePrice,
    reason: `CD分数 ${cdScore.totalScore.toFixed(1)}/100 >= ${cdScoreThreshold} + ${ladderTimeframe}收盘价 ${closePrice.toFixed(2)} > 蓝梯下边缘 ${blueDn.toFixed(2)} → 第一买点（买入50%仓位）`,
  };
}

/**
 * 检测第一买点止损：梯子级收盘价 < 蓝梯下边缘
 */
export function detectFirstSellSignal(
  candles: Partial<Record<Timeframe, Candle[]>>,
  ladderTimeframe: Timeframe
): SellSignalWithScore | null {
  const ladderCandles = candles[ladderTimeframe];
  if (!ladderCandles || ladderCandles.length < 90) return null;

  const ladder = calculateLadder(ladderCandles);
  const n = ladderCandles.length;

  const blueDn = ladder.blueDn[n - 1];
  const closePrice = ladderCandles[n - 1].close;

  // 检查收盘价是否 < 蓝梯下边缘
  if (closePrice < blueDn) {
    return {
      type: "first_sell",
      timeframe: ladderTimeframe,
      reason: `${ladderTimeframe}收盘价 ${closePrice.toFixed(2)} < 蓝梯下边缘 ${blueDn.toFixed(2)} → 第一买点止损（清仓）`,
    };
  }

  return null;
}

/**
 * 检测第二买点：蓝梯下边缘 > 黄梯上边缘
 */
export function detectSecondBuySignal(
  candles: Partial<Record<Timeframe, Candle[]>>,
  ladderTimeframe: Timeframe
): BuySignalWithScore | null {
  const ladderCandles = candles[ladderTimeframe];
  if (!ladderCandles || ladderCandles.length < 90) return null;

  const ladder = calculateLadder(ladderCandles);
  const n = ladderCandles.length;

  const blueUp = ladder.blueUp[n - 1];
  const blueDn = ladder.blueDn[n - 1];
  const yellowUp = ladder.yellowUp[n - 1];
  const yellowDn = ladder.yellowDn[n - 1];
  const closePrice = ladderCandles[n - 1].close;

  // 检查蓝梯下边缘 > 黄梯上边缘
  if (blueDn > yellowUp) {
    // 计算 CD 分数（用于显示）
    const cdScore = calculateCDScore(candles);

    return {
      type: "second_buy",
      timeframe: ladderTimeframe,
      cdScore: cdScore.totalScore,
      blueUp,
      blueDn,
      yellowUp,
      yellowDn,
      closePrice,
      reason: `${ladderTimeframe}蓝梯下边缘 ${blueDn.toFixed(2)} > 黄梯上边缘 ${yellowUp.toFixed(2)} → 第二买点（加仓50%，总共100%满仓）`,
    };
  }

  return null;
}

/**
 * 检测第二买点止损：蓝梯上边缘 < 黄梯下边缘
 */
export function detectSecondSellSignal(
  candles: Partial<Record<Timeframe, Candle[]>>,
  ladderTimeframe: Timeframe
): SellSignalWithScore | null {
  const ladderCandles = candles[ladderTimeframe];
  if (!ladderCandles || ladderCandles.length < 90) return null;

  const ladder = calculateLadder(ladderCandles);
  const n = ladderCandles.length;

  const blueUp = ladder.blueUp[n - 1];
  const yellowDn = ladder.yellowDn[n - 1];

  // 检查蓝梯上边缘 < 黄梯下边缘
  if (blueUp < yellowDn) {
    return {
      type: "second_sell",
      timeframe: ladderTimeframe,
      reason: `${ladderTimeframe}蓝梯上边缘 ${blueUp.toFixed(2)} < 黄梯下边缘 ${yellowDn.toFixed(2)} → 第二买点止损（清仓）`,
    };
  }

  return null;
}

/**
 * 检测持有条件：蓝梯在黄梯之上（用于第二买点后的持有判断）
 */
export function isHoldingConditionMet(
  candles: Partial<Record<Timeframe, Candle[]>>,
  ladderTimeframe: Timeframe
): boolean {
  const ladderCandles = candles[ladderTimeframe];
  if (!ladderCandles || ladderCandles.length < 90) return false;

  const ladder = calculateLadder(ladderCandles);
  const n = ladderCandles.length;

  const blueUp = ladder.blueUp[n - 1];
  const yellowDn = ladder.yellowDn[n - 1];

  // 蓝梯在黄梯之上：蓝梯上边缘 > 黄梯下边缘
  return blueUp > yellowDn;
}

/**
 * 检测第二买点后的持有条件：蓝梯在黄梯之上持有
 * 返回 true 表示继续持有，false 表示应该卖出
 */
export function shouldHoldAfterSecondBuy(
  candles: Partial<Record<Timeframe, Candle[]>>,
  ladderTimeframe: Timeframe
): boolean {
  const ladderCandles = candles[ladderTimeframe];
  if (!ladderCandles || ladderCandles.length < 90) return true; // 数据不足时继续持有

  const ladder = calculateLadder(ladderCandles);
  const n = ladderCandles.length;

  const blueDn = ladder.blueDn[n - 1];
  const yellowUp = ladder.yellowUp[n - 1];

  // 蓝梯在黄梯之上：蓝梯下边缘 > 黄梯上边缘
  return blueDn > yellowUp;
}

/**
 * 指标计算引擎
 * 黄蓝梯子（NX指标）+ CD抄底指标
 *
 * 蓝色梯子：EMA(24) 上边缘 / EMA(23) 下边缘（短周期EMA带）
 * 黄色梯子：EMA(89) 上边缘 / EMA(90) 下边缘（长周期EMA带）
 *
 * CD抄底信号：MACD金叉、MACD柱由负转正、底背离
 */

export type Timeframe = "15m" | "30m" | "1h" | "2h" | "3h" | "4h" | "1d" | "1w";

export interface Candle {
  time: number; // ms timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ============ EMA 计算 ============
export function calculateEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = new Array(data.length).fill(0);

  // 初始值用前period个数据的均值
  let sum = 0;
  const initLen = Math.min(period, data.length);
  for (let i = 0; i < initLen; i++) sum += data[i];
  ema[initLen - 1] = sum / initLen;

  for (let i = initLen; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }

  return ema;
}

// ============ 黄蓝梯子计算 ============
export interface LadderResult {
  // 蓝色梯子（短周期EMA带）
  blueUp: number[];   // EMA(24) - 上边缘
  blueDn: number[];   // EMA(23) - 下边缘（实际上23<24，所以23更快，值更接近价格）
  // 黄色梯子（长周期EMA带）
  yellowUp: number[]; // EMA(89) - 上边缘
  yellowDn: number[]; // EMA(90) - 下边缘
}

export function calculateLadder(candles: Candle[]): LadderResult {
  const closes = candles.map(c => c.close);

  return {
    blueUp: calculateEMA(closes, 24),
    blueDn: calculateEMA(closes, 23),
    yellowUp: calculateEMA(closes, 89),
    yellowDn: calculateEMA(closes, 90),
  };
}

// ============ 梯子信号检测 ============
export interface LadderSignal {
  // 蓝梯在黄梯之上（上涨趋势）
  blueAboveYellow: boolean;
  // 蓝梯下边缘高于黄梯上边缘（强势）
  blueDnAboveYellowUp: boolean;
  // 蓝梯上边缘低于黄梯下边缘（弱势）
  blueUpBelowYellowDn: boolean;
  // 收盘价跌破蓝梯下边缘
  closeBelowBlueDn: boolean;
  // 收盘价在蓝梯上边缘之上
  closeAboveBlueUp: boolean;
  // 蓝梯刚突破黄梯（蓝梯上边缘从下方穿越黄梯上边缘）
  blueCrossYellowUp: boolean;
  // 最新值
  latestBlueUp: number;
  latestBlueDn: number;
  latestYellowUp: number;
  latestYellowDn: number;
  latestClose: number;
}

export function getLadderSignal(candles: Candle[], ladder: LadderResult): LadderSignal {
  const n = candles.length;
  if (n < 2) {
    return {
      blueAboveYellow: false,
      blueDnAboveYellowUp: false,
      blueUpBelowYellowDn: false,
      closeBelowBlueDn: false,
      closeAboveBlueUp: false,
      blueCrossYellowUp: false,
      latestBlueUp: 0,
      latestBlueDn: 0,
      latestYellowUp: 0,
      latestYellowDn: 0,
      latestClose: 0,
    };
  }

  const i = n - 1;
  const prev = n - 2;

  const blueUp = ladder.blueUp[i];
  const blueDn = ladder.blueDn[i];
  const yellowUp = ladder.yellowUp[i];
  const yellowDn = ladder.yellowDn[i];
  const close = candles[i].close;

  const prevBlueUp = ladder.blueUp[prev];
  const prevYellowUp = ladder.yellowUp[prev];

  return {
    blueAboveYellow: blueDn > yellowDn,
    blueDnAboveYellowUp: blueDn > yellowUp,
    blueUpBelowYellowDn: blueUp < yellowDn,
    closeBelowBlueDn: close < blueDn,
    closeAboveBlueUp: close > blueUp,
    // 蓝梯上边缘刚突破黄梯上边缘（前一根在下方，当前在上方）
    blueCrossYellowUp: prevBlueUp <= prevYellowUp && blueUp > yellowUp,
    latestBlueUp: blueUp,
    latestBlueDn: blueDn,
    latestYellowUp: yellowUp,
    latestYellowDn: yellowDn,
    latestClose: close,
  };
}

// ============ MACD 计算 ============
export interface MACDResult {
  macd: number[];    // MACD线 = EMA(12) - EMA(26)
  signal: number[];  // 信号线 = EMA(9) of MACD
  histogram: number[]; // 柱 = MACD - Signal
}

export function calculateMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const closes = candles.map(c => c.close);
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const macd = emaFast.map((v, i) => v - emaSlow[i]);
  const signal = calculateEMA(macd, signalPeriod);
  const histogram = macd.map((v, i) => v - signal[i]);

  return { macd, signal, histogram };
}

// ============ CD抄底信号检测 ============
export interface CDSignal {
  // 金叉：MACD线从下方穿越信号线
  goldenCross: boolean;
  // 柱转正：MACD柱从负变正
  histogramTurnPositive: boolean;
  // 底背离：价格创新低但MACD柱未创新低（简化版）
  bullishDivergence: boolean;
  // 综合CD信号（满足任意一个）
  hasCDSignal: boolean;
  // 信号强度（满足条件越多越强）
  strength: number;
}

export function getCDSignal(candles: Candle[], lookback = 5): CDSignal {
  const n = candles.length;
  if (n < 30) {
    return { goldenCross: false, histogramTurnPositive: false, bullishDivergence: false, hasCDSignal: false, strength: 0 };
  }

  const macdResult = calculateMACD(candles);
  const { macd, signal, histogram } = macdResult;

  // 检查最近lookback根K线内是否有信号
  const startIdx = Math.max(1, n - lookback);

  let goldenCross = false;
  let histogramTurnPositive = false;
  let bullishDivergence = false;

  for (let i = startIdx; i < n; i++) {
    // 金叉：前一根MACD < Signal，当前MACD > Signal
    if (macd[i - 1] < signal[i - 1] && macd[i] > signal[i]) {
      goldenCross = true;
    }
    // 柱转正：前一根柱 < 0，当前柱 > 0
    if (histogram[i - 1] < 0 && histogram[i] > 0) {
      histogramTurnPositive = true;
    }
  }

  // 底背离检测：过去30根K线内，价格创新低但MACD柱未创新低
  if (n >= 30) {
    const lookbackRange = Math.min(30, n - 1);
    const recentCandles = candles.slice(n - lookbackRange);
    const recentHistogram = histogram.slice(n - lookbackRange);

    const minPrice = Math.min(...recentCandles.map(c => c.low));
    const minHistogram = Math.min(...recentHistogram);

    const latestPrice = candles[n - 1].low;
    const latestHistogram = histogram[n - 1];

    // 价格接近最低点（在最低点的2%范围内），但MACD柱高于最低点的50%
    if (latestPrice <= minPrice * 1.02 && latestHistogram > minHistogram * 0.5 && latestHistogram < 0) {
      bullishDivergence = true;
    }
  }

  const strength = (goldenCross ? 1 : 0) + (histogramTurnPositive ? 1 : 0) + (bullishDivergence ? 1 : 0);
  const hasCDSignal = strength > 0;

  return { goldenCross, histogramTurnPositive, bullishDivergence, hasCDSignal, strength };
}

// ============ 多时间级别K线 ============
export type TimeframeCandles = Partial<Record<Timeframe, Candle[]>>;

// ============ 检查指定时间级别是否有CD信号 ============
export function hasCDSignalInRange(candles: Candle[], lookback: number): boolean {
  return getCDSignal(candles, lookback).hasCDSignal;
}

// ============ 4321打法评分 ============
export interface Strategy4321Score {
  symbol: string;
  totalScore: number;
  matchLevel: string; // "4321" | "321" | "21" | "1"
  cdLevels: string[]; // which timeframes have CD signals
  ladderBreakLevel: string; // which timeframe has blue ladder above yellow
  reason: string;
  details: Record<string, number>;
}

const TIMEFRAME_ORDER: Timeframe[] = ["4h", "3h", "2h", "1h"];

export function calculate4321Score(
  symbol: string,
  candles: TimeframeCandles,
  lookback = 5
): Strategy4321Score {
  const details: Record<string, number> = {};
  const cdLevels: string[] = [];

  // 检查各级别CD信号
  for (const tf of TIMEFRAME_ORDER) {
    const c = candles[tf];
    if (c && c.length >= 30) {
      const sig = getCDSignal(c, lookback);
      if (sig.hasCDSignal) {
        cdLevels.push(tf);
        details[`${tf}_cd_strength`] = sig.strength;
      }
    }
  }

  // 检查30分钟蓝梯突破黄梯
  let ladderBreakLevel = "";
  const c30m = candles["30m"];
  if (c30m && c30m.length >= 90) {
    const ladder = calculateLadder(c30m);
    const sig = getLadderSignal(c30m, ladder);
    if (sig.blueAboveYellow) {
      ladderBreakLevel = "30m";
      details["30m_blue_above_yellow"] = 1;
    }
  }

  // 确定匹配级别（4321降级）
  let matchLevel = "";
  let totalScore = 0;

  if (cdLevels.includes("4h") && cdLevels.includes("3h") && cdLevels.includes("2h") && cdLevels.includes("1h") && ladderBreakLevel) {
    matchLevel = "4321";
    totalScore = 100;
  } else if (cdLevels.includes("3h") && cdLevels.includes("2h") && cdLevels.includes("1h") && ladderBreakLevel) {
    matchLevel = "321";
    totalScore = 80;
  } else if (cdLevels.includes("2h") && cdLevels.includes("1h") && ladderBreakLevel) {
    matchLevel = "21";
    totalScore = 60;
  } else if (cdLevels.includes("1h") && ladderBreakLevel) {
    matchLevel = "1";
    totalScore = 40;
  } else if (cdLevels.length > 0 && ladderBreakLevel) {
    matchLevel = cdLevels[0];
    totalScore = 30;
  }

  if (!matchLevel) {
    return {
      symbol,
      totalScore: 0,
      matchLevel: "",
      cdLevels,
      ladderBreakLevel,
      reason: "未找到符合条件的信号",
      details,
    };
  }

  // 加分项
  const cdCount = cdLevels.length;
  const cdStrengthBonus = cdLevels.reduce((sum, tf) => sum + (details[`${tf}_cd_strength`] || 0), 0);
  totalScore = Math.min(100, totalScore + cdStrengthBonus * 2);

  // 生成理由
  const cdDesc = cdLevels.map(tf => `${tf}级别`).join("、");
  const reason = [
    `${matchLevel}打法：${cdDesc}出现CD抄底信号`,
    ladderBreakLevel ? `30分钟蓝色梯子高于黄色梯子（上涨趋势）` : "",
    cdStrengthBonus > 0 ? `信号强度加成+${cdStrengthBonus * 2}分` : "",
  ].filter(Boolean).join("；");

  return {
    symbol,
    totalScore,
    matchLevel,
    cdLevels,
    ladderBreakLevel,
    reason,
    details,
  };
}

// ============ 买入信号检测（回测用） ============
export interface BuySignal {
  type: "first_buy" | "second_buy";
  timeframe: Timeframe;
  reason: string;
}

export function detectBuySignal(
  candles: TimeframeCandles,
  cdTimeframes: Timeframe[],
  ladderTimeframes: Timeframe[],
  cdLookback: number,
  currentPrice: number
): BuySignal | null {
  // 检查所有CD信号级别是否都满足
  for (const tf of cdTimeframes) {
    const c = candles[tf];
    if (!c || c.length < 30) return null;
    if (!hasCDSignalInRange(c, cdLookback)) return null;
  }

  // 检查蓝梯突破黄梯（所有指定级别都需满足）
  for (const tf of ladderTimeframes) {
    const c = candles[tf];
    if (!c || c.length < 90) return null;

    const ladder = calculateLadder(c);
    const sig = getLadderSignal(c, ladder);

    // 第一买点：蓝梯上边缘刚突破黄梯上边缘
    if (sig.blueCrossYellowUp) {
      const cdDesc = cdTimeframes.join("/");
      return {
        type: "first_buy",
        timeframe: tf,
        reason: `${cdDesc}级别CD抄底信号 + ${tf}级别蓝梯上边缘刚突破黄梯上边缘（第一买点）`,
      };
    }

    // 第二买点：蓝梯下边缘高于黄梯上边缘
    if (sig.blueDnAboveYellowUp) {
      const cdDesc = cdTimeframes.join("/");
      return {
        type: "second_buy",
        timeframe: tf,
        reason: `${cdDesc}级别CD抄底信号 + ${tf}级别蓝梯下边缘高于黄梯上边缘（第二买点）`,
      };
    }
  }

  return null;
}

// ============ 卖出信号检测（回测用） ============
export interface SellSignal {
  type: "first_sell" | "second_sell" | "daily_sell_half" | "daily_sell_all";
  timeframe: Timeframe;
  reason: string;
}

export function detectSellSignal(
  candles: TimeframeCandles,
  entryTimeframe: Timeframe,
  currentPrice: number,
  dailySellTriggered: boolean
): SellSignal | null {
  // 卖出条件1：上一级别K线收盘低于蓝梯下边缘（卖50%）
  const tfOrder: Timeframe[] = ["15m", "30m", "1h", "2h", "3h", "4h", "1d", "1w"];
  const entryIdx = tfOrder.indexOf(entryTimeframe);

  if (entryIdx > 0) {
    const upperTf = tfOrder[entryIdx + 1] as Timeframe;
    if (upperTf) {
      const upperCandles = candles[upperTf];
      if (upperCandles && upperCandles.length >= 90) {
        const ladder = calculateLadder(upperCandles);
        const sig = getLadderSignal(upperCandles, ladder);
        if (sig.closeBelowBlueDn) {
          return {
            type: "first_sell",
            timeframe: upperTf,
            reason: `${upperTf}级别K线收盘价（${currentPrice.toFixed(2)}）跌破蓝梯下边缘（${sig.latestBlueDn.toFixed(2)}），卖出50%仓位`,
          };
        }
      }
    }
  }

  // 卖出条件2：当前级别蓝梯上边缘低于黄梯下边缘（卖50%）
  const entryCandles = candles[entryTimeframe];
  if (entryCandles && entryCandles.length >= 90) {
    const ladder = calculateLadder(entryCandles);
    const sig = getLadderSignal(entryCandles, ladder);
    if (sig.blueUpBelowYellowDn) {
      return {
        type: "second_sell",
        timeframe: entryTimeframe,
        reason: `${entryTimeframe}级别蓝梯上边缘（${sig.latestBlueUp.toFixed(2)}）低于黄梯下边缘（${sig.latestYellowDn.toFixed(2)}），卖出50%仓位`,
      };
    }
  }

  // 卖出条件3：日线CD卖出信号（死叉或柱转负）
  const dailyCandles = candles["1d"];
  if (dailyCandles && dailyCandles.length >= 30) {
    const macdResult = calculateMACD(dailyCandles);
    const { macd, signal, histogram } = macdResult;
    const n = dailyCandles.length;

    // 死叉：MACD从上方穿越信号线
    const deathCross = macd[n - 2] > signal[n - 2] && macd[n - 1] < signal[n - 1];
    // 柱转负
    const histogramTurnNegative = histogram[n - 2] > 0 && histogram[n - 1] < 0;

    if ((deathCross || histogramTurnNegative) && !dailySellTriggered) {
      const ladder = calculateLadder(dailyCandles);
      const sig = getLadderSignal(dailyCandles, ladder);
      if (sig.closeBelowBlueDn) {
        return {
          type: "daily_sell_half",
          timeframe: "1d",
          reason: `日线${deathCross ? "MACD死叉" : "MACD柱转负"} + 收盘跌破日线蓝梯下边缘，卖出50%仓位`,
        };
      }
    }
  }

  return null;
}

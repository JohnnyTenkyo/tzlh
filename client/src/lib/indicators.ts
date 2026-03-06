import { Candle, CDSignal, BuySellPressure, LadderLevel, NXSignal, MomentumSignal, ChanLunSignal, AdvancedChanData, AdvancedChanSignal, BiPoint, ZhongShu } from './types';

// ============ EMA Calculation ============
function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  if (data.length === 0) return result;
  
  result[0] = data[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(data[i]);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
  }
  return result;
}

// ============ MACD (CD指标) ============
export interface MACDResult {
  diff: number[];
  dea: number[];
  macd: number[];
}

export function calculateMACD(candles: Candle[], fast = 12, slow = 26, signal = 9): MACDResult {
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  
  const diff = emaFast.map((v, i) => v - emaSlow[i]);
  const dea = ema(diff, signal);
  const macd = diff.map((v, i) => 2 * (v - dea[i]));
  
  return { diff, dea, macd };
}

// ============ Helper functions for CD formula ============

function barslast(condition: boolean[], index: number): number {
  for (let i = index; i >= 0; i--) {
    if (condition[i]) return index - i;
  }
  return index + 1; // never occurred
}

function llv(data: number[], index: number, period: number): number {
  let min = data[index];
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (data[i] < min) min = data[i];
  }
  return min;
}

function hhv(data: number[], index: number, period: number): number {
  let max = data[index];
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (data[i] > max) max = data[i];
  }
  return max;
}

function ref(data: number[], index: number, n: number): number {
  const refIdx = index - n;
  if (refIdx < 0) return 0;
  return data[refIdx];
}

function refBool(data: boolean[], index: number, n: number): boolean {
  const refIdx = index - n;
  if (refIdx < 0) return false;
  return data[refIdx];
}

function count(condition: boolean[], index: number, period: number): number {
  let cnt = 0;
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (condition[i]) cnt++;
  }
  return cnt;
}

// ============ CD Signal Detection (一比一还原源代码) ============
export function calculateCDSignals(candles: Candle[]): CDSignal[] {
  if (candles.length < 30) return [];
  
  const { diff, dea, macd } = calculateMACD(candles);
  const closes = candles.map(c => c.close);
  const n = candles.length;
  
  const macdDeathCross: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    macdDeathCross[i] = (macd[i - 1] >= 0) && (macd[i] < 0);
  }
  
  const macdGoldenCross: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    macdGoldenCross[i] = (macd[i - 1] <= 0) && (macd[i] > 0);
  }
  
  const N1: number[] = new Array(n).fill(0);
  const MM1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    N1[i] = barslast(macdDeathCross, i);
    MM1[i] = barslast(macdGoldenCross, i);
  }
  
  const CC1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CC1[i] = llv(closes, i, N1[i] + 1);
  }
  
  const CC2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CC2[i] = ref(CC1, i, MM1[i] + 1);
  }
  
  const CC3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CC3[i] = ref(CC2, i, MM1[i] + 1);
  }
  
  const DIFL1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFL1[i] = llv(diff, i, N1[i] + 1);
  }
  
  const DIFL2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFL2[i] = ref(DIFL1, i, MM1[i] + 1);
  }
  
  const DIFL3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFL3[i] = ref(DIFL2, i, MM1[i] + 1);
  }
  
  const CH1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CH1[i] = hhv(closes, i, MM1[i] + 1);
  }
  
  const CH2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CH2[i] = ref(CH1, i, N1[i] + 1);
  }
  
  const CH3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CH3[i] = ref(CH2, i, N1[i] + 1);
  }
  
  const DIFH1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFH1[i] = hhv(diff, i, MM1[i] + 1);
  }
  
  const DIFH2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFH2[i] = ref(DIFH1, i, N1[i] + 1);
  }
  
  const DIFH3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFH3[i] = ref(DIFH2, i, N1[i] + 1);
  }
  
  const AAA: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    AAA[i] = (CC1[i] < CC2[i]) && (DIFL1[i] > DIFL2[i]) && (macd[i - 1] < 0) && (diff[i] < 0);
  }
  
  const BBB: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    BBB[i] = (CC1[i] < CC3[i]) && (DIFL1[i] < DIFL2[i]) && (DIFL1[i] > DIFL3[i]) && (macd[i - 1] < 0) && (diff[i] < 0);
  }
  
  const CCC: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    CCC[i] = (AAA[i] || BBB[i]) && (diff[i] < 0);
  }
  
  const LLL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    LLL[i] = !CCC[i - 1] && CCC[i];
  }
  
  const XXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    XXX[i] = (AAA[i - 1] && (DIFL1[i] <= DIFL2[i]) && (diff[i] < dea[i])) ||
             (BBB[i - 1] && (DIFL1[i] <= DIFL3[i]) && (diff[i] < dea[i]));
  }
  
  const JJJ: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    JJJ[i] = CCC[i - 1] && (Math.abs(diff[i - 1]) >= (Math.abs(diff[i]) * 1.01));
  }
  
  const BLBL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    BLBL[i] = JJJ[i - 1] && CCC[i] && ((Math.abs(diff[i - 1]) * 1.01) <= Math.abs(diff[i]));
  }
  
  const DXDX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DXDX[i] = !JJJ[i - 1] && JJJ[i];
  }
  
  const DJGXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const closeCondition = (closes[i] < CC2[i]) || (closes[i] < CC1[i]);
    const jjjRef1 = refBool(JJJ, i, MM1[i] + 1);
    const jjjRef2 = refBool(JJJ, i, MM1[i]);
    const notRefLLL = !refBool(LLL, i, 1);
    const countJJJ = count(JJJ, i, 24);
    DJGXX[i] = closeCondition && (jjjRef1 || jjjRef2) && notRefLLL && (countJJJ >= 1);
  }
  
  const DJXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const refDJGXX: boolean[] = new Array(n).fill(false);
    for (let j = 1; j < n; j++) {
      refDJGXX[j] = DJGXX[j - 1];
    }
    const cnt = count(refDJGXX, i, 2);
    DJXX[i] = !(cnt >= 1) && DJGXX[i];
  }
  
  const DXX: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    DXX[i] = (XXX[i] || DJXX[i]) && !CCC[i];
  }
  
  const DBJG: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJG[i] = (CH1[i] > CH2[i]) && (DIFH1[i] < DIFH2[i]) && (macd[i - 1] > 0) && (diff[i] > 0);
  }
  
  const DBJG2: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJG2[i] = (CH1[i] > CH3[i]) && (DIFH1[i] > DIFH2[i]) && (DIFH1[i] < DIFH3[i]) && (macd[i - 1] > 0) && (diff[i] > 0);
  }
  
  const DBJG3: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    DBJG3[i] = (DBJG[i] || DBJG2[i]) && (diff[i] > 0);
  }
  
  const DBJGLLL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGLLL[i] = !DBJG3[i - 1] && DBJG3[i];
  }
  
  const DBJGXXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGXXX[i] = (DBJG[i - 1] && (DIFH1[i] >= DIFH2[i]) && (diff[i] > dea[i])) ||
                 (DBJG2[i - 1] && (DIFH1[i] >= DIFH3[i]) && (diff[i] > dea[i]));
  }
  
  const DBJGJJJ: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGJJJ[i] = DBJG3[i - 1] && (Math.abs(diff[i - 1]) <= (Math.abs(diff[i]) * 0.99));
  }
  
  const DBJGXC: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGXC[i] = !DBJGJJJ[i - 1] && DBJGJJJ[i];
  }
  
  const signals: CDSignal[] = [];
  for (let i = 0; i < n; i++) {
    if (DXDX[i]) {
      signals.push({ time: candles[i].time, type: 'buy', strength: 'strong', label: '抄底' });
    } else if (DBJGXC[i]) {
      signals.push({ time: candles[i].time, type: 'sell', strength: 'strong', label: '卖出' });
    }
  }
  
  return signals;
}

// ============ 买卖动能 (Buy/Sell Momentum) ============
/**
 * 计算买卖动能指标
 * 基于成交量和价格变化计算买卖力量
 * 不依赖实时 API，可在历史 K 线上显示
 */
export function calculateMomentum(candles: Candle[]): MomentumSignal[] {
  if (candles.length < 20) return [];
  
  const rawMomentum: Array<{
    time: number;
    buyRaw: number;
    sellRaw: number;
    diffRaw: number;
  }> = [];
  
  // 第一步：计算原始动能值
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const priceChange = c.close - c.open;
    const priceChangeRatio = priceChange / c.open;
    const volumeWeight = c.volume || 1;
    
    let buyRaw = 0;
    let sellRaw = 0;
    
    if (priceChange > 0) {
      buyRaw = priceChangeRatio * volumeWeight * 1000;
    } else if (priceChange < 0) {
      sellRaw = Math.abs(priceChangeRatio) * volumeWeight * 1000;
    }
    
    // EMA 平滑
    if (i > 0) {
      buyRaw = rawMomentum[i - 1].buyRaw * 0.9 + buyRaw * 0.1;
      sellRaw = rawMomentum[i - 1].sellRaw * 0.9 + sellRaw * 0.1;
    }
    
    rawMomentum.push({
      time: c.time,
      buyRaw,
      sellRaw,
      diffRaw: buyRaw - sellRaw
    });
  }
  
  // 第二步：找出最大绝对值用于归一化
  const maxBuy = Math.max(...rawMomentum.map(m => m.buyRaw));
  const maxSell = Math.max(...rawMomentum.map(m => m.sellRaw));
  const maxAbsDiff = Math.max(...rawMomentum.map(m => Math.abs(m.diffRaw)));
  
  // 第三步：归一化到 -100~100 区间
  const result: MomentumSignal[] = [];
  
  for (let i = 0; i < rawMomentum.length; i++) {
    const raw = rawMomentum[i];
    
    // 归一化买卖动能到 0-100
    const buyMomentum = maxBuy > 0 ? (raw.buyRaw / maxBuy) * 100 : 0;
    const sellMomentum = maxSell > 0 ? (raw.sellRaw / maxSell) * 100 : 0;
    
    // 归一化动能差到 -100~100
    const diff = maxAbsDiff > 0 ? (raw.diffRaw / maxAbsDiff) * 100 : 0;
    
    // 判断五种信号
    let signal: 'double_digit_up' | 'double_digit_down' | 'yellow_cross_green' | 'green_to_red' | 'strong_buy' | undefined;
    
    if (i > 0) {
      const prevDiff = result[i - 1].diff;
      const prevBuyMomentum = result[i - 1].buyMomentum;
      const prevSellMomentum = result[i - 1].sellMomentum;
      const diffChange = diff - prevDiff;
      const diffChangePercent = prevDiff !== 0 ? (diffChange / Math.abs(prevDiff)) * 100 : 0;
      
      // 1. 动能双位数上涨：买入动能比前一天高50%
      if (buyMomentum > prevBuyMomentum * 1.5) {
        signal = 'double_digit_up';
      }
      
      // 2. 黄线穿绿线：买入动能（黄线）从下方穿过卖出动能（绿线）
      if (prevBuyMomentum < prevSellMomentum && buyMomentum > sellMomentum) {
        signal = 'yellow_cross_green';
      }
      
      // 3. 绿柱转红柱：买压柱从绿色（负值）转为红色（正值）
      if (prevDiff < 0 && diff > 0) {
        signal = 'green_to_red';
      }
      
      // 4. 强买：买入动能显著高于卖出动能（差值 > 30）
      if (diff > 30 && buyMomentum > sellMomentum * 1.5) {
        signal = 'strong_buy';
      }
      
      // 5. 卖出力道双位数下跌：卖出动能比前一天高50%
      if (sellMomentum > prevSellMomentum * 1.5) {
        signal = 'double_digit_down';
      }
    }
    
    result.push({
      time: raw.time,
      buyMomentum,
      sellMomentum,
      diff,
      signal
    });
  }
  
  return result;
}

// ============ 买卖力道 (Buy/Sell Pressure) ============
export function calculateBuySellPressure(candles: Candle[]): BuySellPressure[] {
  if (candles.length < 20) return [];
  
  const closes = candles.map(c => c.close);
  const ema5 = ema(closes, 5);
  const ema10 = ema(closes, 10);
  
  const result: BuySellPressure[] = [];
  for (let i = 0; i < candles.length; i++) {
    const pressure = (ema5[i] - ema10[i]) / ema10[i] * 1000;
    const prevPressure = i > 0 ? result[i - 1].pressure : pressure;
    const changeRate = pressure - prevPressure;
    
    let signal: 'strong_up' | 'strong_down' | undefined;
    // 双位数上涨提醒 (变化率 > 10%)
    if (changeRate > 10) signal = 'strong_up';
    // 双位数下跌提醒 (变化率 < -10%)
    if (changeRate < -10) signal = 'strong_down';
    
    result.push({
      time: candles[i].time,
      pressure,
      changeRate,
      signal
    });
  }
  
  return result;
}

// ============ 黄蓝梯子 (Yellow-Blue Ladder) - 一比一复刻富途源代码 ============
/**
 * 富途源代码逻辑:
 * A:EMA(HIGH,24),COLORBLUE;
 * B:EMA(LOW,23),COLORBLUE;
 * STICKLINE(C>A,A,B,0.1,1),COLORBLUE;
 * STICKLINE(C<B,A,B,0.1,1),COLORBLUE;
 * A1:EMA(H,89),COLORYELLOW;
 * B1:EMA(L,90),COLORYELLOW;
 * STICKLINE(C>A1,A1,B1,0.1,1),COLORYELLOW;
 * STICKLINE(C<B1,A1,B1,0.1,1),COLORYELLOW;
 */
export function calculateLadder(candles: Candle[]): LadderLevel[] {
  if (candles.length === 0) return [];
  
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  
  // 蓝梯子: A = EMA(HIGH, 24), B = EMA(LOW, 23)
  const A = ema(highs, 24);
  const B = ema(lows, 23);
  
  // 黄梯子: A1 = EMA(HIGH, 89), B1 = EMA(LOW, 90)
  const A1 = ema(highs, 89);
  const B1 = ema(lows, 90);
  
  return candles.map((c, i) => {
    // 逻辑: 只有当 C > A 或 C < B 时才显示蓝梯子 (对应 STICKLINE 条件)
    // 这里我们返回原始值，但在绘图层根据条件决定是否显示/填充
    return {
      time: c.time,
      blueUp: A[i],
      blueDn: B[i],
      yellowUp: A1[i],
      yellowDn: B1[i],
      // 辅助字段
      blueMid: (A[i] + B[i]) / 2,
      yellowMid: (A1[i] + B1[i]) / 2,
      // 状态标记
      showBlue: closes[i] > A[i] || closes[i] < B[i],
      showYellow: closes[i] > A1[i] || closes[i] < B1[i]
    };
  });
}

// ============ NX Signal ============
export function calculateNXSignals(candles: Candle[]): NXSignal[] {
  if (candles.length < 20) return [];
  
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const ema5 = ema(closes, 5);
  const ema10 = ema(closes, 10);
  const volEma = ema(volumes, 10);
  
  const signals: NXSignal[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    if (ema5[i] > ema10[i] && ema5[i - 1] <= ema10[i - 1] && volumes[i] > volEma[i] * 1.5) {
      signals.push({ time: candles[i].time, type: 'buy', label: '买入' });
    }
    if (ema5[i] < ema10[i] && ema5[i - 1] >= ema10[i - 1]) {
      signals.push({ time: candles[i].time, type: 'sell', label: '卖出' });
    }
  }
  
  return signals;
}

// ============ Blue Ladder Strength Check (for screener) ============
export function checkBlueLadderStrength(candles: Candle[]): boolean {
  if (candles.length < 60) return false;
  
  const ladder = calculateLadder(candles);
  if (ladder.length < 3) return false;
  
  const last = ladder[ladder.length - 1];
  const prev = ladder[ladder.length - 2];
  const lastCandle = candles[candles.length - 1];
  
  // 选股逻辑保持一定的趋势性
  const blueRising = last.blueMid! > prev.blueMid!;
  const blueAboveYellow = last.blueUp > last.yellowUp;
  const closeAboveBlueDn = lastCandle.close > last.blueDn;
  
  return blueRising && blueAboveYellow && closeAboveBlueDn;
}

// ============ 缠论指标 (Chan Lun / Chanlun Theory) ============

/**
 * K线包含处理 (Merging Candles)
 * 缠论要求先对K线进行包含处理：
 * - 如果当前K线完全包含前一根K线（或被包含），则合并
 * - 上升趋势中取高高，下降趋势中取低低
 */
interface MergedCandle {
  time: number;
  high: number;
  low: number;
  open: number;
  close: number;
  originalIndices: number[];  // 原始K线索引
}

function mergeCandles(candles: Candle[]): MergedCandle[] {
  if (candles.length === 0) return [];
  
  const merged: MergedCandle[] = [{
    time: candles[0].time,
    high: candles[0].high,
    low: candles[0].low,
    open: candles[0].open,
    close: candles[0].close,
    originalIndices: [0],
  }];
  
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const last = merged[merged.length - 1];
    
    // 检查包含关系
    const isContaining = (curr.high >= last.high && curr.low <= last.low);
    const isContained = (curr.high <= last.high && curr.low >= last.low);
    
    if (isContaining || isContained) {
      // 判断趋势方向
      const isUpTrend = merged.length >= 2 ? last.high > merged[merged.length - 2].high : curr.close > curr.open;
      
      if (isUpTrend) {
        // 上升趋势：取高高、低低中的高
        last.high = Math.max(last.high, curr.high);
        last.low = Math.max(last.low, curr.low);
      } else {
        // 下降趋势：取低低、高高中的低
        last.high = Math.min(last.high, curr.high);
        last.low = Math.min(last.low, curr.low);
      }
      last.originalIndices.push(i);
    } else {
      merged.push({
        time: curr.time,
        high: curr.high,
        low: curr.low,
        open: curr.open,
        close: curr.close,
        originalIndices: [i],
      });
    }
  }
  
  return merged;
}

/**
 * 顶底分型识别
 * 顶分型：中间K线的高点是三根中最高的，低点也是三根中最高的
 * 底分型：中间K线的低点是三根中最低的，高点也是三根中最低的
 */
interface FenXing {
  index: number;          // 在merged数组中的索引
  time: number;           // 时间戳
  type: 'top' | 'bottom'; // 顶分型 or 底分型
  high: number;
  low: number;
  originalIndex: number;  // 在原始candles数组中的索引
}

function findFenXing(merged: MergedCandle[]): FenXing[] {
  const result: FenXing[] = [];
  
  for (let i = 1; i < merged.length - 1; i++) {
    const prev = merged[i - 1];
    const curr = merged[i];
    const next = merged[i + 1];
    
    // 顶分型：中间K线最高
    if (curr.high > prev.high && curr.high > next.high &&
        curr.low > prev.low && curr.low > next.low) {
      result.push({
        index: i,
        time: curr.time,
        type: 'top',
        high: curr.high,
        low: curr.low,
        originalIndex: curr.originalIndices[0],
      });
    }
    
    // 底分型：中间K线最低
    if (curr.low < prev.low && curr.low < next.low &&
        curr.high < prev.high && curr.high < next.high) {
      result.push({
        index: i,
        time: curr.time,
        type: 'bottom',
        high: curr.high,
        low: curr.low,
        originalIndex: curr.originalIndices[0],
      });
    }
  }
  
  // 过滤：顶底交替出现
  const filtered: FenXing[] = [];
  for (const fx of result) {
    if (filtered.length === 0) {
      filtered.push(fx);
      continue;
    }
    
    const lastFx = filtered[filtered.length - 1];
    
    if (fx.type === lastFx.type) {
      // 同类型分型，取极值
      if (fx.type === 'top' && fx.high > lastFx.high) {
        filtered[filtered.length - 1] = fx;
      } else if (fx.type === 'bottom' && fx.low < lastFx.low) {
        filtered[filtered.length - 1] = fx;
      }
    } else {
      // 不同类型，检查是否满足最少间隔（至少1根K线间隔）
      if (fx.index - lastFx.index >= 3) {
        filtered.push(fx);
      } else {
        // 间隔不够，但如果极值更极端，替换
        if (fx.type === 'top' && fx.high > lastFx.high) {
          filtered[filtered.length - 1] = fx;
        } else if (fx.type === 'bottom' && fx.low < lastFx.low) {
          filtered[filtered.length - 1] = fx;
        }
      }
    }
  }
  
  return filtered;
}

/**
 * MACD背离检测
 * 底背离：价格创新低，但MACD的DIFF值没有创新低（看涨信号）
 * 顶背离：价格创新高，但MACD的DIFF值没有创新高（看跌信号）
 */
function detectMACDDivergence(
  fenxings: FenXing[],
  candles: Candle[],
  diffValues: number[]
): Map<number, { divergence: boolean; strength: 'strong' | 'medium' | 'weak' }> {
  const result = new Map<number, { divergence: boolean; strength: 'strong' | 'medium' | 'weak' }>();
  
  // 收集同类型的分型对
  const tops: FenXing[] = fenxings.filter(f => f.type === 'top');
  const bottoms: FenXing[] = fenxings.filter(f => f.type === 'bottom');
  
  // 检测底背离
  for (let i = 1; i < bottoms.length; i++) {
    const prev = bottoms[i - 1];
    const curr = bottoms[i];
    
    if (curr.originalIndex < diffValues.length && prev.originalIndex < diffValues.length) {
      const prevPrice = candles[prev.originalIndex].low;
      const currPrice = candles[curr.originalIndex].low;
      const prevDiff = diffValues[prev.originalIndex];
      const currDiff = diffValues[curr.originalIndex];
      
      // 价格创新低，但DIFF没有创新低 = 底背离（买入信号）
      if (currPrice < prevPrice && currDiff > prevDiff && currDiff < 0) {
        const priceDropPct = Math.abs((currPrice - prevPrice) / prevPrice);
        const diffRisePct = Math.abs((currDiff - prevDiff) / (Math.abs(prevDiff) || 1));
        const strength = (priceDropPct > 0.05 && diffRisePct > 0.3) ? 'strong' 
                       : (priceDropPct > 0.02 || diffRisePct > 0.15) ? 'medium' : 'weak';
        result.set(curr.originalIndex, { divergence: true, strength });
      }
    }
  }
  
  // 检测顶背离
  for (let i = 1; i < tops.length; i++) {
    const prev = tops[i - 1];
    const curr = tops[i];
    
    if (curr.originalIndex < diffValues.length && prev.originalIndex < diffValues.length) {
      const prevPrice = candles[prev.originalIndex].high;
      const currPrice = candles[curr.originalIndex].high;
      const prevDiff = diffValues[prev.originalIndex];
      const currDiff = diffValues[curr.originalIndex];
      
      // 价格创新高，但DIFF没有创新高 = 顶背离（卖出信号）
      if (currPrice > prevPrice && currDiff < prevDiff && currDiff > 0) {
        const priceRisePct = Math.abs((currPrice - prevPrice) / prevPrice);
        const diffDropPct = Math.abs((currDiff - prevDiff) / (Math.abs(prevDiff) || 1));
        const strength = (priceRisePct > 0.05 && diffDropPct > 0.3) ? 'strong'
                       : (priceRisePct > 0.02 || diffDropPct > 0.15) ? 'medium' : 'weak';
        result.set(curr.originalIndex, { divergence: true, strength });
      }
    }
  }
  
  return result;
}

/**
 * 计算缠论信号
 * 1. K线包含处理
 * 2. 顶底分型识别
 * 3. MACD背离检测
 * 4. 综合给出买卖点信号
 */
export function calculateChanLunSignals(candles: Candle[]): ChanLunSignal[] {
  if (candles.length < 10) return [];
  
  // 1. K线包含处理
  const merged = mergeCandles(candles);
  if (merged.length < 5) return [];
  
  // 2. 顶底分型识别
  const fenxings = findFenXing(merged);
  if (fenxings.length === 0) return [];
  
  // 3. 计算MACD用于背离检测
  const { diff } = calculateMACD(candles);
  
  // 4. 检测MACD背离
  const divergenceMap = detectMACDDivergence(fenxings, candles, diff);
  
  // 5. 生成信号
  const signals: ChanLunSignal[] = [];
  
  for (const fx of fenxings) {
    const divInfo = divergenceMap.get(fx.originalIndex);
    const hasDivergence = divInfo?.divergence || false;
    
    let signalType: 'buy' | 'sell' | undefined;
    let label = '';
    let strength: 'strong' | 'medium' | 'weak' = 'weak';
    
    if (fx.type === 'bottom') {
      label = '底';
      if (hasDivergence) {
        signalType = 'buy';
        strength = divInfo!.strength;
        label = strength === 'strong' ? '强买' : strength === 'medium' ? '买' : '底背离';
      }
    } else {
      label = '顶';
      if (hasDivergence) {
        signalType = 'sell';
        strength = divInfo!.strength;
        label = strength === 'strong' ? '强卖' : strength === 'medium' ? '卖' : '顶背离';
      }
    }
    
    signals.push({
      time: candles[fx.originalIndex].time,
      type: fx.type,
      signalType,
      label,
      strength,
      divergence: hasDivergence,
    });
  }
  
  return signals;
}

/**
 * 检查缠论买入信号（用于选股）
 * 检查最近是否出现底分型+MACD底背离
 */
export function checkChanLunBuySignal(candles: Candle[]): boolean {
  if (candles.length < 30) return false;
  try {
    const signals = calculateChanLunSignals(candles);
    // 检查最近5个信号中是否有买入信号
    const recentSignals = signals.slice(-5);
    return recentSignals.some(s => s.signalType === 'buy' && s.divergence);
  } catch {
    return false;
  }
}

/**
 * 检查缠论卖出信号（用于选股）
 * 检查最近是否出现顶分型+MACD顶背离
 */
export function checkChanLunSellSignal(candles: Candle[]): boolean {
  if (candles.length < 30) return false;
  try {
    const signals = calculateChanLunSignals(candles);
    const recentSignals = signals.slice(-5);
    return recentSignals.some(s => s.signalType === 'sell' && s.divergence);
  } catch {
    return false;
  }
}


// ============ 高级禅动指标 (Advanced Chan) ============

/**
 * K线合并（处理包含关系）
 * 上升趋势取高高低高，下降趋势取低高低低
 */
interface MergedBar { high: number; low: number; index: number; origIndices: number[]; }

function mergeKlines(candles: Candle[]): MergedBar[] {
  if (candles.length === 0) return [];
  const merged: MergedBar[] = [{ high: candles[0].high, low: candles[0].low, index: 0, origIndices: [0] }];
  for (let i = 1; i < candles.length; i++) {
    const last = merged[merged.length - 1];
    const h = candles[i].high, l = candles[i].low;
    const contain1 = h >= last.high && l <= last.low;
    const contain2 = h <= last.high && l >= last.low;
    if (contain1 || contain2) {
      const isUp = merged.length >= 2 ? merged[merged.length - 2].high < last.high : h > last.high;
      if (isUp) {
        last.high = Math.max(last.high, h);
        last.low = Math.max(last.low, l);
      } else {
        last.high = Math.min(last.high, h);
        last.low = Math.min(last.low, l);
      }
      last.origIndices.push(i);
    } else {
      merged.push({ high: h, low: l, index: i, origIndices: [i] });
    }
  }
  return merged;
}

interface Fractal { type: 'top' | 'bottom'; barIndex: number; price: number; mergedIdx: number; }

function findFractals(bars: MergedBar[]): Fractal[] {
  const fractals: Fractal[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const prev = bars[i - 1], curr = bars[i], next = bars[i + 1];
    if (curr.high > prev.high && curr.high > next.high && curr.low > prev.low && curr.low > next.low) {
      fractals.push({ type: 'top', barIndex: curr.index, price: curr.high, mergedIdx: i });
    } else if (curr.low < prev.low && curr.low < next.low && curr.high < prev.high && curr.high < next.high) {
      fractals.push({ type: 'bottom', barIndex: curr.index, price: curr.low, mergedIdx: i });
    }
  }
  return fractals;
}

export function findBiPoints(candles: Candle[]): BiPoint[] {
  if (candles.length < 10) return [];
  const merged = mergeKlines(candles);
  const fractals = findFractals(merged);
  if (fractals.length < 2) return [];
  const validFractals: Fractal[] = [fractals[0]];
  for (let i = 1; i < fractals.length; i++) {
    const last = validFractals[validFractals.length - 1];
    const curr = fractals[i];
    if (curr.type === last.type) {
      if (curr.type === 'top' && curr.price > last.price) validFractals[validFractals.length - 1] = curr;
      else if (curr.type === 'bottom' && curr.price < last.price) validFractals[validFractals.length - 1] = curr;
    } else {
      const gap = Math.abs(curr.mergedIdx - last.mergedIdx);
      if (gap >= 4) {
        if ((last.type === 'top' && last.price > curr.price) || (last.type === 'bottom' && last.price < curr.price)) {
          validFractals.push(curr);
        }
      } else {
        if (curr.type === 'top' && curr.price > last.price) validFractals[validFractals.length - 1] = curr;
        else if (curr.type === 'bottom' && curr.price < last.price) validFractals[validFractals.length - 1] = curr;
      }
    }
  }
  return validFractals.map(f => ({ index: f.barIndex, time: candles[f.barIndex].time, price: f.price, type: f.type === 'top' ? 'high' as const : 'low' as const }));
}

export function findZhongShu(biPoints: BiPoint[], candles: Candle[]): ZhongShu[] {
  if (biPoints.length < 4) return [];
  const zhongshus: ZhongShu[] = [];
  let i = 0;
  while (i < biPoints.length - 3) {
    const p1 = biPoints[i], p2 = biPoints[i + 1], p3 = biPoints[i + 2], p4 = biPoints[i + 3];
    const seg1High = Math.max(p1.price, p2.price), seg1Low = Math.min(p1.price, p2.price);
    const seg3High = Math.max(p3.price, p4.price), seg3Low = Math.min(p3.price, p4.price);
    const overlapHigh = Math.min(seg1High, seg3High), overlapLow = Math.max(seg1Low, seg3Low);
    if (overlapHigh > overlapLow) {
      let zsHigh = overlapHigh, zsLow = overlapLow, endIdx = i + 3;
      for (let j = i + 4; j < biPoints.length; j++) {
        if (biPoints[j].price >= zsLow && biPoints[j].price <= zsHigh) endIdx = j;
        else break;
      }
      const direction = p1.type === 'low' ? 'up' as const : 'down' as const;
      zhongshus.push({ startTime: candles[biPoints[i].index].time, endTime: candles[biPoints[endIdx].index].time, startIndex: biPoints[i].index, endIndex: biPoints[endIdx].index, high: zsHigh, low: zsLow, direction });
      i = endIdx;
    } else { i++; }
  }
  return zhongshus;
}

export function findChanBuySellPoints(biPoints: BiPoint[], zhongshus: ZhongShu[], candles: Candle[]): AdvancedChanSignal[] {
  if (biPoints.length < 5) return [];
  const signals: AdvancedChanSignal[] = [];
  const macdResult = calculateMACD(candles);
  const addedTimes = new Set<number>();
  // 1类买卖点：趋势反转（MACD背驰）
  for (let i = 4; i < biPoints.length; i++) {
    const curr = biPoints[i], prev2 = biPoints[i - 2];
    if (curr.type === 'low' && prev2.type === 'low' && curr.price <= prev2.price) {
      const currM = Math.abs(macdResult.macd[curr.index] || 0), prevM = Math.abs(macdResult.macd[prev2.index] || 0);
      if (currM < prevM * 0.8 && prevM > 0 && !addedTimes.has(curr.time)) {
        signals.push({ time: curr.time, type: 'buy', label: '1买', strength: 'strong', category: 'b1' });
        addedTimes.add(curr.time);
      }
    }
    if (curr.type === 'high' && prev2.type === 'high' && curr.price >= prev2.price) {
      const currM = Math.abs(macdResult.macd[curr.index] || 0), prevM = Math.abs(macdResult.macd[prev2.index] || 0);
      if (currM < prevM * 0.8 && prevM > 0 && !addedTimes.has(curr.time)) {
        signals.push({ time: curr.time, type: 'sell', label: '1卖', strength: 'strong', category: 's1' });
        addedTimes.add(curr.time);
      }
    }
  }
  // 2类买卖点
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    const sigBiIdx = biPoints.findIndex(b => b.time === sig.time);
    if (sigBiIdx < 0 || sigBiIdx + 2 >= biPoints.length) continue;
    if (sig.category === 'b1') {
      const nextLow = biPoints[sigBiIdx + 2];
      if (nextLow && nextLow.type === 'low' && nextLow.price > biPoints[sigBiIdx].price && !addedTimes.has(nextLow.time)) {
        signals.push({ time: nextLow.time, type: 'buy', label: '2买', strength: 'medium', category: 'b2' });
        addedTimes.add(nextLow.time);
      }
    }
    if (sig.category === 's1') {
      const nextHigh = biPoints[sigBiIdx + 2];
      if (nextHigh && nextHigh.type === 'high' && nextHigh.price < biPoints[sigBiIdx].price && !addedTimes.has(nextHigh.time)) {
        signals.push({ time: nextHigh.time, type: 'sell', label: '2卖', strength: 'medium', category: 's2' });
        addedTimes.add(nextHigh.time);
      }
    }
  }
  // 3类买卖点：离开中枢后回踩不进入中枢
  for (const zs of zhongshus) {
    const afterPoints = biPoints.filter(b => b.index > zs.endIndex);
    for (let j = 0; j < afterPoints.length && j < 6; j++) {
      const p = afterPoints[j];
      if (p.type === 'low' && p.price > zs.high && !addedTimes.has(p.time)) {
        signals.push({ time: p.time, type: 'buy', label: '3买', strength: 'medium', category: 'b3' });
        addedTimes.add(p.time); break;
      }
      if (p.type === 'high' && p.price < zs.low && !addedTimes.has(p.time)) {
        signals.push({ time: p.time, type: 'sell', label: '3卖', strength: 'medium', category: 's3' });
        addedTimes.add(p.time); break;
      }
    }
  }
  signals.sort((a, b) => a.time - b.time);
  return signals;
}

/**
 * 简化ZIGZAG算法 - 基于收盘价的锯齿线（保留用于趋势线）
 */
function zigzagClose(closes: number[], pct: number = 1): number[] {
  const result = new Array(closes.length).fill(0);
  if (closes.length === 0) return result;
  
  result[0] = closes[0];
  let lastPivot = closes[0];
  let lastPivotIdx = 0;
  let direction = 0; // 0=unknown, 1=up, -1=down
  
  for (let i = 1; i < closes.length; i++) {
    const change = (closes[i] - lastPivot) / lastPivot * 100;
    
    if (direction === 0) {
      if (Math.abs(change) >= pct) {
        direction = change > 0 ? 1 : -1;
        // Interpolate between lastPivot and current
        for (let j = lastPivotIdx; j <= i; j++) {
          const t = (j - lastPivotIdx) / (i - lastPivotIdx || 1);
          result[j] = lastPivot + (closes[i] - lastPivot) * t;
        }
        lastPivot = closes[i];
        lastPivotIdx = i;
      } else {
        result[i] = lastPivot;
      }
    } else if (direction === 1) {
      if (closes[i] >= lastPivot) {
        lastPivot = closes[i];
        lastPivotIdx = i;
        result[i] = closes[i];
      } else if ((lastPivot - closes[i]) / lastPivot * 100 >= pct) {
        // Reverse
        for (let j = lastPivotIdx; j <= i; j++) {
          const t = (j - lastPivotIdx) / (i - lastPivotIdx || 1);
          result[j] = lastPivot + (closes[i] - lastPivot) * t;
        }
        direction = -1;
        lastPivot = closes[i];
        lastPivotIdx = i;
      } else {
        result[i] = lastPivot;
      }
    } else {
      if (closes[i] <= lastPivot) {
        lastPivot = closes[i];
        lastPivotIdx = i;
        result[i] = closes[i];
      } else if ((closes[i] - lastPivot) / lastPivot * 100 >= pct) {
        for (let j = lastPivotIdx; j <= i; j++) {
          const t = (j - lastPivotIdx) / (i - lastPivotIdx || 1);
          result[j] = lastPivot + (closes[i] - lastPivot) * t;
        }
        direction = 1;
        lastPivot = closes[i];
        lastPivotIdx = i;
      } else {
        result[i] = lastPivot;
      }
    }
  }
  
  // Fill remaining
  for (let i = lastPivotIdx + 1; i < closes.length; i++) {
    if (result[i] === 0) result[i] = closes[i];
  }
  
  return result;
}

/**
 * 加权移动平均 (WMA) - 用于短高H/短低L计算
 */
function wma(data: number[], period: number): number[] {
  const result = new Array(data.length).fill(0);
  const weightSum = (period * (period + 1)) / 2;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result[i] = data[i];
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - period + 1 + j] * (j + 1);
    }
    result[i] = sum / weightSum;
  }
  return result;
}

/**
 * 前移函数 REFX1 - 将数据向前移动N个周期
 * 在通达信中 REFX1(X, N) 是将X的值前移N个周期
 */
function refx1(data: number[], n: number): number[] {
  const result = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    const srcIdx = i + n;
    if (srcIdx < data.length) {
      result[i] = data[srcIdx];
    } else {
      // 超出范围用最后的值填充
      result[i] = data[data.length - 1];
    }
  }
  return result;
}

/**
 * 计算高级禅动指标数据
 * 基于通达信公式转换
 */
export function calculateAdvancedChanData(candles: Candle[]): AdvancedChanData[] {
  if (candles.length < 30) return [];
  
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const n = candles.length;
  
  // 1. 趋势线系统
  const buyLineRaw = zigzagClose(closes, 1);
  const buyLine = buyLineRaw;
  const sellLine = ema(buyLineRaw, 3);
  
  // 2. 主力支撑/压力线 (D90系统)
  const shortH = wma(highs, 20);  // 短高H: 20周期加权高点
  const shortL = wma(lows, 20);   // 短低L: 20周期加权低点
  const d90H = ema(shortH, 90);   // D90H
  const d90L = ema(shortL, 90);   // D90L
  
  const d90Top: number[] = [];
  const d90Bottom: number[] = [];
  for (let i = 0; i < n; i++) {
    const spread = d90H[i] - d90L[i];
    d90Top.push(d90H[i] + spread * 2);
    d90Bottom.push(d90L[i] - spread * 2);
  }
  
  // 3. 主力中枢系统 (25周期)
  const maH25 = sma(highs, 25);
  const xh25 = refx1(maH25, Math.floor(25 / 2));
  const xxh25 = refx1(sma(xh25, 25), Math.floor(25 / 2));
  
  const maL25 = sma(lows, 25);
  const xl25 = refx1(maL25, Math.floor(25 / 2));
  const xxl25 = refx1(sma(xl25, 25), Math.floor(25 / 2));
  
  const zhongshuHigh: number[] = []; // 高0
  const zhongshuLow: number[] = [];  // 低0
  const longLine: number[] = [];     // 做多线
  const shortLineArr: number[] = []; // 做空线
  
  for (let i = 0; i < n; i++) {
    const spread = xxh25[i] - xxl25[i];
    zhongshuHigh.push(spread + xxh25[i]);     // 高0 = XXH25-XXL25+XXH25
    zhongshuLow.push(xxl25[i] * 2 - xxh25[i]); // 低0 = XXL25*2-XXH25
    longLine.push(xxl25[i] - spread);           // 做多线
    shortLineArr.push(spread + xxh25[i]);       // 做空线
  }
  
  // 4. 趋势定位
  const trends: Array<'bull' | 'bear' | 'range'> = [];
  for (let i = 0; i < n; i++) {
    const isBull = zhongshuLow[i] >= d90Bottom[i] && zhongshuHigh[i] >= d90Top[i];
    const isBear = zhongshuHigh[i] <= d90Top[i] && zhongshuLow[i] <= d90Bottom[i];
    if (isBull) trends.push('bull');
    else if (isBear) trends.push('bear');
    else trends.push('range');
  }
  
  // 构建结果
  const result: AdvancedChanData[] = [];
  for (let i = 0; i < n; i++) {
    result.push({
      time: candles[i].time,
      buyLine: buyLine[i],
      sellLine: sellLine[i],
      xxh25: xxh25[i],
      xxl25: xxl25[i],
      zhongshuHigh: zhongshuHigh[i],
      zhongshuLow: zhongshuLow[i],
      d90Top: d90Top[i],
      d90Bottom: d90Bottom[i],
      d90H: d90H[i],
      d90L: d90L[i],
      longLine: longLine[i],
      shortLine: shortLineArr[i],
      trend: trends[i],
    });
  }
  
  return result;
}

/**
 * 计算高级禅动买卖信号
 */
export function calculateAdvancedChanSignals(candles: Candle[], data: AdvancedChanData[]): AdvancedChanSignal[] {
  if (data.length < 5 || candles.length < 5) return [];
  
  const signals: AdvancedChanSignal[] = [];
  const n = Math.min(candles.length, data.length);
  
  for (let i = 1; i < n; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const candle = candles[i];
    const prevCandle = candles[i - 1];
    
    // 做多信号: 低点穿越做多线 (CROSS(做多, L))
    const crossLong = prev.longLine > prevCandle.low && curr.longLine <= candle.low;
    // 做空信号: 高点穿越做空线 (CROSS(H, 做空))
    const crossShort = prevCandle.high < prev.shortLine && candle.high >= curr.shortLine;
    
    if (crossLong && curr.trend === 'bull') {
      signals.push({
        time: candle.time,
        type: 'buy',
        label: '多头买',
        strength: 'strong',
        category: 'trend_buy',
      });
    } else if (crossLong && curr.trend === 'range') {
      signals.push({
        time: candle.time,
        type: 'buy',
        label: '震荡买',
        strength: 'medium',
        category: 'range_buy',
      });
    }
    
    if (crossShort && curr.trend === 'bear') {
      signals.push({
        time: candle.time,
        type: 'sell',
        label: '空头卖',
        strength: 'strong',
        category: 'trend_sell',
      });
    } else if (crossShort && curr.trend === 'range') {
      signals.push({
        time: candle.time,
        type: 'sell',
        label: '震荡卖',
        strength: 'medium',
        category: 'range_sell',
      });
    }
    
    // 接近黄金主力支撑线 (D90底)
    const distToSupport = Math.abs(candle.low - curr.d90Bottom) / candle.close;
    if (distToSupport < 0.02 && candle.low <= curr.d90Bottom * 1.02) {
      signals.push({
        time: candle.time,
        type: 'buy',
        label: '近支撑',
        strength: 'medium',
        category: 'near_support',
      });
    }
    
    // 接近主力压力线 (D90顶)
    const distToResistance = Math.abs(candle.high - curr.d90Top) / candle.close;
    if (distToResistance < 0.02 && candle.high >= curr.d90Top * 0.98) {
      signals.push({
        time: candle.time,
        type: 'sell',
        label: '近压力',
        strength: 'medium',
        category: 'near_resistance',
      });
    }
    
    // 接近主力中枢区域
    const zhongshuMid = (curr.xxh25 + curr.xxl25) / 2;
    const distToZhongshu = Math.abs(candle.close - zhongshuMid) / candle.close;
    if (distToZhongshu < 0.015) {
      signals.push({
        time: candle.time,
        type: candle.close > zhongshuMid ? 'sell' : 'buy',
        label: '近中枢',
        strength: 'weak',
        category: 'near_zhongshu',
      });
    }
  }
  
  return signals;
}

/**
 * 检查高级禅动买入信号（用于选股）
 */
export function checkAdvancedChanBuySignal(candles: Candle[]): boolean {
  if (candles.length < 30) return false;
  try {
    const data = calculateAdvancedChanData(candles);
    const signals = calculateAdvancedChanSignals(candles, data);
    const recent = signals.slice(-5);
    return recent.some(s => s.type === 'buy' && (s.category === 'trend_buy' || s.category === 'range_buy'));
  } catch { return false; }
}

/**
 * 检查高级禅动卖出信号（用于选股）
 */
export function checkAdvancedChanSellSignal(candles: Candle[]): boolean {
  if (candles.length < 30) return false;
  try {
    const data = calculateAdvancedChanData(candles);
    const signals = calculateAdvancedChanSignals(candles, data);
    const recent = signals.slice(-5);
    return recent.some(s => s.type === 'sell' && (s.category === 'trend_sell' || s.category === 'range_sell'));
  } catch { return false; }
}

/**
 * 检查接近黄金主力支撑线（用于选股）
 */
export function checkNearGoldenSupport(candles: Candle[]): boolean {
  if (candles.length < 30) return false;
  try {
    const data = calculateAdvancedChanData(candles);
    const signals = calculateAdvancedChanSignals(candles, data);
    const recent = signals.slice(-3);
    return recent.some(s => s.category === 'near_support');
  } catch { return false; }
}

/**
 * 检查接近主力筹码中枢（用于选股）
 */
export function checkNearZhongshu(candles: Candle[]): boolean {
  if (candles.length < 30) return false;
  try {
    const data = calculateAdvancedChanData(candles);
    const signals = calculateAdvancedChanSignals(candles, data);
    const recent = signals.slice(-3);
    return recent.some(s => s.category === 'near_zhongshu');
  } catch { return false; }
}

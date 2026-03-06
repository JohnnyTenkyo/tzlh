/**
 * 指标计算引擎
 * 黄蓝梯子（NX指标）+ CD抄底指标
 *
 * 蓝色梯子：EMA(24) 上边缘 / EMA(23) 下边缘（短周期EMA带）
 * 黄色梯子：EMA(89) 上边缘 / EMA(90) 下边缘（长周期EMA带）
 *
 * CD抄底信号：按富途牛牛源代码精确实现
 * - DXDX：抄底信号（底背离）
 * - DBJGXC：卖出信号（顶背离）
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
  blueDn: number[];   // EMA(23) - 下边缘
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
  diff: number[];    // DIFF = EMA(12) - EMA(26)（富途称DIFF）
  dea: number[];     // DEA = EMA(DIFF, 9)（富途称DEA）
  macd: number[];    // MACD柱 = (DIFF - DEA) * 2（富途源码）
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

  // DIFF = EMA(12) - EMA(26)
  const diff = emaFast.map((v, i) => v - emaSlow[i]);
  // DEA = EMA(DIFF, 9)
  const dea = calculateEMA(diff, signalPeriod);
  // MACD柱 = (DIFF - DEA) * 2
  const macd = diff.map((v, i) => (v - dea[i]) * 2);

  return { diff, dea, macd };
}

// ============ 辅助函数：BARSLAST（上次条件为真距当前的距离） ============
/**
 * 模拟富途BARSLAST(condition)
 * 返回：从当前bar往前，上次condition为true的距离（当前bar=0）
 * 如果从未为true，返回数组长度（大数）
 */
function barslastArray(condition: boolean[]): number[] {
  const n = condition.length;
  const result: number[] = new Array(n).fill(n);
  for (let i = 0; i < n; i++) {
    if (condition[i]) {
      result[i] = 0;
    } else {
      result[i] = i > 0 ? result[i - 1] + 1 : n;
    }
  }
  return result;
}

// ============ 辅助函数：LLV（N期内最低值） ============
function llvArray(data: number[], period: number): number[] {
  const n = data.length;
  const result: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - period + 1);
    let min = data[start];
    for (let j = start + 1; j <= i; j++) {
      if (data[j] < min) min = data[j];
    }
    result[i] = min;
  }
  return result;
}

// ============ 辅助函数：HHV（N期内最高值） ============
function hhvArray(data: number[], period: number): number[] {
  const n = data.length;
  const result: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - period + 1);
    let max = data[start];
    for (let j = start + 1; j <= i; j++) {
      if (data[j] > max) max = data[j];
    }
    result[i] = max;
  }
  return result;
}

// ============ 辅助函数：REF（前N期的值） ============
function refArray(data: number[], n: number): number[] {
  const len = data.length;
  const result: number[] = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    result[i] = i >= n ? data[i - n] : 0;
  }
  return result;
}

// ============ 辅助函数：CROSS(A, B) - A从下方穿越B ============
function crossArray(a: number[], b: number[]): boolean[] {
  const n = a.length;
  const result: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    result[i] = a[i - 1] < b[i - 1] && a[i] >= b[i];
  }
  return result;
}

// ============ CD抄底指标（完全按富途牛牛源代码实现） ============
export interface CDSignalResult {
  // 抄底信号（DXDX）
  dxdx: boolean[];
  // 卖出信号（DBJGXC）
  dbjgxc: boolean[];
  // 辅助信号
  ccc: boolean[];   // 底背离候选
  dbbl: boolean[];  // 顶背离候选
  // MACD数据
  diff: number[];
  dea: number[];
  macd: number[];
}

export function calculateCDSignal(candles: Candle[]): CDSignalResult {
  const n = candles.length;
  const closes = candles.map(c => c.close);
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);

  const { diff, dea, macd } = calculateMACD(candles);

  // CROSS(0, MACD) = MACD从负穿越0（MACD柱由负转正）
  const zero = new Array(n).fill(0);
  const macdCrossUp = crossArray(zero, macd);   // CROSS(0, MACD) - macd从负变正
  const macdCrossDn = crossArray(macd, zero);   // CROSS(MACD, 0) - macd从正变负

  // N1 = BARSLAST(CROSS(0,MACD)) - 距上次MACD柱由负转正的距离
  const n1Arr = barslastArray(macdCrossUp);
  // MM1 = BARSLAST(CROSS(MACD,0)) - 距上次MACD柱由正转负的距离
  const mm1Arr = barslastArray(macdCrossDn);

  // N1_SAFE = IF(N1=0,1,MAX(N1+1,1))
  const n1Safe = n1Arr.map(v => v === 0 ? 1 : Math.max(v + 1, 1));
  // MM1_SAFE = IF(MM1=0,1,MAX(MM1+1,1))
  const mm1Safe = mm1Arr.map(v => v === 0 ? 1 : Math.max(v + 1, 1));

  // CC1 = LLV(CLOSE, N1_SAFE) - 当前负MACD区间内的最低收盘价
  // 注意：N1_SAFE是每个bar的值，需要逐bar计算
  const cc1 = new Array(n).fill(0);
  const cc2 = new Array(n).fill(0);
  const cc3 = new Array(n).fill(0);
  const difl1 = new Array(n).fill(0);
  const difl2 = new Array(n).fill(0);
  const difl3 = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const p1 = n1Safe[i];
    const p2 = mm1Safe[i];

    // CC1 = LLV(CLOSE, N1_SAFE) - 当前负MACD段内最低收盘价
    const cc1Start = Math.max(0, i - p1 + 1);
    cc1[i] = Math.min(...closes.slice(cc1Start, i + 1));

    // DIFL1 = LLV(DIFF, N1_SAFE) - 当前负MACD段内DIFF最低值
    const difl1Start = Math.max(0, i - p1 + 1);
    difl1[i] = Math.min(...diff.slice(difl1Start, i + 1));

    // CC2 = IF(REF(CC1,MM1_SAFE)=0, CC1, REF(CC1,MM1_SAFE))
    // 即：上一个正MACD段的CC1
    const refIdx2 = i - p2;
    const refCC1 = refIdx2 >= 0 ? cc1[refIdx2] : 0;
    cc2[i] = refCC1 === 0 ? cc1[i] : refCC1;

    // CC3 = IF(REF(CC2,MM1_SAFE)=0, CC2, REF(CC2,MM1_SAFE))
    const refCC2 = refIdx2 >= 0 ? cc2[refIdx2] : 0;
    cc3[i] = refCC2 === 0 ? cc2[i] : refCC2;

    // DIFL2 = IF(REF(DIFL1,MM1_SAFE)=0, DIFL1, REF(DIFL1,MM1_SAFE))
    const refDifl1 = refIdx2 >= 0 ? difl1[refIdx2] : 0;
    difl2[i] = refDifl1 === 0 ? difl1[i] : refDifl1;

    // DIFL3 = IF(REF(DIFL2,MM1_SAFE)=0, DIFL2, REF(DIFL2,MM1_SAFE))
    const refDifl2 = refIdx2 >= 0 ? difl2[refIdx2] : 0;
    difl3[i] = refDifl2 === 0 ? difl2[i] : refDifl2;
  }

  // 买入条件
  // AAA = CC1 < CC2 AND DIFL1 > DIFL2 AND REF(MACD,1) < 0 AND DIFF < 0
  // 价格创新低但DIFF未创新低（一次底背离）
  const aaa = new Array(n).fill(false);
  // BBB = CC1 < CC3 AND DIFL1 < DIFL2 AND DIFL1 > DIFL3 AND REF(MACD,1) < 0 AND DIFF < 0
  // 价格创更低新低但DIFF在中间（二次底背离）
  const bbb = new Array(n).fill(false);

  for (let i = 1; i < n; i++) {
    aaa[i] = cc1[i] < cc2[i] && difl1[i] > difl2[i] && macd[i - 1] < 0 && diff[i] < 0;
    bbb[i] = cc1[i] < cc3[i] && difl1[i] < difl2[i] && difl1[i] > difl3[i] && macd[i - 1] < 0 && diff[i] < 0;
  }

  // CCC = (AAA OR BBB) AND DIFF < 0
  const ccc = aaa.map((a, i) => (a || bbb[i]) && diff[i] < 0);

  // LLL = NOT(REF(CCC,1)) AND CCC - 底背离刚出现
  const lll = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    lll[i] = !ccc[i - 1] && ccc[i];
  }

  // XXX = REF(AAA,1) AND DIFL1 <= DIFL2 AND DIFF < DEA
  //     OR REF(BBB,1) AND DIFL1 <= DIFL3 AND DIFF < DEA
  const xxx = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    xxx[i] = (aaa[i - 1] && difl1[i] <= difl2[i] && diff[i] < dea[i])
           || (bbb[i - 1] && difl1[i] <= difl3[i] && diff[i] < dea[i]);
  }

  // JJJ = REF(CCC,1) AND ABS(REF(DIFF,1)) >= ABS(DIFF) * 1.01
  // 底背离后DIFF继续缩小（确认信号）
  const jjj = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    jjj[i] = ccc[i - 1] && Math.abs(diff[i - 1]) >= Math.abs(diff[i]) * 1.01;
  }

  // BLBL = REF(JJJ,1) AND CCC AND ABS(REF(DIFF,1)) * 1.01 <= ABS(DIFF)
  const blbl = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    blbl[i] = jjj[i - 1] && ccc[i] && Math.abs(diff[i - 1]) * 1.01 <= Math.abs(diff[i]);
  }

  // DXDX = NOT(REF(JJJ,1)) AND JJJ - 抄底信号首次出现
  const dxdx = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    dxdx[i] = !jjj[i - 1] && jjj[i];
  }

  // DJGXX = (CLOSE < CC2 OR CLOSE < CC1) AND (REF(JJJ,MM1_SAFE) OR REF(JJJ,MM1))
  //       AND NOT(REF(LLL,1)) AND SUM(IF(JJJ,1,0),24) >= 1
  const djgxx = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const p2 = mm1Safe[i];
    const refJjjMm1Safe = i >= p2 ? jjj[i - p2] : false;
    const refJjjMm1 = i >= mm1Arr[i] ? jjj[i - mm1Arr[i]] : false;
    // SUM(IF(JJJ,1,0),24) >= 1
    const jjjSum = jjj.slice(Math.max(0, i - 23), i + 1).filter(Boolean).length;
    djgxx[i] = (closes[i] < cc2[i] || closes[i] < cc1[i])
             && (refJjjMm1Safe || refJjjMm1)
             && !lll[i - 1]
             && jjjSum >= 1;
  }

  // DJXX = NOT(SUM(IF(REF(DJGXX,1),1,0),2) >= 1) AND DJGXX
  const djxx = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const prevDjgxxSum = djgxx.slice(Math.max(0, i - 1), i).filter(Boolean).length;
    djxx[i] = prevDjgxxSum < 1 && djgxx[i];
  }

  // DXX = (XXX OR DJXX) AND NOT(CCC)
  const dxx = xxx.map((x, i) => (x || djxx[i]) && !ccc[i]);

  // ============ 卖出条件 ============
  // CH1 = HHV(CLOSE, MM1_SAFE)
  const ch1 = new Array(n).fill(0);
  const ch2 = new Array(n).fill(0);
  const ch3 = new Array(n).fill(0);
  const difh1 = new Array(n).fill(0);
  const difh2 = new Array(n).fill(0);
  const difh3 = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const p1 = n1Safe[i];
    const p2 = mm1Safe[i];

    // CH1 = HHV(CLOSE, MM1_SAFE) - 当前正MACD段内最高收盘价
    const ch1Start = Math.max(0, i - p2 + 1);
    ch1[i] = Math.max(...closes.slice(ch1Start, i + 1));

    // DIFH1 = HHV(DIFF, MM1_SAFE)
    const difh1Start = Math.max(0, i - p2 + 1);
    difh1[i] = Math.max(...diff.slice(difh1Start, i + 1));

    // CH2 = IF(REF(CH1,N1_SAFE)=0, CH1, REF(CH1,N1_SAFE))
    const refIdx1 = i - p1;
    const refCh1 = refIdx1 >= 0 ? ch1[refIdx1] : 0;
    ch2[i] = refCh1 === 0 ? ch1[i] : refCh1;

    // CH3 = IF(REF(CH2,N1_SAFE)=0, CH2, REF(CH2,N1_SAFE))
    const refCh2 = refIdx1 >= 0 ? ch2[refIdx1] : 0;
    ch3[i] = refCh2 === 0 ? ch2[i] : refCh2;

    // DIFH2 = IF(REF(DIFH1,N1_SAFE)=0, DIFH1, REF(DIFH1,N1_SAFE))
    const refDifh1 = refIdx1 >= 0 ? difh1[refIdx1] : 0;
    difh2[i] = refDifh1 === 0 ? difh1[i] : refDifh1;

    // DIFH3 = IF(REF(DIFH2,N1_SAFE)=0, DIFH2, REF(DIFH2,N1_SAFE))
    const refDifh2 = refIdx1 >= 0 ? difh2[refIdx1] : 0;
    difh3[i] = refDifh2 === 0 ? difh2[i] : refDifh2;
  }

  // ZJDBL = CH1 > CH2 AND DIFH1 < DIFH2 AND REF(MACD,1) > 0 AND DIFF > 0
  const zjdbl = new Array(n).fill(false);
  // GXDBL = CH1 > CH3 AND DIFH1 > DIFH2 AND DIFH1 < DIFH3 AND REF(MACD,1) > 0 AND DIFF > 0
  const gxdbl = new Array(n).fill(false);

  for (let i = 1; i < n; i++) {
    zjdbl[i] = ch1[i] > ch2[i] && difh1[i] < difh2[i] && macd[i - 1] > 0 && diff[i] > 0;
    gxdbl[i] = ch1[i] > ch3[i] && difh1[i] > difh2[i] && difh1[i] < difh3[i] && macd[i - 1] > 0 && diff[i] > 0;
  }

  // DBBL = (ZJDBL OR GXDBL) AND DIFF > 0
  const dbbl = zjdbl.map((z, i) => (z || gxdbl[i]) && diff[i] > 0);

  // DBL = NOT(REF(DBBL,1)) AND DBBL AND DIFF > DEA
  const dbl = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    dbl[i] = !dbbl[i - 1] && dbbl[i] && diff[i] > dea[i];
  }

  // DBLXS = REF(ZJDBL,1) AND DIFH1 >= DIFH2 AND DIFF > DEA
  //       OR REF(GXDBL,1) AND DIFH1 >= DIFH3 AND DIFF > DEA
  const dblxs = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    dblxs[i] = (zjdbl[i - 1] && difh1[i] >= difh2[i] && diff[i] > dea[i])
             || (gxdbl[i - 1] && difh1[i] >= difh3[i] && diff[i] > dea[i]);
  }

  // DBJG = REF(DBBL,1) AND REF(DIFF,1) >= DIFF * 1.01
  const dbjg = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    dbjg[i] = dbbl[i - 1] && diff[i - 1] >= diff[i] * 1.01;
  }

  // DBJGXC = NOT(REF(DBJG,1)) AND DBJG - 卖出信号首次出现
  const dbjgxc = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    dbjgxc[i] = !dbjg[i - 1] && dbjg[i];
  }

  // DBJGBL = REF(DBJG,1) AND DBBL AND REF(DIFF,1) * 1.01 <= DIFF
  const dbjgbl = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    dbjgbl[i] = dbjg[i - 1] && dbbl[i] && diff[i - 1] * 1.01 <= diff[i];
  }

  // ZZZZZ = (CLOSE > CH2 OR CLOSE > CH1) AND (REF(DBJG,N1_SAFE) OR REF(DBJG,N1))
  //       AND NOT(REF(DBL,1)) AND SUM(IF(DBJG,1,0),23) >= 1
  const zzzzz = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const p1 = n1Safe[i];
    const refDbjgN1Safe = i >= p1 ? dbjg[i - p1] : false;
    const refDbjgN1 = i >= n1Arr[i] ? dbjg[i - n1Arr[i]] : false;
    const dbjgSum = dbjg.slice(Math.max(0, i - 22), i + 1).filter(Boolean).length;
    zzzzz[i] = (closes[i] > ch2[i] || closes[i] > ch1[i])
             && (refDbjgN1Safe || refDbjgN1)
             && !dbl[i - 1]
             && dbjgSum >= 1;
  }

  // YYYYY = NOT(SUM(IF(REF(ZZZZZ,1),1,0),2) >= 1) AND ZZZZZ
  const yyyyy = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const prevZzzzzSum = zzzzz.slice(Math.max(0, i - 1), i).filter(Boolean).length;
    yyyyy[i] = prevZzzzzSum < 1 && zzzzz[i];
  }

  // WWWWW = (DBLXS OR YYYYY) AND NOT(DBBL)
  const wwwww = dblxs.map((d, i) => (d || yyyyy[i]) && !dbbl[i]);

  return {
    dxdx,
    dbjgxc,
    ccc,
    dbbl,
    diff,
    dea,
    macd,
  };
}

// ============ CD信号接口（向后兼容） ============
export interface CDSignal {
  // 抄底信号（DXDX）
  hasCDSignal: boolean;
  // 卖出信号（DBJGXC）
  hasSellSignal: boolean;
  // 底背离候选（CCC）
  hasDivergenceCandidate: boolean;
  // 信号强度
  strength: number;
  // 最新bar的DIFF/DEA/MACD值
  latestDiff: number;
  latestDea: number;
  latestMacd: number;
}

/**
 * 检查最近lookback根K线内是否有CD抄底信号（DXDX）
 */
export function getCDSignal(candles: Candle[], lookback = 5): CDSignal {
  const n = candles.length;
  if (n < 60) {
    return {
      hasCDSignal: false,
      hasSellSignal: false,
      hasDivergenceCandidate: false,
      strength: 0,
      latestDiff: 0,
      latestDea: 0,
      latestMacd: 0,
    };
  }

  const result = calculateCDSignal(candles);
  const { dxdx, dbjgxc, ccc, diff, dea, macd } = result;

  // 检查最近lookback根K线内是否有DXDX信号
  const startIdx = Math.max(1, n - lookback);
  let hasCDSignal = false;
  let hasSellSignal = false;
  let hasDivergenceCandidate = false;

  for (let i = startIdx; i < n; i++) {
    if (dxdx[i]) hasCDSignal = true;
    if (dbjgxc[i]) hasSellSignal = true;
    if (ccc[i]) hasDivergenceCandidate = true;
  }

  // 信号强度：DXDX=2，CCC候选=1
  const strength = (hasCDSignal ? 2 : 0) + (hasDivergenceCandidate ? 1 : 0);

  return {
    hasCDSignal,
    hasSellSignal,
    hasDivergenceCandidate,
    strength,
    latestDiff: diff[n - 1],
    latestDea: dea[n - 1],
    latestMacd: macd[n - 1],
  };
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

  // 检查各级别CD信号（DXDX）
  for (const tf of TIMEFRAME_ORDER) {
    const c = candles[tf];
    if (c && c.length >= 60) {
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
    // 其他有CD信号且有蓝梯突破的情况（如4h、3h等）
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

  // 加分项：CD信号强度
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
  timeframe: Timeframe;  // 买入时所用的蓝梯级别（最低级别）
  cdTimeframe: Timeframe; // CD信号级别描述
  reason: string;
}

// 时间级别顺序（从小到大）
const TF_ORDER: Timeframe[] = ["15m", "30m", "1h", "2h", "3h", "4h", "1d", "1w"];

export function detectBuySignal(
  candles: TimeframeCandles,
  cdTimeframes: Timeframe[],
  ladderTimeframes: Timeframe[],
  cdLookback: number,
  currentPrice: number
): BuySignal | null {
  // 步骤1：检查所有用户选择的CD信号级别是否都满足（多选时需同时满足）
  for (const tf of cdTimeframes) {
    const c = candles[tf];
    if (!c || c.length < 60) return null;
    if (!hasCDSignalInRange(c, cdLookback)) return null;
  }

  // 步骤2：找到用户选择的蓝梯级别中最低的级别（用于买入判断）
  // 按级别从小到大排序，取最小的级别
  const sortedLadderTfs = [...ladderTimeframes].sort(
    (a, b) => TF_ORDER.indexOf(a) - TF_ORDER.indexOf(b)
  );

  const cdDesc = cdTimeframes.join("/");

  for (const tf of sortedLadderTfs) {
    const c = candles[tf];
    if (!c || c.length < 90) continue;

    const ladder = calculateLadder(c);
    const sig = getLadderSignal(c, ladder);

    // 第一买点：最低级别蓝梯上边缘刚刚突破黄梯上边缘
    // （前一根K线蓝梯上边缘 <= 黄梯上边缘，当前蓝梯上边缘 > 黄梯上边缘）
    if (sig.blueCrossYellowUp) {
      return {
        type: "first_buy",
        timeframe: tf,
        cdTimeframe: cdTimeframes[cdTimeframes.length - 1] || tf,
        reason: `${cdDesc}级别CD抄底信号(DXDX) + ${tf}级别蓝梯上边缘刚刚突破黄梯上边缘（第一买点，买入50%仓位）`,
      };
    }
  }

  // 第二买点检查：最低级别蓝梯下边缘 > 黄梯上边缘
  for (const tf of sortedLadderTfs) {
    const c = candles[tf];
    if (!c || c.length < 90) continue;

    const ladder = calculateLadder(c);
    const sig = getLadderSignal(c, ladder);

    if (sig.blueDnAboveYellowUp) {
      return {
        type: "second_buy",
        timeframe: tf,
        cdTimeframe: cdTimeframes[cdTimeframes.length - 1] || tf,
        reason: `${cdDesc}级别CD抄底信号(DXDX) + ${tf}级别蓝梯下边缘高于黄梯上边缘（第二买点，买入50%仓位）`,
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
  /**
   * 卖出规则：
   * - 第一卖点：买入级别的上一级别K线收盘价跌破蓝梯下边缘 → 卖出50%
   * - 第二卖点：买入级别蓝梯上边缘 < 黄梯下边缘 → 卖出50%
   * - 日线卖出：日线DBJGXC信号 + 日线收盘跌破蓝梯下边缘 → 分批卖出
   */
  const tfOrder: Timeframe[] = ["15m", "30m", "1h", "2h", "3h", "4h", "1d", "1w"];
  const entryIdx = tfOrder.indexOf(entryTimeframe);

  // 卖出条件1：买入级别的上一级别K线收盘价跌破蓝梯下边缘（卖偐50%）
  // 注：上一级别是买入级别的上一级，不是上两级
  if (entryIdx >= 0 && entryIdx < tfOrder.length - 1) {
    const upperTf = tfOrder[entryIdx + 1] as Timeframe;
    const upperCandles = candles[upperTf];
    if (upperCandles && upperCandles.length >= 90) {
      const ladder = calculateLadder(upperCandles);
      const sig = getLadderSignal(upperCandles, ladder);
      if (sig.closeBelowBlueDn) {
        return {
          type: "first_sell",
          timeframe: upperTf,
          reason: `买入级别${entryTimeframe}的上一级别${upperTf}K线收盘价（${currentPrice.toFixed(2)}）跌破蓝梯下边缘（${sig.latestBlueDn.toFixed(2)}），卖出50%仓位`,
        };
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

  // 卖出条件3：日线DBJGXC卖出信号
  const dailyCandles = candles["1d"];
  if (dailyCandles && dailyCandles.length >= 60) {
    const cdResult = calculateCDSignal(dailyCandles);
    const n = dailyCandles.length;

    // 检查最近3根K线内是否有DBJGXC信号
    const hasDailySell = cdResult.dbjgxc.slice(Math.max(0, n - 3)).some(Boolean);

    if (hasDailySell && !dailySellTriggered) {
      const ladder = calculateLadder(dailyCandles);
      const sig = getLadderSignal(dailyCandles, ladder);
      if (sig.closeBelowBlueDn) {
        return {
          type: "daily_sell_half",
          timeframe: "1d",
          reason: `日线DBJGXC顶背离卖出信号 + 收盘跌破日线蓝梯下边缘，卖出50%仓位`,
        };
      }
    }
  }

  return null;
}

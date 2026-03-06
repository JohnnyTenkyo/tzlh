export interface Candle {
  time: number; // Unix timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

export interface CDSignal {
  time: number;
  type: 'buy' | 'sell';
  strength: 'strong' | 'medium' | 'weak';
  label: string;
  diffValue?: number;
  deaValue?: number;
  macdValue?: number;
}

export interface BuySellPressure {
  time: number;
  pressure: number;
  changeRate: number;
  signal?: 'strong_up' | 'strong_down';
}

export interface LadderLevel {
  time: number;
  blueUp: number;
  blueDn: number;
  yellowUp: number;
  yellowDn: number;
  blueMid?: number;
  yellowMid?: number;
}

export interface NXSignal {
  time: number;
  type: 'buy' | 'sell';
  label: string;
}

export interface MomentumSignal {
  time: number;
  buyMomentum: number;
  sellMomentum: number;
  diff: number;
  signal?: 'double_digit_up' | 'double_digit_down' | 'yellow_cross_green' | 'green_to_red' | 'strong_buy';
}

// 缠论顶底分型信号
export interface ChanLunSignal {
  time: number;
  type: 'top' | 'bottom';  // 顶分型 or 底分型
  signalType?: 'buy' | 'sell';  // 配合MACD背离的买卖点
  label: string;
  strength: 'strong' | 'medium' | 'weak';
  divergence?: boolean;  // 是否有MACD背离
}

// 笔端点
export interface BiPoint {
  index: number;   // 原始K线索引
  time: number;    // 时间戳
  price: number;   // 价格（高点或低点）
  type: 'high' | 'low';  // 高点或低点
}

// 中枢区域
export interface ZhongShu {
  startTime: number;
  endTime: number;
  startIndex: number;
  endIndex: number;
  high: number;    // 中枢上沿
  low: number;     // 中枢下沿
  direction: 'up' | 'down';  // 所在趋势方向
}

// 高级禅动指标数据（每根K线一组值）
export interface AdvancedChanData {
  time: number;
  // 趋势线
  buyLine: number;    // 买线 (ZIGZAG)
  sellLine: number;   // 卖线 (EMA of buyLine)
  // 主力中枢
  xxh25: number;      // 中枢上轨
  xxl25: number;      // 中枢下轨
  zhongshuHigh: number; // 中枢扩展上轨 (高0)
  zhongshuLow: number;  // 中枢扩展下轨 (低0)
  // 主力支撑/压力线 (D90)
  d90Top: number;     // D90顶部压力
  d90Bottom: number;  // D90底部支撑
  d90H: number;       // D90高
  d90L: number;       // D90低
  // 做多做空线
  longLine: number;   // 做多线
  shortLine: number;  // 做空线
  // 趋势定位
  trend: 'bull' | 'bear' | 'range'; // 多头/空头/震荡
}

// 高级禅动买卖信号
export interface AdvancedChanSignal {
  time: number;
  type: 'buy' | 'sell';
  label: string;
  strength: 'strong' | 'medium' | 'weak';
  category: 'b1' | 'b2' | 'b3' | 's1' | 's2' | 's3' | 'trend_buy' | 'trend_sell' | 'range_buy' | 'range_sell' | 'near_support' | 'near_resistance' | 'near_zhongshu';
}

export type TimeInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '3h' | '4h' | '1d' | '1w' | '1mo';

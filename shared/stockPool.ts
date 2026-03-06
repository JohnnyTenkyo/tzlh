/**
 * 美股股票池
 */
export const STOCK_POOL = [
  // 科技巨头
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA", "NFLX", "ADBE",
  // 半导体
  "AMD", "INTC", "QCOM", "AVGO", "MU", "AMAT", "LRCX", "KLAC", "MRVL", "SMCI",
  // AI/云计算
  "PLTR", "AI", "SNOW", "DDOG", "NET", "CRWD", "ZS", "OKTA", "MDB", "CFLT",
  // 比特币/加密
  "MSTR", "MARA", "RIOT", "COIN", "CLSK", "BTBT", "HUT",
  // 中概股
  "BABA", "PDD", "JD", "BIDU", "BILI", "NIO", "XPEV", "LI", "TCOM", "TME",
  // 电动车
  "RIVN", "LCID", "FSR",
  // 金融科技
  "SQ", "PYPL", "SOFI", "AFRM", "UPST",
  // 生物医疗
  "MRNA", "BNTX", "REGN", "VRTX", "ILMN",
  // ETF
  "QQQ", "SPY", "ARKK", "SOXL", "TQQQ",
  // 其他大盘股
  "JPM", "BAC", "GS", "MS", "V", "MA", "PYPL",
  "WMT", "COST", "TGT", "AMZN",
  "XOM", "CVX", "COP",
  "LLY", "JNJ", "PFE", "ABBV",
  "BRK-B", "UNH", "HD",
];

// 去重
export const US_STOCKS = Array.from(new Set(STOCK_POOL));

export const MARKET_CAP_FILTERS = {
  none: 0,
  "1b": 1e9,
  "10b": 10e9,
  "50b": 50e9,
  "100b": 100e9,
  "500b": 500e9,
} as const;

export type MarketCapFilter = keyof typeof MARKET_CAP_FILTERS;

export const MARKET_CAP_LABELS: Record<MarketCapFilter, string> = {
  none: "无限制",
  "1b": "10亿美元以上",
  "10b": "100亿美元以上",
  "50b": "500亿美元以上",
  "100b": "1000亿美元以上",
  "500b": "5000亿美元以上",
};

export const TIMEFRAME_LABELS: Record<string, string> = {
  "1w": "周线",
  "1d": "日线",
  "4h": "4小时",
  "3h": "3小时",
  "2h": "2小时",
  "1h": "1小时",
  "30m": "30分钟",
  "15m": "15分钟",
};

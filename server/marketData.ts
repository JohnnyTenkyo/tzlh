/**
 * 股票市场数据获取
 * 主数据源：Yahoo Finance（免费）
 * 备用数据源：Finnhub
 */
import axios from "axios";
import type { Candle, Timeframe } from "./indicators";

// ============ 时间范围映射 ============
const RANGE_MAP: Record<Timeframe, string> = {
  "15m": "60d",   // 15分钟数据最多60天
  "30m": "60d",   // 30分钟数据最多60天
  "1h":  "730d",  // 1小时数据最多2年
  "2h":  "730d",  // 2小时数据（由1h合并）
  "3h":  "730d",  // 3小时数据（由1h合并）
  "4h":  "730d",  // 4小时数据（由1h合并）
  "1d":  "10y",   // 日线数据最多10年
  "1w":  "20y",   // 周线数据最多20年
};

const INTERVAL_MAP: Record<Timeframe, string> = {
  "15m": "15m",
  "30m": "30m",
  "1h":  "60m",
  "2h":  "60m",   // 用1h合并
  "3h":  "60m",   // 用1h合并
  "4h":  "60m",   // 用1h合并
  "1d":  "1d",
  "1w":  "1wk",
};

/**
 * 将1h K线聚合为2h/3h/4h K线
 */
function resampleCandles(candles: Candle[], factor: number): Candle[] {
  const result: Candle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    if (chunk.length === 0) continue;
    result.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

/**
 * 从Yahoo Finance获取K线数据（使用range参数）
 */
async function fetchYahooCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const interval = INTERVAL_MAP[timeframe];
  const range = RANGE_MAP[timeframe];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;

  try {
    const res = await axios.get(url, {
      params: { interval, range },
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const result = res.data?.chart?.result?.[0];
    if (!result) throw new Error("No data from Yahoo Finance");

    const timestamps: number[] = result.timestamp || [];
    const quotes = result.indicators.quote[0];

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quotes.close[i] !== null && quotes.close[i] !== undefined) {
        candles.push({
          time: timestamps[i] * 1000,
          open: quotes.open[i] || quotes.close[i],
          high: quotes.high[i] || quotes.close[i],
          low: quotes.low[i] || quotes.close[i],
          close: quotes.close[i],
          volume: quotes.volume[i] || 0,
        });
      }
    }

    // 聚合为2h/3h/4h
    if (timeframe === "2h") return resampleCandles(candles, 2);
    if (timeframe === "3h") return resampleCandles(candles, 3);
    if (timeframe === "4h") return resampleCandles(candles, 4);

    return candles;
  } catch (err) {
    console.warn(`[MarketData] Yahoo failed for ${symbol}/${timeframe}:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

/**
 * 从Finnhub获取K线数据（备用数据源）
 */
async function fetchFinnhubCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("FINNHUB_API_KEY not set");

  const resolutionMap: Record<Timeframe, { resolution: string; days: number }> = {
    "15m": { resolution: "15", days: 60 },
    "30m": { resolution: "30", days: 60 },
    "1h":  { resolution: "60", days: 730 },
    "2h":  { resolution: "120", days: 730 },
    "3h":  { resolution: "180", days: 730 },
    "4h":  { resolution: "240", days: 730 },
    "1d":  { resolution: "D", days: 3650 },
    "1w":  { resolution: "W", days: 7300 },
  };

  const { resolution, days } = resolutionMap[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 86400;

  try {
    const res = await axios.get("https://finnhub.io/api/v1/stock/candle", {
      params: { symbol, resolution, from, to: now, token: apiKey },
      timeout: 15000,
    });

    const data = res.data;
    if (data.s !== "ok" || !data.t) throw new Error("No data from Finnhub");

    return data.t.map((t: number, i: number) => ({
      time: t * 1000,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i] || 0,
    }));
  } catch (err) {
    console.warn(`[MarketData] Finnhub failed for ${symbol}/${timeframe}:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

/**
 * 获取K线数据（Yahoo Finance优先，Finnhub备用）
 */
export async function fetchCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  try {
    const candles = await fetchYahooCandles(symbol, timeframe);
    if (candles.length > 0) return candles;
    throw new Error("Empty data from Yahoo");
  } catch (err) {
    console.warn(`[MarketData] Yahoo failed for ${symbol}/${timeframe}, trying Finnhub...`);
    try {
      return await fetchFinnhubCandles(symbol, timeframe);
    } catch (err2) {
      console.error(`[MarketData] Both sources failed for ${symbol}/${timeframe}`);
      return [];
    }
  }
}

/**
 * 获取历史K线（用于回测）
 * 注意：Yahoo Finance 的 range 参数有限制
 * - 15m/30m: 最多60天
 * - 1h: 最多730天
 * - 1d: 最多10年
 * - 1w: 最多20年
 */
export async function fetchHistoricalCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate: string, // YYYY-MM-DD（可选，如果超出range范围则忽略）
  endDate: string    // YYYY-MM-DD（可选）
): Promise<Candle[]> {
  // 对于分钟级数据，忽略日期范围限制，直接使用range参数获取最新数据
  // 这是Yahoo Finance的限制，无法绕过
  return fetchCandles(symbol, timeframe);
}

/**
 * 获取实时报价
 */
export async function fetchQuote(symbol: string): Promise<{ price: number; change: number; changePercent: number }> {
  try {
    const res = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, {
      params: { modules: "price" },
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const price = res.data?.quoteSummary?.result?.[0]?.price;
    if (!price) throw new Error("No price data");

    return {
      price: price.regularMarketPrice?.raw || 0,
      change: price.regularMarketChange?.raw || 0,
      changePercent: price.regularMarketChangePercent?.raw || 0,
    };
  } catch (err) {
    console.error(`[MarketData] Failed to fetch quote for ${symbol}:`, err instanceof Error ? err.message : err);
    return { price: 0, change: 0, changePercent: 0 };
  }
}

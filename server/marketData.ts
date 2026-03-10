/**
 * 股票市场数据获取
 * 主数据源：Finnhub
 * 备用数据源：Tiingo、Alpha Vantage、Yahoo Finance
 */
import axios from "axios";
import type { Candle, Timeframe } from "./indicators";
import { ENV } from "./_core/env";

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
 * 从Finnhub获取K线数据（主数据源）
 */
async function fetchFinnhubCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const apiKey = ENV.finnhubApiKey;
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
    const url = "https://finnhub.io/api/v1/stock/candle";
    const params = { symbol, resolution, from, to: now, token: apiKey };
    const res = await axios.get(url, {
      params,
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
    if (axios.isAxiosError(err) && err.response) {
      throw new Error(`Finnhub HTTP ${err.response.status}`);
    }
    throw err;
  }
}

/**
 * 从Tiingo获取K线数据（备用数据源）
 */
async function fetchTiingoCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const apiKey = ENV.tiingoApiKey;
  if (!apiKey) throw new Error("TIINGO_API_KEY not set");

  const resolutionMap: Record<Timeframe, string> = {
    "15m": "15min",
    "30m": "30min",
    "1h":  "1hour",
    "2h":  "1hour",  // 需要合并
    "3h":  "1hour",  // 需要合并
    "4h":  "1hour",  // 需要合并
    "1d":  "daily",
    "1w":  "weekly",
  };

  const resolution = resolutionMap[timeframe];
  const now = new Date();
  const startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];

  try {
    const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`;
    const params = { startDate, endDate, resampleFreq: resolution, token: apiKey };
    const res = await axios.get(url, {
      params,
      timeout: 15000,
    });

    if (!Array.isArray(res.data) || res.data.length === 0) throw new Error("No data from Tiingo");

    const candles: Candle[] = res.data.map((item: any) => ({
      time: new Date(item.date).getTime(),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume || 0,
    }));

    // 聚合为2h/3h/4h
    if (timeframe === "2h") return resampleCandles(candles, 2);
    if (timeframe === "3h") return resampleCandles(candles, 3);
    if (timeframe === "4h") return resampleCandles(candles, 4);

    return candles;
  } catch (err) {
    throw err;
  }
}

/**
 * 从Alpha Vantage获取K线数据（备用数据源）
 */
async function fetchAlphaVantageCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const apiKey = ENV.alphaVantageApiKey;
  if (!apiKey) throw new Error("ALPHAVANTAGE_API_KEY not set");

  const functionMap: Record<Timeframe, string> = {
    "15m": "TIME_SERIES_INTRADAY",
    "30m": "TIME_SERIES_INTRADAY",
    "1h":  "TIME_SERIES_INTRADAY",
    "2h":  "TIME_SERIES_INTRADAY",
    "3h":  "TIME_SERIES_INTRADAY",
    "4h":  "TIME_SERIES_INTRADAY",
    "1d":  "TIME_SERIES_DAILY",
    "1w":  "TIME_SERIES_WEEKLY",
  };

  const intervalMap: Record<Timeframe, string> = {
    "15m": "15min",
    "30m": "30min",
    "1h":  "60min",
    "2h":  "60min",
    "3h":  "60min",
    "4h":  "60min",
    "1d":  "",
    "1w":  "",
  };

  try {
    const func = functionMap[timeframe];
    const interval = intervalMap[timeframe];
    const params: any = { symbol, apikey: apiKey, outputsize: "full" };
    if (interval) params.interval = interval;

    const res = await axios.get("https://www.alphavantage.co/query", {
      params: { ...params, function: func },
      timeout: 15000,
    });

    const data = res.data;
    const timeSeriesKey = Object.keys(data).find(k => k.startsWith("Time Series"));
    if (!timeSeriesKey || !data[timeSeriesKey]) throw new Error("No data from Alpha Vantage");

    const timeSeries = data[timeSeriesKey];
    const candles: Candle[] = Object.entries(timeSeries)
      .map(([time, values]: any) => ({
        time: new Date(time).getTime(),
        open: parseFloat(values["1. open"]),
        high: parseFloat(values["2. high"]),
        low: parseFloat(values["3. low"]),
        close: parseFloat(values["4. close"]),
        volume: parseInt(values["5. volume"] || "0"),
      }))
      .sort((a, b) => a.time - b.time);

    // 聚合为2h/3h/4h
    if (timeframe === "2h") return resampleCandles(candles, 2);
    if (timeframe === "3h") return resampleCandles(candles, 3);
    if (timeframe === "4h") return resampleCandles(candles, 4);

    return candles;
  } catch (err) {
    throw err;
  }
}

/**
 * 从Yahoo Finance获取K线数据（最后备用）
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
    throw err;
  }
}

/**
 * 获取K线数据（多源策略：Finnhub > Tiingo > Alpha Vantage > Yahoo）
 */
export async function fetchCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const sources = [
    { name: "Finnhub", fn: fetchFinnhubCandles },
    { name: "Tiingo", fn: fetchTiingoCandles },
    { name: "Alpha Vantage", fn: fetchAlphaVantageCandles },
    { name: "Yahoo Finance", fn: fetchYahooCandles },
  ];

  for (const source of sources) {
    try {
      console.log(`[MarketData] Trying ${source.name} for ${symbol}/${timeframe}...`);
      const candles = await source.fn(symbol, timeframe);
      if (candles.length > 0) {
        console.log(`[MarketData] Success: ${source.name} returned ${candles.length} candles for ${symbol}/${timeframe}`);
        return candles;
      }
    } catch (err) {
      console.warn(`[MarketData] ${source.name} failed for ${symbol}/${timeframe}:`, err instanceof Error ? err.message : err);
    }
  }

  console.error(`[MarketData] All sources failed for ${symbol}/${timeframe}`);
  return [];
}

/**
 * 获取历史K线（用于回测）
 */
export async function fetchHistoricalCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate: string, // YYYY-MM-DD（可选）
  endDate: string    // YYYY-MM-DD（可选）
): Promise<Candle[]> {
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
    console.warn(`[MarketData] Failed to fetch quote for ${symbol}:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

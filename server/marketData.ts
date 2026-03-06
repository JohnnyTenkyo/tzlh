/**
 * 股票市场数据获取
 * 主数据源：Yahoo Finance（免费）
 * 备用数据源：Finnhub
 */
import axios from "axios";
import type { Candle, Timeframe } from "./indicators";

// Yahoo Finance interval mapping
const YF_INTERVAL_MAP: Record<Timeframe, { interval: string; range: string }> = {
  "15m": { interval: "15m", range: "60d" },
  "30m": { interval: "30m", range: "60d" },
  "1h":  { interval: "60m", range: "730d" },
  "2h":  { interval: "60m", range: "730d" }, // YF doesn't support 2h, use 1h and resample
  "3h":  { interval: "60m", range: "730d" }, // same
  "4h":  { interval: "60m", range: "730d" }, // same
  "1d":  { interval: "1d",  range: "10y" }, // 扩展到10年歴史数据
  "1w":  { interval: "1wk", range: "20y" }, // 扩展到20年歴史数据
};

// Finnhub resolution mapping
const FINNHUB_RES_MAP: Record<Timeframe, { resolution: string; days: number }> = {
  "15m": { resolution: "15", days: 60 },
  "30m": { resolution: "30", days: 60 },
  "1h":  { resolution: "60", days: 365 },
  "2h":  { resolution: "120", days: 365 },
  "3h":  { resolution: "180", days: 365 },
  "4h":  { resolution: "240", days: 365 },
  "1d":  { resolution: "D", days: 3650 }, // 扩展到级10年
  "1w":  { resolution: "W", days: 7300 }, // 扩展到级20年
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

async function fetchYahooCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const { interval, range } = YF_INTERVAL_MAP[timeframe];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;

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

  // Resample for 2h/3h/4h
  if (timeframe === "2h") return resampleCandles(candles, 2);
  if (timeframe === "3h") return resampleCandles(candles, 3);
  if (timeframe === "4h") return resampleCandles(candles, 4);

  return candles;
}

async function fetchFinnhubCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("FINNHUB_API_KEY not set");

  const { resolution, days } = FINNHUB_RES_MAP[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 86400;

  const url = `https://finnhub.io/api/v1/stock/candle`;
  const res = await axios.get(url, {
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
      console.error(`[MarketData] Both sources failed for ${symbol}/${timeframe}:`, err2);
      return [];
    }
  }
}

/**
 * 获取历史K线（用于回测，支持指定日期范围）
 * 注意：Yahoo Finance API有一次调用的数据量限制，大数据量请求需要分批获取
 */
export async function fetchHistoricalCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
): Promise<Candle[]> {
  try {
    const startTs = Math.floor(new Date(startDate).getTime() / 1000);
    const endTs = Math.floor(new Date(endDate).getTime() / 1000);

    const { interval } = YF_INTERVAL_MAP[timeframe];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;

    // 大时间范围数据请求需要分批（每次最多1年）
    const allCandles: Candle[] = [];
    let currentStart = startTs;
    const oneYearInSeconds = 365 * 24 * 60 * 60;

    while (currentStart < endTs) {
      const currentEnd = Math.min(currentStart + oneYearInSeconds, endTs);

      const res = await axios.get(url, {
        params: { interval, period1: currentStart, period2: currentEnd },
        timeout: 20000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      const result = res.data?.chart?.result?.[0];
      if (!result) {
        currentStart = currentEnd;
        continue;
      }

      const timestamps: number[] = result.timestamp || [];
      const quotes = result.indicators.quote[0];

      for (let i = 0; i < timestamps.length; i++) {
        if (quotes.close[i] !== null && quotes.close[i] !== undefined) {
          allCandles.push({
            time: timestamps[i] * 1000,
            open: quotes.open[i] || quotes.close[i],
            high: quotes.high[i] || quotes.close[i],
            low: quotes.low[i] || quotes.close[i],
            close: quotes.close[i],
            volume: quotes.volume[i] || 0,
          });
        }
      }

      // 控制请求速率，避免API限流
      await new Promise(resolve => setTimeout(resolve, 500));
      currentStart = currentEnd;
    }

    if (timeframe === "2h") return resampleCandles(allCandles, 2);
    if (timeframe === "3h") return resampleCandles(allCandles, 3);
    if (timeframe === "4h") return resampleCandles(allCandles, 4);

    return allCandles;
  } catch (err) {
    console.error(`[MarketData] Historical fetch failed for ${symbol}/${timeframe}:`, err);
    return [];
  }
}

/**
 * 获取股票实时报价
 */
export async function fetchQuote(symbol: string): Promise<{
  price: number;
  changePercent: number;
  marketCap?: number;
} | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await axios.get(url, {
      params: { interval: "1d", range: "1d" },
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const result = res.data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    return {
      price: meta.regularMarketPrice || 0,
      changePercent: meta.regularMarketChangePercent || 0,
      marketCap: meta.marketCap,
    };
  } catch {
    // Try Finnhub
    try {
      const apiKey = process.env.FINNHUB_API_KEY;
      if (!apiKey) return null;
      const res = await axios.get(`https://finnhub.io/api/v1/quote`, {
        params: { symbol, token: apiKey },
        timeout: 10000,
      });
      return {
        price: res.data.c || 0,
        changePercent: res.data.dp || 0,
      };
    } catch {
      return null;
    }
  }
}

/**
 * 获取股票市值（用于筛选）
 */
export async function fetchMarketCap(symbol: string): Promise<number | null> {
  try {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return null;
    const res = await axios.get(`https://finnhub.io/api/v1/stock/profile2`, {
      params: { symbol, token: apiKey },
      timeout: 10000,
    });
    const mc = res.data?.marketCapitalization;
    return mc ? mc * 1e6 : null; // Finnhub returns in millions
  } catch {
    return null;
  }
}

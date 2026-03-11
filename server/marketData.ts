/**
 * 股票市场数据获取
 * 日线/周线主数据源：Stooq（免费、无限制、历史完整 20+ 年）
 * 分时主数据源：Tiingo IEX（/iex/<ticker>/prices 端点，支持 2 年历史）
 * 备用数据源：Finnhub、Alpha Vantage、Yahoo Finance
 */
import axios from "axios";
import type { Candle, Timeframe } from "./indicators";
import { ENV } from "./_core/env";

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
 * 将 US 股票代码转换为 Stooq 格式（AAPL -> aapl.us）
 */
function toStooqSymbol(symbol: string): string {
  // 如果已经包含 .us 后缀则直接返回
  if (symbol.toLowerCase().includes('.')) return symbol.toLowerCase();
  return `${symbol.toLowerCase()}.us`;
}

/**
 * 从 Stooq 获取日线/周线数据（免费、无限制、历史完整 20+ 年）
 * 端点：https://stooq.com/q/d/l/?s=<symbol>&d1=<YYYYMMDD>&d2=<YYYYMMDD>&i=<d|w>
 */
async function fetchStooqCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  // Stooq 只支持日线和周线
  if (timeframe !== "1d" && timeframe !== "1w") {
    throw new Error(`Stooq does not support ${timeframe} timeframe`);
  }

  const stooqSymbol = toStooqSymbol(symbol);
  const interval = timeframe === "1w" ? "w" : "d";

  // 默认获取 10 年历史
  const now = new Date();
  const defaultEnd = endDate || now.toISOString().split("T")[0];
  const defaultStart = startDate || new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const d1 = defaultStart.replace(/-/g, "");
  const d2 = defaultEnd.replace(/-/g, "");

  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol}&d1=${d1}&d2=${d2}&i=${interval}`;

  const res = await axios.get(url, {
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    responseType: "text",
  });

  const text: string = res.data;
  if (!text || text.includes("No data") || text.includes("Warning:")) {
    throw new Error(`Stooq returned no data for ${symbol}/${timeframe}`);
  }

  const lines = text.trim().split("\n");
  if (lines.length < 2) throw new Error("Stooq: insufficient data rows");

  // 跳过标题行
  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(",");
    if (parts.length < 5) continue;
    const [dateStr, open, high, low, close, volume] = parts;
    const ts = new Date(dateStr).getTime();
    if (!Number.isFinite(ts)) continue;
    candles.push({
      time: ts,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: volume ? parseInt(volume) : 0,
    });
  }

  return candles.sort((a, b) => a.time - b.time);
}

/**
 * 从 Tiingo IEX 获取分时数据（正确端点：/iex/<ticker>/prices）
 * 支持 resampleFreq: 5min, 15min, 30min, 1hour 等
 * 历史数据范围：约 2 年
 */
async function fetchTiingoIntradayCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const apiKey = ENV.tiingoApiKey;
  if (!apiKey) throw new Error("TIINGO_API_KEY not set");

  const resampleFreqMap: Partial<Record<Timeframe, string>> = {
    "15m": "15min",
    "30m": "30min",
    "1h":  "1hour",
    "2h":  "1hour",  // 需要合并
    "3h":  "1hour",  // 需要合并
    "4h":  "1hour",  // 需要合并
  };

  const resampleFreq = resampleFreqMap[timeframe];
  if (!resampleFreq) throw new Error(`Tiingo IEX does not support ${timeframe} timeframe`);

  const now = new Date();
  // Tiingo IEX 支持约 2 年的历史分时数据
  const defaultStart = startDate || new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const defaultEnd = endDate || now.toISOString().split("T")[0];

  const url = `https://api.tiingo.com/iex/${encodeURIComponent(symbol)}/prices`;
  const params = {
    startDate: defaultStart,
    endDate: defaultEnd,
    resampleFreq,
    columns: "open,high,low,close,volume",
    token: apiKey,
  };

  const res = await axios.get(url, { params, timeout: 20000 });

  if (!Array.isArray(res.data) || res.data.length === 0) {
    throw new Error(`No intraday data from Tiingo IEX for ${symbol}/${timeframe}`);
  }

  const candles: Candle[] = res.data.map((item: any) => ({
    time: new Date(item.date).getTime(),
    open: item.open || item.close,
    high: item.high || item.close,
    low: item.low || item.close,
    close: item.close,
    volume: item.volume || 0,
  }));

  const sorted = candles.sort((a, b) => a.time - b.time);

  // 聚合为2h/3h/4h
  if (timeframe === "2h") return resampleCandles(sorted, 2);
  if (timeframe === "3h") return resampleCandles(sorted, 3);
  if (timeframe === "4h") return resampleCandles(sorted, 4);

  return sorted;
}

/**
 * 从 Tiingo 日线 API 获取数据（备用，端点：/tiingo/daily/<ticker>/prices）
 */
async function fetchTiingoDailyCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const apiKey = ENV.tiingoApiKey;
  if (!apiKey) throw new Error("TIINGO_API_KEY not set");

  if (timeframe !== "1d" && timeframe !== "1w") {
    throw new Error(`Tiingo daily API does not support ${timeframe} timeframe`);
  }

  const now = new Date();
  const defaultStart = startDate || new Date(now.getTime() - 3650 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const defaultEnd = endDate || now.toISOString().split("T")[0];

  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`;
  const params = {
    startDate: defaultStart,
    endDate: defaultEnd,
    resampleFreq: timeframe === "1w" ? "weekly" : "daily",
    token: apiKey,
  };

  const res = await axios.get(url, { params, timeout: 15000 });

  if (!Array.isArray(res.data) || res.data.length === 0) {
    throw new Error(`No data from Tiingo daily for ${symbol}/${timeframe}`);
  }

  return res.data
    .map((item: any) => ({
      time: new Date(item.date).getTime(),
      open: item.open || item.adjClose,
      high: item.high || item.adjClose,
      low: item.low || item.adjClose,
      close: item.adjClose || item.close,
      volume: item.volume || 0,
    }))
    .sort((a: Candle, b: Candle) => a.time - b.time);
}

/**
 * 从 Finnhub 获取 K 线数据
 */
async function fetchFinnhubCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
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

  const res = await axios.get("https://finnhub.io/api/v1/stock/candle", {
    params: { symbol, resolution, from, to: now, token: apiKey },
    timeout: 15000,
  });

  const data = res.data;
  if (data.s !== "ok" || !data.t) throw new Error("No data from Finnhub");

  const candles: Candle[] = data.t.map((t: number, i: number) => ({
    time: t * 1000,
    open: data.o[i],
    high: data.h[i],
    low: data.l[i],
    close: data.c[i],
    volume: data.v[i] || 0,
  }));

  // 聚合为2h/3h/4h
  if (timeframe === "2h") return resampleCandles(candles, 2);
  if (timeframe === "3h") return resampleCandles(candles, 3);
  if (timeframe === "4h") return resampleCandles(candles, 4);

  return candles;
}

/**
 * 从 Alpha Vantage 获取 K 线数据
 */
async function fetchAlphaVantageCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
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

  if (timeframe === "2h") return resampleCandles(candles, 2);
  if (timeframe === "3h") return resampleCandles(candles, 3);
  if (timeframe === "4h") return resampleCandles(candles, 4);

  return candles;
}

/**
 * 从 Yahoo Finance 获取 K 线数据（最后备用）
 */
async function fetchYahooCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const RANGE_MAP: Record<Timeframe, string> = {
    "15m": "60d",
    "30m": "60d",
    "1h":  "730d",
    "2h":  "730d",
    "3h":  "730d",
    "4h":  "730d",
    "1d":  "10y",
    "1w":  "20y",
  };

  const INTERVAL_MAP: Record<Timeframe, string> = {
    "15m": "15m",
    "30m": "30m",
    "1h":  "60m",
    "2h":  "60m",
    "3h":  "60m",
    "4h":  "60m",
    "1d":  "1d",
    "1w":  "1wk",
  };

  const interval = INTERVAL_MAP[timeframe];
  const range = RANGE_MAP[timeframe];
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

  if (timeframe === "2h") return resampleCandles(candles, 2);
  if (timeframe === "3h") return resampleCandles(candles, 3);
  if (timeframe === "4h") return resampleCandles(candles, 4);

  return candles;
}

/**
 * 获取 K 线数据（多源策略）
 *
 * 日线/周线：Stooq（免费完整）> Tiingo Daily > Finnhub > Alpha Vantage > Yahoo
 * 分时数据：Tiingo IEX（正确端点）> Finnhub > Alpha Vantage > Yahoo
 */
export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const isDaily = timeframe === "1d" || timeframe === "1w";

  const sources = isDaily
    ? [
        { name: "Stooq", fn: fetchStooqCandles },
        { name: "Tiingo Daily", fn: fetchTiingoDailyCandles },
        { name: "Finnhub", fn: fetchFinnhubCandles },
        { name: "Alpha Vantage", fn: fetchAlphaVantageCandles },
        { name: "Yahoo Finance", fn: fetchYahooCandles },
      ]
    : [
        { name: "Tiingo IEX", fn: fetchTiingoIntradayCandles },
        { name: "Finnhub", fn: fetchFinnhubCandles },
        { name: "Alpha Vantage", fn: fetchAlphaVantageCandles },
        { name: "Yahoo Finance", fn: fetchYahooCandles },
      ];

  for (const source of sources) {
    try {
      console.log(`[MarketData] Trying ${source.name} for ${symbol}/${timeframe}...`);
      const candles = await source.fn(symbol, timeframe, startDate, endDate);
      if (candles.length > 0) {
        console.log(
          `[MarketData] Success: ${source.name} returned ${candles.length} candles for ${symbol}/${timeframe}`
        );
        return candles;
      }
    } catch (err) {
      console.warn(
        `[MarketData] ${source.name} failed for ${symbol}/${timeframe}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.error(`[MarketData] All sources failed for ${symbol}/${timeframe}`);
  return [];
}

/**
 * 获取历史 K 线（用于回测），按日期范围过滤
 */
export async function fetchHistoricalCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate: string,
  endDate: string
): Promise<Candle[]> {
  const candles = await fetchCandles(symbol, timeframe, startDate, endDate);

  const startTs = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const endTs = new Date(`${endDate}T23:59:59.999Z`).getTime();

  return candles
    .filter(c => Number.isFinite(c.time) && c.time >= startTs && c.time <= endTs)
    .sort((a, b) => a.time - b.time);
}

/**
 * 获取实时报价
 */
export async function fetchQuote(
  symbol: string
): Promise<{ price: number; change: number; changePercent: number }> {
  try {
    const res = await axios.get(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`,
      {
        params: { modules: "price" },
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    const price = res.data?.quoteSummary?.result?.[0]?.price;
    if (!price) throw new Error("No price data");

    return {
      price: price.regularMarketPrice?.raw || 0,
      change: price.regularMarketChange?.raw || 0,
      changePercent: price.regularMarketChangePercent?.raw || 0,
    };
  } catch (err) {
    console.warn(
      `[MarketData] Failed to fetch quote for ${symbol}:`,
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

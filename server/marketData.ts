/**
 * 股票市场数据获取 - 三层架构
 *
 * 第一层：原始数据层（基准周期）
 *   - 15m：Alpaca（Since 2020）> Tiingo IEX > Finnhub > Alpha Vantage > Yahoo
 *   - 1h ：Alpaca（Since 2020）> Tiingo IEX > Finnhub > Alpha Vantage > Yahoo
 *   - 1d ：Stooq（20+年）> Alpaca（Since 2016）> Tiingo Daily > Finnhub > Alpha Vantage > Yahoo
 *
 * 第二层：聚合层（从基准周期本地聚合，不再请求外部 API）
 *   - 30m = 15m × 2
 *   - 2h  = 1h × 2
 *   - 3h  = 1h × 3
 *   - 4h  = 1h × 4
 *   - 1w  = 1d 按交易周聚合
 *
 * 第三层：健康监控层
 *   - 记录每个数据源的成功/失败次数
 *   - 支持查询各数据源健康状态
 */

import axios from "axios";
import type { Candle, Timeframe } from "./indicators";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { dataSourceHealth } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

// ============================================================
// 类型定义
// ============================================================

type DataSource = "alpaca" | "stooq" | "tiingo" | "finnhub" | "alphavantage" | "yahoo";

// 基准周期（直接从外部 API 获取）
const BASE_TIMEFRAMES: Timeframe[] = ["15m", "1h", "1d"];

// 聚合周期（从基准周期本地聚合）
const AGGREGATED_TIMEFRAMES: Partial<Record<Timeframe, { base: Timeframe; factor: number; mode: "fixed" | "week" }>> = {
  "30m": { base: "15m", factor: 2, mode: "fixed" },
  "2h":  { base: "1h",  factor: 2, mode: "fixed" },
  "3h":  { base: "1h",  factor: 3, mode: "fixed" },
  "4h":  { base: "1h",  factor: 4, mode: "fixed" },
  "1w":  { base: "1d",  factor: 5, mode: "week"  },
};

// ============================================================
// 健康监控
// ============================================================

async function recordHealth(source: DataSource, timeframe: string, success: boolean, error?: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    await db
      .insert(dataSourceHealth)
      .values({
        source,
        timeframe,
        success: success ? 1 : 0,
        failure: success ? 0 : 1,
        lastSuccess: success ? now : undefined,
        lastFailure: success ? undefined : now,
        lastError: success ? undefined : error?.slice(0, 500),
      })
      .onDuplicateKeyUpdate({
        set: {
          success: success
            ? sql`success + 1`
            : sql`success`,
          failure: success
            ? sql`failure`
            : sql`failure + 1`,
          lastSuccess: success ? now : undefined,
          lastFailure: success ? undefined : now,
          lastError: success ? undefined : error?.slice(0, 500),
        },
      });
  } catch {
    // 健康监控失败不影响主流程
  }
}

// ============================================================
// 聚合工具函数
// ============================================================

/**
 * 将 K 线按固定数量聚合（例如 15m×2 = 30m）
 * 锚点固定在 09:30 ET，最后一根允许短 bar
 */
function aggregateByFactor(candles: Candle[], factor: number): Candle[] {
  const result: Candle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    if (chunk.length === 0) continue;
    result.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

/**
 * 将日线按交易周聚合为周线
 * 周一为一周开始，周五为结束
 */
function aggregateToWeekly(dailyCandles: Candle[]): Candle[] {
  const weeks: Map<string, Candle[]> = new Map();
  for (const c of dailyCandles) {
    const d = new Date(c.time);
    // 计算本周一的日期作为 key
    const day = d.getUTCDay(); // 0=Sun, 1=Mon...
    const daysToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d.getTime() + daysToMonday * 86400000);
    const key = monday.toISOString().split("T")[0];
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(c);
  }
  const result: Candle[] = [];
  for (const [, chunk] of Array.from(weeks.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (chunk.length === 0) continue;
    result.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

// ============================================================
// 第一层：各数据源原始数据获取
// ============================================================

/**
 * Alpaca Markets Data API
 * 支持：15m（2020+）、1h（2020+）、1d（2016+）
 * 频率：200次/分钟（免费 Basic）
 * 分页：通过 next_page_token 获取全量数据
 */
async function fetchAlpacaCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const apiKey = ENV.alpacaApiKey;
  const secretKey = ENV.alpacaSecretKey;
  if (!apiKey || !secretKey) throw new Error("ALPACA_API_KEY or ALPACA_SECRET_KEY not set");

  // Alpaca 只支持基准周期
  if (!BASE_TIMEFRAMES.includes(timeframe)) {
    throw new Error(`Alpaca does not support ${timeframe} (use base timeframes only)`);
  }

  const tfMap: Record<string, string> = {
    "15m": "15Min",
    "1h":  "1Hour",
    "1d":  "1Day",
  };
  const alpacaTf = tfMap[timeframe];
  if (!alpacaTf) throw new Error(`Alpaca unsupported timeframe: ${timeframe}`);

  const now = new Date();
  const defaultEnd = endDate || now.toISOString().split("T")[0];
  const defaultStart = startDate || (() => {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - (timeframe === "1d" ? 10 : 5));
    return d.toISOString().split("T")[0];
  })();

  const headers = {
    "APCA-API-KEY-ID": apiKey,
    "APCA-API-SECRET-KEY": secretKey,
  };

  const allCandles: Candle[] = [];
  let nextPageToken: string | null = null;
  let pageCount = 0;
  const maxPages = 50; // 防止无限循环

  do {
    const params: Record<string, any> = {
      symbols: symbol,
      timeframe: alpacaTf,
      start: defaultStart,
      end: defaultEnd,
      limit: 10000,
      // NOTE: adjustment="all" requires paid subscription; omit for free accounts
      // adjustment: "all",
    };
    if (nextPageToken) params.page_token = nextPageToken;

    const res = await axios.get("https://data.alpaca.markets/v2/stocks/bars", {
      params,
      headers,
      timeout: 20000,
    });

    const bars = res.data?.bars?.[symbol];
    if (!Array.isArray(bars) || bars.length === 0) break;

    for (const bar of bars) {
      allCandles.push({
        time: new Date(bar.t).getTime(),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v || 0,
      });
    }

    nextPageToken = res.data?.next_page_token || null;
    pageCount++;
  } while (nextPageToken && pageCount < maxPages);

  if (allCandles.length === 0) {
    throw new Error(`Alpaca returned no data for ${symbol}/${timeframe}`);
  }

  return allCandles.sort((a, b) => a.time - b.time);
}

/**
 * Alpaca 批量请求：一次获取多个股票的 K 线数据
 * 返回 Map<symbol, Candle[]>
 */
export async function fetchAlpacaBatchCandles(
  symbols: string[],
  timeframe: Timeframe,
  startDate: string,
  endDate: string
): Promise<Map<string, Candle[]>> {
  const apiKey = ENV.alpacaApiKey;
  const secretKey = ENV.alpacaSecretKey;
  if (!apiKey || !secretKey) throw new Error("ALPACA_API_KEY or ALPACA_SECRET_KEY not set");

  if (!BASE_TIMEFRAMES.includes(timeframe)) {
    throw new Error(`Alpaca batch does not support aggregated timeframe: ${timeframe}`);
  }

  const tfMap: Record<string, string> = {
    "15m": "15Min",
    "1h":  "1Hour",
    "1d":  "1Day",
  };
  const alpacaTf = tfMap[timeframe];
  if (!alpacaTf) throw new Error(`Alpaca unsupported timeframe: ${timeframe}`);

  const headers = {
    "APCA-API-KEY-ID": apiKey,
    "APCA-API-SECRET-KEY": secretKey,
  };

  const result = new Map<string, Candle[]>();
  // 初始化所有 symbol 为空数组
  for (const s of symbols) result.set(s, []);

  let nextPageToken: string | null = null;
  let pageCount = 0;
  const maxPages = 200;

  do {
    const params: Record<string, any> = {
      symbols: symbols.join(","),
      timeframe: alpacaTf,
      start: startDate,
      end: endDate,
      limit: 10000,
    };
    if (nextPageToken) params.page_token = nextPageToken;

    const res = await axios.get("https://data.alpaca.markets/v2/stocks/bars", {
      params,
      headers,
      timeout: 30000,
    });

    const bars = res.data?.bars || {};
    for (const [sym, symBars] of Object.entries(bars)) {
      if (!Array.isArray(symBars)) continue;
      const existing = result.get(sym) || [];
      for (const bar of symBars as any[]) {
        existing.push({
          time: new Date(bar.t).getTime(),
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v || 0,
        });
      }
      result.set(sym, existing);
    }

    nextPageToken = res.data?.next_page_token || null;
    pageCount++;
  } while (nextPageToken && pageCount < maxPages);

  // 排序
  Array.from(result.keys()).forEach((sym) => {
    const candles = result.get(sym) || [];
    result.set(sym, candles.sort((a: Candle, b: Candle) => a.time - b.time));
  });

  return result;
}

/**
 * Stooq CSV 数据（日线/周线，免费，20+年历史）
 */
function toStooqSymbol(symbol: string): string {
  if (symbol.toLowerCase().includes(".")) return symbol.toLowerCase();
  return `${symbol.toLowerCase()}.us`;
}

async function fetchStooqCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  if (timeframe !== "1d") {
    throw new Error(`Stooq does not support ${timeframe} timeframe`);
  }
  // Stooq 只支持特定市场的股票，对于非美股或特殊代码先尝试美股格式
  const stooqSymbol = toStooqSymbol(symbol);
  const now = new Date();
  const defaultEnd = endDate || now.toISOString().split("T")[0];
  const defaultStart = startDate || new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const d1 = defaultStart.replace(/-/g, "");
  const d2 = defaultEnd.replace(/-/g, "");
  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol}&d1=${d1}&d2=${d2}&i=d`;
  const res = await axios.get(url, {
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    responseType: "text",
  });
  const text: string = res.data;
  // Stooq 返回无数据时通常包含 "No data" 或 HTML 页面
  if (!text || text.includes("No data") || text.includes("Warning:") || text.trim().startsWith("<")) {
    throw new Error(`Stooq returned no data for ${symbol}/${timeframe} (symbol may not be listed on US markets)`);
  }
  const lines = text.trim().split("\n");
  if (lines.length < 2) throw new Error("Stooq: insufficient data rows");
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
 * Tiingo IEX 分时数据（正确端点：/iex/<ticker>/prices）
 * 支持约 2 年历史
 */
async function fetchTiingoIntradayCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const apiKey = ENV.tiingoApiKey;
  if (!apiKey) throw new Error("TIINGO_API_KEY not set");
  if (timeframe !== "15m" && timeframe !== "1h") {
    throw new Error(`Tiingo IEX does not support ${timeframe} as base timeframe`);
  }
  const resampleFreq = timeframe === "15m" ? "15min" : "1hour";
  const now = new Date();
  const defaultStart = startDate || new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const defaultEnd = endDate || now.toISOString().split("T")[0];
  const url = `https://api.tiingo.com/iex/${encodeURIComponent(symbol)}/prices`;
  // Tiingo 可能返回 429 限速，添加重试机制
  let res: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await axios.get(url, {
        params: { startDate: defaultStart, endDate: defaultEnd, resampleFreq, columns: "open,high,low,close,volume", token: apiKey },
        timeout: 20000,
      });
      if (res.status !== 429) break;
      // 429: 等待再重试
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    } catch (err: any) {
      if (err?.response?.status === 429) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
      throw err;
    }
  }
  if (!res || res.status === 429) throw new Error(`Tiingo IEX rate limited for ${symbol}/${timeframe}`);
  if (!Array.isArray(res.data) || res.data.length === 0) {
    throw new Error(`No intraday data from Tiingo IEX for ${symbol}/${timeframe}`);
  }
  return res.data
    .map((item: any) => ({
      time: new Date(item.date).getTime(),
      open: item.open || item.close,
      high: item.high || item.close,
      low: item.low || item.close,
      close: item.close,
      volume: item.volume || 0,
    }))
    .sort((a: Candle, b: Candle) => a.time - b.time);
}

/**
 * Tiingo 日线 API（备用）
 */
async function fetchTiingoDailyCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const apiKey = ENV.tiingoApiKey;
  if (!apiKey) throw new Error("TIINGO_API_KEY not set");
  if (timeframe !== "1d") throw new Error(`Tiingo daily API does not support ${timeframe}`);
  const now = new Date();
  const defaultStart = startDate || new Date(now.getTime() - 3650 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const defaultEnd = endDate || now.toISOString().split("T")[0];
  const res = await axios.get(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`, {
    params: { startDate: defaultStart, endDate: defaultEnd, resampleFreq: "daily", token: apiKey },
    timeout: 15000,
  });
  if (!Array.isArray(res.data) || res.data.length === 0) {
    throw new Error(`No data from Tiingo daily for ${symbol}`);
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
 * Finnhub（备用）
 */
async function fetchFinnhubCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const apiKey = ENV.finnhubApiKey;
  if (!apiKey) throw new Error("FINNHUB_API_KEY not set");
  if (!BASE_TIMEFRAMES.includes(timeframe)) {
    throw new Error(`Finnhub: ${timeframe} is not a base timeframe`);
  }
  // Finnhub 免费账户仅支持日线（D），分时数据需要付费订阅
  if (timeframe !== "1d") {
    throw new Error(`Finnhub free tier does not support ${timeframe} intraday data`);
  }
  const resolutionMap: Record<string, { resolution: string; days: number }> = {
    "1d":  { resolution: "D", days: 3650 },
  };
  const { resolution, days } = resolutionMap[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const fromTs = startDate
    ? Math.floor(new Date(startDate).getTime() / 1000)
    : now - days * 86400;
  const toTs = endDate
    ? Math.floor(new Date(endDate + "T23:59:59Z").getTime() / 1000)
    : now;
  const res = await axios.get("https://finnhub.io/api/v1/stock/candle", {
    params: { symbol, resolution, from: fromTs, to: toTs, token: apiKey },
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
 * Alpha Vantage（备用，月切片补旧数据）
 */
async function fetchAlphaVantageCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const apiKey = ENV.alphaVantageApiKey;
  if (!apiKey) throw new Error("ALPHAVANTAGE_API_KEY not set");
  if (!BASE_TIMEFRAMES.includes(timeframe)) {
    throw new Error(`AlphaVantage: ${timeframe} is not a base timeframe`);
  }
  const functionMap: Record<string, string> = {
    "15m": "TIME_SERIES_INTRADAY",
    "1h":  "TIME_SERIES_INTRADAY",
    "1d":  "TIME_SERIES_DAILY",
  };
  const intervalMap: Record<string, string> = {
    "15m": "15min",
    "1h":  "60min",
    "1d":  "",
  };
  const func = functionMap[timeframe];
  const interval = intervalMap[timeframe];
  const params: any = { symbol, apikey: apiKey, outputsize: "full", function: func };
  if (interval) {
    params.interval = interval;
    params.extended_hours = "false"; // 只获取正常交易时间数据
    params.month = undefined; // 不指定月份，获取最新数据
  }
  const res = await axios.get("https://www.alphavantage.co/query", { params, timeout: 20000 });
  // 检查 API 限速错误
  if (res.data?.Note || res.data?.Information) {
    throw new Error(`AlphaVantage rate limit: ${res.data?.Note || res.data?.Information}`);
  }
  const data = res.data;
  const timeSeriesKey = Object.keys(data).find((k) => k.startsWith("Time Series"));
  if (!timeSeriesKey || !data[timeSeriesKey]) throw new Error("No data from Alpha Vantage");
  const timeSeries = data[timeSeriesKey];
  return Object.entries(timeSeries)
    .map(([time, values]: any) => ({
      time: new Date(time).getTime(),
      open: parseFloat(values["1. open"]),
      high: parseFloat(values["2. high"]),
      low: parseFloat(values["3. low"]),
      close: parseFloat(values["4. close"]),
      volume: parseInt(values["5. volume"] || "0"),
    }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Yahoo Finance（最后备用）
 */
async function fetchYahooCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  if (!BASE_TIMEFRAMES.includes(timeframe)) {
    throw new Error(`Yahoo: ${timeframe} is not a base timeframe`);
  }
  const RANGE_MAP: Record<string, string> = { "15m": "60d", "1h": "730d", "1d": "10y" };
  const INTERVAL_MAP: Record<string, string> = { "15m": "15m", "1h": "60m", "1d": "1d" };
  const interval = INTERVAL_MAP[timeframe];
  const range = RANGE_MAP[timeframe];
  // Yahoo Finance 有时需要备用 URL
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  ];
  let res: any = null;
  for (const url of urls) {
    try {
      res = await axios.get(url, {
        params: { interval, range },
        timeout: 20000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
      });
      if (res.data?.chart?.result?.[0]) break;
    } catch {
      // 尝试备用 URL
    }
  }
  if (!res) throw new Error("Yahoo Finance: all URLs failed");
  const result = res.data?.chart?.result?.[0];
  if (!result) throw new Error("No data from Yahoo Finance");
  const timestamps: number[] = result.timestamp || [];
  const quotes = result.indicators.quote[0];
  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quotes.close[i] != null) {
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
  return candles;
}

// ============================================================
// 第二层：聚合层
// ============================================================

/**
 * 从基准周期聚合出目标周期 K 线
 */
async function getAggregatedCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const agg = AGGREGATED_TIMEFRAMES[timeframe];
  if (!agg) throw new Error(`${timeframe} is not an aggregated timeframe`);

  // 获取基准周期数据（稍微扩大范围以确保聚合边界完整）
  const baseCandles = await getRawCandles(symbol, agg.base, startDate, endDate);
  if (baseCandles.length === 0) return [];

  if (agg.mode === "week") {
    return aggregateToWeekly(baseCandles);
  } else {
    return aggregateByFactor(baseCandles, agg.factor);
  }
}

// ============================================================
// 第三层：统一入口（带健康监控）
// ============================================================

/**
 * 获取基准周期原始数据（15m / 1h / 1d）
 * 按优先级尝试各数据源，记录健康状态
 */
async function getRawCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  // 定义各基准周期的数据源优先级
  const sourceChains: Record<string, Array<{ name: DataSource; fn: Function }>> = {
    "1d": [
      { name: "stooq",       fn: fetchStooqCandles },
      { name: "alpaca",      fn: fetchAlpacaCandles },
      { name: "tiingo",      fn: fetchTiingoDailyCandles },
      { name: "finnhub",     fn: fetchFinnhubCandles },
      { name: "alphavantage",fn: fetchAlphaVantageCandles },
      { name: "yahoo",       fn: fetchYahooCandles },
    ],
    "1h": [
      { name: "alpaca",      fn: fetchAlpacaCandles },
      { name: "tiingo",      fn: fetchTiingoIntradayCandles },
      { name: "finnhub",     fn: fetchFinnhubCandles },
      { name: "alphavantage",fn: fetchAlphaVantageCandles },
      { name: "yahoo",       fn: fetchYahooCandles },
    ],
    "15m": [
      { name: "alpaca",      fn: fetchAlpacaCandles },
      { name: "tiingo",      fn: fetchTiingoIntradayCandles },
      { name: "finnhub",     fn: fetchFinnhubCandles },
      { name: "alphavantage",fn: fetchAlphaVantageCandles },
      { name: "yahoo",       fn: fetchYahooCandles },
    ],
  };

  const chain = sourceChains[timeframe];
  if (!chain) throw new Error(`No source chain for base timeframe: ${timeframe}`);

  for (const source of chain) {
    try {
      console.log(`[MarketData] Trying ${source.name} for ${symbol}/${timeframe}...`);
      const candles = await source.fn(symbol, timeframe, startDate, endDate);
      if (candles.length > 0) {
        console.log(`[MarketData] ✓ ${source.name} → ${candles.length} candles for ${symbol}/${timeframe}`);
        // 异步记录成功（不阻塞主流程）
        recordHealth(source.name, timeframe, true).catch(() => {});
        return candles;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[MarketData] ✗ ${source.name} failed for ${symbol}/${timeframe}: ${msg}`);
      // 异步记录失败
      recordHealth(source.name, timeframe, false, msg).catch(() => {});
    }
  }

  console.error(`[MarketData] All sources failed for ${symbol}/${timeframe}`);
  return [];
}

/**
 * 公共入口：获取任意周期 K 线
 * - 基准周期（15m/1h/1d）：直接从外部 API 获取
 * - 聚合周期（30m/2h/3h/4h/1w）：从基准周期本地聚合
 */
export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  if (BASE_TIMEFRAMES.includes(timeframe)) {
    return getRawCandles(symbol, timeframe, startDate, endDate);
  }
  if (AGGREGATED_TIMEFRAMES[timeframe]) {
    return getAggregatedCandles(symbol, timeframe, startDate, endDate);
  }
  throw new Error(`Unsupported timeframe: ${timeframe}`);
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
    .filter((c) => Number.isFinite(c.time) && c.time >= startTs && c.time <= endTs)
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
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
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
    console.warn(`[MarketData] Failed to fetch quote for ${symbol}:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

/**
 * 数据源策略优化
 * 实现智能缓存、速率限制处理和备用数据源故障转移
 */
import axios from "axios";
import type { Candle, Timeframe } from "./indicators";
import { ENV } from "./_core/env";

// ============ 数据源优先级和配置 ============
interface DataSourceConfig {
  name: string;
  priority: number;
  maxRetries: number;
  retryDelayMs: number;
  rateLimitDelayMs: number;
}

const DATA_SOURCE_CONFIGS: Record<string, DataSourceConfig> = {
  finnhub: { name: "Finnhub", priority: 1, maxRetries: 2, retryDelayMs: 1000, rateLimitDelayMs: 500 },
  tiingo: { name: "Tiingo", priority: 2, maxRetries: 3, retryDelayMs: 2000, rateLimitDelayMs: 3000 },
  alphaVantage: { name: "Alpha Vantage", priority: 3, maxRetries: 2, retryDelayMs: 1500, rateLimitDelayMs: 5000 },
  yahoo: { name: "Yahoo Finance", priority: 4, maxRetries: 1, retryDelayMs: 1000, rateLimitDelayMs: 500 },
};

// ============ 速率限制跟踪 ============
const rateLimitTracker = new Map<string, { resetTime: number; requestCount: number }>();

function shouldWaitForRateLimit(source: string): number {
  const tracker = rateLimitTracker.get(source);
  if (!tracker) return 0;

  const now = Date.now();
  if (now >= tracker.resetTime) {
    rateLimitTracker.delete(source);
    return 0;
  }

  return tracker.resetTime - now;
}

function recordRateLimit(source: string, resetAfterMs: number = 60000) {
  rateLimitTracker.set(source, {
    resetTime: Date.now() + resetAfterMs,
    requestCount: (rateLimitTracker.get(source)?.requestCount || 0) + 1,
  });
}

// ============ 重试逻辑 ============
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
  sourceName: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 检查速率限制
      const waitTime = shouldWaitForRateLimit(sourceName);
      if (waitTime > 0) {
        console.log(`[${sourceName}] Rate limited, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 处理 429 速率限制错误
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        recordRateLimit(sourceName, 60000);
        console.warn(`[${sourceName}] Rate limited (429), will retry after delay`);
      }

      if (attempt < maxRetries) {
        const backoffDelay = delayMs * Math.pow(2, attempt);
        console.log(`[${sourceName}] Attempt ${attempt + 1} failed, retrying in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxRetries} retries`);
}

// ============ 数据源实现 ============

/**
 * 从 Tiingo 获取完整历史数据
 * Tiingo 支持最长 20 年的历史数据
 */
export async function fetchTiingoFullHistory(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const apiKey = ENV.tiingoApiKey;
  if (!apiKey) throw new Error("TIINGO_API_KEY not set");

  const resolutionMap: Record<Timeframe, string> = {
    "15m": "15min",
    "30m": "30min",
    "1h": "1hour",
    "2h": "1hour",
    "3h": "1hour",
    "4h": "1hour",
    "1d": "daily",
    "1w": "weekly",
  };

  const resolution = resolutionMap[timeframe];
  const now = new Date();

  // Tiingo 支持最长 20 年的历史数据
  const defaultStartDate = new Date(now.getTime() - 7300 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const defaultEndDate = now.toISOString().split("T")[0];
  const queryStartDate = startDate || defaultStartDate;
  const queryEndDate = endDate || defaultEndDate;

  return retryWithBackoff(
    async () => {
      const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`;
      const params = {
        startDate: queryStartDate,
        endDate: queryEndDate,
        resampleFreq: resolution,
        token: apiKey,
      };

      const res = await axios.get(url, { params, timeout: 15000 });

      if (!Array.isArray(res.data) || res.data.length === 0) {
        throw new Error("No data from Tiingo");
      }

      const candles: Candle[] = res.data.map((item: any) => ({
        time: new Date(item.date).getTime(),
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume || 0,
      }));

      // 聚合为 2h/3h/4h
      if (timeframe === "2h") return resampleCandles(candles, 2);
      if (timeframe === "3h") return resampleCandles(candles, 3);
      if (timeframe === "4h") return resampleCandles(candles, 4);

      return candles;
    },
    DATA_SOURCE_CONFIGS.tiingo.maxRetries,
    DATA_SOURCE_CONFIGS.tiingo.retryDelayMs,
    "Tiingo"
  );
}

/**
 * 从 Alpha Vantage 获取完整历史数据
 * Alpha Vantage 支持最长 20 年的日线数据
 */
export async function fetchAlphaVantageFullHistory(
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
    "1h": "TIME_SERIES_INTRADAY",
    "2h": "TIME_SERIES_INTRADAY",
    "3h": "TIME_SERIES_INTRADAY",
    "4h": "TIME_SERIES_INTRADAY",
    "1d": "TIME_SERIES_DAILY",
    "1w": "TIME_SERIES_WEEKLY",
  };

  const intervalMap: Record<Timeframe, string> = {
    "15m": "15min",
    "30m": "30min",
    "1h": "60min",
    "2h": "60min",
    "3h": "60min",
    "4h": "60min",
    "1d": "",
    "1w": "",
  };

  return retryWithBackoff(
    async () => {
      const func = functionMap[timeframe];
      const interval = intervalMap[timeframe];
      const params: any = {
        symbol,
        apikey: apiKey,
        outputsize: "full",
        function: func,
      };

      if (interval) params.interval = interval;

      const res = await axios.get("https://www.alphavantage.co/query", {
        params,
        timeout: 15000,
      });

      const timeSeriesKey = Object.keys(res.data).find(k => k.startsWith("Time Series"));
      if (!timeSeriesKey || !res.data[timeSeriesKey]) {
        throw new Error("No data from Alpha Vantage");
      }

      const timeSeries = res.data[timeSeriesKey];
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

      // 应用日期范围过滤
      if (startDate || endDate) {
        const startTs = startDate ? new Date(`${startDate}T00:00:00.000Z`).getTime() : 0;
        const endTs = endDate ? new Date(`${endDate}T23:59:59.999Z`).getTime() : Infinity;
        return candles.filter(c => c.time >= startTs && c.time <= endTs);
      }

      // 聚合为 2h/3h/4h
      if (timeframe === "2h") return resampleCandles(candles, 2);
      if (timeframe === "3h") return resampleCandles(candles, 3);
      if (timeframe === "4h") return resampleCandles(candles, 4);

      return candles;
    },
    DATA_SOURCE_CONFIGS.alphaVantage.maxRetries,
    DATA_SOURCE_CONFIGS.alphaVantage.retryDelayMs,
    "Alpha Vantage"
  );
}

/**
 * 将 1h K 线聚合为 2h/3h/4h K 线
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
 * 获取完整历史数据（优先使用备用数据源）
 */
export async function fetchFullHistoryData(
  symbol: string,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<Candle[]> {
  const sources = [
    {
      name: "Tiingo",
      fn: () => fetchTiingoFullHistory(symbol, timeframe, startDate, endDate),
    },
    {
      name: "Alpha Vantage",
      fn: () => fetchAlphaVantageFullHistory(symbol, timeframe, startDate, endDate),
    },
  ];

  for (const source of sources) {
    try {
      console.log(`[FullHistory] Trying ${source.name} for ${symbol}/${timeframe}...`);
      const candles = await source.fn();
      if (candles.length > 0) {
        console.log(
          `[FullHistory] Success: ${source.name} returned ${candles.length} candles for ${symbol}/${timeframe}`
        );
        return candles;
      }
    } catch (err) {
      console.warn(
        `[FullHistory] ${source.name} failed for ${symbol}/${timeframe}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.error(`[FullHistory] All sources failed for ${symbol}/${timeframe}`);
  return [];
}

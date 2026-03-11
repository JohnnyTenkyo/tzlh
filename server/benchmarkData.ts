/**
 * 基准指数数据获取
 */

import { fetchHistoricalCandles } from "./marketData";
import type { Timeframe } from "./indicators";
import type { Candle } from "./cacheManager";

export interface BenchmarkData {
  date: string;
  return: number; // 收益率百分比
}

/**
 * 获取基准指数收益率曲线
 * @param symbol 基准指数代码（QQQ 或 SPY）
 * @param startDate 开始日期
 * @param endDate 结束日期
 * @returns 收益率曲线
 */
export async function getBenchmarkReturns(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<BenchmarkData[]> {
  try {
    // 获取日线数据
    const candles = await fetchHistoricalCandles(symbol, "1d" as Timeframe, startDate, endDate);

    if (candles.length === 0) {
      return [];
    }

    // 计算每日收益率
    const firstClose = candles[0].close;
    const results: BenchmarkData[] = [];

    for (const candle of candles) {
      const dailyReturn = ((candle.close - firstClose) / firstClose) * 100;
      const candleDate = (candle as any).date || (candle as any).t || new Date().toISOString().split('T')[0];
      results.push({
        date: candleDate,
        return: parseFloat(dailyReturn.toFixed(4)),
      });
    }

    return results;
  } catch (err) {
    console.error(`[Benchmark] Failed to fetch ${symbol} data:`, err);
    return [];
  }
}

/**
 * 获取多个基准指数的收益率
 */
export async function getMultipleBenchmarks(
  symbols: string[],
  startDate: string,
  endDate: string
): Promise<Record<string, BenchmarkData[]>> {
  const results: Record<string, BenchmarkData[]> = {};

  for (const symbol of symbols) {
    results[symbol] = await getBenchmarkReturns(symbol, startDate, endDate);
  }

  return results;
}

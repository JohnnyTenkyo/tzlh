import { Candle, StockQuote, TimeInterval } from './types';

// Convert K-line time to display time (end time)
// 显示 K 线的结束时间（收盘时间）
export function toFutuTime(timestamp: number, interval: TimeInterval): number {
  // 根据时间周期加上相应的时间间隔，显示 K 线结束时间
  // 例如：9:30-10:00 的 30m K线显示为 10:00
  const intervalMs: Record<TimeInterval, number> = {
    '1m': 60 * 1000,
    '3m': 3 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '3h': 3 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1mo': 30 * 24 * 60 * 60 * 1000,
  };
  
  return timestamp + (intervalMs[interval] || 0);
}

// Helper to call tRPC with superjson format
async function trpcQuery<T>(path: string, input: Record<string, unknown>): Promise<T> {
  const encoded = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const res = await fetch(`/api/trpc/${path}?batch=1&input=${encoded}`, {
    credentials: 'include',
  });
  const json = await res.json();
  
  // batch response format: [{ result: { data: { json: ... } } }]
  if (Array.isArray(json)) {
    const first = json[0];
    if (first?.result?.data?.json !== undefined) {
      return first.result.data.json as T;
    }
    if (first?.result?.data !== undefined) {
      return first.result.data as T;
    }
    if (first?.error) {
      throw new Error(first.error.json?.message || 'API Error');
    }
  }
  
  // non-batch response format
  if (json?.result?.data?.json !== undefined) {
    return json.result.data.json as T;
  }
  if (json?.result?.data !== undefined) {
    return json.result.data as T;
  }
  
  throw new Error('Failed to fetch data from API');
}

// Fetch stock chart data via tRPC backend (no CORS issues)
export async function fetchStockData(symbol: string, interval: TimeInterval): Promise<Candle[]> {
  return trpcQuery<Candle[]>('stock.getChart', { symbol, interval });
}

// Fetch stock quote via tRPC backend
export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
  return trpcQuery<StockQuote>('stock.getQuote', { symbol });
}

// Batch fetch quotes via tRPC backend
export async function fetchBatchQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  return trpcQuery<Record<string, StockQuote>>('stock.batchQuotes', { symbols });
}

// 从共享配置导入股票池
export { US_STOCKS, STOCK_POOL } from '../../../shared/stockPool';
export type { StockSector } from '../../../shared/stockPool';

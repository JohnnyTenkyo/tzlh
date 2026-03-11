/**
 * 请求去重和数据范围合并机制
 * 避免并发重复请求相同时间段的数据
 */

interface PendingRequest {
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  promise: Promise<any>;
}

const pendingRequests = new Map<string, PendingRequest>();

/**
 * 生成请求的唯一键
 */
function getRequestKey(symbol: string, timeframe: string, startDate: string, endDate: string): string {
  return `${symbol}:${timeframe}:${startDate}:${endDate}`;
}

/**
 * 合并日期范围
 */
function mergeDateRanges(ranges: Array<{ start: string; end: string }>): Array<{ start: string; end: string }> {
  if (ranges.length === 0) return [];
  
  // 按开始日期排序
  const sorted = ranges.sort((a, b) => a.start.localeCompare(b.start));
  
  const merged: Array<{ start: string; end: string }> = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    
    // 如果当前范围的开始日期在上一个范围的结束日期之前或相同，则合并
    if (current.start <= last.end) {
      last.end = current.end > last.end ? current.end : last.end;
    } else {
      merged.push(current);
    }
  }
  
  return merged;
}

/**
 * 获取或创建去重请求
 */
export async function deduplicatedFetch<T>(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const key = getRequestKey(symbol, timeframe, startDate, endDate);
  
  // 如果已有相同的待处理请求，直接返回其 Promise
  if (pendingRequests.has(key)) {
    console.log(`[Dedup] Reusing pending request for ${key}`);
    return pendingRequests.get(key)!.promise;
  }
  
  // 创建新的请求
  const promise = fetchFn()
    .then((result) => {
      pendingRequests.delete(key);
      return result;
    })
    .catch((error) => {
      pendingRequests.delete(key);
      throw error;
    });
  
  pendingRequests.set(key, {
    symbol,
    timeframe,
    startDate,
    endDate,
    promise,
  });
  
  return promise;
}

/**
 * 获取待处理的请求列表
 */
export function getPendingRequests(): PendingRequest[] {
  return Array.from(pendingRequests.values());
}

/**
 * 清空所有待处理请求
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}

/**
 * 获取请求统计信息
 */
export function getRequestStats() {
  return {
    pendingCount: pendingRequests.size,
    pendingRequests: Array.from(pendingRequests.entries()).map(([key, req]) => ({
      key,
      symbol: req.symbol,
      timeframe: req.timeframe,
      dateRange: `${req.startDate} to ${req.endDate}`,
    })),
  };
}

export { mergeDateRanges };

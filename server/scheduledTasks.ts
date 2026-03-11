import { cacheStockHistoricalData, startBackgroundWarmup, stopWarmup } from "./cacheManager";
import { getDb } from "./db";
import { stockRecommendations } from "../drizzle/schema";
import type { Timeframe } from "./indicators";

let updateTaskRunning = false;
let lastUpdateTime: Date | null = null;

/**
 * 获取所有推荐的股票代码
 */
async function getRecommendedStocks(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const recommendations = await db.select().from(stockRecommendations);
    const symbols = recommendations.map((r: any) => r.symbol);
    return Array.from(new Set(symbols));
  } catch (error) {
    console.error("[ScheduledTasks] Error fetching recommended stocks:", error);
    return [];
  }
}

/**
 * 更新单个股票的缓存数据
 */
async function updateStockCache(symbol: string): Promise<boolean> {
  try {
    console.log(`[ScheduledTasks] Updating cache for ${symbol}...`);
    await cacheStockHistoricalData(symbol);
    console.log(`[ScheduledTasks] Cache updated for ${symbol}`);
    return true;
  } catch (error) {
    console.error(`[ScheduledTasks] Error updating cache for ${symbol}:`, error);
    return false;
  }
}

/**
 * 启动定时缓存更新任务
 */
export function startScheduledCacheUpdate(intervalMinutes: number = 60): void {
  if (updateTaskRunning) {
    console.log("[ScheduledTasks] Update task already running");
    return;
  }

  updateTaskRunning = true;
  console.log(`[ScheduledTasks] Starting scheduled cache update every ${intervalMinutes} minutes`);

  setInterval(async () => {
    if (lastUpdateTime && Date.now() - lastUpdateTime.getTime() < intervalMinutes * 60 * 1000) {
      return;
    }

    try {
      const stocks = await getRecommendedStocks();
      console.log(`[ScheduledTasks] Updating cache for ${stocks.length} stocks...`);

      let successCount = 0;
      for (const symbol of stocks) {
        const success = await updateStockCache(symbol);
        if (success) successCount++;
      }

      lastUpdateTime = new Date();
      console.log(`[ScheduledTasks] Cache update completed: ${successCount}/${stocks.length} successful`);
    } catch (error) {
      console.error("[ScheduledTasks] Error in scheduled update:", error);
    }
  }, intervalMinutes * 60 * 1000);
}

/**
 * 停止定时缓存更新任务
 */
export function stopScheduledCacheUpdate(): void {
  updateTaskRunning = false;
  console.log("[ScheduledTasks] Scheduled cache update stopped");
}

/**
 * 启动后台全量缓存预热（使用 Alpaca 批量 API）
 * 自动限速恢复，可跨天运行
 */
export async function startFullWarmupTask(
  symbols: string[],
  timeframes: Timeframe[] = ["1d", "1h", "15m"]
): Promise<void> {
  await startBackgroundWarmup(symbols, timeframes, 50);
}

export { stopWarmup };

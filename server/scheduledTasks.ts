import { cacheStockHistoricalData } from "./cacheManager";
import { getDb } from "./db";
import { stockRecommendations } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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
    return [...new Set(recommendations.map((r: any) => r.symbol))];
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

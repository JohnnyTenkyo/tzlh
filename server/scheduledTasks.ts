import { cacheStockHistoricalData, getCacheMetadata, updateCacheMetadata } from "./cacheManager";
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
    const success = await cacheStockHistoricalData(symbol);
    if (success) {
      console.log(`[ScheduledTasks] Successfully updated cache for ${symbol}`);
    } else {
      console.warn(`[ScheduledTasks] Failed to update cache for ${symbol}`);
    }
    return success;
  } catch (error) {
    console.error(`[ScheduledTasks] Error updating cache for ${symbol}:`, error);
    return false;
  }
}

/**
 * 每日更新缓存数据
 * 仅更新推荐的股票，以节省 API 配额
 */
export async function updateCacheDaily(): Promise<void> {
  if (updateTaskRunning) {
    console.warn("[ScheduledTasks] Update task already running, skipping...");
    return;
  }

  updateTaskRunning = true;
  const startTime = Date.now();

  try {
    console.log("[ScheduledTasks] Starting daily cache update...");

    // 获取所有推荐的股票
    const stocks = await getRecommendedStocks();
    console.log(`[ScheduledTasks] Found ${stocks.length} recommended stocks to update`);

    let successCount = 0;
    let failureCount = 0;

    // 逐个更新股票的缓存
    for (const symbol of stocks) {
      const success = await updateStockCache(symbol);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }

      // 添加延迟，避免 API 限流
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    lastUpdateTime = new Date();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[ScheduledTasks] Daily cache update completed in ${duration}s. Success: ${successCount}, Failure: ${failureCount}`
    );
  } catch (error) {
    console.error("[ScheduledTasks] Error during daily cache update:", error);
  } finally {
    updateTaskRunning = false;
  }
}

/**
 * 获取缓存更新状态
 */
export function getCacheUpdateStatus(): {
  isRunning: boolean;
  lastUpdateTime: Date | null;
} {
  return {
    isRunning: updateTaskRunning,
    lastUpdateTime,
  };
}

/**
 * 初始化定时任务
 * 每天 UTC 17:00 执行一次（美国东部时间 12:00 PM）
 */
export function initializeScheduledTasks(): void {
  // 计算下次执行时间
  const now = new Date();
  const next = new Date();
  next.setUTCHours(17, 0, 0, 0);

  // 如果已经过了今天的 17:00，则设置为明天的 17:00
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  const delay = next.getTime() - now.getTime();

  console.log(
    `[ScheduledTasks] Initialized. Next update scheduled for ${next.toISOString()}`
  );

  // 设置第一次执行
  setTimeout(() => {
    updateCacheDaily();

    // 之后每 24 小时执行一次
    setInterval(() => {
      updateCacheDaily();
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

/**
 * 手动触发缓存更新（用于测试或前端请求）
 */
export async function triggerManualUpdate(): Promise<{
  success: boolean;
  message: string;
}> {
  if (updateTaskRunning) {
    return {
      success: false,
      message: "缓存更新已在进行中，请稍候...",
    };
  }

  // 在后台异步执行
  updateCacheDaily().catch((error) =>
    console.error("[ScheduledTasks] Error in manual update:", error)
  );

  return {
    success: true,
    message: "缓存更新任务已启动，请稍候查看结果",
  };
}

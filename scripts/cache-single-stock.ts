/**
 * 缓存单个股票的 5 年历史 K 线数据
 * 运行方式: npx tsx scripts/cache-single-stock.ts SYMBOL
 */

import { cacheStockHistoricalData, getCacheStatus } from "../server/cacheManager";

async function main() {
  const symbol = process.argv[2];

  if (!symbol) {
    console.error("Usage: npx tsx scripts/cache-single-stock.ts SYMBOL");
    process.exit(1);
  }

  try {
    console.log(`[Cache] Starting to cache ${symbol}...`);

    // 检查缓存状态
    const status = await getCacheStatus(symbol);
    if (status?.status === "completed") {
      console.log(`[Cache] ${symbol} already cached (${status.totalCandles} candles)`);
      process.exit(0);
    }

    // 开始缓存
    const success = await cacheStockHistoricalData(symbol);

    if (success) {
      const newStatus = await getCacheStatus(symbol);
      console.log(`[Cache] ✅ Successfully cached ${symbol} (${newStatus?.totalCandles} candles)`);
      process.exit(0);
    } else {
      console.error(`[Cache] ❌ Failed to cache ${symbol}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`[Cache] Error:`, error);
    process.exit(1);
  }
}

main();

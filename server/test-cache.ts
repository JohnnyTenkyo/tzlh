/**
 * 测试缓存系统
 * 运行方式: npx tsx server/test-cache.ts
 */

import { cacheStockHistoricalData, getCacheStatus, getCandlesFromCache } from "./cacheManager";

async function testCache() {
  console.log("🧪 Testing cache system...\n");

  const testSymbol = "AAPL";
  const testTimeframe = "1d";
  const testStartDate = "2021-01-01";
  const testEndDate = "2026-03-10";

  try {
    // 1. 测试缓存单个股票
    console.log(`1️⃣  Testing cache for ${testSymbol}...`);
    const success = await cacheStockHistoricalData(testSymbol);
    if (success) {
      console.log(`✅ Successfully cached ${testSymbol}`);
    } else {
      console.log(`❌ Failed to cache ${testSymbol}`);
    }

    // 2. 检查缓存状态
    console.log(`\n2️⃣  Checking cache status...`);
    const status = await getCacheStatus(testSymbol);
    if (status) {
      console.log(`✅ Cache status for ${testSymbol}:`);
      console.log(`   - Status: ${status.status}`);
      console.log(`   - Total candles: ${status.totalCandles}`);
      console.log(`   - Earliest date: ${status.earliestDate}`);
      console.log(`   - Latest date: ${status.latestDate}`);
    } else {
      console.log(`❌ No cache status found for ${testSymbol}`);
    }

    // 3. 从缓存中读取数据
    console.log(`\n3️⃣  Reading from cache...`);
    const candles = await getCandlesFromCache(testSymbol, testTimeframe, testStartDate, testEndDate);
    if (candles && candles.length > 0) {
      console.log(`✅ Retrieved ${candles.length} candles from cache`);
      console.log(`   - First candle: ${candles[0].date} (close: ${candles[0].close})`);
      console.log(`   - Last candle: ${candles[candles.length - 1].date} (close: ${candles[candles.length - 1].close})`);
    } else {
      console.log(`❌ No candles found in cache`);
    }

    console.log(`\n✅ Cache test completed!`);
  } catch (error) {
    console.error("❌ Cache test failed:", error);
  }

  process.exit(0);
}

testCache();

import { fetchHistoricalCandles } from "./marketData";

async function checkCandles() {
  try {
    console.log("Fetching TSLA 1d candles...");
    const candles = await fetchHistoricalCandles("TSLA", "1d", "2026-03-01", "2026-03-07");
    
    console.log(`\nTotal candles: ${candles.length}`);
    console.log("\nLast 5 candles:");
    
    candles.slice(-5).forEach((c, i) => {
      const date = new Date(c.time);
      console.log(`  ${i}. time=${c.time} (${date.toISOString()}), close=${c.close}`);
    });
    
    // 检查时间戳是否在当天
    console.log("\n--- Time analysis ---");
    const lastCandle = candles[candles.length - 1];
    const candleDate = new Date(lastCandle.time);
    console.log(`Last candle time: ${lastCandle.time}`);
    console.log(`Last candle date: ${candleDate.toISOString()}`);
    console.log(`Last candle UTC date: ${candleDate.getUTCFullYear()}-${String(candleDate.getUTCMonth() + 1).padStart(2, '0')}-${String(candleDate.getUTCDate()).padStart(2, '0')}`);
    
    // 测试过滤逻辑
    const testDate = "2026-03-07";
    const dateTime = new Date(testDate).getTime();
    console.log(`\nTest date: ${testDate}`);
    console.log(`Test dateTime: ${dateTime}`);
    console.log(`Last candle time: ${lastCandle.time}`);
    console.log(`Last candle time <= dateTime: ${lastCandle.time <= dateTime}`);
    
    // 尝试包含当天的 K 线
    const dateTimeEndOfDay = new Date(testDate + "T23:59:59Z").getTime();
    console.log(`\nTest dateTimeEndOfDay: ${dateTimeEndOfDay}`);
    console.log(`Last candle time <= dateTimeEndOfDay: ${lastCandle.time <= dateTimeEndOfDay}`);
    
  } catch (error) {
    console.error("Error:", error);
  }
}

checkCandles();

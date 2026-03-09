import { fetchHistoricalCandles } from "./marketData";
import { detectBuySignal } from "./indicators";

async function testDetectBuySignalDirect() {
  try {
    console.log("Fetching TSLA candles...");
    
    const candles1d = await fetchHistoricalCandles("TSLA", "1d", "2025-12-01", "2026-03-07");
    const candles4h = await fetchHistoricalCandles("TSLA", "4h", "2025-12-01", "2026-03-07");
    const candles1h = await fetchHistoricalCandles("TSLA", "1h", "2025-12-01", "2026-03-07");
    const candles30m = await fetchHistoricalCandles("TSLA", "30m", "2025-12-01", "2026-03-07");
    
    // 找到 2026-03-05 的 K 线（需要包含当天）
    const mar5DateTime = new Date("2026-03-05T23:59:59Z").getTime();
    
    // 构建 candlesUpTo（包含 2026-03-05 及之前的所有 K 线）
    const candlesUpTo = {
      "1d": candles1d.filter(c => c.time <= mar5DateTime),
      "4h": candles4h.filter(c => c.time <= mar5DateTime),
      "1h": candles1h.filter(c => c.time <= mar5DateTime),
      "30m": candles30m.filter(c => c.time <= mar5DateTime),
    };
    
    console.log(`\nCandles up to 2026-03-05T23:59:59Z:`);
    console.log(`  1d: ${candlesUpTo["1d"].length}`);
    console.log(`  4h: ${candlesUpTo["4h"].length}`);
    console.log(`  1h: ${candlesUpTo["1h"].length}`);
    console.log(`  30m: ${candlesUpTo["30m"].length}`);
    
    // 检查 2026-03-05 的 K 线是否被包含
    console.log(`\nDebug: mar5DateTime = ${mar5DateTime} (${new Date(mar5DateTime).toISOString()})`);
    const mar5Candle1d = candlesUpTo["1d"].find(c => new Date(c.time).toISOString().startsWith("2026-03-05"));
    console.log(`Debug: 2026-03-05 1d candle: ${mar5Candle1d ? "found" : "NOT found"}`);
    
    // 获取最后一根日线的收盘价
    const lastDaily = candlesUpTo["1d"][candlesUpTo["1d"].length - 1];
    console.log(`\nLast daily candle: time=${lastDaily.time} (${new Date(lastDaily.time).toISOString()}), close=${lastDaily.close}`);
    
    // 测试 detectBuySignal
    console.log(`\n=== Testing detectBuySignal ===`);
    
    const testCases = [
      { cdTfs: ["1d"], ladderTfs: ["1d"] },
      { cdTfs: ["1d"], ladderTfs: ["4h"] },
      { cdTfs: ["1d"], ladderTfs: ["1h"] },
      { cdTfs: ["1d"], ladderTfs: ["30m"] },
    ];
    
    for (const testCase of testCases) {
      console.log(`\nTesting ${testCase.cdTfs.join("/")} + ${testCase.ladderTfs.join("/")}...`);
      const sig = detectBuySignal(
        candlesUpTo as any,
        testCase.cdTfs as any,
        testCase.ladderTfs as any,
        10,
        lastDaily.close
      );
      
      const label = `CD:${testCase.cdTfs.join("/")}, Ladder:${testCase.ladderTfs.join("/")}`;
      if (sig) {
        console.log(`✅ ${label}: ${sig.type} - ${sig.reason}`);
      } else {
        console.log(`❌ ${label}: null`);
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testDetectBuySignalDirect();

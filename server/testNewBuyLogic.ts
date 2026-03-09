import { fetchHistoricalCandles } from "./marketData";
import { detectBuySignal } from "./indicators";

async function testNewBuyLogic() {
  try {
    console.log("Fetching TSLA candles for testing new buy logic...");
    
    const candles1d = await fetchHistoricalCandles("TSLA", "1d", "2025-12-01", "2026-03-07");
    const candles4h = await fetchHistoricalCandles("TSLA", "4h", "2025-12-01", "2026-03-07");
    const candles1h = await fetchHistoricalCandles("TSLA", "1h", "2025-12-01", "2026-03-07");
    const candles30m = await fetchHistoricalCandles("TSLA", "30m", "2025-12-01", "2026-03-07");
    
    console.log(`Candles: 1d=${candles1d.length}, 4h=${candles4h.length}, 1h=${candles1h.length}, 30m=${candles30m.length}`);
    
    // 找到 2026-03-05 的 K 线
    const mar5Index = candles1d.findIndex(c => {
      const date = new Date(c.time);
      return date.getUTCFullYear() === 2026 && date.getUTCMonth() === 2 && date.getUTCDate() === 5;
    });
    
    if (mar5Index >= 0) {
      const candlesUpToMar5 = {
        "1d": candles1d.slice(0, mar5Index + 1),
        "4h": candles4h.filter(c => c.time <= candles1d[mar5Index].time),
        "1h": candles1h.filter(c => c.time <= candles1d[mar5Index].time),
        "30m": candles30m.filter(c => c.time <= candles1d[mar5Index].time),
      };
      
      console.log(`\n=== Testing New Buy Logic at 2026-03-05 ===`);
      console.log(`Candles up to 2026-03-05: 1d=${candlesUpToMar5["1d"].length}, 4h=${candlesUpToMar5["4h"].length}, 1h=${candlesUpToMar5["1h"].length}, 30m=${candlesUpToMar5["30m"].length}`);
      
      const currentPrice = candles1d[mar5Index].close;
      console.log(`Current price: ${currentPrice}`);
      
      // 测试不同的梯子级别组合
      const testCases = [
        { cdTfs: ["1d"], ladderTfs: ["1d"] },
        { cdTfs: ["1d"], ladderTfs: ["4h"] },
        { cdTfs: ["1d"], ladderTfs: ["1h"] },
        { cdTfs: ["1d"], ladderTfs: ["30m"] },
        { cdTfs: ["1d"], ladderTfs: ["1d", "4h"] },
        { cdTfs: ["1d"], ladderTfs: ["4h", "1h"] },
        { cdTfs: ["1d"], ladderTfs: ["1h", "30m"] },
      ];
      
      console.log("\n--- Buy Signal Detection (New Logic) ---");
      for (const testCase of testCases) {
        const sig = detectBuySignal(
          candlesUpToMar5 as any,
          testCase.cdTfs as any,
          testCase.ladderTfs as any,
          5,
          currentPrice
        );
        
        const label = `CD:${testCase.cdTfs.join("/")}, Ladder:${testCase.ladderTfs.join("/")}`;
        if (sig) {
          console.log(`✅ ${label}: ${sig.type} - ${sig.reason}`);
        } else {
          console.log(`❌ ${label}: null`);
        }
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testNewBuyLogic();

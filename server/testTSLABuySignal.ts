import { fetchHistoricalCandles } from "./marketData";
import { detectBuySignal, calculateLadder, getLadderSignal } from "./indicators";

async function testTSLABuySignal() {
  try {
    console.log("Fetching TSLA candles for all timeframes...");
    
    const candles1d = await fetchHistoricalCandles("TSLA", "1d", "2025-12-01", "2026-03-07");
    const candles4h = await fetchHistoricalCandles("TSLA", "4h", "2025-12-01", "2026-03-07");
    const candles1h = await fetchHistoricalCandles("TSLA", "1h", "2025-12-01", "2026-03-07");
    const candles30m = await fetchHistoricalCandles("TSLA", "30m", "2025-12-01", "2026-03-07");
    
    console.log(`Candles: 1d=${candles1d.length}, 4h=${candles4h.length}, 1h=${candles1h.length}, 30m=${candles30m.length}`);
    
    // 测试 2026-03-05 的买入信号
    console.log("\n=== Testing Buy Signal at 2026-03-05 ===");
    
    const mar5Index = candles1d.findIndex(c => {
      const date = new Date(c.time);
      return date.getUTCFullYear() === 2026 && date.getUTCMonth() === 2 && date.getUTCDate() === 5;
    });
    
    if (mar5Index >= 0) {
      const candlesUpToMar5 = candles1d.slice(0, mar5Index + 1);
      const candles4hUpToMar5 = candles4h.filter(c => c.time <= candles1d[mar5Index].time);
      const candles1hUpToMar5 = candles1h.filter(c => c.time <= candles1d[mar5Index].time);
      const candles30mUpToMar5 = candles30m.filter(c => c.time <= candles1d[mar5Index].time);
      
      console.log(`Candles up to 2026-03-05: 1d=${candlesUpToMar5.length}, 4h=${candles4hUpToMar5.length}, 1h=${candles1hUpToMar5.length}, 30m=${candles30mUpToMar5.length}`);
      
      const currentPrice = candles1d[mar5Index].close;
      console.log(`Current price: ${currentPrice}`);
      
      // 检查梯子信号
      console.log("\n--- Ladder Signals ---");
      for (const [tf, candles] of [["1d", candlesUpToMar5], ["4h", candles4hUpToMar5], ["1h", candles1hUpToMar5], ["30m", candles30mUpToMar5]] as const) {
        if (candles.length >= 90) {
          const ladder = calculateLadder(candles);
          const sig = getLadderSignal(candles, ladder);
          console.log(`${tf}:`, {
            blueCrossYellowUp: sig.blueCrossYellowUp,
            blueDnAboveYellowUp: sig.blueDnAboveYellowUp,
            blueAboveYellow: sig.blueAboveYellow,
            blueUp: sig.latestBlueUp.toFixed(2),
            blueDn: sig.latestBlueDn.toFixed(2),
            yellowUp: sig.latestYellowUp.toFixed(2),
            yellowDn: sig.latestYellowDn.toFixed(2),
          });
        }
      }
      
      // 测试买入信号
      console.log("\n--- Buy Signal Detection ---");
      const buySig1 = detectBuySignal(
        {
          "1d": candlesUpToMar5,
          "4h": candles4hUpToMar5,
          "1h": candles1hUpToMar5,
          "30m": candles30mUpToMar5,
        },
        ["1d"], // CD signal timeframes
        ["1d"], // Ladder break timeframes
        5, // CD lookback
        currentPrice
      );
      console.log("Buy signal (CD:1d, Ladder:1d):", buySig1);
      
      const buySig2 = detectBuySignal(
        {
          "1d": candlesUpToMar5,
          "4h": candles4hUpToMar5,
          "1h": candles1hUpToMar5,
          "30m": candles30mUpToMar5,
        },
        ["1d"], // CD signal timeframes
        ["4h"], // Ladder break timeframes
        5, // CD lookback
        currentPrice
      );
      console.log("Buy signal (CD:1d, Ladder:4h):", buySig2);
      
      const buySig3 = detectBuySignal(
        {
          "1d": candlesUpToMar5,
          "4h": candles4hUpToMar5,
          "1h": candles1hUpToMar5,
          "30m": candles30mUpToMar5,
        },
        ["1d"], // CD signal timeframes
        ["1d", "4h"], // Ladder break timeframes
        5, // CD lookback
        currentPrice
      );
      console.log("Buy signal (CD:1d, Ladder:1d,4h):", buySig3);
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testTSLABuySignal();

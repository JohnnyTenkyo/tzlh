import { fetchHistoricalCandles } from "./marketData";
import { calculateLadder, getLadderSignal } from "./indicators";

async function testTSLALadderConditions() {
  try {
    console.log("Fetching TSLA candles...");
    
    const candles1d = await fetchHistoricalCandles("TSLA", "1d", "2025-12-01", "2026-03-07");
    const candles4h = await fetchHistoricalCandles("TSLA", "4h", "2025-12-01", "2026-03-07");
    
    // 找到 2026-03-05 的 K 线
    const mar5Index = candles1d.findIndex(c => {
      const date = new Date(c.time);
      return date.getUTCFullYear() === 2026 && date.getUTCMonth() === 2 && date.getUTCDate() === 5;
    });
    
    if (mar5Index >= 0) {
      const candlesUpToMar5 = candles1d.slice(0, mar5Index + 1);
      const candles4hUpToMar5 = candles4h.filter(c => c.time <= candles1d[mar5Index].time);
      
      const ladder1d = calculateLadder(candlesUpToMar5);
      const sig1d = getLadderSignal(candlesUpToMar5, ladder1d);
      
      const ladder4h = calculateLadder(candles4hUpToMar5);
      const sig4h = getLadderSignal(candles4hUpToMar5, ladder4h);
      
      console.log("\n=== 1d Ladder Conditions ===");
      console.log(`blueUp: ${sig1d.latestBlueUp.toFixed(2)}`);
      console.log(`blueDn: ${sig1d.latestBlueDn.toFixed(2)}`);
      console.log(`yellowUp: ${sig1d.latestYellowUp.toFixed(2)}`);
      console.log(`yellowDn: ${sig1d.latestYellowDn.toFixed(2)}`);
      console.log(`close: ${sig1d.latestClose.toFixed(2)}`);
      console.log(`\nCondition checks:`);
      console.log(`blueUpBelowYellowDn: ${sig1d.blueUpBelowYellowDn} (blueUp ${sig1d.latestBlueUp.toFixed(2)} < yellowDn ${sig1d.latestYellowDn.toFixed(2)})`);
      console.log(`closeAboveBlueUp: ${sig1d.closeAboveBlueUp} (close ${sig1d.latestClose.toFixed(2)} > blueUp ${sig1d.latestBlueUp.toFixed(2)})`);
      console.log(`blueAboveYellow: ${sig1d.blueAboveYellow} (blueDn ${sig1d.latestBlueDn.toFixed(2)} > yellowDn ${sig1d.latestYellowDn.toFixed(2)})`);
      
      console.log("\n=== 4h Ladder Conditions ===");
      console.log(`blueUp: ${sig4h.latestBlueUp.toFixed(2)}`);
      console.log(`blueDn: ${sig4h.latestBlueDn.toFixed(2)}`);
      console.log(`yellowUp: ${sig4h.latestYellowUp.toFixed(2)}`);
      console.log(`yellowDn: ${sig4h.latestYellowDn.toFixed(2)}`);
      console.log(`close: ${sig4h.latestClose.toFixed(2)}`);
      console.log(`\nCondition checks:`);
      console.log(`blueUpBelowYellowDn: ${sig4h.blueUpBelowYellowDn} (blueUp ${sig4h.latestBlueUp.toFixed(2)} < yellowDn ${sig4h.latestYellowDn.toFixed(2)})`);
      console.log(`closeAboveBlueUp: ${sig4h.closeAboveBlueUp} (close ${sig4h.latestClose.toFixed(2)} > blueUp ${sig4h.latestBlueUp.toFixed(2)})`);
      console.log(`blueAboveYellow: ${sig4h.blueAboveYellow} (blueDn ${sig4h.latestBlueDn.toFixed(2)} > yellowDn ${sig4h.latestYellowDn.toFixed(2)})`);
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testTSLALadderConditions();

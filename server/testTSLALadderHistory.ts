import { fetchHistoricalCandles } from "./marketData";
import { calculateLadder, getLadderSignal } from "./indicators";

async function testTSLALadderHistory() {
  try {
    console.log("Fetching TSLA daily candles...");
    
    const candles1d = await fetchHistoricalCandles("TSLA", "1d", "2025-12-01", "2026-03-07");
    console.log(`Total 1d candles: ${candles1d.length}`);
    
    // 找到 2026-03-05 的 K 线
    const mar5Index = candles1d.findIndex(c => {
      const date = new Date(c.time);
      return date.getUTCFullYear() === 2026 && date.getUTCMonth() === 2 && date.getUTCDate() === 5;
    });
    
    console.log(`2026-03-05 index: ${mar5Index}`);
    
    if (mar5Index >= 0) {
      const candlesUpToMar5 = candles1d.slice(0, mar5Index + 1);
      const ladder = calculateLadder(candlesUpToMar5);
      
      // 打印最后 20 根 K 线的梯子穿越情况
      console.log("\n=== Last 20 K-lines Ladder Signals ===");
      const start = Math.max(0, candlesUpToMar5.length - 20);
      for (let i = start; i < candlesUpToMar5.length; i++) {
        const candlesUpToI = candlesUpToMar5.slice(0, i + 1);
        const ladderUpToI = calculateLadder(candlesUpToI);
        const sig = getLadderSignal(candlesUpToI, ladderUpToI);
        
        const date = new Date(candlesUpToMar5[i].time);
        const dateStr = date.toISOString().split('T')[0];
        
        console.log(`[${i}] ${dateStr}: blueCrossYellowUp=${sig.blueCrossYellowUp}, blueDnAboveYellowUp=${sig.blueDnAboveYellowUp}, blueUp=${sig.latestBlueUp.toFixed(2)}, yellowUp=${sig.latestYellowUp.toFixed(2)}`);
      }
      
      // 检查是否有任何穿越
      console.log("\n=== Checking for any blueCrossYellowUp in history ===");
      let foundCross = false;
      for (let i = 1; i < candlesUpToMar5.length; i++) {
        const candlesUpToI = candlesUpToMar5.slice(0, i + 1);
        const ladderUpToI = calculateLadder(candlesUpToI);
        const sig = getLadderSignal(candlesUpToI, ladderUpToI);
        
        if (sig.blueCrossYellowUp) {
          foundCross = true;
          const date = new Date(candlesUpToMar5[i].time);
          console.log(`Found blueCrossYellowUp at index ${i} (${date.toISOString().split('T')[0]})`);
        }
      }
      
      if (!foundCross) {
        console.log("No blueCrossYellowUp found in entire history");
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testTSLALadderHistory();

import { fetchHistoricalCandles } from "./marketData";
import { calculateLadder, getLadderSignal, getCDSignal, hasCDSignalInRange } from "./indicators";

async function testTSLA4hCD() {
  try {
    console.log("Fetching TSLA 4h candles...");
    
    const candles4h = await fetchHistoricalCandles("TSLA", "4h", "2025-12-01", "2026-03-07");
    console.log(`Total 4h candles: ${candles4h.length}`);
    
    // 找到指定日期的 K 线
    const targetDates = [
      { date: "2026-01-21", name: "Jan 21" },
      { date: "2026-01-30", name: "Jan 30" },
      { date: "2026-02-24", name: "Feb 24" },
      { date: "2026-03-04", name: "Mar 04" },
      { date: "2026-03-05", name: "Mar 05" },
    ];
    
    for (const target of targetDates) {
      const [year, month, day] = target.date.split("-").map(Number);
      const targetIndex = candles4h.findIndex(c => {
        const date = new Date(c.time);
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
      });
      
      if (targetIndex >= 0) {
        const candlesUpToTarget = candles4h.slice(0, targetIndex + 1);
        const ladder = calculateLadder(candlesUpToTarget);
        const sig = getLadderSignal(candlesUpToTarget, ladder);
        const cdSig = getCDSignal(candlesUpToTarget, 5);
        
        console.log(`\n=== ${target.name} (${target.date}) ===`);
        console.log(`Index: ${targetIndex}, Candles: ${candlesUpToTarget.length}`);
        console.log(`Ladder: blueUp=${sig.latestBlueUp.toFixed(2)}, blueDn=${sig.latestBlueDn.toFixed(2)}, yellowUp=${sig.latestYellowUp.toFixed(2)}, yellowDn=${sig.latestYellowDn.toFixed(2)}`);
        console.log(`Signals: blueCrossYellowUp=${sig.blueCrossYellowUp}, blueDnAboveYellowUp=${sig.blueDnAboveYellowUp}, blueAboveYellow=${sig.blueAboveYellow}`);
        console.log(`CD: hasCDSignal=${cdSig.hasCDSignal}, DIFF=${cdSig.latestDiff.toFixed(3)}, DEA=${cdSig.latestDea.toFixed(3)}, MACD=${cdSig.latestMacd.toFixed(3)}`);
      } else {
        console.log(`\n=== ${target.name} (${target.date}) - NOT FOUND ===`);
      }
    }
    
    // 检查 4h 级别是否有任何 blueCrossYellowUp
    console.log("\n\n=== Checking for any blueCrossYellowUp in 4h history ===");
    let foundCross = false;
    for (let i = 1; i < candles4h.length; i++) {
      const candlesUpToI = candles4h.slice(0, i + 1);
      const ladderUpToI = calculateLadder(candlesUpToI);
      const sig = getLadderSignal(candlesUpToI, ladderUpToI);
      
      if (sig.blueCrossYellowUp) {
        foundCross = true;
        const date = new Date(candles4h[i].time);
        console.log(`Found blueCrossYellowUp at index ${i} (${date.toISOString()})`);
      }
    }
    
    if (!foundCross) {
      console.log("No blueCrossYellowUp found in entire 4h history");
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testTSLA4hCD();

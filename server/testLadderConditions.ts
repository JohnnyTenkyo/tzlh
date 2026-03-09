import { fetchHistoricalCandles } from "./marketData";
import { calculateLadder } from "./indicators";

async function testLadderConditions() {
  try {
    console.log("Fetching TSLA candles...");
    
    const candles1d = await fetchHistoricalCandles("TSLA", "1d", "2025-12-01", "2026-03-07");
    const candles4h = await fetchHistoricalCandles("TSLA", "4h", "2025-12-01", "2026-03-07");
    const candles1h = await fetchHistoricalCandles("TSLA", "1h", "2025-12-01", "2026-03-07");
    
    // 找到 2026-03-05 的 K 线
    const mar5Index = candles1d.findIndex(c => {
      const date = new Date(c.time);
      return date.getUTCFullYear() === 2026 && date.getUTCMonth() === 2 && date.getUTCDate() === 5;
    });
    
    if (mar5Index >= 0) {
      console.log(`\n=== Ladder Conditions at 2026-03-05 ===`);
      
      // 1d 级别
      const ladder1d = calculateLadder(candles1d.slice(0, mar5Index + 1));
      const n1d = ladder1d.blueUp.length - 1;
      console.log(`\n1d Level:`);
      console.log(`  Blue Up: ${ladder1d.blueUp[n1d].toFixed(2)}, Blue Dn: ${ladder1d.blueDn[n1d].toFixed(2)}`);
      console.log(`  Yellow Up: ${ladder1d.yellowUp[n1d].toFixed(2)}, Yellow Dn: ${ladder1d.yellowDn[n1d].toFixed(2)}`);
      console.log(`  First Buy (blueUp > yellowUp && blueDn <= yellowUp): ${ladder1d.blueUp[n1d] > ladder1d.yellowUp[n1d] && ladder1d.blueDn[n1d] <= ladder1d.yellowUp[n1d]}`);
      console.log(`  Second Buy (blueDn > yellowUp): ${ladder1d.blueDn[n1d] > ladder1d.yellowUp[n1d]}`);
      
      // 4h 级别
      const ladder4h = calculateLadder(candles4h.filter(c => c.time <= candles1d[mar5Index].time));
      const n4h = ladder4h.blueUp.length - 1;
      console.log(`\n4h Level:`);
      console.log(`  Blue Up: ${ladder4h.blueUp[n4h].toFixed(2)}, Blue Dn: ${ladder4h.blueDn[n4h].toFixed(2)}`);
      console.log(`  Yellow Up: ${ladder4h.yellowUp[n4h].toFixed(2)}, Yellow Dn: ${ladder4h.yellowDn[n4h].toFixed(2)}`);
      console.log(`  First Buy (blueUp > yellowUp && blueDn <= yellowUp): ${ladder4h.blueUp[n4h] > ladder4h.yellowUp[n4h] && ladder4h.blueDn[n4h] <= ladder4h.yellowUp[n4h]}`);
      console.log(`  Second Buy (blueDn > yellowUp): ${ladder4h.blueDn[n4h] > ladder4h.yellowUp[n4h]}`);
      
      // 1h 级别
      const ladder1h = calculateLadder(candles1h.filter(c => c.time <= candles1d[mar5Index].time));
      const n1h = ladder1h.blueUp.length - 1;
      console.log(`\n1h Level:`);
      console.log(`  Blue Up: ${ladder1h.blueUp[n1h].toFixed(2)}, Blue Dn: ${ladder1h.blueDn[n1h].toFixed(2)}`);
      console.log(`  Yellow Up: ${ladder1h.yellowUp[n1h].toFixed(2)}, Yellow Dn: ${ladder1h.yellowDn[n1h].toFixed(2)}`);
      console.log(`  First Buy (blueUp > yellowUp && blueDn <= yellowUp): ${ladder1h.blueUp[n1h] > ladder1h.yellowUp[n1h] && ladder1h.blueDn[n1h] <= ladder1h.yellowUp[n1h]}`);
      console.log(`  Second Buy (blueDn > yellowUp): ${ladder1h.blueDn[n1h] > ladder1h.yellowUp[n1h]}`);
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testLadderConditions();

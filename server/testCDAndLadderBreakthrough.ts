import { fetchHistoricalCandles } from "./marketData";
import { calculateLadder, hasCDSignalInRange } from "./indicators";

async function testCDAndLadderBreakthrough() {
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
      console.log(`\n=== CD Signal and Ladder Breakthrough Analysis ===`);
      
      // 检查 CD 信号
      const candlesUpToMar5 = candles1d.slice(0, mar5Index + 1);
      const hasCDSignal = hasCDSignalInRange(candlesUpToMar5, 5);
      console.log(`\nCD Signal at 2026-03-05: ${hasCDSignal}`);
      
      // 检查之后 20 根 K 线内的梯子突破
      console.log(`\nChecking ladder breakthrough in 20 candles after 2026-03-05...`);
      
      const lookAheadCount = Math.min(20, candles1d.length - mar5Index - 1);
      console.log(`Looking ahead ${lookAheadCount} candles...`);
      
      for (let i = 1; i <= lookAheadCount; i++) {
        const idx = mar5Index + i;
        const date = new Date(candles1d[idx].time);
        const dateStr = date.toISOString().split('T')[0];
        
        // 检查 1d 级别梯子
        const ladder1d = calculateLadder(candles1d.slice(0, idx + 1));
        const n1d = ladder1d.blueUp.length - 1;
        const blueUp1d = ladder1d.blueUp[n1d];
        const blueDn1d = ladder1d.blueDn[n1d];
        const yellowUp1d = ladder1d.yellowUp[n1d];
        
        const firstBuy1d = blueUp1d > yellowUp1d && blueDn1d <= yellowUp1d;
        const secondBuy1d = blueDn1d > yellowUp1d;
        
        if (firstBuy1d || secondBuy1d) {
          console.log(`\n[Day ${i}] ${dateStr}: ✅ Ladder breakthrough detected!`);
          console.log(`  1d Blue Up: ${blueUp1d.toFixed(2)}, Blue Dn: ${blueDn1d.toFixed(2)}, Yellow Up: ${yellowUp1d.toFixed(2)}`);
          if (firstBuy1d) console.log(`  → First Buy Point (blueUp > yellowUp && blueDn <= yellowUp)`);
          if (secondBuy1d) console.log(`  → Second Buy Point (blueDn > yellowUp)`);
        }
      }
      
      console.log(`\nNote: If no breakthrough detected within 20 candles, the observation period expires.`);
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testCDAndLadderBreakthrough();

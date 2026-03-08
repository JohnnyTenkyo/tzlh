import { fetchHistoricalCandles } from "./marketData";
import { calculateCDSignal, getCDSignal } from "./indicators";

async function testTSLACD() {
  try {
    console.log("Fetching TSLA daily candles...");
    
    const candles1d = await fetchHistoricalCandles("TSLA", "1d", "2025-12-01", "2026-03-07");
    console.log(`Total 1d candles: ${candles1d.length}`);
    
    // 找到 2026-03-05 的 K 线
    const mar5Index = candles1d.findIndex(c => {
      const date = new Date(c.time);
      return date.getUTCFullYear() === 2026 && date.getUTCMonth() === 2 && date.getUTCDate() === 5;
    });
    
    const dec26Index = candles1d.findIndex(c => {
      const date = new Date(c.time);
      return date.getUTCFullYear() === 2025 && date.getUTCMonth() === 11 && date.getUTCDate() === 26;
    });
    
    console.log(`\n2026-03-05 index: ${mar5Index}, 2025-12-26 index: ${dec26Index}`);
    
    if (mar5Index >= 0) {
      const candle = candles1d[mar5Index];
      console.log(`\n2026-03-05 K线:`, {
        timestamp: new Date(candle.time).toISOString(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
      
      // 计算到该日期为止的 CD 信号
      const candlesUpToMar5 = candles1d.slice(0, mar5Index + 1);
      const cdResult = calculateCDSignal(candlesUpToMar5);
      const cdSignal = getCDSignal(candlesUpToMar5, 5);
      
      console.log(`\nCD Signal at 2026-03-05:`, {
        hasCDSignal: cdSignal.hasCDSignal,
        hasSellSignal: cdSignal.hasSellSignal,
        latestDiff: cdSignal.latestDiff,
        latestDea: cdSignal.latestDea,
        latestMacd: cdSignal.latestMacd,
      });
      
      // 打印最后几根 K 线的 DXDX 值
      console.log(`\nLast 10 DXDX values:`, cdResult.dxdx.slice(-10));
      console.log(`Last 10 CCC values:`, cdResult.ccc.slice(-10));
      
      // 打印最后几根 K 线的 DIFF/DEA/MACD
      const n = cdResult.diff.length;
      console.log(`\nLast 5 DIFF/DEA/MACD values:`);
      for (let i = Math.max(0, n - 5); i < n; i++) {
        console.log(`  [${i}] DIFF: ${cdResult.diff[i].toFixed(3)}, DEA: ${cdResult.dea[i].toFixed(3)}, MACD: ${cdResult.macd[i].toFixed(3)}`);
      }
    }
    
    if (dec26Index >= 0) {
      const candle = candles1d[dec26Index];
      console.log(`\n\n2025-12-26 K线:`, {
        timestamp: new Date(candle.time).toISOString(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
      
      // 计算到该日期为止的 CD 信号
      const candlesUpToDec26 = candles1d.slice(0, dec26Index + 1);
      const cdResult = calculateCDSignal(candlesUpToDec26);
      const cdSignal = getCDSignal(candlesUpToDec26, 5);
      
      console.log(`\nCD Signal at 2025-12-26:`, {
        hasCDSignal: cdSignal.hasCDSignal,
        hasSellSignal: cdSignal.hasSellSignal,
        latestDiff: cdSignal.latestDiff,
        latestDea: cdSignal.latestDea,
        latestMacd: cdSignal.latestMacd,
      });
      
      // 打印最后几根 K 线的 DBJGXC 值
      console.log(`\nLast 10 DBJGXC values:`, cdResult.dbjgxc.slice(-10));
      console.log(`Last 10 DBBL values:`, cdResult.dbbl.slice(-10));
      
      // 打印最后几根 K 线的 DIFF/DEA/MACD
      const n = cdResult.diff.length;
      console.log(`\nLast 5 DIFF/DEA/MACD values:`);
      for (let i = Math.max(0, n - 5); i < n; i++) {
        console.log(`  [${i}] DIFF: ${cdResult.diff[i].toFixed(3)}, DEA: ${cdResult.dea[i].toFixed(3)}, MACD: ${cdResult.macd[i].toFixed(3)}`);
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testTSLACD();

import { fetchHistoricalCandles } from "./marketData";
import { calculateLadder, getLadderSignal, detectBuySignal, detectSellSignal } from "./indicators";

async function testFullBacktest() {
  try {
    console.log("Fetching TSLA candles for backtest...");
    
    const candles1d = await fetchHistoricalCandles("TSLA", "1d", "2025-12-01", "2026-03-07");
    const candles4h = await fetchHistoricalCandles("TSLA", "4h", "2025-12-01", "2026-03-07");
    const candles1h = await fetchHistoricalCandles("TSLA", "1h", "2025-12-01", "2026-03-07");
    const candles30m = await fetchHistoricalCandles("TSLA", "30m", "2025-12-01", "2026-03-07");
    
    console.log(`Candles: 1d=${candles1d.length}, 4h=${candles4h.length}, 1h=${candles1h.length}, 30m=${candles30m.length}`);
    
    // 配置参数
    const config = {
      cdTimeframes: ["1d"] as const,
      ladderTimeframes: ["4h"] as const,
      cdLookback: 5,
    };
    
    let buyCount = 0;
    let sellCount = 0;
    const trades: any[] = [];
    
    // 逐日期遍历，检查买卖信号
    console.log("\n=== Scanning for Buy/Sell Signals ===");
    
    for (let i = 100; i < candles1d.length; i++) {
      const currentDate = new Date(candles1d[i].time);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // 获取当前日期之前的所有 K 线
      const candlesUpToNow = {
        "1d": candles1d.slice(0, i + 1),
        "4h": candles4h.filter(c => c.time <= candles1d[i].time),
        "1h": candles1h.filter(c => c.time <= candles1d[i].time),
        "30m": candles30m.filter(c => c.time <= candles1d[i].time),
      };
      
      const currentPrice = candles1d[i].close;
      
      // 检查买入信号
      const buySig = detectBuySignal(
        candlesUpToNow as any,
        config.cdTimeframes as any,
        config.ladderTimeframes as any,
        config.cdLookback,
        currentPrice
      );
      
      if (buySig) {
        buyCount++;
        trades.push({
          date: dateStr,
          type: "BUY",
          price: currentPrice,
          reason: buySig.reason,
        });
        console.log(`[BUY #${buyCount}] ${dateStr} @ ${currentPrice.toFixed(2)} - ${buySig.reason}`);
      }
      
      // 检查卖出信号
      const sellSig = detectSellSignal(
        candlesUpToNow as any,
        config.ladderTimeframes[0],
        currentPrice,
        false
      );
      
      if (sellSig) {
        sellCount++;
        trades.push({
          date: dateStr,
          type: "SELL",
          price: currentPrice,
          reason: sellSig.reason,
        });
        console.log(`[SELL #${sellCount}] ${dateStr} @ ${currentPrice.toFixed(2)} - ${sellSig.reason}`);
      }
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Total Buy signals: ${buyCount}`);
    console.log(`Total Sell signals: ${sellCount}`);
    console.log(`Total trades: ${trades.length}`);
    
    if (trades.length === 0) {
      console.log("❌ No trades generated!");
    } else {
      console.log(`✅ Generated ${trades.length} trades`);
      console.log("\nFirst 10 trades:");
      for (let i = 0; i < Math.min(10, trades.length); i++) {
        const t = trades[i];
        console.log(`  [${i + 1}] ${t.type} @ ${t.price.toFixed(2)} on ${t.date}`);
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testFullBacktest();

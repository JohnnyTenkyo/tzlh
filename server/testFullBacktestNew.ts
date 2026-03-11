import { runBacktest } from "./backtestEngine";

async function test() {
  console.log("🔄 运行完整回测测试...\n");
  
  const config = {
    sessionId: 1,
    initialBalance: 100000,
    startDate: "2025-12-01",
    endDate: "2026-03-07",
    marketCapFilter: "all" as const,
    ladderTimeframe: "30m" as const,
    cdScoreThreshold: 30 as any,
    customStocks: ["TSLA"],
    debug: false,
  };

  try {
    const result = await runBacktest(config);
    
    console.log("✅ 回测完成！");
    console.log("\n📊 回测结果摘要：");
    console.log(`- 总交易数：${result.trades.length}`);
    console.log(`- 买入次数：${result.trades.filter(t => t.type === 'buy').length}`);
    console.log(`- 卖出次数：${result.trades.filter(t => t.type === 'sell').length}`);
    
    if (result.trades.length > 0) {
      console.log("\n📈 前 5 笔交易：");
      result.trades.slice(0, 5).forEach((trade: any, i: number) => {
        const price = typeof trade.price === 'string' ? parseFloat(trade.price) : trade.price;
        const date = trade.tradeDate || new Date().toISOString().split('T')[0];
        console.log(`${i + 1}. ${trade.type.toUpperCase()} ${trade.symbol} @ ${price.toFixed(2)} (${date})`);
      });
    }
    
    console.log("\n✅ 测试成功！");
  } catch (error) {
    console.error("❌ 测试失败：", error);
    process.exit(1);
  }
}

test();

/**
 * 回测引擎测试脚本
 * 使用历史数据直接测试信号检测逻辑
 */

import { fetchHistoricalCandles } from "./marketData";
import {
  calculateLadder,
  getLadderSignal,
  hasCDSignalInRange,
  type Candle,
  type Timeframe,
} from "./indicators";

interface TradeSignal {
  date: string;
  type: "buy" | "sell";
  price: number;
  reason: string;
}

async function testBacktestSignals(symbol: string, startDate: string, endDate: string) {
  console.log(`\n=== 测试 ${symbol} (${startDate} 到 ${endDate}) ===\n`);

  try {
    // 获取日线K线数据
    const candles1d = await fetchHistoricalCandles(symbol, "1d", startDate, endDate);

    console.log(`日线K线数据: ${candles1d.length} 根`);

    if (candles1d.length < 90) {
      console.log("❌ 日线数据不足，无法进行回测");
      return;
    }

    // 检测买入和卖出信号
    const buySignals: TradeSignal[] = [];
    const sellSignals: TradeSignal[] = [];

    // 逐日检测信号
    for (let i = 90; i < candles1d.length; i++) {
      const date = new Date(candles1d[i].time).toISOString().split("T")[0];
      const dailyCandles = candles1d.slice(0, i + 1);

      // 检测CD信号
      const hasCDSignal = hasCDSignalInRange(dailyCandles, 10);

      // 检测梯子信号
      const ladder = calculateLadder(dailyCandles);
      const ladderSignal = getLadderSignal(dailyCandles, ladder);

      // 买入信号：CD信号 + 蓝梯突破黄梯
      if (hasCDSignal && ladderSignal.blueCrossYellowUp) {
        buySignals.push({
          date,
          type: "buy",
          price: candles1d[i].close,
          reason: `CD信号 + 蓝梯突破黄梯（第一买点）`,
        });
      }

      // 卖出信号：收盘价跌破蓝梯下边缘
      if (ladderSignal.closeBelowBlueDn) {
        sellSignals.push({
          date,
          type: "sell",
          price: candles1d[i].close,
          reason: `收盘价跌破蓝梯下边缘（止损）`,
        });
      }

      // 卖出信号：蓝梯完全跌破黄梯
      if (ladderSignal.blueUpBelowYellowDn) {
        sellSignals.push({
          date,
          type: "sell",
          price: candles1d[i].close,
          reason: `蓝梯完全跌破黄梯（趋势反转）`,
        });
      }
    }

    console.log(`检测到买入信号: ${buySignals.length} 个`);
    console.log(`检测到卖出信号: ${sellSignals.length} 个`);

    if (buySignals.length > 0) {
      console.log("\n前5个买入信号:");
      buySignals.slice(0, 5).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.date} @ ${s.price.toFixed(2)} - ${s.reason}`);
      });
    }

    if (sellSignals.length > 0) {
      console.log("\n前5个卖出信号:");
      sellSignals.slice(0, 5).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.date} @ ${s.price.toFixed(2)} - ${s.reason}`);
      });
    }

    if (buySignals.length === 0 && sellSignals.length === 0) {
      console.log("\n⚠️  未检测到任何买卖信号");
      console.log("\n诊断信息:");
      console.log(`最后10根K线的CD信号和梯子状态:`);
      for (let i = Math.max(90, candles1d.length - 10); i < candles1d.length; i++) {
        const date = new Date(candles1d[i].time).toISOString().split("T")[0];
        const dailyCandles = candles1d.slice(0, i + 1);
        const hasCDSignal = hasCDSignalInRange(dailyCandles, 10);
        const ladder = calculateLadder(dailyCandles);
        const ladderSignal = getLadderSignal(dailyCandles, ladder);
        console.log(
          `  ${date}: CD=${hasCDSignal}, blueAboveYellow=${ladderSignal.blueAboveYellow}, blueCrossYellowUp=${ladderSignal.blueCrossYellowUp}`
        );
      }
    }
  } catch (error) {
    console.error("❌ 测试失败:", error instanceof Error ? error.message : error);
  }
}

async function main() {
  console.log("=== 回测信号检测测试 ===");

  // 测试多个股票和时间段
  await testBacktestSignals("TSLA", "2024-03-01", "2024-03-31");
  await testBacktestSignals("NVDA", "2024-01-01", "2024-01-31");
  await testBacktestSignals("SPY", "2024-02-01", "2024-02-29");
  await testBacktestSignals("QQQ", "2024-04-01", "2024-04-30");

  console.log("\n✅ 测试完成\n");
}

main().catch(console.error);

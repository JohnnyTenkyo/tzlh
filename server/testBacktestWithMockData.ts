/**
 * 回测引擎模拟数据测试
 * 使用人工构造的K线数据测试信号检测逻辑
 * 
 * 关键：生成足够长的初始数据，使EMA能够正确计算
 */

import {
  calculateLadder,
  getLadderSignal,
  hasCDSignalInRange,
  type Candle,
} from "./indicators";

/**
 * 生成模拟K线数据
 * 策略：
 * 1. 前150根：高位震荡（110-115），使黄梯稳定在高位
 * 2. 第150-180根：下跌到低位（90-95），蓝梯快速下跌
 * 3. 第180-200根：反弹上升，蓝梯从下方突破黄梯
 */
function generateMockCandles(): Candle[] {
  const candles: Candle[] = [];
  const baseTime = new Date("2024-01-01").getTime();
  let price = 110;

  // 生成300根K线
  for (let i = 0; i < 300; i++) {
    const time = baseTime + i * 24 * 60 * 60 * 1000; // 日线

    // 前150根：高位震荡（110-115）
    // 这样黄梯（EMA89）会稳定在112左右
    if (i < 150) {
      price = 110 + Math.sin(i / 20) * 2 + Math.random() * 1;
    }
    // 第150-180根：快速下跌到90
    // 蓝梯快速下跌，黄梯缓慢下跌
    else if (i >= 150 && i < 180) {
      price = 110 - (i - 150) * 0.67 + Math.random() * 0.5;
    }
    // 第180-220根：反弹上升到120
    // 蓝梯快速上升，从下方突破黄梯！
    else if (i >= 180 && i < 220) {
      price = 90 + (i - 180) * 0.75 + Math.random() * 0.5;
    }
    // 第220-260根：继续上升到150
    else if (i >= 220 && i < 260) {
      price = 120 + (i - 220) * 0.75 + Math.random() * 0.3;
    }
    // 第260-300根：缓慢上升
    else {
      price = 150 + (i - 260) * 0.5 + Math.random() * 0.2;
    }

    const high = price + Math.random() * 0.5;
    const low = price - Math.random() * 0.5;
    const open = price - Math.random() * 0.3;
    const close = price;

    candles.push({
      time,
      open: Math.max(open, low),
      high: Math.max(high, close, open),
      low: Math.min(low, close, open),
      close,
      volume: Math.floor(Math.random() * 1000000) + 500000,
    });
  }

  return candles;
}

async function testWithMockData() {
  console.log("=== 回测引擎模拟数据测试 ===\n");

  const candles = generateMockCandles();
  console.log(`生成了 ${candles.length} 根模拟K线数据\n`);

  // 检测买入和卖出信号
  const buySignals: { date: string; price: number; reason: string }[] = [];
  const sellSignals: { date: string; price: number; reason: string }[] = [];
  let blueCrossCount = 0;
  let cdSignalCount = 0;

  // 逐日检测信号
  for (let i = 90; i < candles.length; i++) {
    const date = new Date(candles[i].time).toISOString().split("T")[0];
    const dailyCandles = candles.slice(0, i + 1);

    // 检测CD信号
    const hasCDSignal = hasCDSignalInRange(dailyCandles, 10);
    if (hasCDSignal) cdSignalCount++;

    // 检测梯子信号
    const ladder = calculateLadder(dailyCandles);
    const ladderSignal = getLadderSignal(dailyCandles, ladder);

    if (ladderSignal.blueCrossYellowUp) {
      blueCrossCount++;
      console.log(`[✓] ${date}: 蓝梯突破黄梯！blueUp=${ladderSignal.latestBlueUp.toFixed(2)}, yellowUp=${ladderSignal.latestYellowUp.toFixed(2)}`);
    }

    // 买入信号：CD信号 + 蓝梯突破黄梯
    if (hasCDSignal && ladderSignal.blueCrossYellowUp) {
      buySignals.push({
        date,
        price: candles[i].close,
        reason: `CD信号 + 蓝梯突破黄梯（第一买点）`,
      });
    }

    // 买入信号：蓝梯下边缘高于黄梯上边缘（第二买点）
    if (hasCDSignal && ladderSignal.blueDnAboveYellowUp && !ladderSignal.blueCrossYellowUp) {
      buySignals.push({
        date,
        price: candles[i].close,
        reason: `CD信号 + 蓝梯下边缘高于黄梯上边缘（第二买点）`,
      });
    }

    // 卖出信号：收盘价跌破蓝梯下边缘
    if (ladderSignal.closeBelowBlueDn) {
      sellSignals.push({
        date,
        price: candles[i].close,
        reason: `收盘价跌破蓝梯下边缘（止损）`,
      });
    }

    // 卖出信号：蓝梯完全跌破黄梯
    if (ladderSignal.blueUpBelowYellowDn) {
      sellSignals.push({
        date,
        price: candles[i].close,
        reason: `蓝梯完全跌破黄梯（趋势反转）`,
      });
    }
  }

  console.log(`\n=== 检测统计 ===`);
  console.log(`CD信号出现次数: ${cdSignalCount}`);
  console.log(`蓝梯突破黄梯次数: ${blueCrossCount}`);
  console.log(`买入信号: ${buySignals.length} 个`);
  console.log(`卖出信号: ${sellSignals.length} 个\n`);

  if (buySignals.length > 0) {
    console.log("买入信号:");
    buySignals.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.date} @ ${s.price.toFixed(2)} - ${s.reason}`);
    });
  }

  if (sellSignals.length > 0) {
    console.log("\n卖出信号:");
    sellSignals.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.date} @ ${s.price.toFixed(2)} - ${s.reason}`);
    });
  }

  if (buySignals.length === 0 && sellSignals.length === 0) {
    console.log("⚠️  未检测到任何买卖信号");
  }

  // 简单的回测计算
  if (buySignals.length > 0 && sellSignals.length > 0) {
    console.log("\n=== 简单回测结果 ===");
    const firstBuy = buySignals[0];
    const firstSell = sellSignals.find(s => s.price > firstBuy.price) || sellSignals[0];

    const profit = firstSell.price - firstBuy.price;
    const profitPercent = (profit / firstBuy.price) * 100;

    console.log(`第一次买入: ${firstBuy.date} @ ${firstBuy.price.toFixed(2)}`);
    console.log(`第一次卖出: ${firstSell.date} @ ${firstSell.price.toFixed(2)}`);
    console.log(`盈亏: ${profit.toFixed(2)} (${profitPercent.toFixed(2)}%)`);
  }

  console.log("\n✅ 模拟数据测试完成\n");
}

testWithMockData().catch(console.error);

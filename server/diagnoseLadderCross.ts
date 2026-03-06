/**
 * 诊断脚本：检查蓝梯何时突破黄梯
 */

import {
  calculateLadder,
  getLadderSignal,
  type Candle,
} from "./indicators";

/**
 * 生成模拟K线数据（与测试脚本相同）
 */
function generateMockCandles(): Candle[] {
  const candles: Candle[] = [];
  const baseTime = new Date("2024-03-01").getTime();
  let price = 100;

  for (let i = 0; i < 200; i++) {
    const time = baseTime + i * 24 * 60 * 60 * 1000;

    if (i < 80) {
      price = 100 + Math.sin(i / 10) * 2.5 + Math.random() * 1;
    } else if (i >= 80 && i < 100) {
      price = 105 + (i - 80) * 0.25 + Math.random() * 0.5;
    } else if (i >= 100 && i < 120) {
      price = 110 + (i - 100) * 1 + Math.random() * 0.5;
    } else if (i >= 120 && i < 150) {
      price = 130 + (i - 120) * 1 + Math.random() * 0.5;
    } else if (i >= 150 && i < 180) {
      price = 160 + (i - 150) * 0.67 + Math.random() * 0.3;
    } else {
      price = 180 + (i - 180) * 0.5 + Math.random() * 0.3;
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

async function diagnose() {
  console.log("=== 蓝梯突破黄梯诊断 ===\n");

  const candles = generateMockCandles();

  // 找出蓝梯首次突破黄梯的位置
  let firstCrossIndex = -1;
  let firstCrossDate = "";

  for (let i = 1; i < candles.length; i++) {
    const dailyCandles = candles.slice(0, i + 1);
    const ladder = calculateLadder(dailyCandles);
    const ladderSignal = getLadderSignal(dailyCandles, ladder);

    if (ladderSignal.blueCrossYellowUp) {
      firstCrossIndex = i;
      firstCrossDate = new Date(candles[i].time).toISOString().split("T")[0];
      break;
    }
  }

  console.log(`蓝梯首次突破黄梯的位置: ${firstCrossIndex}`);
  console.log(`日期: ${firstCrossDate}`);
  console.log(`\n前后K线的梯子状态:`);

  // 显示前后10根K线的状态
  for (let i = Math.max(0, firstCrossIndex - 10); i <= Math.min(candles.length - 1, firstCrossIndex + 10); i++) {
    const date = new Date(candles[i].time).toISOString().split("T")[0];
    const dailyCandles = candles.slice(0, i + 1);
    const ladder = calculateLadder(dailyCandles);
    const ladderSignal = getLadderSignal(dailyCandles, ladder);

    const marker = i === firstCrossIndex ? ">>> " : "    ";
    console.log(
      `${marker}${date} (i=${i}): blueUp=${ladderSignal.latestBlueUp.toFixed(2)}, yellowUp=${ladderSignal.latestYellowUp.toFixed(2)}, blueCross=${ladderSignal.blueCrossYellowUp}`
    );
  }

  console.log(`\n结论: 蓝梯突破黄梯发生在第 ${firstCrossIndex} 根K线（从0开始计数）`);
  console.log(`如果从第90根K线开始检测，${firstCrossIndex < 90 ? "将无法检测到这个信号" : "可以检测到这个信号"}`);
}

diagnose().catch(console.error);

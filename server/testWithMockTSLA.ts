/**
 * 使用模拟 TSLA 数据测试回测引擎
 * 验证能否检测到买卖信号
 */

import { generateMockTSLAData } from "./generateMockTSLAData";
import { detectBuySignal, calculateLadder, getLadderSignal, calculateCDSignal, hasCDSignalInRange } from "./indicators";

async function testWithMockTSLA() {
  console.log("=== 使用模拟 TSLA 数据测试回测引擎 ===\n");

  const candles = generateMockTSLAData();
  console.log(`生成 ${candles.length} 根模拟 K 线`);
  console.log(`时间范围: ${new Date(candles[0].time).toISOString().split("T")[0]} 到 ${new Date(candles[candles.length - 1].time).toISOString().split("T")[0]}\n`);

  // 检查梯子状态
  console.log("=== 检查梯子状态 ===\n");

  let blueCrossIdx = -1;
  for (let i = 90; i < candles.length; i++) {
    const ladder = calculateLadder(candles.slice(0, i + 1));
    const sig = getLadderSignal(candles.slice(0, i + 1), ladder);

    if (sig.blueCrossYellowUp && blueCrossIdx === -1) {
      blueCrossIdx = i;
      console.log(`✓ 蓝梯首次突破黄梯位置: ${i} (${new Date(candles[i].time).toISOString().split("T")[0]})`);
      console.log(`  蓝梯上边缘: ${sig.latestBlueUp.toFixed(2)}, 黄梯上边缘: ${sig.latestYellowUp.toFixed(2)}\n`);
      break;
    }
  }

  if (blueCrossIdx === -1) {
    console.log("✗ 未找到蓝梯突破黄梯的位置\n");
    return;
  }

  // 检查蓝梯突破后的 CD 信号
  console.log("=== 检查蓝梯突破后的 CD 信号 ===\n");

  const cdResult = calculateCDSignal(candles);
  const { dxdx } = cdResult;

  let cdIdx = -1;
  for (let i = blueCrossIdx; i < Math.min(blueCrossIdx + 30, candles.length); i++) {
    if (dxdx[i]) {
      cdIdx = i;
      console.log(`✓ 蓝梯突破后的 CD 信号位置: ${i} (${new Date(candles[i].time).toISOString().split("T")[0]})`);
      console.log(`  距离蓝梯突破: ${i - blueCrossIdx} 根 K 线\n`);
      break;
    }
  }

  if (cdIdx === -1) {
    console.log("⚠ 蓝梯突破后 30 根 K 线内未找到 CD 信号\n");
  }

  // 测试 detectBuySignal
  console.log("=== 测试 detectBuySignal ===\n");

  // 在蓝梯突破后的位置调用 detectBuySignal
  const testIdx = Math.min(blueCrossIdx + 20, candles.length - 1);
  const testCandles = candles.slice(0, testIdx + 1);

  const buySignal = detectBuySignal(
    { "1d": testCandles },
    ["1d"],
    ["1d"],
    10,
    testCandles[testCandles.length - 1].close
  );

  console.log(`在位置 ${testIdx} (${new Date(testCandles[testCandles.length - 1].time).toISOString().split("T")[0]}) 调用 detectBuySignal:`);
  console.log(`结果: ${buySignal ? JSON.stringify(buySignal, null, 2) : "null"}\n`);

  // 显示梯子状态演变
  console.log("=== 梯子状态演变（蓝梯突破前后 10 根 K 线）===\n");

  for (let i = Math.max(90, blueCrossIdx - 10); i <= Math.min(blueCrossIdx + 10, candles.length - 1); i++) {
    const ladder = calculateLadder(candles.slice(0, i + 1));
    const sig = getLadderSignal(candles.slice(0, i + 1), ladder);
    const dateStr = new Date(candles[i].time).toISOString().split("T")[0];

    console.log(
      `${dateStr}: BlueUp=${sig.latestBlueUp.toFixed(2)}, YellowUp=${sig.latestYellowUp.toFixed(2)}, Cross=${sig.blueCrossYellowUp} ${i === blueCrossIdx ? "← 突破点" : ""}`
    );
  }
}

testWithMockTSLA().catch(console.error);

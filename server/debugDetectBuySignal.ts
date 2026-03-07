/**
 * 详细调试 detectBuySignal 函数
 * 测试 2024 年 5 月-6 月的 TSLA（有明确上升趋势）
 */

import { fetchHistoricalCandles } from "./marketData";
import { detectBuySignal, calculateCDSignal, hasCDSignalInRange, getLadderSignal, calculateLadder } from "./indicators";

async function debugDetectBuySignal() {
  console.log("=== 调试 detectBuySignal ===");
  console.log("测试时间段: 2024 年 5 月-6 月 TSLA（有明确上升趋势）\n");

  // 获取 TSLA 2024-05-01 到 2024-06-30 的数据
  console.log("正在获取 TSLA 2024-05-01 到 2024-06-30 的数据...\n");

  const timeframes = ["30m", "1h", "4h", "1d"] as const;
  const allCandles: Record<string, any[]> = {};

  for (const tf of timeframes) {
    try {
      const candles = await fetchHistoricalCandles("TSLA", tf, "2024-05-01", "2024-06-30");
      allCandles[tf] = candles;
      console.log(`✓ ${tf}: ${candles.length} 根 K 线`);
    } catch (err) {
      console.log(`✗ ${tf}: 获取失败 - ${err}`);
    }
  }

  console.log("\n=== 检查梯子信号 ===\n");

  const dailyCandles = allCandles["1d"];
  if (dailyCandles && dailyCandles.length >= 60) {
    console.log(`日线数据: ${dailyCandles.length} 根\n`);

    const ladder = calculateLadder(dailyCandles);
    const sig = getLadderSignal(dailyCandles, ladder);

    console.log(`最新蓝梯上边缘: ${sig.latestBlueUp.toFixed(2)}`);
    console.log(`最新蓝梯下边缘: ${sig.latestBlueDn.toFixed(2)}`);
    console.log(`最新黄梯上边缘: ${sig.latestYellowUp.toFixed(2)}`);
    console.log(`最新黄梯下边缘: ${sig.latestYellowDn.toFixed(2)}`);
    console.log(`蓝梯在黄梯之上: ${sig.blueAboveYellow}`);
    console.log(`蓝梯突破黄梯: ${sig.blueCrossYellowUp}`);
    console.log(`蓝梯下边缘 > 黄梯上边缘: ${sig.blueDnAboveYellowUp}\n`);

    // 检查最近 20 根日线的梯子状态
    console.log("最近 20 根日线的梯子状态:");
    for (let i = Math.max(0, dailyCandles.length - 20); i < dailyCandles.length; i++) {
      const lad = calculateLadder(dailyCandles.slice(0, i + 1));
      const s = getLadderSignal(dailyCandles.slice(0, i + 1), lad);
      console.log(
        `  ${dailyCandles[i].date}: BlueUp=${s.latestBlueUp.toFixed(2)}, YellowUp=${s.latestYellowUp.toFixed(2)}, Cross=${s.blueCrossYellowUp}`
      );
    }

    // 检查 CD 信号
    console.log("\n=== 检查 CD 信号 ===\n");

    const cdResult = calculateCDSignal(dailyCandles);
    const { dxdx } = cdResult;

    // 找最近的 CD 信号
    let lastDXDXIdx = -1;
    for (let i = dxdx.length - 1; i >= 0; i--) {
      if (dxdx[i]) {
        lastDXDXIdx = i;
        break;
      }
    }

    console.log(`最近 DXDX 信号位置: ${lastDXDXIdx}`);
    console.log(`hasCDSignalInRange(10): ${hasCDSignalInRange(dailyCandles, 10)}\n`);

    // 检查 30m 梯子
    const minCandles = allCandles["30m"];
    if (minCandles && minCandles.length >= 90) {
      console.log(`30m 数据: ${minCandles.length} 根\n`);

      const minLadder = calculateLadder(minCandles);
      const minSig = getLadderSignal(minCandles, minLadder);

      console.log(`30m 最新蓝梯上边缘: ${minSig.latestBlueUp.toFixed(2)}`);
      console.log(`30m 最新黄梯上边缘: ${minSig.latestYellowUp.toFixed(2)}`);
      console.log(`30m 蓝梯突破黄梯: ${minSig.blueCrossYellowUp}\n`);
    }
  }

  // 调用 detectBuySignal
  console.log("=== 调用 detectBuySignal ===\n");

  const buySignal = detectBuySignal(
    allCandles,
    ["1d"],
    ["30m"],
    10,
    dailyCandles?.[dailyCandles.length - 1]?.close || 0
  );

  console.log(`买入信号: ${buySignal ? JSON.stringify(buySignal, null, 2) : "null"}`);
}

debugDetectBuySignal().catch(console.error);

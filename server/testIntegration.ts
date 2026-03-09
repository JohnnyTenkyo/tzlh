/**
 * 集成测试：验证 CD 分数和买卖信号检测
 */

import { Timeframe } from "./indicators";
import { fetchHistoricalCandles } from "./marketData";
import { calculateCDScore } from "./cdScore";
import {
  detectFirstBuySignal,
  detectFirstSellSignal,
  detectSecondBuySignal,
  detectSecondSellSignal,
  isHoldingConditionMet,
} from "./buySignalWithScore";

async function testIntegration() {
  try {
    console.log("=== 集成测试：CD 分数和买卖信号检测 ===\n");

    // 获取 TSLA 的各时间级别 K 线数据
    console.log("获取 TSLA 数据...");
    const timeframes: Timeframe[] = ["15m", "30m", "1h", "4h", "1d", "1w"];
    const candles: Record<string, any> = {};

    for (const tf of timeframes) {
      try {
        const data = await fetchHistoricalCandles("TSLA", tf, "2026-02-01", "2026-03-07");
        candles[tf] = data;
        console.log(`  ${tf}: ${data.length} 根 K 线`);
      } catch (e) {
        console.log(`  ${tf}: 获取失败`);
      }
    }

    // 测试 CD 分数计算
    console.log("\n=== 测试 CD 分数计算 ===");
    const cdScore = calculateCDScore(candles);
    console.log(`总分数: ${cdScore.totalScore}/100`);
    console.log(`各级别分数:`);
    console.log(`  15m: ${cdScore.score15m} (${cdScore.hasCD15m ? "有抄底" : "无"})`);
    console.log(`  30m: ${cdScore.score30m} (${cdScore.hasCD30m ? "有抄底" : "无"})`);
    console.log(`  1h: ${cdScore.score1h} (${cdScore.hasCD1h ? "有抄底" : "无"})`);
    console.log(`  4h: ${cdScore.score4h} (${cdScore.hasCD4h ? "有抄底" : "无"})`);
    console.log(`  1d: ${cdScore.score1d} (${cdScore.hasCD1d ? "有抄底" : "无"})`);
    console.log(`  1w: ${cdScore.score1w} (${cdScore.hasCD1w ? "有抄底" : "无"})`);

    // 测试买卖信号检测（选择 30m 梯子）
    console.log("\n=== 测试买卖信号检测（梯子级别：30m，CD 分数阈值：60） ===");

    const ladderTf: Timeframe = "30m";
    const cdThreshold = 60;

    // 第一买点
    const firstBuy = detectFirstBuySignal(candles, ladderTf, cdThreshold);
    if (firstBuy) {
      console.log(`✅ 检测到第一买点:`);
      console.log(`   ${firstBuy.reason}`);
    } else {
      console.log(`❌ 未检测到第一买点`);
    }

    // 第二买点
    const secondBuy = detectSecondBuySignal(candles, ladderTf);
    if (secondBuy) {
      console.log(`✅ 检测到第二买点:`);
      console.log(`   ${secondBuy.reason}`);
    } else {
      console.log(`❌ 未检测到第二买点`);
    }

    // 第一卖点
    const firstSell = detectFirstSellSignal(candles, ladderTf);
    if (firstSell) {
      console.log(`✅ 检测到第一卖点:`);
      console.log(`   ${firstSell.reason}`);
    } else {
      console.log(`❌ 未检测到第一卖点`);
    }

    // 第二卖点
    const secondSell = detectSecondSellSignal(candles, ladderTf);
    if (secondSell) {
      console.log(`✅ 检测到第二卖点:`);
      console.log(`   ${secondSell.reason}`);
    } else {
      console.log(`❌ 未检测到第二卖点`);
    }

    // 持有条件
    const holdingOk = isHoldingConditionMet(candles, ladderTf);
    console.log(`\n持有条件（蓝梯在黄梯之上）: ${holdingOk ? "✅ 满足" : "❌ 不满足"}`);

    // 测试不同阈值
    console.log("\n=== 测试不同 CD 分数阈值 ===");
    const thresholds = [30, 50, 60, 70, 80];
    for (const threshold of thresholds) {
      const buy = detectFirstBuySignal(candles, ladderTf, threshold);
      console.log(`  阈值 ${threshold}: ${buy ? "✅ 有买点" : "❌ 无买点"}`);
    }

    console.log("\n=== 集成测试完成 ===");
  } catch (error) {
    console.error("错误:", error);
  }
}

testIntegration();

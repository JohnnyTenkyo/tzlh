/**
 * 诊断脚本：排查回测无买卖信号的原因
 */

import { fetchHistoricalCandles } from "./marketData";
import {
  calculateLadder,
  getLadderSignal,
  hasCDSignalInRange,
  detectBuySignal,
  type Timeframe,
} from "./indicators";

async function diagnose() {
  console.log("=== 回测无买卖信号诊断 ===\n");

  // 使用 QQQ 作为测试股票，最近 60 天
  const symbol = "QQQ";
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  console.log(`测试股票: ${symbol}`);
  console.log(`时间范围: ${startDate} 到 ${endDate}\n`);

  // 获取多个时间级别的数据
  const timeframes: Timeframe[] = ["30m", "1h", "4h", "1d"];
  const allCandles: Partial<Record<Timeframe, any[]>> = {};

  for (const tf of timeframes) {
    try {
      console.log(`正在获取 ${tf} 数据...`);
      const candles = await fetchHistoricalCandles(symbol, tf, startDate, endDate);
      allCandles[tf] = candles;
      console.log(`✓ ${tf}: 获取了 ${candles.length} 根 K 线`);
    } catch (err) {
      console.error(`✗ ${tf}: 获取失败 -`, (err as Error).message);
    }
  }

  console.log("\n=== 数据检查 ===");

  // 检查是否有足够的数据
  for (const tf of timeframes) {
    const candles = allCandles[tf];
    if (!candles || candles.length === 0) {
      console.log(`⚠️  ${tf}: 无数据`);
      continue;
    }

    const firstDate = new Date(candles[0].time).toISOString().split("T")[0];
    const lastDate = new Date(candles[candles.length - 1].time)
      .toISOString()
      .split("T")[0];
    console.log(`✓ ${tf}: ${firstDate} 到 ${lastDate}`);
  }

  // 检查梯子和 CD 信号
  console.log("\n=== 信号检测 ===");

  const dailyCandles = allCandles["1d"] || [];
  if (dailyCandles.length === 0) {
    console.log("❌ 日线数据为空，无法进行诊断");
    return;
  }

  console.log(`日线数据: ${dailyCandles.length} 根\n`);

  // 逐日检查信号
  let buySignalCount = 0;
  let cdSignalCount = 0;
  let ladderBuyCount = 0;

  for (let i = Math.max(0, dailyCandles.length - 20); i < dailyCandles.length; i++) {
    const date = new Date(dailyCandles[i].time).toISOString().split("T")[0];
    const dailyUpTo = dailyCandles.slice(0, i + 1);

    // 检查 CD 信号
    const hasCD = hasCDSignalInRange(dailyUpTo, 10);
    if (hasCD) cdSignalCount++;

    // 检查梯子
    const ladder = calculateLadder(dailyUpTo);
    const ladderSignal = getLadderSignal(dailyUpTo, ladder);

    // 检查 30m 梯子
    const candles30m = allCandles["30m"] || [];
    const candles30mUpTo = candles30m.filter(
      (c) => c.time <= dailyCandles[i].time
    );

    if (candles30mUpTo.length > 0) {
      const ladder30m = calculateLadder(candles30mUpTo);
      const ladderSignal30m = getLadderSignal(candles30mUpTo, ladder30m);

      if (ladderSignal30m.blueCrossYellowUp) {
        ladderBuyCount++;
        console.log(
          `${date}: ✓ 蓝梯突破黄梯 (30m) | CD=${hasCD} | 日线蓝梯=${ladderSignal.latestBlueUp.toFixed(2)}`
        );
      }
    }

    // 检查买入信号
    const buySig = detectBuySignal(
      allCandles as any,
      ["1d"],
      ["30m"],
      10,
      dailyCandles[i].close
    );

    if (buySig) {
      buySignalCount++;
      console.log(
        `${date}: ✓ 买入信号 (${buySig.type}) | 原因: ${buySig.reason}`
      );
    }
  }

  console.log(`\n=== 统计 ===`);
  console.log(`最近 20 根日线中:`);
  console.log(`  CD 信号: ${cdSignalCount} 次`);
  console.log(`  蓝梯突破黄梯 (30m): ${ladderBuyCount} 次`);
  console.log(`  买入信号: ${buySignalCount} 次`);

  if (buySignalCount === 0) {
    console.log(`\n❌ 未检测到任何买入信号`);
    console.log(`\n可能的原因:`);
    console.log(`1. 30m 数据不足或无法获取`);
    console.log(`2. CD 信号检测逻辑有问题`);
    console.log(`3. 梯子突破检测逻辑有问题`);
    console.log(`4. 当前市场不符合买入条件`);
  } else {
    console.log(`\n✓ 信号检测正常`);
  }
}

diagnose().catch(console.error);

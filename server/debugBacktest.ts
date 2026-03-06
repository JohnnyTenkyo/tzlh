/**
 * 调试脚本：测试回测信号检测逻辑
 * 运行：npx tsx server/debugBacktest.ts
 */
import { fetchHistoricalCandles } from "./marketData";
import {
  Candle,
  Timeframe,
  calculateLadder,
  getCDSignal,
  getLadderSignal,
  hasCDSignalInRange,
  detectBuySignal,
} from "./indicators";

async function debug() {
  const symbol = "QQQ";
  const endDate = "2024-12-31";
  const startDate = "2024-01-01";

  console.log(`\n=== 调试回测信号：${symbol} ${startDate} → ${endDate} ===\n`);

  // 获取各时间级别K线
  const timeframes: Timeframe[] = ["30m", "1h", "4h", "1d"];
  const allCandles: Partial<Record<Timeframe, Candle[]>> = {};

  for (const tf of timeframes) {
    const candles = await fetchHistoricalCandles(symbol, tf, startDate, endDate);
    allCandles[tf] = candles;
    console.log(`${tf}: ${candles.length} 根K线`);
  }

  // 检查各级别K线数量是否足够
  console.log("\n--- K线数量检查 ---");
  for (const tf of timeframes) {
    const c = allCandles[tf];
    if (!c) {
      console.log(`${tf}: 无数据`);
      continue;
    }
    console.log(`${tf}: ${c.length} 根K线 (需要 >=90 才能计算指标)`);
  }

  // 检查CD信号
  console.log("\n--- CD信号检查（lookback=10）---");
  for (const tf of timeframes) {
    const c = allCandles[tf];
    if (!c || c.length < 60) {
      console.log(`${tf}: K线不足，跳过`);
      continue;
    }
    const sig = getCDSignal(c, 10);
    console.log(`${tf}: hasCDSignal=${sig.hasCDSignal}, strength=${sig.strength}, latestDiff=${sig.latestDiff?.toFixed(4)}, latestDea=${sig.latestDea?.toFixed(4)}`);
  }

  // 检查梯子信号
  console.log("\n--- 梯子信号检查 ---");
  for (const tf of timeframes) {
    const c = allCandles[tf];
    if (!c || c.length < 90) {
      console.log(`${tf}: K线不足(${c?.length || 0})，跳过`);
      continue;
    }
    const ladder = calculateLadder(c);
    const sig = getLadderSignal(c, ladder);
    console.log(`${tf}: blueAboveYellow=${sig.blueAboveYellow}, blueCrossYellowUp=${sig.blueCrossYellowUp}, blueDnAboveYellowUp=${sig.blueDnAboveYellowUp}`);
    console.log(`  blueUp=${sig.latestBlueUp?.toFixed(2)}, blueDn=${sig.latestBlueDn?.toFixed(2)}, yellowUp=${sig.latestYellowUp?.toFixed(2)}, yellowDn=${sig.latestYellowDn?.toFixed(2)}, close=${sig.latestClose?.toFixed(2)}`);
  }

  // 模拟逐日检测买入信号
  console.log("\n--- 逐日买入信号检测（标准策略）---");
  const dailyCandles = allCandles["1d"] || [];
  let signalCount = 0;

  for (let i = 90; i < dailyCandles.length; i++) {
    const date = new Date(dailyCandles[i].time).toISOString().split("T")[0];
    const ts = dailyCandles[i].time + 86400000;

    // 截取到当天的K线
    const candlesUpTo: Partial<Record<Timeframe, Candle[]>> = {};
    for (const tf of timeframes) {
      const c = allCandles[tf];
      if (c) candlesUpTo[tf] = c.filter(x => x.time <= ts);
    }

    const closePrice = dailyCandles[i].close;

    // 检查 CD 信号（1h + 4h）
    const cdTfs: Timeframe[] = ["1h", "4h"];
    const ladderTfs: Timeframe[] = ["30m"];

    const buySig = detectBuySignal(candlesUpTo, cdTfs, ladderTfs, 10, closePrice);
    if (buySig) {
      console.log(`${date}: 买入信号！type=${buySig.type}, tf=${buySig.timeframe}, reason=${buySig.reason}`);
      signalCount++;
    }
  }

  if (signalCount === 0) {
    console.log("未检测到任何买入信号！");

    // 深入诊断：检查每个条件
    console.log("\n--- 深入诊断：最后100根日K线的CD信号情况 ---");
    const last100 = dailyCandles.slice(-100);
    for (const tf of ["1h", "4h"] as Timeframe[]) {
      const c = allCandles[tf];
      if (!c || c.length < 60) continue;

      // 检查最后10根K线内是否有CD信号
      for (let lookback = 5; lookback <= 30; lookback += 5) {
        const hasSig = hasCDSignalInRange(c, lookback);
        console.log(`${tf} lookback=${lookback}: hasCDSignal=${hasSig}`);
      }
    }

    console.log("\n--- 深入诊断：30m蓝梯突破情况 ---");
    const c30m = allCandles["30m"];
    if (c30m && c30m.length >= 90) {
      // 检查最近30根K线中是否有蓝梯突破
      for (let i = Math.max(2, c30m.length - 30); i < c30m.length; i++) {
        const slice = c30m.slice(0, i + 1);
        const ladder = calculateLadder(slice);
        const sig = getLadderSignal(slice, ladder);
        if (sig.blueCrossYellowUp) {
          const date = new Date(c30m[i].time).toISOString().split("T")[0];
          console.log(`30m 蓝梯突破黄梯：${date}, blueUp=${sig.latestBlueUp?.toFixed(2)}, yellowUp=${sig.latestYellowUp?.toFixed(2)}`);
        }
      }
    }
  }

  console.log(`\n总计检测到 ${signalCount} 个买入信号`);
}

debug().catch(console.error);

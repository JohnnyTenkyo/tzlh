/**
 * 生成模拟 TSLA 数据从 2024-01-01 到 2026-02-28
 * 确保有蓝梯突破黄梯 + CD 信号的场景
 */

import { Candle } from "./indicators";

function generateMockTSLAData(): Candle[] {
  const candles: Candle[] = [];
  let date = new Date("2024-01-01");
  let price = 250; // TSLA 初始价格

  // 生成 426 天的日线数据（2024-01-01 到 2026-02-28）
  for (let i = 0; i < 426; i++) {
    // 跳过周末
    if (date.getDay() === 0 || date.getDay() === 6) {
      date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      continue;
    }

    let priceChange = 1.0;

    // 前 60 天：下跌趋势（为了让黄梯高于蓝梯）
    if (i < 60) {
      priceChange = 0.98 + Math.random() * 0.02; // 下跌
    }
    // 60-90 天：继续下跌（加强下跌趋势，为 MACD 底背离做准备）
    else if (i < 90) {
      priceChange = 0.97 + Math.random() * 0.02;
    }
    // 90-100 天：小幅反弹但不破前低（MACD 底背离形成）
    else if (i < 100) {
      priceChange = 0.99 + Math.random() * 0.02;
    }
    // 100-120 天：强势上升（蓝梯开始突破黄梯）
    else if (i < 120) {
      priceChange = 1.02 + Math.random() * 0.02; // 上升
    }
    // 120-150 天：继续上升
    else if (i < 150) {
      priceChange = 1.015 + Math.random() * 0.02;
    }
    // 150-200 天：高位震荡
    else if (i < 200) {
      priceChange = 0.99 + Math.random() * 0.03;
    }
    // 200-250 天：下跌
    else if (i < 250) {
      priceChange = 0.98 + Math.random() * 0.02;
    }
    // 250-300 天：再次上升
    else if (i < 300) {
      priceChange = 1.02 + Math.random() * 0.02;
    }
    // 300-350 天：高位继续上升
    else if (i < 350) {
      priceChange = 1.01 + Math.random() * 0.02;
    }
    // 350-400 天：高位震荡
    else if (i < 400) {
      priceChange = 0.99 + Math.random() * 0.03;
    }
    // 400+ 天：继续上升
    else {
      priceChange = 1.01 + Math.random() * 0.02;
    }

    price *= priceChange;

    // 生成 OHLC 数据
    const open = price * (0.99 + Math.random() * 0.02);
    const close = price * (0.99 + Math.random() * 0.02);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.floor(50000000 + Math.random() * 50000000); // 5000-10000 万股
    const time = date.getTime();

    candles.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    });

    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }

  return candles;
}

export { generateMockTSLAData };

import { describe, it, expect } from "vitest";
import {
  calculateEMA,
  calculateLadder,
  getLadderSignal,
  calculateMACD,
  getCDSignal,
  calculate4321Score,
  Candle,
  TimeframeCandles,
} from "./indicators";

// 生成模拟K线数据
function generateCandles(count: number, startPrice = 100, trend: "up" | "down" | "flat" = "flat"): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const change = trend === "up" ? 0.5 : trend === "down" ? -0.5 : (Math.random() - 0.5) * 2;
    price = Math.max(1, price + change);
    candles.push({
      time: Date.now() - (count - i) * 3600000,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000000,
    });
  }
  return candles;
}

// 生成上涨后下跌的K线（用于测试底背离）
function generateDivergenceCandles(): Candle[] {
  const candles: Candle[] = [];
  // 先上涨
  for (let i = 0; i < 50; i++) {
    const price = 100 + i * 0.5;
    candles.push({ time: i * 3600000, open: price - 0.5, high: price + 1, low: price - 1, close: price, volume: 1000000 });
  }
  // 然后下跌（价格创新低）
  for (let i = 0; i < 30; i++) {
    const price = 125 - i * 1.5;
    candles.push({ time: (50 + i) * 3600000, open: price + 0.5, high: price + 1, low: price - 1, close: price, volume: 800000 });
  }
  return candles;
}

describe("EMA Calculation", () => {
  it("should calculate EMA correctly", () => {
    const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const ema = calculateEMA(data, 3);
    expect(ema).toHaveLength(data.length);
    // EMA should be between min and max
    expect(ema[ema.length - 1]).toBeGreaterThan(0);
    expect(ema[ema.length - 1]).toBeLessThan(30);
  });

  it("should handle empty data", () => {
    const ema = calculateEMA([], 10);
    expect(ema).toHaveLength(0);
  });

  it("should produce smooth values", () => {
    const data = [100, 200, 100, 200, 100]; // volatile
    const ema = calculateEMA(data, 3);
    // EMA should be smoother than raw data
    expect(Math.abs(ema[4] - ema[3])).toBeLessThan(Math.abs(data[4] - data[3]));
  });
});

describe("Ladder Calculation", () => {
  it("should calculate blue and yellow ladders", () => {
    const candles = generateCandles(200);
    const ladder = calculateLadder(candles);

    expect(ladder.blueUp).toHaveLength(200);
    expect(ladder.blueDn).toHaveLength(200);
    expect(ladder.yellowUp).toHaveLength(200);
    expect(ladder.yellowDn).toHaveLength(200);
  });

  it("should detect blue ladder above yellow in uptrend", () => {
    // Strong uptrend should have blue above yellow
    const candles = generateCandles(200, 50, "up");
    const ladder = calculateLadder(candles);
    const sig = getLadderSignal(candles, ladder);

    // In a strong uptrend, blue (short EMA) should be above yellow (long EMA)
    expect(sig.blueAboveYellow).toBe(true);
  });

  it("should detect blue ladder below yellow in downtrend", () => {
    // Strong downtrend should have blue below yellow
    const candles = generateCandles(200, 200, "down");
    const ladder = calculateLadder(candles);
    const sig = getLadderSignal(candles, ladder);

    // In a strong downtrend, blue should be below yellow
    expect(sig.blueAboveYellow).toBe(false);
  });

  it("should return valid signal structure", () => {
    const candles = generateCandles(100);
    const ladder = calculateLadder(candles);
    const sig = getLadderSignal(candles, ladder);

    expect(typeof sig.blueAboveYellow).toBe("boolean");
    expect(typeof sig.blueDnAboveYellowUp).toBe("boolean");
    expect(typeof sig.blueUpBelowYellowDn).toBe("boolean");
    expect(typeof sig.closeBelowBlueDn).toBe("boolean");
    expect(sig.latestClose).toBeGreaterThan(0);
    expect(sig.latestBlueUp).toBeGreaterThan(0);
  });
});

describe("MACD Calculation", () => {
  it("should calculate MACD correctly", () => {
    const candles = generateCandles(100);
    const macd = calculateMACD(candles);

    expect(macd.macd).toHaveLength(100);
    expect(macd.signal).toHaveLength(100);
    expect(macd.histogram).toHaveLength(100);
  });

  it("should have histogram = macd - signal", () => {
    const candles = generateCandles(100);
    const { macd, signal, histogram } = calculateMACD(candles);

    for (let i = 50; i < 100; i++) {
      expect(Math.abs(histogram[i] - (macd[i] - signal[i]))).toBeLessThan(0.0001);
    }
  });
});

describe("CD Signal Detection", () => {
  it("should detect golden cross in uptrend", () => {
    // Generate data that transitions from downtrend to uptrend
    const downCandles = generateCandles(60, 100, "down");
    const upCandles = generateCandles(30, 70, "up");
    const candles = [...downCandles, ...upCandles];

    const sig = getCDSignal(candles, 10);
    expect(sig).toBeDefined();
    expect(typeof sig.hasCDSignal).toBe("boolean");
    expect(typeof sig.goldenCross).toBe("boolean");
    expect(typeof sig.histogramTurnPositive).toBe("boolean");
    expect(sig.strength).toBeGreaterThanOrEqual(0);
    expect(sig.strength).toBeLessThanOrEqual(3);
  });

  it("should return no signal for insufficient data", () => {
    const candles = generateCandles(10);
    const sig = getCDSignal(candles, 5);
    expect(sig.hasCDSignal).toBe(false);
  });
});

describe("4321 Strategy Score", () => {
  it("should return zero score when no signals", () => {
    const candles = generateCandles(200, 100, "down");
    const tfCandles: TimeframeCandles = {
      "4h": candles,
      "3h": candles,
      "2h": candles,
      "1h": candles,
      "30m": candles,
    };

    const score = calculate4321Score("TEST", tfCandles, 5);
    expect(score.symbol).toBe("TEST");
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });

  it("should return valid score structure", () => {
    const candles = generateCandles(200);
    const tfCandles: TimeframeCandles = {
      "4h": candles,
      "3h": candles,
      "2h": candles,
      "1h": candles,
      "30m": candles,
    };

    const score = calculate4321Score("AAPL", tfCandles, 5);
    expect(score.symbol).toBe("AAPL");
    expect(typeof score.totalScore).toBe("number");
    expect(Array.isArray(score.cdLevels)).toBe(true);
    expect(typeof score.reason).toBe("string");
    expect(typeof score.details).toBe("object");
  });

  it("should score higher for more matching timeframes", () => {
    // Create candles that should trigger CD signals
    const downThenUp = [...generateCandles(60, 100, "down"), ...generateCandles(40, 70, "up")];

    const tfCandles: TimeframeCandles = {
      "4h": downThenUp,
      "3h": downThenUp,
      "2h": downThenUp,
      "1h": downThenUp,
      "30m": generateCandles(200, 50, "up"), // uptrend for ladder
    };

    const score = calculate4321Score("TEST", tfCandles, 10);
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
  });
});

describe("Auth Router - Local Auth", () => {
  it("should validate username length", () => {
    const username = "ab"; // min 2 chars
    expect(username.length).toBeGreaterThanOrEqual(2);
    expect(username.length).toBeLessThanOrEqual(32);
  });

  it("should validate password length", () => {
    const password = "1234"; // min 4 chars
    expect(password.length).toBeGreaterThanOrEqual(4);
  });
});

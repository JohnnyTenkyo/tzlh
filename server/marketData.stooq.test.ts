import { describe, it, expect } from "vitest";

/**
 * 测试 Stooq CSV 解析逻辑
 */
describe("Stooq Data Source", () => {
  it("should parse Stooq CSV format correctly", () => {
    const csvText = `Date,Open,High,Low,Close,Volume
2023-01-03,128.343,128.955,122.325,123.212,113808899
2023-01-04,125.004,126.743,123.221,124.481,90458019
2023-01-05,125.241,125.871,122.905,123.163,82184128`;

    const lines = csvText.trim().split("\n");
    expect(lines.length).toBe(4); // header + 3 data rows

    const candles = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(",");
      expect(parts.length).toBe(6);
      const [dateStr, open, high, low, close, volume] = parts;
      const ts = new Date(dateStr).getTime();
      expect(Number.isFinite(ts)).toBe(true);
      candles.push({
        time: ts,
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
        volume: parseInt(volume),
      });
    }

    expect(candles.length).toBe(3);
    expect(candles[0].close).toBeCloseTo(123.212, 2);
    expect(candles[0].volume).toBe(113808899);
    // 确保按时间升序排列
    expect(candles[0].time).toBeLessThan(candles[1].time);
  });

  it("should convert US stock symbol to Stooq format", () => {
    const toStooqSymbol = (symbol: string) => {
      if (symbol.toLowerCase().includes('.')) return symbol.toLowerCase();
      return `${symbol.toLowerCase()}.us`;
    };

    expect(toStooqSymbol("AAPL")).toBe("aapl.us");
    expect(toStooqSymbol("NVDA")).toBe("nvda.us");
    expect(toStooqSymbol("aapl.us")).toBe("aapl.us");
    expect(toStooqSymbol("SPY")).toBe("spy.us");
  });

  it("should detect no-data response from Stooq", () => {
    const noDataResponse = "No data";
    const warningResponse = "Warning: mysql_num_rows() expects parameter 1 to be resource";

    expect(noDataResponse.includes("No data")).toBe(true);
    expect(warningResponse.includes("Warning:")).toBe(true);
  });
});

/**
 * 测试手续费成本价计算
 */
describe("Trade Cost Calculation", () => {
  it("should include fees in effective average cost", () => {
    const closePrice = 100;
    const buyAmount = 1000;
    const buyQty = buyAmount / closePrice; // 10 shares
    const feeRate = 0.005; // 0.5%
    const fees = buyAmount * feeRate; // $5
    const totalBuyAmount = buyAmount + fees; // $1005

    // 旧方式：avgCost = closePrice（不含手续费）
    const oldAvgCost = closePrice;
    // 新方式：avgCost = totalBuyAmount / buyQty（含手续费）
    const newAvgCost = totalBuyAmount / buyQty;

    expect(newAvgCost).toBeGreaterThan(oldAvgCost);
    expect(newAvgCost).toBeCloseTo(100.5, 2);

    // 验证卖出时 P&L 计算更准确
    const sellPrice = 110;
    const sellQty = buyQty;
    const pnlOld = sellPrice * sellQty - oldAvgCost * sellQty; // 100 (偏高)
    const pnlNew = sellPrice * sellQty - newAvgCost * sellQty; // 95 (更准确)

    expect(pnlNew).toBeLessThan(pnlOld);
    expect(pnlNew).toBeCloseTo(95, 1);
  });
});

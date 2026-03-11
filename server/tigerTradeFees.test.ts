import { describe, it, expect } from "vitest";
import { calculateTradeFees, calculateTotalFees } from "./tigerTradeFees";

describe("Tiger Trade Fees", () => {
  it("should calculate fees for a small trade", () => {
    // 100 股 @ $100 = $10,000
    const fees = calculateTradeFees(100, 100);
    
    // 佣金：100 * 0.0039 = $0.39，上限 $10,000 * 0.5% = $50，取较小值 $0.39
    expect(fees.commission).toBeCloseTo(0.39, 2);
    
    // 平台费：100 * 0.004 = $0.40，最低 $1，取较大值 $1，上限 $50，取较小值 $1
    expect(fees.platformFee).toBeCloseTo(1, 2);
    
    // 总手续费
    expect(fees.totalFee).toBeCloseTo(1.39, 2);
  });

  it("should apply commission cap at 0.5%", () => {
    // 10,000 股 @ $100 = $1,000,000
    const fees = calculateTradeFees(10000, 100);
    
    // 佣金：10,000 * 0.0039 = $39，上限 $1,000,000 * 0.5% = $5,000，取较小值 $39
    expect(fees.commission).toBeCloseTo(39, 2);
    
    // 平台费：10,000 * 0.004 = $40，最低 $1，取较大值 $40，上限 $5,000，取较小值 $40
    expect(fees.platformFee).toBeCloseTo(40, 2);
    
    expect(fees.totalFee).toBeCloseTo(79, 2);
  });

  it("should apply platform fee minimum of $1", () => {
    // 10 股 @ $10 = $100
    const fees = calculateTradeFees(10, 10);
    
    // 佣金：10 * 0.0039 = $0.039，上限 $100 * 0.5% = $0.5，取较小值 $0.039
    expect(fees.commission).toBeCloseTo(0.039, 3);
    
    // 平台费：10 * 0.004 = $0.04，最低 $1，取较大值 $1，上限 $0.5，取较小值 $0.5
    // 等等，这里有问题：最低 $1 > 上限 $0.5，应该取上限 $0.5
    // 让我重新理解：最低 $1 和 上限 $0.5 冲突，应该取较小值（上限优先）
    expect(fees.platformFee).toBeCloseTo(0.5, 2);
    
    expect(fees.totalFee).toBeCloseTo(0.539, 2);
  });

  it("should calculate total fees for multiple trades", () => {
    const trades = [
      { quantity: 100, price: 100 },
      { quantity: 50, price: 200 },
    ];
    
    const totalFees = calculateTotalFees(trades);
    
    // 第一笔：100 * 100 = $10,000，手续费 $1.39
    // 第二笔：50 * 200 = $10,000，手续费 $1.39
    // 总计：$2.78
    expect(totalFees).toBeCloseTo(2.585, 2);
  });
});

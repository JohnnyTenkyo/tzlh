/**
 * Tiger Trade 手续费计算
 * 佣金：0.0039 美元/股，上限 0.5%
 * 平台费（固定式）：0.004 美元/股，最低 1 美元，上限 0.5%
 */

export interface FeeBreakdown {
  commission: number;      // 佣金
  platformFee: number;     // 平台费
  totalFee: number;        // 总手续费
}

/**
 * 计算单笔交易的手续费
 * @param quantity 股数
 * @param price 单价
 * @returns 手续费明细
 */
export function calculateTradeFees(quantity: number, price: number): FeeBreakdown {
  const totalAmount = quantity * price;

  // 佣金计算：0.0039 美元/股，上限 0.5%
  const commissionPerShare = 0.0039;
  const commissionByQuantity = quantity * commissionPerShare;
  const commissionByAmount = totalAmount * 0.005;  // 0.5%
  const commission = Math.min(commissionByQuantity, commissionByAmount);

  // 平台费计算（固定式）：0.004 美元/股，最低 1 美元，上限 0.5%
  const platformFeePerShare = 0.004;
  const platformFeeByQuantity = quantity * platformFeePerShare;
  const platformFeeByAmount = totalAmount * 0.005;  // 0.5%
  const platformFeeMin = Math.max(platformFeeByQuantity, 1);  // 最低 1 美元
  const platformFee = Math.min(platformFeeMin, platformFeeByAmount);

  return {
    commission,
    platformFee,
    totalFee: commission + platformFee,
  };
}

/**
 * 计算批量交易的总手续费
 * @param trades 交易列表，每笔交易包含 quantity 和 price
 * @returns 总手续费
 */
export function calculateTotalFees(trades: Array<{ quantity: number; price: number }>): number {
  return trades.reduce((total, trade) => {
    const fees = calculateTradeFees(trade.quantity, trade.price);
    return total + fees.totalFee;
  }, 0);
}

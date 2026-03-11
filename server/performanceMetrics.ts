/**
 * 性能指标计算
 */

export interface Trade {
  pnl: number;
  pnlPercent: number;
  type: "buy" | "sell";
}

export interface PerformanceMetrics {
  avgReturn: number;           // 平均收益率
  sharpeRatio: number;         // 夏普比率
  maxProfit: number;           // 最大单笔盈利
  maxLoss: number;             // 最大单笔亏损
  avgProfit: number;           // 平均盈利百分比
  avgLoss: number;             // 平均亏损百分比
  maxConsecutiveWin: number;   // 最大连续胜利
  maxConsecutiveLoss: number;  // 最大连续失败
}

/**
 * 计算性能指标
 * @param trades 交易列表（仅包含卖出交易）
 * @param totalReturn 总收益率（%）
 * @param tradingDays 交易天数
 * @returns 性能指标
 */
export function calculatePerformanceMetrics(
  trades: Trade[],
  totalReturn: number,
  tradingDays: number
): PerformanceMetrics {
  // 筛选卖出交易（完整的交易对）
  const closedTrades = trades.filter(t => t.type === "sell");
  
  if (closedTrades.length === 0) {
    return {
      avgReturn: 0,
      sharpeRatio: 0,
      maxProfit: 0,
      maxLoss: 0,
      avgProfit: 0,
      avgLoss: 0,
      maxConsecutiveWin: 0,
      maxConsecutiveLoss: 0,
    };
  }

  // 1. 平均收益率
  const avgReturn = totalReturn / closedTrades.length;

  // 2. 最大单笔盈利和亏损
  let maxProfit = 0;
  let maxLoss = 0;
  const profitTrades: number[] = [];
  const lossTrades: number[] = [];

  for (const trade of closedTrades) {
    if (trade.pnl > 0) {
      maxProfit = Math.max(maxProfit, trade.pnl);
      profitTrades.push(trade.pnlPercent);
    } else {
      maxLoss = Math.min(maxLoss, trade.pnl);
      lossTrades.push(trade.pnlPercent);
    }
  }

  // 3. 平均盈利和亏损百分比
  const avgProfit = profitTrades.length > 0 
    ? profitTrades.reduce((a, b) => a + b, 0) / profitTrades.length 
    : 0;
  
  const avgLoss = lossTrades.length > 0 
    ? lossTrades.reduce((a, b) => a + b, 0) / lossTrades.length 
    : 0;

  // 4. 最大连续胜利和失败
  let maxConsecutiveWin = 0;
  let maxConsecutiveLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;

  for (const trade of closedTrades) {
    if (trade.pnl > 0) {
      currentWin++;
      currentLoss = 0;
      maxConsecutiveWin = Math.max(maxConsecutiveWin, currentWin);
    } else {
      currentLoss++;
      currentWin = 0;
      maxConsecutiveLoss = Math.max(maxConsecutiveLoss, currentLoss);
    }
  }

  // 5. 夏普比率（简化版）
  // Sharpe Ratio = (平均收益 - 无风险利率) / 标准差
  // 假设无风险利率为 0，使用日收益率的标准差
  const dailyReturn = totalReturn / tradingDays;
  const variance = closedTrades.reduce((sum, trade) => {
    return sum + Math.pow(trade.pnlPercent - avgReturn, 2);
  }, 0) / closedTrades.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? dailyReturn / stdDev : 0;

  return {
    avgReturn,
    sharpeRatio,
    maxProfit,
    maxLoss,
    avgProfit,
    avgLoss,
    maxConsecutiveWin,
    maxConsecutiveLoss,
  };
}

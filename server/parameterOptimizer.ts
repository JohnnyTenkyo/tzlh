import { getDb } from "./db";
import { runBacktest } from "./backtestEngine";
import { backtestSessions, backtestTrades } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * 参数优化配置
 */
export interface OptimizationConfig {
  symbol: string;
  startDate: Date;
  endDate: Date;
  ladderLevels: string[]; // 要测试的梯子级别，如 ["1d", "4h", "1h", "30m"]
  cdScoreThresholds: number[]; // 要测试的 CD 分数阈值，如 [40, 50, 60, 70, 80]
  strategy: "standard" | "aggressive" | "conservative";
}

/**
 * 优化结果
 */
export interface OptimizationResult {
  ladderLevel: string;
  cdScoreThreshold: number;
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  score: number; // 综合评分
}

/**
 * 计算综合评分（考虑多个指标）
 */
function calculateScore(result: Partial<OptimizationResult>): number {
  const winRate = result.winRate || 0;
  const returnScore = Math.max(0, Math.min(result.totalReturn || 0, 100)); // 限制在 0-100
  const drawdownScore = Math.max(0, 100 - (Math.abs(result.maxDrawdown || 0) * 100)); // 回撤越小越好
  
  // 加权平均：胜率 40%，收益 40%，回撤 20%
  return winRate * 0.4 + returnScore * 0.4 + drawdownScore * 0.2;
}

/**
 * 运行单个参数组合的回测
 */
async function runSingleBacktest(
  symbol: string,
  startDate: Date,
  endDate: Date,
  ladderLevel: string,
  cdScoreThreshold: number,
  strategy: string
): Promise<OptimizationResult> {
  try {
    // 运行回测
    const result = await runBacktest({
      sessionId: 0, // 优化时不需要真实 sessionId
      initialBalance: 100000,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      marketCapFilter: "none" as any,
      ladderTimeframe: ladderLevel as any,
      cdScoreThreshold,
      customStocks: [symbol],
    });

    // 计算指标
    const totalTrades = result.totalTrades || 0;
    const winningTrades = result.winTrades || 0;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const totalReturn = result.equityCurve.length > 0
      ? ((result.equityCurve[result.equityCurve.length - 1].value - 100000) / 100000) * 100
      : 0;

    // 计算最大回撤
    let maxDrawdown = 0;
    let peak = 100000;
    for (const point of result.equityCurve) {
      if (point.value > peak) peak = point.value;
      const dd = ((peak - point.value) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // 估算夏普比率
    const sharpeRatio = totalTrades > 0 ? (totalReturn / Math.sqrt(totalTrades)) : 0;

    const optimizationResult: OptimizationResult = {
      ladderLevel,
      cdScoreThreshold,
      totalTrades,
      winningTrades,
      winRate,
      totalReturn,
      maxDrawdown,
      sharpeRatio,
      score: 0, // 先设为 0，下面计算
    };

    optimizationResult.score = calculateScore(optimizationResult);
    return optimizationResult;
  } catch (error) {
    console.error(
      `[Optimizer] Error backtesting ${symbol} with level=${ladderLevel}, threshold=${cdScoreThreshold}:`,
      error
    );
    // 返回默认失败结果
    return {
      ladderLevel,
      cdScoreThreshold,
      totalTrades: 0,
      winningTrades: 0,
      winRate: 0,
      totalReturn: 0,
      maxDrawdown: 100,
      sharpeRatio: 0,
      score: -100, // 失败的参数组合得分为负
    };
  }
}

/**
 * 运行参数优化（网格搜索）
 */
export async function optimizeParameters(
  config: OptimizationConfig
): Promise<OptimizationResult[]> {
  const results: OptimizationResult[] = [];
  const totalCombinations =
    config.ladderLevels.length * config.cdScoreThresholds.length;

  console.log(
    `[Optimizer] Starting grid search for ${config.symbol}: ${totalCombinations} combinations`
  );

  let completed = 0;

  // 遍历所有参数组合
  for (const ladderLevel of config.ladderLevels) {
    for (const cdScoreThreshold of config.cdScoreThresholds) {
      completed++;
      console.log(
        `[Optimizer] Progress: ${completed}/${totalCombinations} (${((completed / totalCombinations) * 100).toFixed(1)}%)`
      );

      const result = await runSingleBacktest(
        config.symbol,
        config.startDate,
        config.endDate,
        ladderLevel,
        cdScoreThreshold,
        config.strategy
      );

      results.push(result);

      // 添加延迟，避免 API 限流
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // 按综合评分排序，最高分在前
  results.sort((a, b) => b.score - a.score);

  console.log(
    `[Optimizer] Grid search completed. Best result: level=${results[0].ladderLevel}, threshold=${results[0].cdScoreThreshold}, score=${results[0].score.toFixed(2)}`
  );

  return results;
}

/**
 * 保存优化结果到数据库
 */
export async function saveOptimizationResults(
  symbol: string,
  results: OptimizationResult[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 创建优化结果表（如果不存在）
  // 这里假设已经在 schema.ts 中定义了 optimization_results 表

  for (const result of results) {
    // 插入或更新优化结果
    // await db.insert(optimization_results).values({
    //   symbol,
    //   ladderLevel: result.ladderLevel,
    //   cdScoreThreshold: result.cdScoreThreshold,
    //   totalTrades: result.totalTrades,
    //   winRate: result.winRate,
    //   totalReturn: result.totalReturn,
    //   maxDrawdown: result.maxDrawdown,
    //   sharpeRatio: result.sharpeRatio,
    //   score: result.score,
    //   createdAt: new Date(),
    // });
  }
}

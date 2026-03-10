/**
 * 自动回测引擎
 * 基于黄蓝梯子 + CD抄底指标的买卖逻辑
 */
import { detectFirstBuySignal, detectFirstSellSignal, detectSecondBuySignal, detectSecondSellSignal } from "./buySignalWithScore";
import { calculateCDScore } from "./cdScore";
import { fetchHistoricalCandles, fetchQuote } from "./marketData";
import {
  Candle,
  Timeframe,
  calculateLadder,
  getCDSignal,
  getLadderSignal,
  hasCDSignalInRange,
  detectBuySignal,
  detectSellSignal,
  detectAggressiveBuySignal,
  detectAggressiveSellSignal,
} from "./indicators";
import { getDb } from "./db";
import {
  backtestSessions,
  backtestTrades,
  backtestPositions,
  InsertBacktestTrade,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { US_STOCKS, MARKET_CAP_FILTERS, MarketCapFilter } from "../shared/stockPool";

// ============ 回测配置 ============
export interface BacktestConfig {
  sessionId: number;
  initialBalance: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  marketCapFilter: MarketCapFilter;
  ladderTimeframe: Timeframe; // 梯子级别（单选）
  cdScoreThreshold: number; // CD 分数阈值（0-100）
  customStocks?: string[]; // 自选股票列表，为空时使用全部股票池
  debug?: boolean; // 调试模式：输出详细的信号检测日志
  debugSymbol?: string; // 调试特定股票（为空时输出所有股票）
}

// ============ 持仓状态 ============
interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  entryTimeframe: Timeframe;
  entryType: "first_buy" | "second_buy";
  firstBuyDone: boolean;
  secondBuyDone: boolean;
  dailySellTriggered: boolean;
  dailySellDate: string | null;
  // 激进策略加仓状态
  aggressiveAddDone: boolean;     // 是否已完成蓝梯突破黄梯加仓
  aggressiveRetestAddDone: boolean; // 是否已完成回撞黄梯加仓
}

// ============ 回测状态 ============
interface BacktestState {
  balance: number;
  positions: Map<string, Position>;
  trades: InsertBacktestTrade[];
  equityCurve: { date: string; value: number }[];
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
}

// 运行中的回测任务
const runningTasks = new Map<number, boolean>();

// K线数据缓存（避免重复API调用）
const candleCache = new Map<string, Candle[]>();
const CACHE_KEY_SEPARATOR = "::";
const API_TIMEOUT_MS = 10000; // API 调用超时 10 秒
const MAX_CONCURRENT_REQUESTS = 3; // 最多并发 3 个 API 请求

function getCacheKey(symbol: string, tf: Timeframe, startDate: string, endDate: string): string {
  return `${symbol}${CACHE_KEY_SEPARATOR}${tf}${CACHE_KEY_SEPARATOR}${startDate}${CACHE_KEY_SEPARATOR}${endDate}`;
}

/**
 * 带超时的 Promise 包装
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`API 调用超时（${timeoutMs}ms）`)), timeoutMs)
    ),
  ]);
}

/**
 * 从缓存或API获取K线数据（带超时和重试）
 */
async function getCandlesWithCache(
  symbol: string,
  tf: Timeframe,
  startDate: string,
  endDate: string,
  retries: number = 2
): Promise<Candle[]> {
  const cacheKey = getCacheKey(symbol, tf, startDate, endDate);
  
  if (candleCache.has(cacheKey)) {
    return candleCache.get(cacheKey)!;
  }
  
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const candles = await withTimeout(
        fetchHistoricalCandles(symbol, tf, startDate, endDate),
        API_TIMEOUT_MS
      );
      candleCache.set(cacheKey, candles);
      
      // 缓存大小超过 200 条记录时清理最旧的记录
      if (candleCache.size > 200) {
        const firstKey = candleCache.keys().next().value as string | undefined;
        if (firstKey) candleCache.delete(firstKey);
      }
      
      return candles;
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries - 1) {
        // 指数退避：第一次等待 500ms，第二次等待 1000ms
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }
  
  console.warn(`[Backtest] Failed to fetch ${symbol} ${tf} after ${retries} retries:`, lastError?.message);
  return [];
}

/**
 * 并发获取多只股票的多个时间级别数据
 */
async function getCandlesForStocks(
  symbols: string[],
  timeframes: Timeframe[],
  startDate: string,
  endDate: string
): Promise<Map<string, Partial<Record<Timeframe, Candle[]>>>> {
  const result = new Map<string, Partial<Record<Timeframe, Candle[]>>>();
  
  // 构建所有需要的请求
  const requests: Array<{
    symbol: string;
    tf: Timeframe;
    promise: Promise<Candle[]>;
  }> = [];
  
  for (const symbol of symbols) {
    for (const tf of timeframes) {
      requests.push({
        symbol,
        tf,
        promise: getCandlesWithCache(symbol, tf, startDate, endDate),
      });
    }
  }
  
  // 使用并发控制执行请求
  const results = await executeWithConcurrency(
    requests.map(r => () => r.promise),
    MAX_CONCURRENT_REQUESTS
  );
  
  // 整理结果
  for (let i = 0; i < requests.length; i++) {
    const { symbol, tf } = requests[i];
    const candles = results[i];
    
    if (!result.has(symbol)) {
      result.set(symbol, {});
    }
    
    if (candles && candles.length > 0) {
      result.get(symbol)![tf] = candles;
    }
  }
  
  return result;
}

/**
 * 并发执行任务，限制并发数
 */
async function executeWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrent: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Set<Promise<void>> = new Set();
  
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    
    const promise = Promise.resolve().then(async () => {
      try {
        results[i] = await task();
      } catch (err) {
        console.error(`[Backtest] Task ${i} failed:`, err);
        results[i] = undefined as any;
      }
    }).finally(() => {
      executing.delete(promise);
    });
    
    executing.add(promise);
    
    if (executing.size >= maxConcurrent) {
      await Promise.race(executing);
    }
  }
  
  await Promise.all(executing);
  return results;
}

function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const day = String(current.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function getClosePriceOnDate(candles: Candle[], date: string): number | null {
  const dateTime = new Date(date).getTime();
  for (const c of candles) {
    if (c.time === dateTime) return c.close;
  }
  return null;
}

function calcMaxDrawdown(equityCurve: { date: string; value: number }[]): number {
  if (equityCurve.length === 0) return 0;

  let maxValue = equityCurve[0].value;
  let maxDrawdown = 0;

  for (const point of equityCurve) {
    if (point.value > maxValue) {
      maxValue = point.value;
    }
    const dd = (maxValue - point.value) / maxValue;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
    }
  }

  return maxDrawdown * 100;
}

/**
 * 单只股票回测
 */
async function backtestSymbol(
  symbol: string,
  config: BacktestConfig,
  allCandlesByTf: Partial<Record<Timeframe, Candle[]>>,
  dates: string[],
  state: BacktestState
): Promise<void> {
  // 检查是否有足够的数据
  const has1d = allCandlesByTf["1d"] && allCandlesByTf["1d"]!.length > 0;
  if (!has1d) return;

  for (const date of dates) {
    const dateTime = new Date(date).getTime();
    const candlesUpTo: Partial<Record<Timeframe, Candle[]>> = {};

    // 截取到当前日期的K线
    for (const [tf, candles] of Object.entries(allCandlesByTf)) {
      if (candles) {
        candlesUpTo[tf as Timeframe] = candles.filter(c => c.time <= dateTime);
      }
    }

    const dailyCandles = candlesUpTo["1d"] || [];
    if (dailyCandles.length === 0) continue;

    const closePrice = getClosePriceOnDate(dailyCandles, date);
    if (closePrice === null) continue;

    // ============ 有持仓：检查卖出信号 ============
    if (state.positions.has(symbol)) {
      const position = state.positions.get(symbol)!;

      // 检查日线CD卖出信号（仅在第一次卖出后检查）
      if (!position.dailySellTriggered && closePrice < position.avgCost * 1.05) {
        const dailyCDSell = hasCDSignalInRange(dailyCandles, 10);
        if (dailyCDSell && closePrice < position.avgCost) {
          position.dailySellTriggered = true;
          position.dailySellDate = date;
        }
      }

      // 检查卖出信号
      const firstSell = detectFirstSellSignal(
        candlesUpTo as Partial<Record<Timeframe, Candle[]>>,
        config.ladderTimeframe
      );
      const sellSig = firstSell ? {
        type: firstSell.type,
        timeframe: firstSell.timeframe,
        reason: firstSell.reason,
      } : null;

      if (config.debug && (!config.debugSymbol || config.debugSymbol === symbol)) {
        console.log(`[DEBUG] ${symbol} @ ${date}: sellSig=${sellSig ? JSON.stringify(sellSig) : "null"}`);
      }

      if (sellSig) {
        let sellQty = 0;
        let sellType = sellSig.type;

        if (sellSig.type === "first_sell") {
          sellQty = position.quantity * 0.5;
        } else if (sellSig.type === "second_sell") {
          sellQty = position.quantity;
        }

        if (sellQty > 0 && position.quantity > 0) {
          const actualQty = Math.min(sellQty, position.quantity);
          const amount = actualQty * closePrice;
          const pnl = amount - actualQty * position.avgCost;

          state.trades.push({
            sessionId: config.sessionId,
            symbol,
            type: "sell",
            quantity: String(actualQty.toFixed(6)),
            price: String(closePrice.toFixed(4)),
            amount: String(amount.toFixed(2)),
            tradeDate: date,
            signalTimeframe: sellSig.timeframe,
            signalType: sellSig.type,
            reason: sellSig.reason,
            pnl: String(pnl.toFixed(2)),
            pnlPercent: String(((pnl / (actualQty * position.avgCost)) * 100).toFixed(4)),
          });

          state.balance += amount;
          position.quantity -= actualQty;

          // 新的卖出逻辑不需要 dailySellTriggered

          if (position.quantity <= 0.001) {
            if (pnl > 0) state.winTrades++;
            else state.lossTrades++;
            state.totalTrades++;
            state.positions.delete(symbol);
          }
        }
      }
    }

    // ============ 无持仓：检查买入信号 ============
    if (!state.positions.has(symbol)) {
      // 检查资金是否充足（至少 1%仓位）
      const minAmount = state.balance * 0.01;
      if (state.balance < minAmount) continue;

      // 激进策略与标准策略买入信号检测
      let buySig: { type: string; timeframe: Timeframe; reason: string } | null = null;

      // 基于 CD 分数的买入信号检测
      const firstBuy = detectFirstBuySignal(
        candlesUpTo as Partial<Record<Timeframe, Candle[]>>,
        config.ladderTimeframe,
        config.cdScoreThreshold
      );
      if (firstBuy) {
        buySig = {
          type: firstBuy.type,
          timeframe: firstBuy.timeframe,
          reason: firstBuy.reason,
        };
      }

      if (config.debug && (!config.debugSymbol || config.debugSymbol === symbol)) {
        console.log(`[DEBUG] ${symbol} @ ${date}: buySig=${buySig ? JSON.stringify(buySig) : "null"}`);
      }

      if (buySig) {
        const buyAmount = state.balance * 0.5;
        const buyQty = buyAmount / closePrice;

        state.trades.push({
          sessionId: config.sessionId,
          symbol,
          type: "buy",
          quantity: String(buyQty.toFixed(6)),
          price: String(closePrice.toFixed(4)),
          amount: String(buyAmount.toFixed(2)),
          tradeDate: date,
          signalTimeframe: buySig.timeframe,
          signalType: buySig.type,
          reason: buySig.reason,
          pnl: "0",
          pnlPercent: "0",
        });

        state.balance -= buyAmount;
        state.positions.set(symbol, {
          symbol,
          quantity: buyQty,
          avgCost: closePrice,
          entryTimeframe: buySig.timeframe,
          entryType: "first_buy",
          firstBuyDone: true,
          secondBuyDone: false,
          dailySellTriggered: false,
          dailySellDate: null,
          aggressiveAddDone: false,
          aggressiveRetestAddDone: false,
        });
      }
    }
  }
}

/**
 * 执行回测
 */
export async function runBacktest(config: BacktestConfig): Promise<void> {
  if (runningTasks.get(config.sessionId)) {
    console.log(`[Backtest] Session ${config.sessionId} already running`);
    return;
  }

  runningTasks.set(config.sessionId, true);
  const db = await getDb();
  if (!db) {
    runningTasks.delete(config.sessionId);
    return;
  }

  try {
    // 更新状态为运行中
    await db.update(backtestSessions)
      .set({ status: "running", progress: 0 })
      .where(eq(backtestSessions.id, config.sessionId));

    const dates = getDateRange(config.startDate, config.endDate);
    if (dates.length === 0) throw new Error("日期范围无效");

    // 确定要回测的股票列表
    let stocksToTest: string[];
    if (config.customStocks && config.customStocks.length > 0) {
      // 自选股票模式：使用用户指定的股票，不限制数量
      stocksToTest = config.customStocks.map(s => s.toUpperCase().trim()).filter(Boolean);
    } else {
      // 全部股票池模式：按市値筛选，限制30只以控制时间
      stocksToTest = US_STOCKS.filter(s => !["QQQ", "SPY", "TQQQ", "SOXL", "ARKK"].includes(s.symbol)).map(s => s.symbol);
      stocksToTest = stocksToTest.slice(0, 30);
    }

    const state: BacktestState = {
      balance: config.initialBalance,
      positions: new Map(),
      trades: [],
      equityCurve: [],
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
    };

    // 所有需要的时间级别（添加所有用于 CD 分数计算的级别）
    const allTf = Array.from(new Set([
      "5m" as Timeframe,
      "15m" as Timeframe,
      "30m" as Timeframe,
      "1h" as Timeframe,
      "2h" as Timeframe,
      "3h" as Timeframe,
      "4h" as Timeframe,
      "1d" as Timeframe,
      "1w" as Timeframe,
      config.ladderTimeframe,
    ]));

    // 计算指标预热日期（往前多取180天用于EMA/MACD预热）
    const warmupStart = new Date(config.startDate);
    warmupStart.setDate(warmupStart.getDate() - 180);
    const dataStartDate = warmupStart.toISOString().split("T")[0];

    console.log(`[Backtest] Session ${config.sessionId} started. Stocks: ${stocksToTest.length}, Dates: ${dates.length}`);

    // 并发获取基准数据（QQQ/SPY）
    const benchmarkCandles = await getCandlesForStocks(
      ["QQQ", "SPY"],
      ["1d"],
      dataStartDate,
      config.endDate
    );

    const qqqCandles = benchmarkCandles.get("QQQ")?.["1d"] || [];
    const spyCandles = benchmarkCandles.get("SPY")?.["1d"] || [];

    const qqqStart = getClosePriceOnDate(qqqCandles, dates[0]);
    const spyStart = getClosePriceOnDate(spyCandles, dates[0]);
    const qqqEnd = getClosePriceOnDate(qqqCandles, dates[dates.length - 1]);
    const spyEnd = getClosePriceOnDate(spyCandles, dates[dates.length - 1]);

    // 分批获取股票数据（每批 10 只）
    const batchSize = 10;
    const allStockCandles = new Map<string, Partial<Record<Timeframe, Candle[]>>>();

    for (let batch = 0; batch < stocksToTest.length; batch += batchSize) {
      const batchStocks = stocksToTest.slice(batch, Math.min(batch + batchSize, stocksToTest.length));
      
      console.log(`[Backtest] Session ${config.sessionId}: Fetching data for batch ${Math.floor(batch / batchSize) + 1}/${Math.ceil(stocksToTest.length / batchSize)}`);
      
      const batchCandles = await getCandlesForStocks(
        batchStocks,
        allTf,
        dataStartDate,
        config.endDate
      );
      
      batchCandles.forEach((candles, symbol) => {
        allStockCandles.set(symbol, candles);
      });
      
      // 更新进度
      const progress = Math.round((batch + batchSize) / stocksToTest.length * 40);
      await db.update(backtestSessions)
        .set({ progress, currentDate: dates[Math.min(batch, dates.length - 1)] })
        .where(eq(backtestSessions.id, config.sessionId));
    }

    // 逐股票回测
    for (let si = 0; si < stocksToTest.length; si++) {
      const symbol = stocksToTest[si];
      const allCandlesByTf = allStockCandles.get(symbol) || {};

      await backtestSymbol(symbol, config, allCandlesByTf, dates, state);

      // 更新进度
      const progress = 40 + Math.round((si + 1) / stocksToTest.length * 40);
      await db.update(backtestSessions)
        .set({ progress, currentDate: dates[Math.min(si * 5, dates.length - 1)] })
        .where(eq(backtestSessions.id, config.sessionId));
    }

    // 计算每日净值曲线（使用已缓存的数据）
    console.log(`[Backtest] Session ${config.sessionId}: Computing equity curve...`);
    
    for (const date of dates) {
      let portfolioValue = state.balance;
      state.positions.forEach((pos, symbol) => {
        const c = allStockCandles.get(symbol)?.["1d"] || [];
        const price = getClosePriceOnDate(c, date) || pos.avgCost;
        portfolioValue += pos.quantity * price;
      });
      state.equityCurve.push({ date, value: portfolioValue });
    }

    // 最终资产
    let finalBalance = state.balance;
    state.positions.forEach((pos, symbol) => {
      const c = allStockCandles.get(symbol)?.["1d"] || [];
      const lastPrice = c.length > 0 ? c[c.length - 1].close : pos.avgCost;
      finalBalance += pos.quantity * lastPrice;
    });

    const totalReturn = ((finalBalance - config.initialBalance) / config.initialBalance) * 100;
    const maxDrawdown = calcMaxDrawdown(state.equityCurve);
    const qqqReturn = qqqStart && qqqEnd ? ((qqqEnd - qqqStart) / qqqStart) * 100 : null;
    const spyReturn = spyStart && spyEnd ? ((spyEnd - spyStart) / spyStart) * 100 : null;

    // 保存交易记录
    if (state.trades.length > 0) {
      console.log(`[Backtest] Session ${config.sessionId}: Saving ${state.trades.length} trades...`);
      // 批量插入（分批）
      const batchSize = 50;
      for (let i = 0; i < state.trades.length; i += batchSize) {
        await db.insert(backtestTrades).values(state.trades.slice(i, i + batchSize));
      }
    }

    // 更新会话结果
    await db.update(backtestSessions).set({
      status: "completed",
      progress: 100,
      finalBalance: String(finalBalance.toFixed(2)),
      totalReturn: String(totalReturn.toFixed(4)),
      maxDrawdown: String(maxDrawdown.toFixed(4)),
      totalTrades: state.totalTrades,
      winTrades: state.winTrades,
      lossTrades: state.lossTrades,
      benchmarkQQQReturn: qqqReturn !== null ? String(qqqReturn.toFixed(4)) : null,
      benchmarkSPYReturn: spyReturn !== null ? String(spyReturn.toFixed(4)) : null,
      equityCurve: JSON.stringify(state.equityCurve),
      completedAt: new Date(),
    }).where(eq(backtestSessions.id, config.sessionId));

    console.log(`[Backtest] Session ${config.sessionId} completed. Return: ${totalReturn.toFixed(2)}%, Trades: ${state.totalTrades}`);
  } catch (err: any) {
    console.error(`[Backtest] Session ${config.sessionId} failed:`, err);
    await db.update(backtestSessions).set({
      status: "failed",
      errorMessage: err.message || "回测失败",
    }).where(eq(backtestSessions.id, config.sessionId));
  } finally {
    runningTasks.delete(config.sessionId);
    // 清空缓存以释放内存
    candleCache.clear();
  }
}

export function isBacktestRunning(sessionId: number): boolean {
  return runningTasks.get(sessionId) === true;
}

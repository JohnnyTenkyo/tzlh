import { calculateTradeFees } from "./tigerTradeFees";
import { deduplicatedFetch } from "./requestDeduplication";
import { ProgressTracker } from "./progressReporter";
/**
 * 自动回测引擎
 * 基于黄蓝梯子 + CD抄底指标的买卖逻辑
 *
 * 修复要点：
 * 1. backtestSymbol 使用移动指针代替 O(n²) filter
 * 2. 缓存 key 不绑定回测区间（Yahoo/Finnhub 等按 symbol+tf+source 缓存）
 * 3. 成功抓到的数据持久化回 DB 缓存
 */
import { detectFirstBuySignal, detectFirstSellSignal, detectSecondBuySignal, detectSecondSellSignal } from "./buySignalWithScore";
import { calculateCDScore } from "./cdScore";
import { fetchHistoricalCandles, fetchQuote } from "./marketData";
import { getCandlesFromCache, saveCandlesToCache } from "./cacheManager";
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
  aggressiveAddDone: boolean;
  aggressiveRetestAddDone: boolean;
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
  totalFees: number;
}

// 运行中的回测任务
const runningTasks = new Map<number, boolean>();

// K线数据内存缓存（按 symbol+tf 缓存，不绑定回测区间）
const candleCache = new Map<string, Candle[]>();
const MAX_CONCURRENT_REQUESTS = 3;
const API_TIMEOUT_MS = 15000;

/**
 * 缓存 key 设计修复：
 * 不再绑定 startDate/endDate，因为 Yahoo/Finnhub 等数据源
 * 实际请求时不按传入的日期范围获取数据。
 * 统一按 symbol + timeframe 缓存全量数据，查询时在本地过滤。
 */
function getCacheKey(symbol: string, tf: Timeframe): string {
  return `${symbol}::${tf}`;
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
 * 修复：缓存 key 不绑定回测区间，成功后持久化到 DB
 */
async function getCandlesWithCache(
  symbol: string,
  tf: Timeframe,
  startDate: string,
  endDate: string,
  retries: number = 2
): Promise<Candle[]> {
  const cacheKey = getCacheKey(symbol, tf);
  
  // 1. Check in-memory cache (全量数据，不按日期过滤)
  if (candleCache.has(cacheKey)) {
    const cached = candleCache.get(cacheKey)!;
    // 在本地按日期过滤
    return filterByDateRange(cached, startDate, endDate);
  }
  
  // 2. Check database cache (priority) - 按日期范围查询
  try {
    const dbCachedCandles = await getCandlesFromCache(symbol, tf, startDate, endDate);
    if (dbCachedCandles && dbCachedCandles.length > 0) {
      console.log(`[Cache] DB hit for ${symbol}/${tf}: ${dbCachedCandles.length} candles`);
      // 存入内存缓存（全量）
      candleCache.set(cacheKey, dbCachedCandles);
      return dbCachedCandles;
    }
  } catch (err) {
    console.warn(`[Cache] Error reading from database cache:`, err);
  }
  
  // 3. Fetch from API
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const candles = await withTimeout(
        fetchHistoricalCandles(symbol, tf, startDate, endDate),
        API_TIMEOUT_MS
      );
      
      if (candles.length > 0) {
        // 存入内存缓存
        candleCache.set(cacheKey, candles);
        
        // 持久化到 DB 缓存（异步，不阻塞主流程）
        persistToDBCache(symbol, tf, candles).catch(err => {
          console.warn(`[Cache] Failed to persist ${symbol}/${tf} to DB:`, err);
        });
      }
      
      // 缓存大小超过 300 条记录时清理最旧的记录
      if (candleCache.size > 300) {
        const firstKey = candleCache.keys().next().value as string | undefined;
        if (firstKey) candleCache.delete(firstKey);
      }
      
      return candles;
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }
  
  console.warn(`[Backtest] Failed to fetch ${symbol} ${tf} after ${retries} retries:`, lastError?.message);
  return [];
}

/**
 * 按日期范围过滤 K 线数据
 */
function filterByDateRange(candles: Candle[], startDate: string, endDate: string): Candle[] {
  const startTs = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const endTs = new Date(`${endDate}T23:59:59.999Z`).getTime();
  return candles.filter(c => c.time >= startTs && c.time <= endTs);
}

/**
 * 将 API 获取的数据持久化到数据库缓存
 */
async function persistToDBCache(symbol: string, tf: string, candles: Candle[]): Promise<void> {
  if (candles.length === 0) return;
  try {
    const formatted = candles.map(c => ({
      time: c.time,
      date: new Date(c.time).toISOString().split("T")[0],
      open: typeof c.open === "string" ? parseFloat(c.open as any) : c.open,
      high: typeof c.high === "string" ? parseFloat(c.high as any) : c.high,
      low: typeof c.low === "string" ? parseFloat(c.low as any) : c.low,
      close: typeof c.close === "string" ? parseFloat(c.close as any) : c.close,
      volume: typeof c.volume === "string" ? parseFloat(c.volume as any) : c.volume,
    }));
    await saveCandlesToCache(symbol, tf, formatted);
    console.log(`[Cache] Persisted ${candles.length} candles for ${symbol}/${tf} to DB`);
  } catch (err) {
    console.warn(`[Cache] persistToDBCache error for ${symbol}/${tf}:`, err);
  }
}

/**
 * 并发获取多只股票的多个时间级别数据
 * 修复：使用惰性工厂函数，真正的并发控制
 */
async function getCandlesForStocks(
  symbols: string[],
  timeframes: Timeframe[],
  startDate: string,
  endDate: string
): Promise<Map<string, Partial<Record<Timeframe, Candle[]>>>> {
  const result = new Map<string, Partial<Record<Timeframe, Candle[]>>>();
  
  // 构建惰性任务工厂函数数组
  const tasks: Array<{
    symbol: string;
    tf: Timeframe;
    run: () => Promise<Candle[]>;
  }> = [];

  for (const symbol of symbols) {
    for (const tf of timeframes) {
      tasks.push({
        symbol,
        tf,
        run: () =>
          deduplicatedFetch(
            symbol,
            tf,
            startDate,
            endDate,
            () => getCandlesWithCache(symbol, tf, startDate, endDate)
          ),
      });
    }
  }

  // 传入工厂函数数组，并发控制器按需调用 run()
  const results = await executeWithConcurrency(
    tasks.map((t) => t.run),
    MAX_CONCURRENT_REQUESTS
  );

  // 整理结果
  for (let i = 0; i < tasks.length; i++) {
    const { symbol, tf } = tasks[i];
    const candles = results[i] as Candle[] | undefined;

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
 * 并发执行任务，限制并发数（真正的并发控制）
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
  // 尝试按日期字符串匹配
  for (const c of candles) {
    const candleDate = new Date(c.time).toISOString().split("T")[0];
    if (candleDate === date) return c.close;
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
 * 修复：使用移动指针代替 O(n²) filter，大幅提升性能
 */
export async function backtestSymbol(
  symbol: string,
  config: BacktestConfig,
  allCandlesByTf: Partial<Record<Timeframe, Candle[]>>,
  _dates: string[],
  state: BacktestState
): Promise<void> {
  const dailyAll = allCandlesByTf["1d"] || [];
  if (dailyAll.length === 0) return;

  // 预计算各 timeframe 的移动指针（关键优化：避免每天全量 filter）
  const tfEntries = Object.entries(allCandlesByTf).map(([tf, candles]) => ({
    tf: tf as Timeframe,
    candles: candles || [],
    endIndex: 0,  // 移动指针：当前已扫描到的位置
  }));

  for (const dailyCandle of dailyAll) {
    const date = new Date(dailyCandle.time).toISOString().split("T")[0];

    // 只回测用户选择区间
    if (date < config.startDate || date > config.endDate) continue;

    const cutoffTime = dailyCandle.time;
    const closePrice = dailyCandle.close;

    const candlesUpTo: Partial<Record<Timeframe, Candle[]>> = {};

    // 使用移动指针截取到当前日期的K线（O(1) 摊销复杂度）
    for (const entry of tfEntries) {
      while (
        entry.endIndex < entry.candles.length &&
        entry.candles[entry.endIndex].time <= cutoffTime
      ) {
        entry.endIndex++;
      }
      // slice(0, endIndex) 只创建引用，不重新扫描
      candlesUpTo[entry.tf] = entry.candles.slice(0, entry.endIndex);
    }

    const dailyCandles = candlesUpTo["1d"] || [];
    if (dailyCandles.length === 0) continue;

    // ============ 有持仓：检查卖出信号 ============
    if (state.positions.has(symbol)) {
      const position = state.positions.get(symbol)!;

      // 检查日线CD卖出信号
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

        if (sellSig.type === "first_sell") {
          sellQty = position.quantity * 0.5;
        } else if (sellSig.type === "second_sell") {
          sellQty = position.quantity;
        }

        if (sellQty > 0 && position.quantity > 0) {
          const actualQty = Math.min(sellQty, position.quantity);
          const amount = actualQty * closePrice;
          
          // 计算卖出手续费
          const sellFees = calculateTradeFees(actualQty, closePrice);
          const netAmount = amount - sellFees.totalFee;
          const pnl = netAmount - actualQty * position.avgCost;

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
            fees: String(sellFees.totalFee.toFixed(4)),
          });

          state.balance += netAmount;
          state.totalFees += sellFees.totalFee;
          position.quantity -= actualQty;

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
      const minAmount = state.balance * 0.01;
      if (state.balance < minAmount) continue;

      let buySig: { type: string; timeframe: Timeframe; reason: string } | null = null;

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
        
        const fees = calculateTradeFees(buyQty, closePrice);
        const totalBuyAmount = buyAmount + fees.totalFee;
        
        if (totalBuyAmount > state.balance) continue;

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
          fees: String(fees.totalFee.toFixed(4)),
        });

        state.balance -= totalBuyAmount;
        state.totalFees += fees.totalFee;
        state.totalTrades++;
        const effectiveAvgCost = totalBuyAmount / buyQty;
        state.positions.set(symbol, {
          symbol,
          quantity: buyQty,
          avgCost: effectiveAvgCost,
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
export interface BacktestResult {
  trades: InsertBacktestTrade[];
  equityCurve: Array<{ date: string; value: number }>;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  totalFees: number;
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  if (runningTasks.get(config.sessionId)) {
    console.log(`[Backtest] Session ${config.sessionId} already running`);
    return { trades: [], equityCurve: [], totalTrades: 0, winTrades: 0, lossTrades: 0, totalFees: 0 };
  }

  runningTasks.set(config.sessionId, true);
  const db = await getDb();
  if (!db) {
    runningTasks.delete(config.sessionId);
    return { trades: [], equityCurve: [], totalTrades: 0, winTrades: 0, lossTrades: 0, totalFees: 0 };
  }

  try {
    const progressTracker = new ProgressTracker(config.sessionId, 100);
    
    await db.update(backtestSessions)
      .set({ status: "running", progress: 0 })
      .where(eq(backtestSessions.id, config.sessionId));

    const dates = getDateRange(config.startDate, config.endDate);
    if (dates.length === 0) throw new Error("日期范围无效");
    
    progressTracker.step("fetching_data", "准备获取数据");

    // 确定要回测的股票列表
    let stocksToTest: string[];
    if (config.customStocks && config.customStocks.length > 0) {
      stocksToTest = config.customStocks.map(s => s.toUpperCase().trim()).filter(Boolean);
    } else {
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
      totalFees: 0,
    };

    // 所有需要的时间级别
    const allTf = Array.from(new Set([
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
      
      // 更新进度（数据获取阶段占 0-40%）
      const progress = Math.min(40, Math.round((batch + batchSize) / stocksToTest.length * 40));
      await db.update(backtestSessions)
        .set({ progress, currentDate: `正在获取数据...` })
        .where(eq(backtestSessions.id, config.sessionId));
    }

    // 逐股票回测（回测阶段占 40-80%）
    for (let si = 0; si < stocksToTest.length; si++) {
      const symbol = stocksToTest[si];
      const allCandlesByTf = allStockCandles.get(symbol) || {};

      await backtestSymbol(symbol, config, allCandlesByTf, dates, state);

      // 更新进度
      const progress = 40 + Math.round((si + 1) / stocksToTest.length * 40);
      await db.update(backtestSessions)
        .set({ progress, currentDate: `回测 ${symbol} (${si + 1}/${stocksToTest.length})` })
        .where(eq(backtestSessions.id, config.sessionId));
    }

    // 计算每日净值曲线（80-90%）
    console.log(`[Backtest] Session ${config.sessionId}: Computing equity curve...`);
    await db.update(backtestSessions)
      .set({ progress: 85, currentDate: "计算净值曲线..." })
      .where(eq(backtestSessions.id, config.sessionId));
    
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

    // 保存交易记录（90-95%）
    await db.update(backtestSessions)
      .set({ progress: 90, currentDate: "保存交易记录..." })
      .where(eq(backtestSessions.id, config.sessionId));

    if (state.trades.length > 0) {
      console.log(`[Backtest] Session ${config.sessionId}: Saving ${state.trades.length} trades...`);
      const tradeBatchSize = 50;
      for (let i = 0; i < state.trades.length; i += tradeBatchSize) {
        await db.insert(backtestTrades).values(state.trades.slice(i, i + tradeBatchSize));
      }
    }

    // 计算统计指标（95-100%）
    await db.update(backtestSessions)
      .set({ progress: 95, currentDate: "计算统计指标..." })
      .where(eq(backtestSessions.id, config.sessionId));

    const sellTrades = state.trades.filter(t => t.type === "sell" && t.pnl !== "0");
    const pnlValues = sellTrades.map(t => parseFloat(t.pnlPercent || "0"));
    const pnlDollarValues = sellTrades.map(t => parseFloat(t.pnl || "0"));
    const winPnls = pnlValues.filter(p => p > 0);
    const lossPnls = pnlValues.filter(p => p <= 0);
    const winDollarPnls = pnlDollarValues.filter(p => p > 0);
    const lossDollarPnls = pnlDollarValues.filter(p => p <= 0);
    
    const avgReturn = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;
    const avgProfit = winPnls.length > 0 ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length : 0;
    const avgLoss = lossPnls.length > 0 ? lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length : 0;
    
    // maxProfit/maxLoss 使用美元金额（而非百分比）
    const maxProfit = winDollarPnls.length > 0 ? Math.max(...winDollarPnls) : 0;
    const maxLoss = lossDollarPnls.length > 0 ? Math.min(...lossDollarPnls) : 0;
    
    // Sharpe ratio (simplified: avgReturn / stdDev)
    const stdDev = pnlValues.length > 1 ? Math.sqrt(pnlValues.reduce((sum, v) => sum + Math.pow(v - avgReturn, 2), 0) / (pnlValues.length - 1)) : 0;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) : 0;
    
    // Max consecutive wins/losses
    let maxConsecutiveWin = 0, maxConsecutiveLoss = 0, curWin = 0, curLoss = 0;
    for (const p of pnlValues) {
      if (p > 0) { curWin++; curLoss = 0; maxConsecutiveWin = Math.max(maxConsecutiveWin, curWin); }
      else { curLoss++; curWin = 0; maxConsecutiveLoss = Math.max(maxConsecutiveLoss, curLoss); }
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
      totalFees: String(state.totalFees.toFixed(2)),
      equityCurve: JSON.stringify(state.equityCurve),
      completedAt: new Date(),
      avgReturn: String(avgReturn.toFixed(4)),
      avgProfit: String(avgProfit.toFixed(4)),
      avgLoss: String(avgLoss.toFixed(4)),
      maxProfit: String(maxProfit.toFixed(2)),
      maxLoss: String(maxLoss.toFixed(2)),
      sharpeRatio: String(sharpeRatio.toFixed(4)),
      maxConsecutiveWin,
      maxConsecutiveLoss,
    }).where(eq(backtestSessions.id, config.sessionId));

    console.log(`[Backtest] Session ${config.sessionId} completed. Return: ${totalReturn.toFixed(2)}%, Trades: ${state.totalTrades}`);
    
    return {
      trades: state.trades,
      equityCurve: state.equityCurve,
      totalTrades: state.totalTrades,
      winTrades: state.winTrades,
      lossTrades: state.lossTrades,
      totalFees: state.totalFees,
    };
  } catch (err: any) {
    console.error(`[Backtest] Session ${config.sessionId} failed:`, err);
    await db.update(backtestSessions).set({
      status: "failed",
      errorMessage: err.message || "回测失败",
    }).where(eq(backtestSessions.id, config.sessionId));
  } finally {
    runningTasks.delete(config.sessionId);
    // 清空内存缓存以释放内存
    candleCache.clear();
  }
  
  return {
    trades: [],
    equityCurve: [],
    totalTrades: 0,
    winTrades: 0,
    lossTrades: 0,
    totalFees: 0,
  };
}

export function isBacktestRunning(sessionId: number): boolean {
  return runningTasks.get(sessionId) === true;
}

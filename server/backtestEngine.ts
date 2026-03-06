/**
 * 自动回测引擎
 * 基于黄蓝梯子 + CD抄底指标的买卖逻辑
 */
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
  cdSignalTimeframes: Timeframe[];
  cdLookbackBars: number;
  ladderBreakTimeframes: Timeframe[];
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

/**
 * 获取日期列表（工作日）
 */
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const cur = new Date(start);

  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) { // 排除周末
      dates.push(cur.toISOString().split("T")[0]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * 获取指定日期之前的K线（用于计算指标）
 */
function getCandlesUpTo(allCandles: Candle[], dateStr: string): Candle[] {
  const ts = new Date(dateStr).getTime() + 86400000; // 包含当天
  return allCandles.filter(c => c.time <= ts);
}

/**
 * 获取指定日期的收盘价
 */
function getClosePriceOnDate(candles: Candle[], dateStr: string): number | null {
  const dayStart = new Date(dateStr).getTime();
  const dayEnd = dayStart + 86400000;
  const dayCandles = candles.filter(c => c.time >= dayStart && c.time < dayEnd);
  if (dayCandles.length === 0) return null;
  return dayCandles[dayCandles.length - 1].close;
}

/**
 * 执行单只股票的回测逻辑
 */
async function backtestSymbol(
  symbol: string,
  config: BacktestConfig,
  allCandlesByTf: Partial<Record<Timeframe, Candle[]>>,
  dates: string[],
  state: BacktestState
): Promise<void> {
  const dailyCandles = allCandlesByTf["1d"] || [];
  if (dailyCandles.length === 0) return;

  for (const date of dates) {
    const closePrice = getClosePriceOnDate(dailyCandles, date);
    if (!closePrice) continue;

    // 构建截止当天的K线
    const candlesUpTo: Partial<Record<Timeframe, Candle[]>> = {};
    for (const tf of Object.keys(allCandlesByTf) as Timeframe[]) {
      const c = allCandlesByTf[tf];
      if (c) candlesUpTo[tf] = getCandlesUpTo(c, date);
    }

    const position = state.positions.get(symbol);

    // ============ 持仓中：检查卖出信号 ============
    if (position) {
      // 日级别卖出后次日检查
      if (position.dailySellTriggered && position.dailySellDate && position.dailySellDate !== date) {
        const dailyC = candlesUpTo["1d"] || [];
        if (dailyC.length >= 90) {
          const ladder = calculateLadder(dailyC);
          const sig = getLadderSignal(dailyC, ladder);
          if (sig.closeBelowBlueDn) {
            // 次日仍在蓝梯下方，卖出剩余
            const qty = position.quantity;
            if (qty > 0) {
              const amount = qty * closePrice;
              const pnl = amount - qty * position.avgCost;
              state.trades.push({
                sessionId: config.sessionId,
                symbol,
                type: "sell",
                quantity: String(qty),
                price: String(closePrice.toFixed(4)),
                amount: String(amount.toFixed(2)),
                tradeDate: date,
                signalTimeframe: "1d",
                signalType: "daily_sell_all",
                reason: "日线CD卖出信号触发后次日未回到蓝梯上方，清仓",
                pnl: String(pnl.toFixed(2)),
                pnlPercent: String(((pnl / (qty * position.avgCost)) * 100).toFixed(4)),
              });
              state.balance += amount;
              if (pnl > 0) state.winTrades++;
              else state.lossTrades++;
              state.totalTrades++;
              state.positions.delete(symbol);
              continue;
            }
          } else {
            position.dailySellTriggered = false;
            position.dailySellDate = null;
          }
        }
      }

      // 检查卖出信号
      const sellSig = detectSellSignal(
        candlesUpTo as Partial<Record<Timeframe, Candle[]>>,
        position.entryTimeframe,
        closePrice,
        position.dailySellTriggered
      );

      if (sellSig) {
        let sellQty = 0;
        let sellType = sellSig.type;

        if (sellSig.type === "first_sell" || sellSig.type === "daily_sell_half") {
          sellQty = position.quantity * 0.5;
        } else if (sellSig.type === "second_sell" || sellSig.type === "daily_sell_all") {
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

          if (sellSig.type === "daily_sell_half") {
            position.dailySellTriggered = true;
            position.dailySellDate = date;
          }

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
      // 检查资金是否充足（至少1%仓位）
      const minAmount = state.balance * 0.01;
      if (state.balance < minAmount) continue;

      const buySig = detectBuySignal(
        candlesUpTo as Partial<Record<Timeframe, Candle[]>>,
        config.cdSignalTimeframes,
        config.ladderBreakTimeframes,
        config.cdLookbackBars,
        closePrice
      );

      if (buySig) {
        // 计算买入金额（每只股票最多用20%仓位，第一买点50%即10%总仓位）
        const maxAllocation = state.balance * 0.2;
        const buyAmount = buySig.type === "first_buy"
          ? maxAllocation * 0.5
          : maxAllocation * 0.5;

        if (buyAmount < 100) continue; // 最小买入100美元

        const qty = buyAmount / closePrice;

        state.trades.push({
          sessionId: config.sessionId,
          symbol,
          type: "buy",
          quantity: String(qty.toFixed(6)),
          price: String(closePrice.toFixed(4)),
          amount: String(buyAmount.toFixed(2)),
          tradeDate: date,
          signalTimeframe: buySig.timeframe,
          signalType: buySig.type,
          reason: buySig.reason,
          pnl: null,
          pnlPercent: null,
        });

        state.balance -= buyAmount;

        state.positions.set(symbol, {
          symbol,
          quantity: qty,
          avgCost: closePrice,
          entryTimeframe: buySig.timeframe,
          entryType: (buySig.type === "first_buy" || buySig.type === "second_buy") ? buySig.type : "first_buy",
          firstBuyDone: buySig.type === "first_buy",
          secondBuyDone: buySig.type === "second_buy",
          dailySellTriggered: false,
          dailySellDate: null,
        });
      }
    } else if (state.positions.has(symbol)) {
      // 已有第一买点，检查第二买点
      const pos = state.positions.get(symbol)!;
      if (pos.firstBuyDone && !pos.secondBuyDone) {
        const dailyC = candlesUpTo["1d"] || [];
        const lowestCandles = candlesUpTo[pos.entryTimeframe] || [];
        if (lowestCandles.length >= 90) {
          const ladder = calculateLadder(lowestCandles);
          const sig = getLadderSignal(lowestCandles, ladder);
          if (sig.blueDnAboveYellowUp) {
            const buyAmount = state.balance * 0.1; // 10%总仓位
            if (buyAmount >= 100) {
              const qty = buyAmount / closePrice;
              const newTotalQty = pos.quantity + qty;
              const newAvgCost = (pos.quantity * pos.avgCost + qty * closePrice) / newTotalQty;

              state.trades.push({
                sessionId: config.sessionId,
                symbol,
                type: "buy",
                quantity: String(qty.toFixed(6)),
                price: String(closePrice.toFixed(4)),
                amount: String(buyAmount.toFixed(2)),
                tradeDate: date,
                signalTimeframe: pos.entryTimeframe,
                signalType: "second_buy",
                reason: `${pos.entryTimeframe}级别蓝梯下边缘高于黄梯上边缘，触发第二买点（50%仓位）`,
                pnl: null,
                pnlPercent: null,
              });

              state.balance -= buyAmount;
              pos.quantity = newTotalQty;
              pos.avgCost = newAvgCost;
              pos.secondBuyDone = true;
            }
          }
        }
      }
    }
  }
}

/**
 * 计算最大回撤
 */
function calcMaxDrawdown(equityCurve: { date: string; value: number }[]): number {
  let maxVal = 0;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    if (point.value > maxVal) maxVal = point.value;
    const dd = (maxVal - point.value) / maxVal;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  return maxDrawdown * 100;
}

/**
 * 主回测函数
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
    let stocksToTest = US_STOCKS.filter(s => !["QQQ", "SPY", "TQQQ", "SOXL", "ARKK"].includes(s.symbol)).map(s => s.symbol);
    stocksToTest = stocksToTest.slice(0, 30); // 限制30只以控制时间

    const state: BacktestState = {
      balance: config.initialBalance,
      positions: new Map(),
      trades: [],
      equityCurve: [],
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
    };

    // 所有需要的时间级别
    const allTf = Array.from(new Set([
      ...config.cdSignalTimeframes,
      ...config.ladderBreakTimeframes,
      "1d" as Timeframe,
    ]));

    // 获取基准数据（QQQ/SPY）
    const [qqqCandles, spyCandles] = await Promise.all([
      fetchHistoricalCandles("QQQ", "1d", config.startDate, config.endDate),
      fetchHistoricalCandles("SPY", "1d", config.startDate, config.endDate),
    ]);

    const qqqStart = getClosePriceOnDate(qqqCandles, dates[0]);
    const spyStart = getClosePriceOnDate(spyCandles, dates[0]);
    const qqqEnd = getClosePriceOnDate(qqqCandles, dates[dates.length - 1]);
    const spyEnd = getClosePriceOnDate(spyCandles, dates[dates.length - 1]);

    // 逐股票回测
    for (let si = 0; si < stocksToTest.length; si++) {
      const symbol: string = stocksToTest[si]!;

      // 获取该股票所有时间级别的历史数据
      const allCandlesByTf: Partial<Record<Timeframe, Candle[]>> = {};
      for (const tf of allTf) {
        const c = await fetchHistoricalCandles(symbol, tf, config.startDate, config.endDate);
        if (c.length > 0) allCandlesByTf[tf] = c;
      }

      await backtestSymbol(symbol, config, allCandlesByTf, dates, state);

      // 更新进度
      const progress = Math.round((si + 1) / stocksToTest.length * 80);
      await db.update(backtestSessions)
        .set({ progress, currentDate: dates[Math.min(si * 5, dates.length - 1)] })
        .where(eq(backtestSessions.id, config.sessionId));
    }

    // 计算每日净值曲线
    const dailyCandles: Record<string, Candle[]> = {};
    for (const symbol of Array.from(state.positions.keys())) {
      const c = await fetchHistoricalCandles(symbol, "1d", config.startDate, config.endDate);
      if (c.length > 0) dailyCandles[symbol] = c;
    }

    for (const date of dates) {
      let portfolioValue = state.balance;
    state.positions.forEach((pos, symbol) => {
      const c = dailyCandles[symbol] || [];
      const price = getClosePriceOnDate(c, date) || pos.avgCost;
      portfolioValue += pos.quantity * price;
    });
      state.equityCurve.push({ date, value: portfolioValue });
    }

    // 最终资产
    let finalBalance = state.balance;
    state.positions.forEach((pos, symbol) => {
      const c = dailyCandles[symbol] || [];
      const lastPrice = c.length > 0 ? c[c.length - 1].close : pos.avgCost;
      finalBalance += pos.quantity * lastPrice;
    });

    const totalReturn = ((finalBalance - config.initialBalance) / config.initialBalance) * 100;
    const maxDrawdown = calcMaxDrawdown(state.equityCurve);
    const qqqReturn = qqqStart && qqqEnd ? ((qqqEnd - qqqStart) / qqqStart) * 100 : null;
    const spyReturn = spyStart && spyEnd ? ((spyEnd - spyStart) / spyStart) * 100 : null;

    // 保存交易记录
    if (state.trades.length > 0) {
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

    console.log(`[Backtest] Session ${config.sessionId} completed. Return: ${totalReturn.toFixed(2)}%`);
  } catch (err: any) {
    console.error(`[Backtest] Session ${config.sessionId} failed:`, err);
    await db.update(backtestSessions).set({
      status: "failed",
      errorMessage: err.message || "回测失败",
    }).where(eq(backtestSessions.id, config.sessionId));
  } finally {
    runningTasks.delete(config.sessionId);
  }
}

export function isBacktestRunning(sessionId: number): boolean {
  return runningTasks.get(sessionId) === true;
}

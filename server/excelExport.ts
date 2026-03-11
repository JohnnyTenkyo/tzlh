/**
 * Excel 导出功能
 */

import XLSX from "xlsx";
import { BacktestSession, BacktestTrade } from "../drizzle/schema";

export interface ExportData {
  session: BacktestSession;
  trades: BacktestTrade[];
}

/**
 * 生成 Excel 文件
 * @param data 回测数据
 * @returns Excel 文件的 Buffer
 */
export function generateExcel(data: ExportData): Buffer {
  const workbook = XLSX.utils.book_new();

  // 1. 回测摘要页
  const summaryData = [
    ["回测摘要"],
    [],
    ["指标", "数值"],
    ["初始资金", data.session.initialBalance],
    ["最终资金", data.session.finalBalance],
    ["总收益率 (%)", data.session.totalReturn],
    ["最大回撤 (%)", data.session.maxDrawdown],
    ["总交易数", data.session.totalTrades],
    ["胜利交易", data.session.winTrades],
    ["失败交易", data.session.lossTrades],
    ["胜率 (%)", data.session.winTrades && data.session.totalTrades 
      ? ((data.session.winTrades / data.session.totalTrades) * 100).toFixed(2) 
      : "0"],
    ["平均收益率 (%)", data.session.avgReturn],
    ["夏普比率", data.session.sharpeRatio],
    ["最大单笔盈利 ($)", data.session.maxProfit],
    ["最大单笔亏损 ($)", data.session.maxLoss],
    ["平均盈利 (%)", data.session.avgProfit],
    ["平均亏损 (%)", data.session.avgLoss],
    ["最大连续胜利", data.session.maxConsecutiveWin],
    ["最大连续失败", data.session.maxConsecutiveLoss],
    ["总手续费 ($)", data.session.totalFees],
    ["QQQ 基准收益率 (%)", data.session.benchmarkQQQReturn],
    ["SPY 基准收益率 (%)", data.session.benchmarkSPYReturn],
    ["回测周期", `${data.session.startDate} 至 ${data.session.endDate}`],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "摘要");

  // 2. 交易记录页
  const tradeHeaders = [
    "交易类型",
    "股票代码",
    "交易日期",
    "数量",
    "价格",
    "交易金额",
    "信号级别",
    "信号类型",
    "卖出原因",
    "盈亏 ($)",
    "盈亏率 (%)",
  ];

  const tradeData = data.trades.map((trade) => [
    trade.type,
    trade.symbol,
    trade.tradeDate,
    parseFloat(trade.quantity as string),
    parseFloat(trade.price as string),
    parseFloat(trade.amount as string),
    trade.signalTimeframe,
    trade.signalType,
    trade.reason || "",
    parseFloat(trade.pnl as string),
    parseFloat(trade.pnlPercent as string),
  ]);

  const tradeSheet = XLSX.utils.aoa_to_sheet([tradeHeaders, ...tradeData]);
  XLSX.utils.book_append_sheet(workbook, tradeSheet, "交易记录");

  // 3. 资产净值曲线页
  const equityCurve = data.session.equityCurve 
    ? JSON.parse(data.session.equityCurve as string) 
    : [];

  const equityHeaders = ["日期", "资产净值 ($)"];
  const equityData = equityCurve.map((point: { date: string; value: number }) => [
    point.date,
    point.value,
  ]);

  const equitySheet = XLSX.utils.aoa_to_sheet([equityHeaders, ...equityData]);
  XLSX.utils.book_append_sheet(workbook, equitySheet, "资产净值曲线");

  // 生成 Buffer
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  return buffer as Buffer;
}

/**
 * 历史数据回测测试：验证系统能否产生买卖信号
 * 使用 2024 年 3 月-4 月的 TSLA 数据（这个时期有明确的上升趋势）
 */

import { getDb } from "./db";
import { backtestSessions } from "../drizzle/schema";
import { runBacktest } from "./backtestEngine";
import { eq } from "drizzle-orm";

async function testHistoricalBacktest() {
  const db = await getDb();
  if (!db) {
    console.error("数据库连接失败");
    return;
  }

  console.log("=== 历史数据回测测试 ===\n");
  console.log("使用 2024 年 3 月-4 月的 TSLA 数据（有明确上升趋势）\n");

  // 创建回测会话
  const result = await db.insert(backtestSessions).values({
    localUserId: 1,
    name: "历史数据测试 - TSLA 2024.03-04",
    initialBalance: "100000",
    startDate: "2024-03-01",
    endDate: "2024-04-30",
    marketCapFilter: "100b" as any,
    cdSignalTimeframes: JSON.stringify(["1d"]),
    cdLookbackBars: 10,
    ladderBreakTimeframes: JSON.stringify(["30m"]),
    customStocks: JSON.stringify(["TSLA"]),
    strategy: "standard",
    status: "pending",
  });

  const sessionId = (result[0] as any).insertId;
  console.log(`创建回测会话: ID=${sessionId}`);
  console.log(`时间范围: 2024-03-01 到 2024-04-30`);
  console.log(`股票: TSLA`);
  console.log(`策略: 标准策略（蓝梯突破黄梯）\n`);

  // 运行回测
  console.log("正在运行回测...\n");
  await runBacktest({
    sessionId,
    initialBalance: 100000,
    startDate: "2024-03-01",
    endDate: "2024-04-30",
    marketCapFilter: "all" as any,
    cdSignalTimeframes: ["1d"],
    cdLookbackBars: 10,
    ladderBreakTimeframes: ["30m"],
    customStocks: ["TSLA"],
    strategy: "standard" as const,
  });

  // 查询结果
  const session = await db.select().from(backtestSessions).where(eq(backtestSessions.id, sessionId)).then(r => r[0]);

  console.log("\n=== 回测结果 ===");
  console.log(`状态: ${session?.status}`);
  console.log(`最终资产: $${session?.finalBalance}`);
  console.log(`总收益率: ${session?.totalReturn}%`);
  console.log(`最大回撤: ${session?.maxDrawdown}%`);
  console.log(`总交易数: ${session?.totalTrades}`);
  console.log(`盈利交易: ${session?.winTrades}`);
  console.log(`亏损交易: ${session?.lossTrades}`);

  if ((session?.totalTrades || 0) === 0) {
    console.log("\n⚠️  仍然没有交易信号");
    console.log("这可能说明：");
    console.log("1. 2024 年 3 月-4 月的 TSLA 也不符合策略条件");
    console.log("2. 或者信号检测逻辑有问题");
  } else {
    console.log("\n✓ 成功产生交易信号！系统工作正常");
  }
}

testHistoricalBacktest().catch(console.error);

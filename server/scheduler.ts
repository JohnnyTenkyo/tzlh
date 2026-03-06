/**
 * 定时扫描调度器
 * 在美东时间 9:00 和 12:30 自动触发股票扫描
 * 美东时间 = UTC-5（标准时间）或 UTC-4（夏令时）
 * 对应 UTC 时间：14:00 / 17:30（标准时间）或 13:00 / 16:30（夏令时）
 * 为了覆盖两种情况，我们使用 UTC 13:00 和 16:30 作为触发时间
 * （实际上美股开盘为 9:30 ET，这里提前30分钟扫描）
 */
import cron from "node-cron";
import { runDailyScan, getScanStatus, getTodayRecommendations } from "./screener";
import { notifyOwner } from "./_core/notification";

let schedulerStarted = false;

export function startScheduler() {
  if (schedulerStarted) {
    console.log("[Scheduler] Already started, skipping...");
    return;
  }
  schedulerStarted = true;

  console.log("[Scheduler] Starting scheduled stock scanner...");

  // 美东 9:00 = UTC 14:00（标准时间）/ UTC 13:00（夏令时）
  // 使用 UTC 13:00 触发（覆盖夏令时，标准时间为 8:00 ET，提前1小时）
  // 更精确：使用 UTC 14:00（标准时间 9:00 ET）
  // 实际部署时服务器时区为 UTC，所以直接用 UTC 时间
  
  // 方案：同时在 UTC 13:00 和 14:00 触发，确保两种时区都能覆盖
  // 美东 9:00 ET：UTC 13:00（夏令时 EDT）或 UTC 14:00（标准时间 EST）
  // 美东 12:30 ET：UTC 16:30（夏令时 EDT）或 UTC 17:30（标准时间 EST）

  // 早盘扫描：UTC 13:00 和 14:00（覆盖 ET 9:00 夏令时/标准时间）
  cron.schedule("0 0 13 * * 1-5", async () => {
    console.log("[Scheduler] Morning scan triggered (UTC 13:00 / EDT 9:00)");
    await triggerScan("morning");
  }, { timezone: "UTC" });

  cron.schedule("0 0 14 * * 1-5", async () => {
    console.log("[Scheduler] Morning scan triggered (UTC 14:00 / EST 9:00)");
    await triggerScan("morning");
  }, { timezone: "UTC" });

  // 午盘扫描：UTC 16:30 和 17:30（覆盖 ET 12:30 夏令时/标准时间）
  cron.schedule("0 30 16 * * 1-5", async () => {
    console.log("[Scheduler] Midday scan triggered (UTC 16:30 / EDT 12:30)");
    await triggerScan("midday");
  }, { timezone: "UTC" });

  cron.schedule("0 30 17 * * 1-5", async () => {
    console.log("[Scheduler] Midday scan triggered (UTC 17:30 / EST 12:30)");
    await triggerScan("midday");
  }, { timezone: "UTC" });

  console.log("[Scheduler] Scheduled tasks registered:");
  console.log("  - Morning scan: UTC 13:00 & 14:00 (Mon-Fri) → ET 9:00");
  console.log("  - Midday scan: UTC 16:30 & 17:30 (Mon-Fri) → ET 12:30");
}

async function triggerScan(type: "morning" | "midday") {
  const status = getScanStatus();
  if (status.isScanning) {
    console.log(`[Scheduler] ${type} scan skipped: already scanning`);
    return;
  }

  const scanLabel = type === "morning" ? "早盘" : "午盘";
  console.log(`[Scheduler] Starting ${type} scan...`);
  try {
    const scanResults = await runDailyScan(true);
    console.log(`[Scheduler] ${type} scan completed successfully`);

    // 获取扫描结果并推送通知
    const results = scanResults || [];
    const validResults = results.filter((r: any) => r.totalScore > 0);
    const topStock = validResults.length > 0 ? validResults[0] : null;

    const title = `量化回测系统 - ${scanLabel}扫描完成`;
    let content = `时间：${new Date().toLocaleString("zh-CN", { timeZone: "America/New_York" })} (美东)
`;
    content += `扫描股票数：${results.length} 只
`;
    content += `有效信号：${validResults.length} 只
`;
    if (topStock) {
      content += `最高分：${topStock.symbol} (${topStock.totalScore}分) - ${topStock.matchLevel || ""}
`;
      content += `推荐理由：${topStock.reason || ""}
`;
    }
    if (validResults.length > 1) {
      content += `其他推荐：${validResults.slice(1, 5).map((r: any) => `${r.symbol}(${r.totalScore}分)`).join(", ")}`;
    }

    await notifyOwner({ title, content });
    console.log(`[Scheduler] Notification sent: ${validResults.length} valid signals found`);
  } catch (err) {
    console.error(`[Scheduler] ${type} scan failed:`, err);
  }
}

export function getSchedulerStatus() {
  return {
    started: schedulerStarted,
    nextMorningScan: "美东时间 9:00 (周一至周五)",
    nextMiddayScan: "美东时间 12:30 (周一至周五)",
  };
}

#!/usr/bin/env node

/**
 * 批量缓存所有股票的 5 年历史 K 线数据
 * 运行方式: node cache-all-stocks.mjs
 */

import { fileURLToPath } from "url";
import { dirname } from "path";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 所有股票列表（从 screener.ts 中获取）
const STOCK_SYMBOLS = [
  "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "ASML", "NFLX",
  "ADBE", "CSCO", "INTC", "AMD", "CRM", "INTU", "QCOM", "AMAT", "LRCX", "MCHP",
  "SNPS", "CDNS", "KLAC", "CRWD", "PALO", "OKTA", "DDOG", "NET", "SNOW", "DUOL",
  "S", "ZS", "PANW", "SSNC", "VEEX", "ESTC", "SPLK", "WDAY", "NTNX", "DKNG",
  "RBLX", "ROKU", "PINS", "SNAP", "UBER", "LYFT", "DASH", "COIN", "MSTR", "RIOT",
  "MARA", "CLSK", "MARA", "RIOT", "CLSK", "GEVO", "PLUG", "FCEL", "BLNK", "LCID",
  "RIVN", "NIO", "XPEV", "LI", "BABA", "PDD", "BILI", "MOMO", "IQ", "DIDI",
  "BIDU", "NTES", "TCEHY", "ASHR", "KWEB", "CQQQ", "YINN", "YANG", "SQQQ", "QQQ",
  "SPY", "IVV", "VOO", "VTI", "VEA", "VWO", "BND", "BLV", "AGG", "LQD",
  "HYG", "JNK", "VCIT", "VCSH", "VGIT", "VGSH", "VGSLX", "VBTLX", "VTIAX", "VXUS",
  // 添加更多股票...
];

// 从 screener.ts 中导入完整的股票列表
async function getFullStockList() {
  try {
    // 这里应该从数据库或配置中读取完整的股票列表
    // 为了演示，我们使用一个简化的列表
    return STOCK_SYMBOLS;
  } catch (error) {
    console.error("Failed to get stock list:", error);
    return STOCK_SYMBOLS;
  }
}

/**
 * 运行缓存脚本
 */
async function runCacheScript() {
  console.log("🚀 Starting historical K-line cache for all stocks...");
  console.log(`📊 Total stocks to cache: ${STOCK_SYMBOLS.length}`);
  console.log("⏱️  This may take several hours depending on API rate limits\n");

  const stocks = await getFullStockList();
  let successCount = 0;
  let failureCount = 0;
  const startTime = Date.now();

  // 逐个缓存股票（避免 API 限流）
  for (let i = 0; i < stocks.length; i++) {
    const symbol = stocks[i];
    const progress = `[${i + 1}/${stocks.length}]`;

    try {
      console.log(`${progress} Caching ${symbol}...`);

      // 运行 TypeScript 脚本来缓存单个股票
      await runCacheStockScript(symbol);
      successCount++;

      // 添加延迟以避免 API 限流（每个股票之间 2 秒）
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`${progress} ❌ Failed to cache ${symbol}:`, error.message);
      failureCount++;

      // 失败后等待更长时间再继续
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  console.log(`\n✅ Cache completed in ${duration} minutes`);
  console.log(`📈 Success: ${successCount}, Failure: ${failureCount}`);
}

/**
 * 运行单个股票的缓存脚本
 */
function runCacheStockScript(symbol) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", "scripts/cache-single-stock.ts", symbol], {
      cwd: __dirname,
      stdio: "pipe",
    });

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Process exited with code ${code}: ${errorOutput}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

// 运行脚本
runCacheScript().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

import {
  bigint,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow (Manus OAuth).
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Local users table - simple username/password auth
 */
export const localUsers = mysqlTable("local_users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  name: varchar("name", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow(),
});

export type LocalUser = typeof localUsers.$inferSelect;
export type InsertLocalUser = typeof localUsers.$inferInsert;

/**
 * Daily stock recommendations cache
 */
export const stockRecommendations = mysqlTable("stock_recommendations", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  totalScore: decimal("totalScore", { precision: 8, scale: 2 }).notNull(),
  matchLevel: varchar("matchLevel", { length: 20 }).default("4h"), // 4h/3h/2h/1h
  cdSignalLevels: text("cdSignalLevels"), // JSON: which levels triggered CD signal
  ladderBreakLevel: varchar("ladderBreakLevel", { length: 20 }), // which level blue ladder broke yellow
  price: decimal("price", { precision: 16, scale: 4 }),
  changePercent: decimal("changePercent", { precision: 10, scale: 4 }),
  reason: text("reason"),
  details: text("details"), // JSON: detailed score breakdown
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockRecommendation = typeof stockRecommendations.$inferSelect;
export type InsertStockRecommendation = typeof stockRecommendations.$inferInsert;

/**
 * Backtest sessions (archives)
 */
export const backtestSessions = mysqlTable("backtest_sessions", {
  id: int("id").autoincrement().primaryKey(),
  localUserId: int("localUserId").notNull().references(() => localUsers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),

  // Initial config
  initialBalance: decimal("initialBalance", { precision: 16, scale: 2 }).notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(), // YYYY-MM-DD
  endDate: varchar("endDate", { length: 10 }).notNull(), // YYYY-MM-DD

  // Market cap filter
  marketCapFilter: mysqlEnum("marketCapFilter", [
    "none", "1b", "10b", "50b", "100b", "500b"
  ]).default("none").notNull(),

  // CD signal config (JSON array of timeframes)
  cdSignalTimeframes: text("cdSignalTimeframes").notNull(), // JSON: ["4h","3h","2h","1h"]
  cdLookbackBars: int("cdLookbackBars").default(5).notNull(), // 1-30

  // Ladder breakout config (JSON array of timeframes)
  ladderBreakTimeframes: text("ladderBreakTimeframes").notNull(), // JSON: ["30m"]

  // Custom stocks (JSON array of symbols, null = use full pool)
  customStocks: text("customStocks"), // JSON: ["NVDA","AAPL"] or null

  // Strategy type
  strategy: mysqlEnum("strategy", ["standard", "aggressive"]).default("standard").notNull(),

  // Results
  finalBalance: decimal("finalBalance", { precision: 16, scale: 2 }),
  totalReturn: decimal("totalReturn", { precision: 10, scale: 4 }), // percent
  maxDrawdown: decimal("maxDrawdown", { precision: 10, scale: 4 }), // percent
  totalTrades: int("totalTrades").default(0),
  winTrades: int("winTrades").default(0),
  lossTrades: int("lossTrades").default(0),
  benchmarkQQQReturn: decimal("benchmarkQQQReturn", { precision: 10, scale: 4 }),
  benchmarkSPYReturn: decimal("benchmarkSPYReturn", { precision: 10, scale: 4 }),

  // Progress
  progress: int("progress").default(0), // 0-100
  currentDate: varchar("currentDate", { length: 10 }), // current simulation date

  // Equity curve (JSON array of {date, value})
  equityCurve: text("equityCurve"),

  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type BacktestSession = typeof backtestSessions.$inferSelect;
export type InsertBacktestSession = typeof backtestSessions.$inferInsert;

/**
 * Backtest positions (current holdings during simulation)
 */
export const backtestPositions = mysqlTable("backtest_positions", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().references(() => backtestSessions.id, { onDelete: "cascade" }),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  quantity: decimal("quantity", { precision: 16, scale: 6 }).notNull(),
  avgCost: decimal("avgCost", { precision: 16, scale: 4 }).notNull(),
  totalCost: decimal("totalCost", { precision: 16, scale: 2 }).notNull(),
  // Entry signal info
  entryTimeframe: varchar("entryTimeframe", { length: 20 }), // which timeframe triggered buy
  entryType: mysqlEnum("entryType", ["first_buy", "second_buy"]).default("first_buy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BacktestPosition = typeof backtestPositions.$inferSelect;
export type InsertBacktestPosition = typeof backtestPositions.$inferInsert;

/**
 * Backtest trades (buy/sell records)
 */
export const backtestTrades = mysqlTable("backtest_trades", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().references(() => backtestSessions.id, { onDelete: "cascade" }),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  type: mysqlEnum("type", ["buy", "sell"]).notNull(),
  quantity: decimal("quantity", { precision: 16, scale: 6 }).notNull(),
  price: decimal("price", { precision: 16, scale: 4 }).notNull(),
  amount: decimal("amount", { precision: 16, scale: 2 }).notNull(),
  tradeDate: varchar("tradeDate", { length: 10 }).notNull(), // YYYY-MM-DD
  // Signal info
  signalTimeframe: varchar("signalTimeframe", { length: 20 }), // e.g. "30m", "1h"
  signalType: varchar("signalType", { length: 64 }), // e.g. "blue_cross_yellow_first_buy"
  reason: text("reason"), // human-readable reason
  // P&L for sell trades
  pnl: decimal("pnl", { precision: 16, scale: 2 }),
  pnlPercent: decimal("pnlPercent", { precision: 10, scale: 4 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BacktestTrade = typeof backtestTrades.$inferSelect;
export type InsertBacktestTrade = typeof backtestTrades.$inferInsert;


/**
 * Historical K-line data cache
 * Stores pre-fetched historical candles for fast backtest
 */
export const historicalCandleCache = mysqlTable("historical_candle_cache", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  timeframe: varchar("timeframe", { length: 10 }).notNull(), // 1d, 4h, 1h, 30m, 15m
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  open: decimal("open", { precision: 16, scale: 4 }).notNull(),
  high: decimal("high", { precision: 16, scale: 4 }).notNull(),
  low: decimal("low", { precision: 16, scale: 4 }).notNull(),
  close: decimal("close", { precision: 16, scale: 4 }).notNull(),
  volume: bigint("volume", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricalCandleCache = typeof historicalCandleCache.$inferSelect;
export type InsertHistoricalCandleCache = typeof historicalCandleCache.$inferInsert;

/**
 * Cache metadata for tracking cache status
 */
export const cacheMetadata = mysqlTable("cache_metadata", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull().unique(),
  lastUpdated: timestamp("lastUpdated").defaultNow().onUpdateNow().notNull(),
  status: mysqlEnum("status", ["pending", "caching", "completed", "failed"]).default("pending").notNull(),
  earliestDate: varchar("earliestDate", { length: 10 }), // earliest cached date (YYYY-MM-DD)
  latestDate: varchar("latestDate", { length: 10 }), // latest cached date (YYYY-MM-DD)
  totalCandles: int("totalCandles").default(0),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CacheMetadata = typeof cacheMetadata.$inferSelect;
export type InsertCacheMetadata = typeof cacheMetadata.$inferInsert;

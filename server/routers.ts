import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  localUsers,
  backtestSessions,
  backtestTrades,
  backtestPositions,
  stockRecommendations,
} from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getTodayRecommendations, runDailyScan, getScanStatus } from "./screener";
import { getSchedulerStatus } from "./scheduler";
import { runBacktest, isBacktestRunning } from "./backtestEngine";
import { calculateLadder } from "./indicators";
import type { Timeframe } from "./indicators";
import { fetchHistoricalCandles } from "./marketData";

const JWT_SECRET = process.env.JWT_SECRET || "quant-backtest-secret-key";

// ============ 认证辅助 ============
function verifyToken(token: string): { userId: number; username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

function getLocalUser(ctx: any): { userId: number; username: string } | null {
  const auth = ctx.req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.substring(7));
}

// ============ 主路由 ============
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ 本地认证 ============
  localAuth: router({
    register: publicProcedure
      .input(z.object({ username: z.string().min(2).max(32), password: z.string().min(4) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false, error: "数据库不可用" };

        const existing = await db.select().from(localUsers)
          .where(eq(localUsers.username, input.username)).limit(1);
        if (existing.length > 0) return { success: false, error: "用户名已存在" };

        const passwordHash = await bcrypt.hash(input.password, 10);
        const result = await db.insert(localUsers).values({
          username: input.username,
          passwordHash,
          name: input.username,
        });
        const userId = (result[0] as any).insertId;
        const token = jwt.sign({ userId, username: input.username }, JWT_SECRET, { expiresIn: "30d" });
        return { success: true, token, user: { id: userId, username: input.username, name: input.username } };
      }),

    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false, error: "数据库不可用" };

        const users = await db.select().from(localUsers)
          .where(eq(localUsers.username, input.username)).limit(1);
        if (users.length === 0) return { success: false, error: "用户名或密码错误" };

        const user = users[0];
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) return { success: false, error: "用户名或密码错误" };

        await db.update(localUsers).set({ lastSignedIn: new Date() }).where(eq(localUsers.id, user.id));
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
        return { success: true, token, user: { id: user.id, username: user.username, name: user.name || user.username } };
      }),

    changePassword: publicProcedure
      .input(z.object({ oldPassword: z.string(), newPassword: z.string().min(4) }))
      .mutation(async ({ input, ctx }) => {
        const localUser = getLocalUser(ctx);
        if (!localUser) return { success: false, error: "未登录" };

        const db = await getDb();
        if (!db) return { success: false, error: "数据库不可用" };

        const users = await db.select().from(localUsers)
          .where(eq(localUsers.id, localUser.userId)).limit(1);
        if (users.length === 0) return { success: false, error: "用户不存在" };

        const valid = await bcrypt.compare(input.oldPassword, users[0].passwordHash);
        if (!valid) return { success: false, error: "旧密码错误" };

        const newHash = await bcrypt.hash(input.newPassword, 10);
        await db.update(localUsers).set({ passwordHash: newHash }).where(eq(localUsers.id, localUser.userId));
        return { success: true };
      }),

    me: publicProcedure.query(async ({ ctx }) => {
      const localUser = getLocalUser(ctx);
      if (!localUser) return null;
      const db = await getDb();
      if (!db) return null;
      const users = await db.select().from(localUsers)
        .where(eq(localUsers.id, localUser.userId)).limit(1);
      if (users.length === 0) return null;
      return { id: users[0].id, username: users[0].username, name: users[0].name };
    }),
  }),

  // ============ 股票推荐 ============
  screener: router({
    getTodayRecommendations: publicProcedure.query(async () => {
      const { results, fromCache, scanDate } = await getTodayRecommendations();
      return { results, fromCache, scanDate };
    }),

    triggerScan: publicProcedure.mutation(async () => {
      // 异步触发，不等待完成
      runDailyScan(true).catch(err => console.error("[Screener] Scan error:", err));
      return { success: true, message: "扫描已启动，请稍后刷新查看结果" };
    }),

    getStatus: publicProcedure.query(() => {
      const scanStatus = getScanStatus();
      const schedulerStatus = getSchedulerStatus();
      return { ...scanStatus, scheduler: schedulerStatus };
    }),
  }),

  // ============ 回测系统 ============
  backtest: router({
    // 获取存档列表
    getSessions: publicProcedure.query(async ({ ctx }) => {
      const localUser = getLocalUser(ctx);
      if (!localUser) return { success: false, error: "未登录", sessions: [] };

      const db = await getDb();
      if (!db) return { success: false, error: "数据库不可用", sessions: [] };

      const sessions = await db.select().from(backtestSessions)
        .where(eq(backtestSessions.localUserId, localUser.userId))
        .orderBy(desc(backtestSessions.createdAt));

      return { success: true, sessions };
    }),

    // 创建存档
    createSession: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        initialBalance: z.number().min(1000).max(10000000),
        startDate: z.string(),
        endDate: z.string(),
        marketCapFilter: z.enum(["none", "1b", "10b", "50b", "100b", "500b"]),
        cdSignalTimeframes: z.array(z.string()).min(1),
        cdLookbackBars: z.number().min(1).max(30),
        ladderBreakTimeframes: z.array(z.string()).min(1),
        customStocks: z.array(z.string()).optional(),
        strategy: z.enum(["standard", "aggressive"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const localUser = getLocalUser(ctx);
        if (!localUser) return { success: false, error: "未登录" };

        const db = await getDb();
        if (!db) return { success: false, error: "数据库不可用" };

        const cleanCustomStocks = input.customStocks && input.customStocks.length > 0
          ? input.customStocks.map(s => s.toUpperCase().trim()).filter(Boolean)
          : null;

        const result = await db.insert(backtestSessions).values({
          localUserId: localUser.userId,
          name: input.name,
          initialBalance: String(input.initialBalance),
          startDate: input.startDate,
          endDate: input.endDate,
          marketCapFilter: input.marketCapFilter,
          cdSignalTimeframes: JSON.stringify(input.cdSignalTimeframes),
          cdLookbackBars: input.cdLookbackBars,
          ladderBreakTimeframes: JSON.stringify(input.ladderBreakTimeframes),
          customStocks: cleanCustomStocks ? JSON.stringify(cleanCustomStocks) : null,
          strategy: input.strategy || "standard",
          status: "pending",
        });

        const sessionId = (result[0] as any).insertId;

        // 异步启动回测
        setTimeout(() => {
          runBacktest({
            sessionId,
            initialBalance: input.initialBalance,
            startDate: input.startDate,
            endDate: input.endDate,
            marketCapFilter: input.marketCapFilter as any,
            cdSignalTimeframes: input.cdSignalTimeframes as Timeframe[],
            cdLookbackBars: input.cdLookbackBars,
            ladderBreakTimeframes: input.ladderBreakTimeframes as Timeframe[],
            customStocks: cleanCustomStocks || undefined,
            strategy: (input.strategy || "standard") as "standard" | "aggressive",
          }).catch(err => console.error("[Backtest] Error:", err));
        }, 100);

        return { success: true, sessionId };
      }),

    // 获取单个存档详情
    getSession: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const localUser = getLocalUser(ctx);
        if (!localUser) return { success: false, error: "未登录" };

        const db = await getDb();
        if (!db) return { success: false, error: "数据库不可用" };

        const sessions = await db.select().from(backtestSessions)
          .where(and(
            eq(backtestSessions.id, input.id),
            eq(backtestSessions.localUserId, localUser.userId)
          )).limit(1);

        if (sessions.length === 0) return { success: false, error: "存档不存在" };

        const session = sessions[0];
        const trades = await db.select().from(backtestTrades)
          .where(eq(backtestTrades.sessionId, input.id))
          .orderBy(desc(backtestTrades.createdAt));

        return {
          success: true,
          session,
          trades,
          isRunning: isBacktestRunning(input.id),
        };
      }),

    // 删除存档
    deleteSession: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const localUser = getLocalUser(ctx);
        if (!localUser) return { success: false, error: "未登录" };

        const db = await getDb();
        if (!db) return { success: false, error: "数据库不可用" };

        await db.delete(backtestSessions)
          .where(and(
            eq(backtestSessions.id, input.id),
            eq(backtestSessions.localUserId, localUser.userId)
          ));

        return { success: true };
      }),

    // 横向对比多个存档
    compareSessions: publicProcedure
      .input(z.object({ ids: z.array(z.number()).min(2).max(10) }))
      .query(async ({ input, ctx }) => {
        const localUser = getLocalUser(ctx);
        if (!localUser) return { success: false, error: "未登录", sessions: [] };

        const db = await getDb();
        if (!db) return { success: false, error: "数据库不可用", sessions: [] };

        const sessions = await db.select().from(backtestSessions)
          .where(and(
            inArray(backtestSessions.id, input.ids),
            eq(backtestSessions.localUserId, localUser.userId)
          ));

        return { success: true, sessions };
      }),
  }),

  // ============ K线图数据 ============
  chart: router({
    getCandles: publicProcedure
      .input(z.object({
        symbol: z.string(),
        timeframe: z.string().default("1d"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const tf = input.timeframe as Timeframe;
        const endDate = input.endDate || new Date().toISOString().split("T")[0];
        const startDate = input.startDate || (() => {
          const d = new Date();
          d.setFullYear(d.getFullYear() - 1);
          return d.toISOString().split("T")[0];
        })();

        const candles = await fetchHistoricalCandles(input.symbol, tf, startDate, endDate);
        if (candles.length === 0) return { candles: [], blueUp: [], blueDn: [], yellowUp: [], yellowDn: [] };

        // 计算黄蓝梯子指标
        const ladder = calculateLadder(candles);
        const blueUp = candles.map((c, i) => ({ time: c.time, value: ladder.blueUp[i] ?? 0 })).filter(v => v.value > 0);
        const blueDn = candles.map((c, i) => ({ time: c.time, value: ladder.blueDn[i] ?? 0 })).filter(v => v.value > 0);
        const yellowUp = candles.map((c, i) => ({ time: c.time, value: ladder.yellowUp[i] ?? 0 })).filter(v => v.value > 0);
        const yellowDn = candles.map((c, i) => ({ time: c.time, value: ladder.yellowDn[i] ?? 0 })).filter(v => v.value > 0);

        return { candles, blueUp, blueDn, yellowUp, yellowDn };
      }),
  }),
});

export type AppRouter = typeof appRouter;

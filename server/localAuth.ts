/**
 * 本地用户认证路由
 * 简易用户名/密码登录，不依赖OAuth
 */
import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "./db";
import { localUsers } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "quant-backtest-secret-key";
const TOKEN_EXPIRY = "30d";

export const localAuthRouter = Router();

// ============ 注册 ============
localAuthRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ success: false, error: "用户名和密码不能为空" });
    }
    if (username.length < 2 || username.length > 32) {
      return res.json({ success: false, error: "用户名长度需2-32位" });
    }
    if (password.length < 4) {
      return res.json({ success: false, error: "密码至少4位" });
    }

    const db = await getDb();
    if (!db) return res.json({ success: false, error: "数据库不可用" });

    const existing = await db.select().from(localUsers)
      .where(eq(localUsers.username, username)).limit(1);
    if (existing.length > 0) {
      return res.json({ success: false, error: "用户名已存在" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.insert(localUsers).values({
      username,
      passwordHash,
      name: username,
    });

    const userId = (result[0] as any).insertId;
    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    return res.json({
      success: true,
      user: { id: userId, username, name: username },
      token,
    });
  } catch (err) {
    console.error("[LocalAuth] Register error:", err);
    return res.json({ success: false, error: "注册失败，请重试" });
  }
});

// ============ 登录 ============
localAuthRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ success: false, error: "用户名和密码不能为空" });
    }

    const db = await getDb();
    if (!db) return res.json({ success: false, error: "数据库不可用" });

    const users = await db.select().from(localUsers)
      .where(eq(localUsers.username, username)).limit(1);
    if (users.length === 0) {
      return res.json({ success: false, error: "用户名或密码错误" });
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.json({ success: false, error: "用户名或密码错误" });
    }

    await db.update(localUsers)
      .set({ lastSignedIn: new Date() })
      .where(eq(localUsers.id, user.id));

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    return res.json({
      success: true,
      user: { id: user.id, username: user.username, name: user.name || user.username },
      token,
    });
  } catch (err) {
    console.error("[LocalAuth] Login error:", err);
    return res.json({ success: false, error: "登录失败，请重试" });
  }
});

// ============ 修改密码（仅需旧密码） ============
localAuthRouter.post("/change-password", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.json({ success: false, error: "未登录" });
    }
    const token = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.json({ success: false, error: "登录已过期，请重新登录" });
    }

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.json({ success: false, error: "请填写旧密码和新密码" });
    }
    if (newPassword.length < 4) {
      return res.json({ success: false, error: "新密码至少4位" });
    }

    const db = await getDb();
    if (!db) return res.json({ success: false, error: "数据库不可用" });

    const users = await db.select().from(localUsers)
      .where(eq(localUsers.id, decoded.userId)).limit(1);
    if (users.length === 0) {
      return res.json({ success: false, error: "用户不存在" });
    }

    const user = users[0];
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) {
      return res.json({ success: false, error: "旧密码错误" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.update(localUsers)
      .set({ passwordHash: newHash })
      .where(eq(localUsers.id, user.id));

    return res.json({ success: true });
  } catch (err) {
    console.error("[LocalAuth] Change password error:", err);
    return res.json({ success: false, error: "修改密码失败" });
  }
});

// ============ 验证Token（中间件） ============
export function verifyLocalToken(token: string): { userId: number; username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

export function requireLocalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "未登录" });
  }
  const token = authHeader.substring(7);
  const decoded = verifyLocalToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: "登录已过期" });
  }
  (req as any).localUser = decoded;
  next();
}

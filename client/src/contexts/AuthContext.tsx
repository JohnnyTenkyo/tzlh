import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";

interface LocalUser {
  id: number;
  username: string;
  name: string | null;
}

interface AuthContextType {
  user: LocalUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loginMutation = trpc.localAuth.login.useMutation();
  const registerMutation = trpc.localAuth.register.useMutation();
  const changePasswordMutation = trpc.localAuth.changePassword.useMutation();

  // 从localStorage恢复登录状态
  useEffect(() => {
    const savedToken = localStorage.getItem("quant_token");
    const savedUser = localStorage.getItem("quant_user");
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("quant_token");
        localStorage.removeItem("quant_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const result = await loginMutation.mutateAsync({ username, password });
      if (result.success && result.token) {
        setToken(result.token);
        setUser(result.user as LocalUser);
        localStorage.setItem("quant_token", result.token);
        localStorage.setItem("quant_user", JSON.stringify(result.user));
        return { success: true };
      }
      return { success: false, error: result.error || "登录失败" };
    } catch (err: any) {
      return { success: false, error: err.message || "登录失败" };
    }
  }, [loginMutation]);

  const register = useCallback(async (username: string, password: string) => {
    try {
      const result = await registerMutation.mutateAsync({ username, password });
      if (result.success && result.token) {
        setToken(result.token);
        setUser(result.user as LocalUser);
        localStorage.setItem("quant_token", result.token);
        localStorage.setItem("quant_user", JSON.stringify(result.user));
        return { success: true };
      }
      return { success: false, error: result.error || "注册失败" };
    } catch (err: any) {
      return { success: false, error: err.message || "注册失败" };
    }
  }, [registerMutation]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("quant_token");
    localStorage.removeItem("quant_user");
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    try {
      const result = await changePasswordMutation.mutateAsync({ oldPassword, newPassword });
      if (result.success) return { success: true };
      return { success: false, error: result.error || "修改失败" };
    } catch (err: any) {
      return { success: false, error: err.message || "修改失败" };
    }
  }, [changePasswordMutation]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useLocalAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useLocalAuth must be used within AuthProvider");
  return ctx;
}

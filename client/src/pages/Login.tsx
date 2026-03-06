import { useState } from "react";
import { useLocation } from "wouter";
import { useLocalAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Activity, TrendingUp, BarChart2 } from "lucide-react";

export default function Login() {
  const { login, register, user } = useLocalAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // 已登录则跳转
  if (user) {
    navigate("/");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("请填写用户名和密码");
      return;
    }
    setLoading(true);
    const result = mode === "login"
      ? await login(username, password)
      : await register(username, password);
    setLoading(false);

    if (result.success) {
      toast.success(mode === "login" ? "登录成功" : "注册成功");
      navigate("/");
    } else {
      toast.error(result.error || "操作失败");
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex flex-col justify-center items-center flex-1 bg-card border-r border-border p-12">
        <div className="max-w-md space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Activity size={24} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">量化回测系统</h1>
              <p className="text-sm text-muted-foreground">黄蓝梯子策略 · CD抄底指标</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10">
              <TrendingUp size={20} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">4321打法</p>
                <p className="text-xs text-muted-foreground mt-1">
                  4h/3h/2h/1h多级别CD抄底信号 + 30分钟蓝梯突破黄梯，自动评分推荐
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10">
              <BarChart2 size={20} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">自动回测引擎</p>
                <p className="text-xs text-muted-foreground mt-1">
                  按指标信号自动买卖，生成详细报告，与QQQ/SPY对比收益
                </p>
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground border-t border-border pt-4">
            <p className="font-medium text-foreground mb-1">价值2万的核心原则</p>
            <p>蓝色梯子在黄色梯子上方，大趋势上涨概率大</p>
            <p>蜡烛图在蓝色梯子上方，不跌破蓝梯下边缘不卖出</p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm bg-card border-border">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">
              {mode === "login" ? "登录账户" : "创建账户"}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              {mode === "login"
                ? "输入用户名和密码登录"
                : "创建新账户开始使用"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm">用户名</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="2-32位字符"
                  className="bg-input border-border"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm">密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="至少4位"
                  className="bg-input border-border"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {mode === "login" ? "没有账户？点击注册" : "已有账户？点击登录"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

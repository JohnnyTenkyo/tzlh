import { useLocalAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import {
  TrendingUp,
  BarChart2,
  Home,
  User,
  LogOut,
  Key,
  ChevronDown,
  GitCompare,
  Activity,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { changePassword } = useLocalAuth();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPw || !newPw) return;
    setLoading(true);
    const result = await changePassword(oldPw, newPw);
    setLoading(false);
    if (result.success) {
      toast.success("密码修改成功");
      onClose();
    } else {
      toast.error(result.error || "修改失败");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="oldPw">旧密码</Label>
        <Input
          id="oldPw"
          type="password"
          value={oldPw}
          onChange={e => setOldPw(e.target.value)}
          placeholder="输入旧密码"
          className="bg-input border-border"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPw">新密码</Label>
        <Input
          id="newPw"
          type="password"
          value={newPw}
          onChange={e => setNewPw(e.target.value)}
          placeholder="输入新密码（至少4位）"
          className="bg-input border-border"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "修改中..." : "确认修改"}
      </Button>
    </form>
  );
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useLocalAuth();
  const [location, navigate] = useLocation();
  const [pwDialogOpen, setPwDialogOpen] = useState(false);

  const navItems = [
    { path: "/", label: "今日推荐", icon: Home },
    { path: "/backtest", label: "回测系统", icon: BarChart2 },
    { path: "/compare", label: "横向对比", icon: GitCompare },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Activity size={16} className="text-primary" />
            </div>
            <span className="font-bold text-foreground text-sm hidden sm:block">量化回测系统</span>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = location === item.path;
              return (
                <Button
                  key={item.path}
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(item.path)}
                  className={`gap-1.5 text-xs ${isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Button>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-2">
            {user ? (
              <Dialog open={pwDialogOpen} onOpenChange={setPwDialogOpen}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <User size={14} />
                      <span className="hidden sm:inline">{user.name || user.username}</span>
                      <ChevronDown size={12} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border">
                    <DropdownMenuItem className="text-muted-foreground text-xs">
                      {user.username}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border" />
                    <DialogTrigger asChild>
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <Key size={13} />
                        修改密码
                      </DropdownMenuItem>
                    </DialogTrigger>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem
                      className="gap-2 text-destructive cursor-pointer"
                      onClick={logout}
                    >
                      <LogOut size={13} />
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DialogContent className="bg-card border-border max-w-sm">
                  <DialogHeader>
                    <DialogTitle>修改密码</DialogTitle>
                  </DialogHeader>
                  <ChangePasswordDialog onClose={() => setPwDialogOpen(false)} />
                </DialogContent>
              </Dialog>
            ) : (
              <Button size="sm" onClick={() => navigate("/login")} className="text-xs">
                登录
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        量化回测系统 · 黄蓝梯子策略 · 仅供学习参考，不构成投资建议
      </footer>
    </div>
  );
}

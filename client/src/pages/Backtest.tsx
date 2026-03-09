"use client";

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Trash2, BarChart2, Clock, DollarSign,
  TrendingUp, TrendingDown, Loader2, ChevronRight,
  CheckSquare, Square, AlertCircle
} from "lucide-react";
import { TIMEFRAME_LABELS, MARKET_CAP_LABELS } from "@shared/stockPool";

const TIMEFRAMES = ["1w", "1d", "4h", "3h", "2h", "1h", "30m", "15m"] as const;
const MARKET_CAP_OPTIONS = ["none", "1b", "10b", "50b", "100b", "500b"] as const;

function MultiSelect({
  options,
  selected,
  onChange,
  labels,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (v: string[]) => void;
  labels: Record<string, string>;
}) {
  const toggle = (v: string) => {
    if (selected.includes(v)) {
      onChange(selected.filter(x => x !== v));
    } else {
      onChange([...selected, v]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const isSelected = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
              isSelected
                ? "bg-primary/20 border-primary text-primary"
                : "bg-muted border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {isSelected ? <CheckSquare size={12} /> : <Square size={12} />}
            {labels[opt] || opt}
          </button>
        );
      })}
    </div>
  );
}

function CreateBacktestDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("100000");
  const [startDate, setStartDate] = useState("2025-12-01");
  const [endDate, setEndDate] = useState("2026-03-07");
  const [marketCap, setMarketCap] = useState<string>("none");
  const [ladderTimeframe, setLadderTimeframe] = useState<string>("30m");
  const [cdScoreThreshold, setCdScoreThreshold] = useState(60);
  // 策略选择
  const [strategy, setStrategy] = useState<"standard" | "aggressive">("standard");
  // 自选股票
  const [useCustomStocks, setUseCustomStocks] = useState(false);
  const [customStocksInput, setCustomStocksInput] = useState("");
  const [customStocksList, setCustomStocksList] = useState<string[]>([]);
  // 调试模式
  const [debug, setDebug] = useState(false);
  const [debugSymbol, setDebugSymbol] = useState("");

  const handleAddCustomStock = () => {
    const symbols = customStocksInput.toUpperCase().split(/[,\s]+/).map((s: string) => s.trim()).filter((s: string) => /^[A-Z]{1,5}$/.test(s));
    const newList = Array.from(new Set([...customStocksList, ...symbols]));
    setCustomStocksList(newList);
    setCustomStocksInput("");
  };

  const createMutation = trpc.backtest.createSession.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("回测已创建并开始运行");
        setOpen(false);
        onCreated();
      } else {
        toast.error(data.error || "创建失败");
      }
    },
  });

  const handleCreate = () => {
    if (!name.trim()) { toast.error("请填写存档名称"); return; }
    if (!ladderTimeframe) { toast.error("请选择梯子级别"); return; }
    if (useCustomStocks && customStocksList.length === 0) { toast.error("请添加至少一只自选股票"); return; }

    createMutation.mutate({
      name: name.trim(),
      initialBalance: parseFloat(initialBalance) || 100000,
      startDate,
      endDate,
      marketCapFilter: marketCap as any,
      ladderTimeframe,
      cdScoreThreshold,
      strategy,
      customStocks: useCustomStocks ? customStocksList : undefined,
      debug,
      debugSymbol: debug ? debugSymbol : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus size={14} /> 新建回测
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建回测存档</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* 基本信息 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">基本配置</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">存档名称</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="如：2023年4321策略回测"
                  className="bg-input border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">初始金额（美元）</Label>
                <Input
                  type="number"
                  value={initialBalance}
                  onChange={e => setInitialBalance(e.target.value)}
                  className="bg-input border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">市值筛选</Label>
                <div className="flex flex-wrap gap-1.5">
                  {MARKET_CAP_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setMarketCap(opt)}
                      className={`px-2 py-1 rounded text-xs border transition-all ${
                        marketCap === opt
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {MARKET_CAP_LABELS[opt as keyof typeof MARKET_CAP_LABELS]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">回测开始日期</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="bg-input border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">回测结束日期</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-input border-border text-sm"
                />
              </div>
            </div>
          </div>

          {/* CD抄底分数阈值配置 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">CD抄底分数阈值</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">
                分数阈值：<span className="text-primary font-bold">{cdScoreThreshold}</span> / 100
              </Label>
              <Slider
                value={[cdScoreThreshold]}
                onValueChange={([v]) => setCdScoreThreshold(v)}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>激进 (0)</span>
                <span>保守 (100)</span>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                分数越低越激进（容易买入），分数越高越保守。
                分数由各级别CD抄底信号组成：5m=2分、15m=4分、30m=6分、1h=8分、2h=10分、3h=12分、4h=14分、1d=16分、1w=18分、1M=20分。
              </p>
            </div>
          </div>

          {/* 梯子级别配置 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">梯子级别配置</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">选择梯子级别</Label>
              <div className="grid grid-cols-4 gap-2">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setLadderTimeframe(tf)}
                    className={`px-3 py-2 rounded text-xs font-medium transition-all border ${
                      ladderTimeframe === tf
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {TIMEFRAME_LABELS[tf] || tf}
                  </button>
                ))}
              </div>
              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3 space-y-1">
                <p className="font-medium text-foreground">买入逻辑说明：</p>
                <p>• 第一买点：收盘价 &gt; 蓝梯下边缘 &rarr; 买入50%仓位</p>
                <p>• 第二买点：蓝梯下边缘 &gt; 黄梯上边缘 &rarr; 买入余下50%仓位</p>
                <p className="font-medium text-foreground mt-1">卖出逻辑说明：</p>
                <p>• 第一卖点：收盘价 &lt; 蓝梯下边缘 &rarr; 卖出50%</p>
                <p>• 第二卖点：蓝梯上边缘 &lt; 黄梯下边缘 &rarr; 卖出余下50%</p>
                <p>• 第二买点后：蓝梯在黄梯之上持有</p>
              </div>
            </div>
          </div>

          {/* 蓝梯突破配置 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">蓝梯突破黄梯配置</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">
                蓝梯突破级别
                <span className="text-muted-foreground ml-1">已选: {ladderTimeframe}</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setLadderTimeframe(tf)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                      ladderTimeframe === tf
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {TIMEFRAME_LABELS[tf] || tf}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3 space-y-1">
              <p className="font-medium text-foreground">买入逻辑说明：</p>
              <p>• 第一买点：最低级别蓝梯上边缘刚突破黄梯上边缘 → 买入50%仓位</p>
              <p>• 第二买点：蓝梯下边缘高于黄梯上边缘 → 买入余下50%仓位</p>
              <p className="font-medium text-foreground mt-1">卖出逻辑说明：</p>
              <p>• 第一卖点：上一级别K线收盘低于蓝梯下边缘 → 卖出50%</p>
              <p>• 第二卖点：当前级别蓝梯上边缘低于黄梯下边缘 → 卖出余下50%</p>
              <p>• 日线CD卖出 + 收盘跌破蓝梯下边缘 → 分批卖出</p>
            </div>
          </div>

          {/* 策略选择 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">回测策略</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStrategy("standard")}
                className={`p-3 rounded border text-left transition-all ${
                  strategy === "standard"
                    ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                    : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <div className="text-xs font-semibold mb-1">📊 标准策略</div>
                <div className="text-xs opacity-80">蓝梯突破黄梯后买入，信号更稳健，入场较慢</div>
              </button>
              <button
                type="button"
                onClick={() => setStrategy("aggressive")}
                className={`p-3 rounded border text-left transition-all ${
                  strategy === "aggressive"
                    ? "bg-orange-500/10 border-orange-500/50 text-orange-400"
                    : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <div className="text-xs font-semibold mb-1">⚡ 激进策略</div>
                <div className="text-xs opacity-80">CD信号后收盘站上蓝梯即买入，入场更快，止损更严</div>
              </button>
            </div>
            {strategy === "standard" && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3 space-y-1">
                <p className="font-medium text-foreground">标准策略逻辑：</p>
                <p>• 买入：蓝梯上边缘突破黄梯上边缘 → 买入50%；蓝梯下边缘高于黄梯上边缘 → 再买50%</p>
                <p>• 卖出：上级别收盘低于蓝梯下边缘 → 卖50%；蓝梯上边缘低于黄梯下边缘 → 卖余下50%</p>
              </div>
            )}
            {strategy === "aggressive" && (
              <div className="text-xs text-muted-foreground bg-orange-500/5 border border-orange-500/20 rounded p-3 space-y-1">
                <p className="font-medium text-orange-400">激进策略逻辑：</p>
                <p>• 买入：CD信号后30分钟收盘站上蓝梯 → 买入50%；蓝梯突破黄梯 → 加仓50%</p>
                <p>• 加仓：蓝梯回撞黄梯（未破黄梯下边缘）+ CD信号 → 绝佳加仓点</p>
                <p>• 止损：收盘跌破蓝梯下边缘 → 清仓止损</p>
                <p>• 退出：蓝梯上边缘低于黄梯下边缘 → 趋势反转，清仓</p>
              </div>
            )}
          </div>

          {/* 自选股票 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-1">
              <h3 className="text-sm font-semibold text-foreground">自选股票（可选）</h3>
              <button
                type="button"
                onClick={() => setUseCustomStocks(!useCustomStocks)}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-all ${
                  useCustomStocks
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {useCustomStocks ? <CheckSquare size={12} /> : <Square size={12} />}
                {useCustomStocks ? "已开启自选模式" : "开启自选模式"}
              </button>
            </div>
            {useCustomStocks && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">开启后仅回测自选股票，市値筛选失效。支持手动输入股票代码（多个用逗号或空格分隔）。</p>
                <div className="flex gap-2">
                  <Input
                    value={customStocksInput}
                    onChange={e => setCustomStocksInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddCustomStock()}
                    placeholder="如：NVDA, AAPL, TSLA"
                    className="bg-input border-border text-sm flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomStock}
                    className="shrink-0"
                  >
                    添加
                  </Button>
                </div>
                {customStocksList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {customStocksList.map(sym => (
                      <span
                        key={sym}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 border border-primary/30 text-primary text-xs"
                      >
                        {sym}
                        <button
                          type="button"
                          onClick={() => setCustomStocksList(customStocksList.filter(s => s !== sym))}
                          className="hover:text-red-400 transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCustomStocksList([])}
                      className="text-xs text-muted-foreground hover:text-red-400 transition-colors px-1"
                    >
                      清空
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 调试模式 */}
          <div className="space-y-3 p-3 bg-muted/50 rounded border border-border">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="debug"
                checked={debug}
                onChange={e => setDebug(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              <Label htmlFor="debug" className="text-xs font-semibold cursor-pointer">
                🐛 调试模式（输出信号检测日志）
              </Label>
            </div>
            {debug && (
              <div className="space-y-1.5">
                <Label className="text-xs">调试特定股票（可选，为空时输出所有）</Label>
                <Input
                  value={debugSymbol}
                  onChange={e => setDebugSymbol(e.target.value.toUpperCase())}
                  placeholder="如: AAPL"
                  className="bg-input border-border text-sm"
                />
              </div>
            )}
          </div>

          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? (
              <><Loader2 size={14} className="animate-spin mr-2" />创建中...</>
            ) : "创建并开始回测"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    pending: { label: "等待中", className: "bg-muted text-muted-foreground" },
    running: { label: "运行中", className: "bg-blue-500/20 text-blue-400" },
    completed: { label: "已完成", className: "bg-green-500/20 text-green-400" },
    failed: { label: "失败", className: "bg-red-500/20 text-red-400" },
  };
  const cfg = configs[status] || configs.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {status === "running" && <Loader2 size={10} className="animate-spin" />}
      {cfg.label}
    </span>
  );
}

export default function Backtest() {
  const { user } = useLocalAuth();
  const [, navigate] = useLocation();

  const { data, isLoading, refetch } = trpc.backtest.getSessions.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 10000, // 每10秒刷新一次（检查运行中的回测）
  });

  const deleteMutation = trpc.backtest.deleteSession.useMutation({
    onSuccess: () => {
      toast.success("存档已删除");
      refetch();
    },
  });

  if (!user) {
    return (
      <Layout>
        <div className="container py-20 max-w-md text-center">
          <AlertCircle size={40} className="text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">请先登录</p>
          <p className="text-sm text-muted-foreground mb-4">登录后才能使用回测功能</p>
          <Button onClick={() => navigate("/login")}>前往登录</Button>
        </div>
      </Layout>
    );
  }

  const sessions = data?.sessions || [];

  return (
    <Layout>
      <div className="container py-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart2 size={24} className="text-primary" />
              回测系统
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              创建并管理回测存档，验证策略历史表现
            </p>
          </div>
          <CreateBacktestDialog onCreated={refetch} />
        </div>

        {/* Sessions List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full bg-muted" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <BarChart2 size={40} className="text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground font-medium mb-2">暂无回测存档</p>
              <p className="text-sm text-muted-foreground mb-4">
                创建第一个回测存档，验证黄蓝梯子策略的历史表现
              </p>
              <CreateBacktestDialog onCreated={refetch} />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => {
              const totalReturn = session.totalReturn ? parseFloat(String(session.totalReturn)) : null;
              const isProfit = totalReturn !== null && totalReturn > 0;

              return (
                <Card
                  key={session.id}
                  className="bg-card border-border hover:border-primary/30 transition-all cursor-pointer"
                  onClick={() => navigate(`/backtest/${session.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground truncate">{session.name}</h3>
                          <StatusBadge status={session.status} />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign size={11} />
                            ${parseFloat(String(session.initialBalance)).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {session.startDate} → {session.endDate}
                          </span>
                        </div>
                        {session.status === "running" && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                              <span>回测进度</span>
                              <span>{session.progress}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${session.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {session.status === "completed" && totalReturn !== null && (
                          <div className="mt-2 flex items-center gap-4 text-xs">
                            <span className={`flex items-center gap-1 font-medium ${isProfit ? "text-profit" : "text-loss"}`}>
                              {isProfit ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              {isProfit ? "+" : ""}{totalReturn.toFixed(2)}%
                            </span>
                            <span className="text-muted-foreground">
                              最终: ${parseFloat(String(session.finalBalance || 0)).toLocaleString()}
                            </span>
                            {(session.totalTrades ?? 0) > 0 && (
                              <span className="text-muted-foreground">
                                {session.totalTrades}笔交易
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                          onClick={e => {
                            e.stopPropagation();
                            if (confirm("确定删除此回测存档？")) {
                              deleteMutation.mutate({ id: session.id });
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                        <ChevronRight size={16} className="text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

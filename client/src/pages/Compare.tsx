import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";
import {
  GitCompare, AlertCircle, TrendingUp, TrendingDown,
  CheckSquare, Square
} from "lucide-react";
import { TIMEFRAME_LABELS, MARKET_CAP_LABELS } from "@shared/stockPool";

export default function Compare() {
  const { user } = useLocalAuth();
  const [, navigate] = useLocation();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [strategyFilter, setStrategyFilter] = useState<"all" | "standard" | "aggressive">("all");

  const { data: sessionsData, isLoading } = trpc.backtest.getSessions.useQuery(undefined, {
    enabled: !!user,
  });

  const { data: compareData, isLoading: isComparing } = trpc.backtest.compareSessions.useQuery(
    { ids: selectedIds },
    { enabled: selectedIds.length >= 2 }
  );

  const allCompletedSessions = sessionsData?.sessions?.filter(s => s.status === "completed") || [];
  const sessions = allCompletedSessions.filter(s => {
    if (strategyFilter === "all") return true;
    const strategy = (s as any).strategy || "standard";
    return strategy === strategyFilter;
  });

  const toggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(x => x !== id));
    } else {
      if (selectedIds.length >= 6) {
        toast.error("最多同时对比6个存档");
        return;
      }
      setSelectedIds(prev => [...prev, id]);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <AlertCircle size={40} className="text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">请先登录</p>
          <Button onClick={() => navigate("/login")}>前往登录</Button>
        </div>
      </Layout>
    );
  }

  const compareSessions = compareData?.sessions || [];

  // 图表数据
  const returnChartData = compareSessions.map(s => ({
    name: s.name.length > 10 ? s.name.slice(0, 10) + "..." : s.name,
    return: parseFloat(String(s.totalReturn || 0)),
    drawdown: -parseFloat(String(s.maxDrawdown || 0)),
  }));

  return (
    <Layout>
      <div className="container py-6 max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GitCompare size={24} className="text-primary" />
            横向对比
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            选择2-6个已完成的回测存档进行横向对比
          </p>
        </div>

        {/* Session Selector */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 bg-muted" />)}
          </div>
        ) : sessions.length === 0 ? (
          <Card className="bg-card border-border mb-6">
            <CardContent className="p-8 text-center">
              <AlertCircle size={32} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">暂无已完成的回测存档</p>
              <Button size="sm" className="mt-3" onClick={() => navigate("/backtest")}>
                去创建回测
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border-border mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span>
                    选择要对比的存档
                    <span className="text-muted-foreground font-normal ml-2">已选 {selectedIds.length}/6</span>
                  </span>
                  {/* 策略过滤器 */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground mr-1">策略：</span>
                    {(["all", "standard", "aggressive"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => {
                          setStrategyFilter(f);
                          setSelectedIds([]); // 切换过滤器时清空选择
                        }}
                        className={`px-2 py-0.5 rounded border transition-all ${
                          strategyFilter === f
                            ? f === "aggressive"
                              ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                              : f === "standard"
                              ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                              : "bg-primary/20 border-primary/40 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {f === "all" ? "全部" : f === "standard" ? "📊 标准" : "⚡ 激进"}
                      </button>
                    ))}
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sessions.map(session => {
                  const isSelected = selectedIds.includes(session.id);
                  const totalReturn = parseFloat(String(session.totalReturn || 0));
                  const isProfit = totalReturn > 0;

                  return (
                    <div
                      key={session.id}
                      onClick={() => toggleSelect(session.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? "bg-primary/10 border-primary/30"
                          : "bg-muted/30 border-border hover:border-primary/20"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                      }`}>
                        {isSelected && <CheckSquare size={12} className="text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-foreground truncate">{session.name}</p>
                          {(session as any).strategy === "aggressive" ? (
                            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">⚡</span>
                          ) : (
                            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">📊</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {session.startDate} → {session.endDate}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${isProfit ? "text-profit" : "text-loss"}`}>
                          {isProfit ? "+" : ""}{totalReturn.toFixed(2)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ${parseFloat(String(session.initialBalance)).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Comparison Results */}
        {selectedIds.length >= 2 && (
          <>
            {/* Return Chart */}
            {returnChartData.length > 0 && (
              <Card className="bg-card border-border mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">收益率对比</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={returnChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.02 240)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.60 0.02 240)" }} />
                      <YAxis
                        tick={{ fontSize: 10, fill: "oklch(0.60 0.02 240)" }}
                        tickFormatter={v => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "oklch(0.16 0.015 240)",
                          border: "1px solid oklch(0.25 0.02 240)",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                        formatter={(v: number) => [`${v.toFixed(2)}%`, "收益率"]}
                      />
                      <Bar dataKey="return" radius={[4, 4, 0, 0]}>
                        {returnChartData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.return >= 0 ? "oklch(0.70 0.18 145)" : "oklch(0.60 0.22 25)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Comparison Table */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">详细对比表</CardTitle>
              </CardHeader>
              <CardContent>
                {isComparing ? (
                  <Skeleton className="h-48 bg-muted" />
                ) : compareSessions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">指标</th>
                          {compareSessions.map(s => (
                            <th key={s.id} className="text-right py-2 px-3 text-muted-foreground font-medium max-w-[120px]">
                              <span className="truncate block">{s.name}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[
                          {
                            label: "初始金额",
                            getValue: (s: any) => `$${parseFloat(String(s.initialBalance)).toLocaleString()}`,
                          },
                          {
                            label: "最终金额",
                            getValue: (s: any) => s.finalBalance ? `$${parseFloat(String(s.finalBalance)).toLocaleString()}` : "--",
                          },
                          {
                            label: "总收益率",
                            getValue: (s: any) => {
                              const v = parseFloat(String(s.totalReturn || 0));
                              return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
                            },
                            getClass: (s: any) => parseFloat(String(s.totalReturn || 0)) >= 0 ? "text-profit font-bold" : "text-loss font-bold",
                          },
                          {
                            label: "最大回撤",
                            getValue: (s: any) => s.maxDrawdown ? `-${parseFloat(String(s.maxDrawdown)).toFixed(2)}%` : "--",
                            getClass: () => "text-loss",
                          },
                          {
                            label: "总交易次数",
                            getValue: (s: any) => String(s.totalTrades || 0),
                          },
                          {
                            label: "胜率",
                            getValue: (s: any) => {
                              if (!s.totalTrades || s.totalTrades === 0) return "--";
                              return `${((s.winTrades || 0) / s.totalTrades * 100).toFixed(1)}%`;
                            },
                            getClass: (s: any) => {
                              if (!s.totalTrades || s.totalTrades === 0) return "";
                              const rate = (s.winTrades || 0) / s.totalTrades;
                              return rate >= 0.5 ? "text-profit" : "text-loss";
                            },
                          },
                          {
                            label: "vs QQQ",
                            getValue: (s: any) => {
                              if (!s.benchmarkQQQReturn) return "--";
                              const v = parseFloat(String(s.benchmarkQQQReturn));
                              const ret = parseFloat(String(s.totalReturn || 0));
                              const diff = ret - v;
                              return `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`;
                            },
                            getClass: (s: any) => {
                              if (!s.benchmarkQQQReturn) return "";
                              const diff = parseFloat(String(s.totalReturn || 0)) - parseFloat(String(s.benchmarkQQQReturn));
                              return diff >= 0 ? "text-profit" : "text-loss";
                            },
                          },
                          {
                            label: "vs SPY",
                            getValue: (s: any) => {
                              if (!s.benchmarkSPYReturn) return "--";
                              const v = parseFloat(String(s.benchmarkSPYReturn));
                              const ret = parseFloat(String(s.totalReturn || 0));
                              const diff = ret - v;
                              return `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`;
                            },
                            getClass: (s: any) => {
                              if (!s.benchmarkSPYReturn) return "";
                              const diff = parseFloat(String(s.totalReturn || 0)) - parseFloat(String(s.benchmarkSPYReturn));
                              return diff >= 0 ? "text-profit" : "text-loss";
                            },
                          },
                          {
                            label: "回测区间",
                            getValue: (s: any) => `${s.startDate}~${s.endDate}`,
                          },
                          {
                            label: "市值筛选",
                            getValue: (s: any) => MARKET_CAP_LABELS[s.marketCapFilter as keyof typeof MARKET_CAP_LABELS] || s.marketCapFilter,
                          },
                          {
                            label: "CD信号级别",
                            getValue: (s: any) => {
                              try {
                                const tfs = JSON.parse(String(s.cdSignalTimeframes || "[]")) as string[];
                                return tfs.map(t => TIMEFRAME_LABELS[t] || t).join(", ");
                              } catch { return "--"; }
                            },
                          },
                          {
                            label: "K线范围",
                            getValue: (s: any) => `${s.cdLookbackBars}根`,
                          },
                          {
                            label: "回测策略",
                            getValue: (s: any) => (s as any).strategy === "aggressive" ? "⚡ 激进" : "📊 标准",
                            getClass: (s: any) => (s as any).strategy === "aggressive" ? "text-orange-400" : "text-blue-400",
                          },
                        ].map(row => (
                          <tr key={row.label} className="hover:bg-muted/20">
                            <td className="py-2 px-3 text-muted-foreground">{row.label}</td>
                            {compareSessions.map(s => (
                              <td key={s.id} className={`py-2 px-3 text-right ${row.getClass ? row.getClass(s) : "text-foreground"}`}>
                                {row.getValue(s)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </>
        )}

        {selectedIds.length === 1 && (
          <Card className="bg-card border-border">
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              请再选择至少1个存档进行对比
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

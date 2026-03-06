import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  ArrowLeft, TrendingUp, TrendingDown, DollarSign,
  BarChart2, Clock, Target, AlertCircle, Loader2,
  ArrowUpRight, ArrowDownRight, Info
} from "lucide-react";
import StockChart, { type TradeMarker } from "@/components/StockChart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIMEFRAME_LABELS, MARKET_CAP_LABELS } from "@shared/stockPool";

function MetricCard({ label, value, sub, positive }: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-xl font-bold ${positive === true ? "text-profit" : positive === false ? "text-loss" : "text-foreground"}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// K线图选股组件
function KLineTab({
  trades,
  startDate,
  endDate,
}: {
  trades: Array<{ symbol: string; type: string; tradeDate: string; price: string }>;
  startDate: string;
  endDate: string;
}) {
  // 获取回测中涉及的所有股票
  const symbols = Array.from(new Set(trades.map((t) => t.symbol)));
  const [selectedSymbol, setSelectedSymbol] = useState<string>(symbols[0] || "");
  const [selectedTf, setSelectedTf] = useState<string>("1d");

  if (symbols.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          回测完成后可查看K线图
        </CardContent>
      </Card>
    );
  }

  const markers: TradeMarker[] = trades
    .filter((t) => t.symbol === selectedSymbol)
    .map((t) => ({
      date: t.tradeDate,
      type: t.type as "buy" | "sell",
      price: parseFloat(t.price),
    }));

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium">K线图（黄蓝梯子 + 买卖点标注）</CardTitle>
          <div className="flex gap-2">
            <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
              <SelectTrigger className="h-7 text-xs w-28">
                <SelectValue placeholder="选股票" />
              </SelectTrigger>
              <SelectContent>
                {symbols.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedTf} onValueChange={setSelectedTf}>
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue placeholder="时间级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d" className="text-xs">日线</SelectItem>
                <SelectItem value="4h" className="text-xs">4小时</SelectItem>
                <SelectItem value="1h" className="text-xs">1小时</SelectItem>
                <SelectItem value="30m" className="text-xs">30分钟</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 pb-4 px-4">
        <StockChart
          symbol={selectedSymbol}
          timeframe={selectedTf}
          startDate={startDate}
          endDate={endDate}
          tradeMarkers={markers}
          height={450}
          showLadder={true}
        />
        <p className="text-xs text-muted-foreground mt-2 text-center">
          绿色↑ = 买入点 | 红色↓ = 卖出点 | 蓝线 = 蓝色梯子 | 黄线 = 黄色梯子
        </p>
      </CardContent>
    </Card>
  );
}

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  first_buy: "第一买点（蓝梯突破黄梯）",
  second_buy: "第二买点（蓝梯下边缘>黄梯上边缘）",
  first_sell: "第一卖点（上级别跌破蓝梯下边缘）",
  second_sell: "第二卖点（蓝梯上边缘<黄梯下边缘）",
  daily_sell_half: "日线CD卖出信号（卖50%）",
  daily_sell_all: "日线CD卖出后次日清仓",
};

export default function BacktestDetail() {
  const params = useParams<{ id: string }>();
  const sessionId = parseInt(params.id || "0");
  const [, navigate] = useLocation();
  const { user } = useLocalAuth();

  const { data, isLoading } = trpc.backtest.getSession.useQuery(
    { id: sessionId },
    {
      enabled: !!user && !!sessionId,
      refetchInterval: (query) => {
        const d = query.state.data;
        if (d && 'session' in d && d.session?.status === "running") return 5000;
        return false;
      },
    }
  );

  if (!user) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <Button onClick={() => navigate("/login")}>请先登录</Button>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-6 max-w-5xl space-y-4">
          <Skeleton className="h-8 w-48 bg-muted" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 bg-muted" />)}
          </div>
          <Skeleton className="h-64 bg-muted" />
        </div>
      </Layout>
    );
  }

  if (!data?.success || !data.session) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <AlertCircle size={40} className="text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{data?.error || "存档不存在"}</p>
          <Button className="mt-4" onClick={() => navigate("/backtest")}>返回列表</Button>
        </div>
      </Layout>
    );
  }

  const { session, trades, isRunning } = data;
  const totalReturn = session.totalReturn ? parseFloat(String(session.totalReturn)) : null;
  const maxDrawdown = session.maxDrawdown ? parseFloat(String(session.maxDrawdown)) : null;
  const isProfit = totalReturn !== null && totalReturn > 0;

  // 解析权益曲线
  const equityCurve: { date: string; value: number }[] = session.equityCurve
    ? JSON.parse(String(session.equityCurve))
    : [];

  // 解析回测条件
  const cdTimeframes: string[] = session.cdSignalTimeframes
    ? JSON.parse(String(session.cdSignalTimeframes))
    : [];
  const ladderTimeframes: string[] = session.ladderBreakTimeframes
    ? JSON.parse(String(session.ladderBreakTimeframes))
    : [];

  // 计算胜率
  const winRate = session.totalTrades && (session.totalTrades > 0)
    ? ((session.winTrades || 0) / session.totalTrades * 100).toFixed(1)
    : null;

  // 图表数据
  const chartData = equityCurve.map(p => ({
    date: p.date,
    value: p.value,
    label: `$${p.value.toLocaleString()}`,
  }));

  const initialBalance = parseFloat(String(session.initialBalance));

  return (
    <Layout>
      <div className="container py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/backtest")}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> 返回
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{session.name}</h1>
              {session.status === "running" && (
                <Badge className="bg-blue-500/20 text-blue-400 gap-1">
                  <Loader2 size={10} className="animate-spin" /> 运行中 {session.progress}%
                </Badge>
              )}
              {session.status === "completed" && (
                <Badge className="bg-green-500/20 text-green-400">已完成</Badge>
              )}
              {session.status === "failed" && (
                <Badge className="bg-red-500/20 text-red-400">失败</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {session.startDate} → {session.endDate}
            </p>
          </div>
        </div>

        {/* Progress Bar (running) */}
        {session.status === "running" && (
          <Card className="bg-card border-border mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>回测进度</span>
                <span>{session.progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${session.progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                正在扫描历史数据并执行回测，请稍候...
              </p>
            </CardContent>
          </Card>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard
            label="初始金额"
            value={`$${initialBalance.toLocaleString()}`}
          />
          <MetricCard
            label="最终金额"
            value={session.finalBalance ? `$${parseFloat(String(session.finalBalance)).toLocaleString()}` : "--"}
            positive={isProfit}
          />
          <MetricCard
            label="总收益率"
            value={totalReturn !== null ? `${isProfit ? "+" : ""}${totalReturn.toFixed(2)}%` : "--"}
            positive={isProfit}
          />
          <MetricCard
            label="最大回撤"
            value={maxDrawdown !== null ? `-${maxDrawdown.toFixed(2)}%` : "--"}
            positive={false}
          />
        </div>

        {/* Benchmark Comparison */}
        {session.status === "completed" && (session.benchmarkQQQReturn || session.benchmarkSPYReturn) && (
          <Card className="bg-card border-border mb-6">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-foreground mb-3">与大盘对比</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">本策略</p>
                  <p className={`text-lg font-bold ${isProfit ? "text-profit" : "text-loss"}`}>
                    {totalReturn !== null ? `${isProfit ? "+" : ""}${totalReturn.toFixed(2)}%` : "--"}
                  </p>
                </div>
                {session.benchmarkQQQReturn && (
                  <div className="text-center border-l border-border">
                    <p className="text-xs text-muted-foreground mb-1">QQQ</p>
                    <p className={`text-lg font-bold ${parseFloat(String(session.benchmarkQQQReturn)) > 0 ? "text-profit" : "text-loss"}`}>
                      {parseFloat(String(session.benchmarkQQQReturn)) > 0 ? "+" : ""}
                      {parseFloat(String(session.benchmarkQQQReturn)).toFixed(2)}%
                    </p>
                  </div>
                )}
                {session.benchmarkSPYReturn && (
                  <div className="text-center border-l border-border">
                    <p className="text-xs text-muted-foreground mb-1">SPY</p>
                    <p className={`text-lg font-bold ${parseFloat(String(session.benchmarkSPYReturn)) > 0 ? "text-profit" : "text-loss"}`}>
                      {parseFloat(String(session.benchmarkSPYReturn)) > 0 ? "+" : ""}
                      {parseFloat(String(session.benchmarkSPYReturn)).toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="chart" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="chart" className="text-xs">收益曲线</TabsTrigger>
            <TabsTrigger value="kline" className="text-xs">K线图</TabsTrigger>
            <TabsTrigger value="trades" className="text-xs">买卖记录</TabsTrigger>
            <TabsTrigger value="config" className="text-xs">回测条件</TabsTrigger>
          </TabsList>

          {/* Equity Curve */}
          <TabsContent value="chart">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">资产净值曲线</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.02 240)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "oklch(0.60 0.02 240)" }}
                        tickFormatter={v => v.slice(5)} // MM-DD
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "oklch(0.60 0.02 240)" }}
                        tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "oklch(0.16 0.015 240)",
                          border: "1px solid oklch(0.25 0.02 240)",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                        formatter={(v: number) => [`$${v.toLocaleString()}`, "资产"]}
                      />
                      <ReferenceLine
                        y={initialBalance}
                        stroke="oklch(0.60 0.02 240)"
                        strokeDasharray="4 4"
                        label={{ value: "初始", fontSize: 10, fill: "oklch(0.60 0.02 240)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="oklch(0.65 0.18 220)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    {session.status === "running" ? "回测完成后显示收益曲线" : "暂无数据"}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trade Stats */}
            {session.status === "completed" && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">总交易次数</p>
                    <p className="text-lg font-bold text-foreground">{session.totalTrades || 0}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">胜率</p>
                    <p className="text-lg font-bold text-profit">{winRate ? `${winRate}%` : "--"}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">盈/亏笔数</p>
                    <p className="text-lg font-bold text-foreground">
                      <span className="text-profit">{session.winTrades || 0}</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-loss">{session.lossTrades || 0}</span>
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* K线图 Tab */}
          <TabsContent value="kline">
            <KLineTab
              trades={trades}
              startDate={session.startDate}
              endDate={session.endDate}
            />
          </TabsContent>

          {/* Trade Records */}
          <TabsContent value="trades">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  买卖记录 ({trades.length}笔)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trades.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    {session.status === "running" ? "回测完成后显示交易记录" : "暂无交易记录"}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {trades.map((trade, idx) => {
                      const isBuy = trade.type === "buy";
                      const pnl = trade.pnl ? parseFloat(String(trade.pnl)) : null;
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border text-xs ${
                            isBuy
                              ? "bg-green-500/5 border-green-500/20"
                              : "bg-red-500/5 border-red-500/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {isBuy
                                ? <ArrowUpRight size={14} className="text-profit shrink-0" />
                                : <ArrowDownRight size={14} className="text-loss shrink-0" />
                              }
                              <div>
                                <span className={`font-bold ${isBuy ? "text-profit" : "text-loss"}`}>
                                  {isBuy ? "买入" : "卖出"}
                                </span>
                                <span className="text-foreground font-medium ml-1.5">{trade.symbol}</span>
                                <span className="text-muted-foreground ml-1.5">{trade.tradeDate}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-foreground font-medium">
                                ${parseFloat(String(trade.amount)).toLocaleString()}
                              </p>
                              {pnl !== null && (
                                <p className={pnl >= 0 ? "text-profit" : "text-loss"}>
                                  {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                                  {trade.pnlPercent && (
                                    <span className="ml-1">
                                      ({parseFloat(String(trade.pnlPercent)) >= 0 ? "+" : ""}
                                      {parseFloat(String(trade.pnlPercent)).toFixed(2)}%)
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {TIMEFRAME_LABELS[trade.signalTimeframe || ""] || trade.signalTimeframe}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {SIGNAL_TYPE_LABELS[trade.signalType || ""] || trade.signalType}
                            </span>
                          </div>
                          <p className="mt-1.5 text-muted-foreground leading-relaxed">{trade.reason}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Config */}
          <TabsContent value="config">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">回测条件摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">初始金额</p>
                    <p className="text-foreground font-medium">
                      ${parseFloat(String(session.initialBalance)).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">市值筛选</p>
                    <p className="text-foreground font-medium">
                      {MARKET_CAP_LABELS[session.marketCapFilter as keyof typeof MARKET_CAP_LABELS] || session.marketCapFilter}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">回测区间</p>
                    <p className="text-foreground font-medium">{session.startDate} → {session.endDate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">CD信号K线范围</p>
                    <p className="text-foreground font-medium">过去 {session.cdLookbackBars} 根K线</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">CD抄底信号级别（需同时满足）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cdTimeframes.map(tf => (
                      <span key={tf} className="px-2 py-1 rounded bg-primary/10 text-primary text-xs">
                        {TIMEFRAME_LABELS[tf] || tf}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">蓝梯突破黄梯级别（需同时满足）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ladderTimeframes.map(tf => (
                      <span key={tf} className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 text-xs">
                        {TIMEFRAME_LABELS[tf] || tf}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

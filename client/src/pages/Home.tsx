import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  TrendingUp, RefreshCw, Star, Clock, BarChart2,
  ChevronRight, AlertCircle, Zap, Target, Info, LineChart
} from "lucide-react";
import StockChart from "@/components/StockChart";

const MATCH_LEVEL_LABELS: Record<string, string> = {
  "4321": "4321打法",
  "321": "321打法",
  "21": "21打法",
  "1": "1小时打法",
};

const MATCH_LEVEL_COLORS: Record<string, string> = {
  "4321": "score-high",
  "321": "score-medium",
  "21": "score-low",
  "1": "score-low",
};

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? "score-high" : score >= 60 ? "score-medium" : "score-low";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${cls}`}>
      {score}分
    </span>
  );
}

interface RecommendationItem {
  symbol: string;
  totalScore: number;
  matchLevel: string;
  cdLevels: string[];
  ladderBreakLevel: string;
  reason: string;
  details: Record<string, number>;
  aggressiveSignal?: boolean;
  aggressiveType?: string;
  aggressiveReason?: string;
}

const TIMEFRAME_OPTIONS = [
  { value: "1d", label: "日线" },
  { value: "4h", label: "4H" },
  { value: "1h", label: "1H" },
  { value: "30m", label: "30M" },
];

function RecommendationCard({ item, rank }: { item: RecommendationItem; rank: number }) {
  const [showChart, setShowChart] = useState(false);
  const [chartTimeframe, setChartTimeframe] = useState("1d");

  // 查询 chart 数据
  const { data: chartData } = trpc.chart.getCandles.useQuery(
    { symbol: item.symbol, timeframe: chartTimeframe },
    { enabled: showChart }
  );

  const handleToggleChart = () => {
    setShowChart(!showChart);
  };

  const handleTimeframeChange = (tf: string) => {
    setChartTimeframe(tf);
  };

  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-all">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
              ${rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                rank === 2 ? "bg-gray-400/20 text-gray-300" :
                rank === 3 ? "bg-orange-500/20 text-orange-400" :
                "bg-muted text-muted-foreground"}`}>
              {rank}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground text-lg">{item.symbol}</span>
                <Badge variant="outline" className={`text-xs ${MATCH_LEVEL_COLORS[item.matchLevel] || "score-low"}`}>
                  {MATCH_LEVEL_LABELS[item.matchLevel] || item.matchLevel}
                </Badge>
              </div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {item.cdLevels.map(level => (
                  <span key={level} className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {level} CD
                  </span>
                ))}
                {item.ladderBreakLevel && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
                    {item.ladderBreakLevel} 蓝梯↑
                  </span>
                )}
                {item.aggressiveSignal && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    ⚡ 激进
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <ScoreBadge score={item.totalScore} />
            <button
              onClick={handleToggleChart}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
            >
              <LineChart size={12} />
              {showChart ? "收起" : "K线图"}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{item.reason}</p>
        {item.aggressiveSignal && item.aggressiveReason && (
          <div className="mt-2 p-2 rounded bg-orange-500/5 border border-orange-500/20">
            <p className="text-xs text-orange-400">
              <span className="font-medium">⚡ 激进信号：</span>{item.aggressiveReason}
            </p>
          </div>
        )}
        {showChart && (
          <div className="mt-4">
            {/* 时间周期切换按鈕 */}
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs text-muted-foreground mr-1">周期：</span>
              {TIMEFRAME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleTimeframeChange(opt.value)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                    chartTimeframe === opt.value
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {chartData ? (
              <StockChart
                candles={chartData.candles}
                interval={chartData.interval}
                cdSignals={chartData.cdSignals}
                buySellPressure={chartData.buySellPressure}
                momentumSignals={chartData.momentumSignals}
                chanLunSignals={chartData.chanLunSignals}
                advancedChanData={chartData.advancedChanData}
                advancedChanSignals={chartData.advancedChanSignals}
                height={320}
                showLadder={true}
              />
            ) : (
              <div className="flex items-center justify-center bg-slate-900 rounded-lg" style={{ height: 320 }}>
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">加载图表...</span>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1 text-center">
              蓝线 = 蓝色梯子 | 黄线 = 黄色梯子
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user } = useLocalAuth();
  const [, navigate] = useLocation();

  const { data, isLoading, refetch } = trpc.screener.getTodayRecommendations.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const triggerScan = trpc.screener.triggerScan.useMutation({
    onSuccess: () => {
      toast.success("扫描已启动，约2-3分钟后刷新查看结果");
      setTimeout(() => refetch(), 3000);
    },
  });

  const { data: statusData } = trpc.screener.getStatus.useQuery(undefined, {
    refetchInterval: 5000,
  });

  // 只显示有信号的股票（分数>0），按分数降序
  const allResults = data?.results || [];
  const results = allResults.filter(r => r.totalScore > 0);
  const scanDate = data?.scanDate || "";
  const fromCache = data?.fromCache || false;

  // 按大中小盘分类
  const largeCapResults = results.filter(r => r.marketCap === "500b" || r.marketCap === "100b");
  const midCapResults = results.filter(r => r.marketCap === "50b" || r.marketCap === "10b");
  const smallCapResults = results.filter(r => r.marketCap === "1b" || r.marketCap === "none");

  return (
    <Layout>
      <div className="container py-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp size={24} className="text-primary" />
              今日推荐
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              基于4321打法扫描美股，按匹配度评分排列
            </p>
            {statusData?.scheduler && (
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground/70">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
                  自动扫描：美东 9:00 和 12:30（周一至周五）
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {scanDate && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock size={12} />
                {scanDate}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerScan.mutate()}
              disabled={triggerScan.isPending || statusData?.isScanning}
              className="gap-1.5 text-xs border-border"
            >
              <RefreshCw size={13} className={triggerScan.isPending || statusData?.isScanning ? "animate-spin" : ""} />
              {statusData?.isScanning ? "扫描中..." : "重新扫描"}
            </Button>
          </div>
        </div>

        {/* Strategy Explanation */}
        <Card className="bg-card border-border mb-6">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-primary mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="text-foreground font-medium text-sm">4321打法说明</p>
                <p>
                  <span className="text-primary font-medium">4321</span>：4h/3h/2h/1h同时出现CD抄底信号 + 30分钟蓝梯突破黄梯（最强信号）
                </p>
                <p>
                  <span className="text-yellow-400 font-medium">321/21/1</span>：自动降级匹配，级别越多分数越高
                </p>
                <p>
                  <span className="text-green-400 font-medium">第一买点</span>：30分钟蓝梯上边缘刚突破黄梯上边缘（买50%仓位）
                </p>
                <p>
                  <span className="text-green-400 font-medium">第二买点</span>：蓝梯下边缘高于黄梯上边缘（买余下50%仓位）
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-28 w-full bg-muted" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <AlertCircle size={40} className="text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">今日暂无符合4321打法的股票</p>
              <p className="text-xs text-muted-foreground mt-2">
                {allResults.length > 0
                  ? `已扫描 ${allResults.length} 只股票，暂无满足条件的信号`
                  : "可能是市场整体偏弱，或数据尚未更新"}
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => triggerScan.mutate()}
                disabled={triggerScan.isPending}
              >
                立即扫描
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">
                共找到 <span className="text-foreground font-medium">{results.length}</span> 只有效信号
                <span className="ml-1 text-xs">(已扫描{allResults.length}只)</span>
                {fromCache && <span className="ml-1 text-xs text-muted-foreground/60">(今日缓存)</span>}
              </p>
              {!user && (
                <Button size="sm" variant="outline" onClick={() => navigate("/login")} className="text-xs border-border">
                  登录后可使用回测功能
                </Button>
              )}
            </div>

            {/* 大盘股 */}
            {largeCapResults.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary"></span>
                  大盘股 ({largeCapResults.length})
                </h3>
                <div className="space-y-2">
                  {largeCapResults.map((item, idx) => (
                    <RecommendationCard key={item.symbol} item={item} rank={idx + 1} />
                  ))}
                </div>
              </div>
            )}

            {/* 中盘股 */}
            {midCapResults.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  中盘股 ({midCapResults.length})
                </h3>
                <div className="space-y-2">
                  {midCapResults.map((item, idx) => (
                    <RecommendationCard key={item.symbol} item={item} rank={largeCapResults.length + idx + 1} />
                  ))}
                </div>
              </div>
            )}

            {/* 小盘股 */}
            {smallCapResults.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  小盘股 ({smallCapResults.length})
                </h3>
                <div className="space-y-2">
                  {smallCapResults.map((item, idx) => (
                    <RecommendationCard key={item.symbol} item={item} rank={largeCapResults.length + midCapResults.length + idx + 1} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        {user && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card
              className="bg-card border-border hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => navigate("/backtest")}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart2 size={20} className="text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">创建回测</p>
                  <p className="text-xs text-muted-foreground">验证策略历史表现</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
            <Card
              className="bg-card border-border hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => navigate("/compare")}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Target size={20} className="text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">横向对比</p>
                  <p className="text-xs text-muted-foreground">比较多个回测结果</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}

"use client";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, Search, Filter, ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

interface StockResult {
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
  const cls = score >= 80 ? "score-high" : score >= 60 ? "score-medium" : score >= 40 ? "score-low" : "bg-muted";
  const label = score > 0 ? `${score.toFixed(0)}分` : "无信号";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${cls}`}>
      {label}
    </span>
  );
}

function StockRow({ stock }: { stock: StockResult }) {
  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-all">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="font-bold text-foreground text-lg w-16">{stock.symbol}</span>
              <ScoreBadge score={stock.totalScore} />
              {stock.matchLevel && (
                <Badge variant="outline" className={`text-xs ${MATCH_LEVEL_COLORS[stock.matchLevel] || "score-low"}`}>
                  {MATCH_LEVEL_LABELS[stock.matchLevel] || stock.matchLevel}
                </Badge>
              )}
              {stock.aggressiveSignal && (
                <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400">
                  ⚡ {stock.aggressiveType || "激进"}
                </Badge>
              )}
            </div>
            {stock.reason && (
              <p className="text-xs text-muted-foreground mt-2">{stock.reason}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AllStocks() {
  const [, navigate] = useLocation();
  const [searchSymbol, setSearchSymbol] = useState("");
  const [filterSignal, setFilterSignal] = useState<"all" | "with" | "without">("all");
  const [sortBy, setSortBy] = useState<"score" | "symbol">("score");

  const { data, isLoading } = trpc.screener.getAllScanResults.useQuery();

  const allStocks = data?.results || [];
  const total = data?.total || 0;
  const withSignals = data?.withSignals || 0;

  // 应用筛选和排序
  const filteredStocks = useMemo(() => {
    let result = allStocks;

    // 按搜索词筛选
    if (searchSymbol.trim()) {
      result = result.filter(s => s.symbol.toUpperCase().includes(searchSymbol.toUpperCase()));
    }

    // 按信号筛选
    if (filterSignal === "with") {
      result = result.filter(s => s.totalScore > 0);
    } else if (filterSignal === "without") {
      result = result.filter(s => s.totalScore === 0);
    }

    // 排序
    if (sortBy === "score") {
      result = result.sort((a, b) => b.totalScore - a.totalScore);
    } else {
      result = result.sort((a, b) => a.symbol.localeCompare(b.symbol));
    }

    return result;
  }, [allStocks, searchSymbol, filterSignal, sortBy]);

  return (
    <Layout>
      <div className="container py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="p-0 h-auto"
            >
              <ChevronLeft size={20} />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <TrendingUp size={24} className="text-primary" />
                全部股票扫描结果
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                共扫描 <span className="text-foreground font-medium">{total}</span> 只股票，
                其中 <span className="text-primary font-medium">{withSignals}</span> 只有信号
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索股票代码..."
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <Select value={filterSignal} onValueChange={(v: any) => setFilterSignal(v)}>
            <SelectTrigger className="w-40">
              <Filter size={16} className="mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部股票</SelectItem>
              <SelectItem value="with">仅有信号</SelectItem>
              <SelectItem value="without">无信号</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">按分数排序</SelectItem>
              <SelectItem value="symbol">按代码排序</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full bg-muted" />
            ))}
          </div>
        ) : filteredStocks.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">未找到匹配的股票</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              显示 <span className="text-foreground font-medium">{filteredStocks.length}</span> 只股票
            </p>
            {filteredStocks.map((stock) => (
              <StockRow key={stock.symbol} stock={stock} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

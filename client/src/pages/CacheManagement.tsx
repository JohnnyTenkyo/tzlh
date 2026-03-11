'use client';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertCircle, RefreshCw, CheckCircle2, XCircle, Clock,
  Trash2, Database, Activity, Wifi, WifiOff, Shield,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

// ============================================================
// 数据源颜色映射
// ============================================================
const SOURCE_COLORS: Record<string, string> = {
  alpaca:       'bg-blue-500/20 text-blue-400 border-blue-500/30',
  stooq:        'bg-green-500/20 text-green-400 border-green-500/30',
  tiingo:       'bg-purple-500/20 text-purple-400 border-purple-500/30',
  finnhub:      'bg-orange-500/20 text-orange-400 border-orange-500/30',
  alphavantage: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  yahoo:        'bg-red-500/20 text-red-400 border-red-500/30',
};

const SOURCE_LABELS: Record<string, string> = {
  alpaca:       'Alpaca',
  stooq:        'Stooq',
  tiingo:       'Tiingo',
  finnhub:      'Finnhub',
  alphavantage: 'Alpha Vantage',
  yahoo:        'Yahoo Finance',
};

function getHealthColor(rate: number | null): string {
  if (rate === null) return 'text-gray-400';
  if (rate >= 90) return 'text-green-400';
  if (rate >= 70) return 'text-yellow-400';
  return 'text-red-400';
}

function getHealthIcon(rate: number | null) {
  if (rate === null) return <Clock className="h-4 w-4 text-gray-400" />;
  if (rate >= 90) return <Wifi className="h-4 w-4 text-green-400" />;
  if (rate >= 70) return <Wifi className="h-4 w-4 text-yellow-400" />;
  return <WifiOff className="h-4 w-4 text-red-400" />;
}

export default function CacheManagement() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed' | 'pending' | 'caching'>('all');
  const [page, setPage] = useState(1);

  const { data: stats, refetch: refetchStats } = trpc.cache.getStats.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const { data: cacheList, refetch: refetchList } = trpc.cache.getList.useQuery(
    { page, pageSize: 50, status: statusFilter },
    { refetchInterval: 10000 }
  );
  const { data: healthData, refetch: refetchHealth } = trpc.health.getSourceHealth.useQuery(undefined, {
    refetchInterval: 15000,
  });

  const clearIntradayMut = trpc.cache.clearIntradayCache.useMutation({
    onSuccess: (data) => {
      toast.success('分时缓存已清空', { description: data.message });
      refetchStats(); refetchList();
    },
    onError: (err) => toast.error('操作失败', { description: err.message }),
  });

  const clearAllMut = trpc.cache.clearAll.useMutation({
    onSuccess: (data) => {
      toast.success('全部缓存已清空', { description: data.message });
      refetchStats(); refetchList();
    },
    onError: (err) => toast.error('操作失败', { description: err.message }),
  });

  const clearSymbolMut = trpc.cache.clearSymbol.useMutation({
    onSuccess: () => {
      toast.success('已清空该股票缓存');
      refetchStats(); refetchList();
    },
    onError: (err) => toast.error('操作失败', { description: err.message }),
  });

  const resetHealthMut = trpc.health.resetStats.useMutation({
    onSuccess: () => {
      toast.success('健康统计已重置');
      refetchHealth();
    },
    onError: (err) => toast.error('操作失败', { description: err.message }),
  });

  // 后台预热进度查询（每 3 秒刷新一次）
  const { data: warmupProgressData, refetch: refetchWarmup } = trpc.cache.getWarmupProgress.useQuery(undefined, {
    refetchInterval: 3000,
  });

  const warmupMut = trpc.cache.warmupAllStocks.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('后台预热已启动', { description: data.message });
      } else {
        toast.warning('预热任务已在运行', { description: data.message });
      }
      refetchWarmup();
    },
    onError: (err) => toast.error('启动失败', { description: err.message }),
  });

  const stopWarmupMut = trpc.cache.stopWarmup.useMutation({
    onSuccess: () => {
      toast.success('后台预热已停止');
      refetchWarmup();
    },
    onError: (err) => toast.error('停止失败', { description: err.message }),
  });

  const handleWarmup = () => {
    warmupMut.mutate({ timeframes: ['1d', '1h', '15m'] });
  };

  // 聚合健康数据（按数据源分组）
  const healthBySource: Record<string, {
    source: string;
    timeframes: Array<{
      timeframe: string;
      successRate: number | null;
      totalRequests: number;
      lastError: string | null;
    }>;
    totalSuccess: number;
    totalFailure: number;
  }> = {};

  for (const row of healthData || []) {
    if (!healthBySource[row.source]) {
      healthBySource[row.source] = { source: row.source, timeframes: [], totalSuccess: 0, totalFailure: 0 };
    }
    healthBySource[row.source].timeframes.push({
      timeframe: row.timeframe,
      successRate: row.successRate,
      totalRequests: row.totalRequests,
      lastError: row.lastError,
    });
    healthBySource[row.source].totalSuccess += row.success;
    healthBySource[row.source].totalFailure += row.failure;
  }

  const sourceList = Object.values(healthBySource);
  const cacheProgress = stats && stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white hover:bg-gray-700 px-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="m15 18-6-6 6-6"/></svg>
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">缓存管理</h1>
            <p className="text-gray-400 text-sm mt-1">管理 K 线历史数据缓存，监控各数据源健康状态</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetchStats(); refetchList(); refetchHealth(); }}
          className="border-gray-600 text-gray-300 hover:bg-gray-700"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: '总股票数', value: stats?.total ?? '-', color: 'text-white' },
          { label: '已缓存', value: stats?.completed ?? '-', color: 'text-green-400' },
          { label: '缓存中', value: stats?.caching ?? '-', color: 'text-blue-400' },
          { label: '待缓存', value: stats?.pending ?? '-', color: 'text-yellow-400' },
          { label: '失败', value: stats?.failed ?? '-', color: 'text-red-400' },
        ].map((item) => (
          <Card key={item.label} className="bg-gray-800/50 border-gray-700">
            <CardContent className="pt-4 pb-4">
              <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
              <div className="text-xs text-gray-400 mt-1">{item.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats && stats.total > 0 && (
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">缓存进度</span>
              <span className="text-sm text-gray-400">{stats.completed}/{stats.total} ({cacheProgress}%)</span>
            </div>
            <Progress value={cacheProgress} className="h-2" />
            <div className="text-xs text-gray-500 mt-2">
              共 {stats.totalCandles.toLocaleString()} 根 K 线已缓存
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="cache">
        <TabsList className="bg-gray-800 border-gray-700">
          <TabsTrigger value="cache" className="data-[state=active]:bg-gray-700">
            <Database className="h-4 w-4 mr-2" />
            缓存列表
          </TabsTrigger>
          <TabsTrigger value="health" className="data-[state=active]:bg-gray-700">
            <Activity className="h-4 w-4 mr-2" />
            数据源健康
          </TabsTrigger>
          <TabsTrigger value="actions" className="data-[state=active]:bg-gray-700">
            <Shield className="h-4 w-4 mr-2" />
            缓存操作
          </TabsTrigger>
        </TabsList>

        {/* ---- 缓存列表 ---- */}
        <TabsContent value="cache" className="mt-4">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-base">股票缓存状态</CardTitle>
                <div className="flex gap-2">
                  {(['all', 'completed', 'failed', 'pending'] as const).map((s) => (
                    <Button
                      key={s}
                      variant={statusFilter === s ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => { setStatusFilter(s); setPage(1); }}
                      className={statusFilter === s ? '' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}
                    >
                      {s === 'all' ? '全部' : s === 'completed' ? '已完成' : s === 'failed' ? '失败' : '待缓存'}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!cacheList || cacheList.items.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>暂无缓存记录</p>
                  <p className="text-xs mt-1">发起回测后系统将自动缓存 K 线数据</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-700">
                        <TableHead className="text-gray-400">股票代码</TableHead>
                        <TableHead className="text-gray-400">状态</TableHead>
                        <TableHead className="text-gray-400">最早日期</TableHead>
                        <TableHead className="text-gray-400">最新日期</TableHead>
                        <TableHead className="text-gray-400">K 线数</TableHead>
                        <TableHead className="text-gray-400">最后更新</TableHead>
                        <TableHead className="text-gray-400">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cacheList.items.map((item) => (
                        <TableRow key={item.id} className="border-gray-700 hover:bg-gray-700/30">
                          <TableCell className="font-mono text-white font-medium">{item.symbol}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                item.status === 'completed' ? 'border-green-500/30 text-green-400 bg-green-500/10' :
                                item.status === 'failed'    ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                                item.status === 'caching'   ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' :
                                'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'
                              }
                            >
                              {item.status === 'completed' ? '已完成' :
                               item.status === 'failed' ? '失败' :
                               item.status === 'caching' ? '缓存中' : '待缓存'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-300 text-sm">{item.earliestDate || '-'}</TableCell>
                          <TableCell className="text-gray-300 text-sm">{item.latestDate || '-'}</TableCell>
                          <TableCell className="text-gray-300 text-sm">{item.totalCandles?.toLocaleString() || '-'}</TableCell>
                          <TableCell className="text-gray-400 text-xs">
                            {new Date(item.lastUpdated).toLocaleString('zh-CN')}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => clearSymbolMut.mutate({ symbol: item.symbol })}
                              disabled={clearSymbolMut.isPending}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-gray-400">共 {cacheList.total} 条</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="border-gray-600 text-gray-300 hover:bg-gray-700"
                      >
                        上一页
                      </Button>
                      <span className="text-sm text-gray-400 self-center">第 {page} 页</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page * 50 >= (cacheList.total || 0)}
                        onClick={() => setPage(p => p + 1)}
                        className="border-gray-600 text-gray-300 hover:bg-gray-700"
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- 数据源健康 ---- */}
        <TabsContent value="health" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                记录各数据源的请求成功率，每次 K 线请求后自动更新
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetHealthMut.mutate()}
                disabled={resetHealthMut.isPending}
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                重置统计
              </Button>
            </div>

            {sourceList.length === 0 ? (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="py-12 text-center text-gray-400">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>暂无健康数据</p>
                  <p className="text-xs mt-1">发起 K 线请求后将自动记录数据源成功率</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sourceList.map((src) => {
                  const totalReqs = src.totalSuccess + src.totalFailure;
                  const overallRate = totalReqs > 0
                    ? Math.round((src.totalSuccess / totalReqs) * 100)
                    : null;
                  return (
                    <Card key={src.source} className="bg-gray-800/50 border-gray-700">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getHealthIcon(overallRate)}
                            <CardTitle className="text-white text-base">
                              {SOURCE_LABELS[src.source] || src.source}
                            </CardTitle>
                          </div>
                          <Badge
                            variant="outline"
                            className={SOURCE_COLORS[src.source] || 'border-gray-500/30 text-gray-400'}
                          >
                            {overallRate !== null ? `${overallRate}%` : 'N/A'}
                          </Badge>
                        </div>
                        <CardDescription className="text-gray-500 text-xs">
                          共 {totalReqs} 次请求 · {src.totalSuccess} 成功 · {src.totalFailure} 失败
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {overallRate !== null && (
                          <Progress value={overallRate} className="h-1.5 mb-3" />
                        )}
                        <div className="space-y-1.5">
                          {src.timeframes.sort((a, b) => a.timeframe.localeCompare(b.timeframe)).map((tf) => (
                            <div key={tf.timeframe} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400 font-mono w-8">{tf.timeframe}</span>
                              <div className="flex items-center gap-2 flex-1 ml-3">
                                <div className="flex-1 bg-gray-700 rounded-full h-1">
                                  <div
                                    className={`h-1 rounded-full ${
                                      tf.successRate === null ? 'bg-gray-600' :
                                      tf.successRate >= 90 ? 'bg-green-500' :
                                      tf.successRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${tf.successRate ?? 0}%` }}
                                  />
                                </div>
                                <span className={`w-10 text-right ${getHealthColor(tf.successRate)}`}>
                                  {tf.successRate !== null ? `${tf.successRate}%` : 'N/A'}
                                </span>
                                <span className="text-gray-600 w-12 text-right">{tf.totalRequests}次</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {src.timeframes.some(t => t.lastError) && (
                          <Alert className="mt-3 bg-red-500/10 border-red-500/30 py-2">
                            <AlertCircle className="h-3 w-3 text-red-400" />
                            <AlertDescription className="text-red-300 text-xs ml-2">
                              {src.timeframes.find(t => t.lastError)?.lastError?.slice(0, 80)}
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ---- 缓存操作 ---- */}
        <TabsContent value="actions" className="mt-4">
          <div className="space-y-4">
            {/* 预热全部股票 */}
            <Card className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-purple-500/30">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-purple-400" />
                  预热全部股票
                </CardTitle>
                <CardDescription className="text-gray-400">
                  一键启动后台全量预热：793 支股票 × 3 个时间级别，使用 Alpaca 批量 API（每批 50 支）。
                  遇到限速自动等待后继续，可跨天运行直到全部完成。
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* 后台预热进度显示 */}
                {warmupProgressData?.running && (
                  <div className="mb-4 space-y-3">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        后台预热运行中...
                        {warmupProgressData.paused && <span className="text-yellow-400">(限速等待中)</span>}
                      </span>
                      <span>{warmupProgressData.completed}/{warmupProgressData.total}</span>
                    </div>
                    <Progress
                      value={warmupProgressData.total > 0 ? Math.round((warmupProgressData.completed / warmupProgressData.total) * 100) : 0}
                      className="h-2"
                    />
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                      <span>当前: {warmupProgressData.currentSymbol} / {warmupProgressData.currentTimeframe}</span>
                      {warmupProgressData.estimatedFinishAt && (
                        <span>预计完成: {new Date(warmupProgressData.estimatedFinishAt).toLocaleTimeString()}</span>
                      )}
                      <span className="text-green-400">成功: {warmupProgressData.completed}</span>
                      <span className="text-red-400">失败: {warmupProgressData.failed}</span>
                    </div>
                    {warmupProgressData.paused && warmupProgressData.pauseUntil && (
                      <Alert className="bg-yellow-500/10 border-yellow-500/30">
                        <AlertCircle className="h-4 w-4 text-yellow-400" />
                        <AlertDescription className="text-yellow-300 text-xs">
                          遇到 API 限速，自动等待至 {new Date(warmupProgressData.pauseUntil).toLocaleTimeString()} 后继续
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
                <Alert className="bg-purple-500/10 border-purple-500/30 mb-4">
                  <AlertCircle className="h-4 w-4 text-purple-400" />
                  <AlertDescription className="text-purple-300 text-sm">
                    后台运行，不阻塞界面。已缓存的数据不重复请求，只补充新增数据。遇到限速自动等待，可跨天完成全量。
                  </AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  <Button
                    onClick={handleWarmup}
                    disabled={warmupProgressData?.running || warmupMut.isPending}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {warmupMut.isPending ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />启动中...</>
                    ) : warmupProgressData?.running ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />预热运行中</>
                    ) : (
                      <><Database className="h-4 w-4 mr-2" />启动后台预热</>  
                    )}
                  </Button>
                  {warmupProgressData?.running && (
                    <Button
                      onClick={() => stopWarmupMut.mutate()}
                      disabled={stopWarmupMut.isPending}
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      停止预热
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 清空分时缓存 */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-blue-400" />
                  清空分时缓存（推荐）
                </CardTitle>
                <CardDescription className="text-gray-400">
                  清空 15m / 30m / 1h / 2h / 3h / 4h 的历史缓存，保留日线数据。
                  由于之前 Tiingo 分时端点错误，旧缓存中可能存在不完整数据，建议执行此操作后重新发起回测。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert className="bg-blue-500/10 border-blue-500/30 mb-4">
                  <AlertCircle className="h-4 w-4 text-blue-400" />
                  <AlertDescription className="text-blue-300 text-sm">
                    清空后，下次回测时系统将使用新的 Alpaca 数据源重新获取分时数据（15m/1h 支持 2020 年起的完整历史）。
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={() => clearIntradayMut.mutate()}
                  disabled={clearIntradayMut.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {clearIntradayMut.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />清空中...</>
                  ) : (
                    <><Trash2 className="h-4 w-4 mr-2" />清空分时缓存</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* 清空全部缓存 */}
            <Card className="bg-gray-800/50 border-red-900/30">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-400" />
                  清空全部缓存
                </CardTitle>
                <CardDescription className="text-gray-400">
                  清空所有 K 线缓存（包括日线）。下次回测时将从头重新获取所有数据，耗时较长。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert className="bg-red-500/10 border-red-500/30 mb-4">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <AlertDescription className="text-red-300 text-sm">
                    此操作不可撤销，将删除所有已缓存的 K 线数据（共 {stats?.totalCandles?.toLocaleString() ?? 0} 根 K 线）。
                  </AlertDescription>
                </Alert>
                <Button
                  variant="destructive"
                  onClick={() => clearAllMut.mutate()}
                  disabled={clearAllMut.isPending}
                >
                  {clearAllMut.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />清空中...</>
                  ) : (
                    <><Trash2 className="h-4 w-4 mr-2" />清空全部缓存</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* 数据源架构说明 */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  当前数据源架构
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {[
                    {
                      tf: '日线 (1d)',
                      chain: 'Stooq（主，20+年）→ Alpaca（2016+）→ Tiingo → Finnhub → Alpha Vantage → Yahoo',
                      note: '日线数据最完整，Stooq 无需 API Key',
                    },
                    {
                      tf: '小时线 (1h)',
                      chain: 'Alpaca（主，2020+）→ Tiingo IEX → Finnhub → Alpha Vantage → Yahoo',
                      note: '聚合为 2h / 3h / 4h',
                    },
                    {
                      tf: '15分钟 (15m)',
                      chain: 'Alpaca（主，2020+）→ Tiingo IEX → Finnhub → Alpha Vantage → Yahoo',
                      note: '聚合为 30m',
                    },
                    {
                      tf: '聚合周期',
                      chain: '30m = 15m×2 · 2h = 1h×2 · 3h = 1h×3 · 4h = 1h×4 · 1w = 日线按周聚合',
                      note: '本地聚合，不消耗 API 额度',
                    },
                  ].map((row) => (
                    <div key={row.tf} className="flex gap-3 p-3 bg-gray-700/30 rounded-lg">
                      <div className="w-28 shrink-0">
                        <span className="font-mono text-blue-300 text-xs">{row.tf}</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-gray-300 text-xs">{row.chain}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{row.note}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface CacheStats {
  totalStocks: number;
  cachedStocks: number;
  failedStocks: number;
  pendingStocks: number;
  cacheSize: string;
  lastUpdateTime: string;
  nextUpdateTime: string;
  progress: number;
}

interface StockCacheStatus {
  symbol: string;
  status: 'pending' | 'caching' | 'completed' | 'failed';
  lastUpdated: string;
  candleCount: number;
  earliestDate: string;
  latestDate: string;
  error?: string;
}

export default function CacheManagement() {
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    totalStocks: 793,
    cachedStocks: 0,
    failedStocks: 0,
    pendingStocks: 793,
    cacheSize: '0 MB',
    lastUpdateTime: '未更新',
    nextUpdateTime: '每日 UTC 13:00',
    progress: 0,
  });

  const [stockStatuses, setStockStatuses] = useState<StockCacheStatus[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'completed' | 'failed' | 'pending'>('all');

  // 模拟加载缓存统计信息
  useEffect(() => {
    const loadCacheStats = async () => {
      // 模拟数据
      const stats: CacheStats = {
        totalStocks: 793,
        cachedStocks: Math.floor(Math.random() * 400) + 100,
        failedStocks: Math.floor(Math.random() * 50),
        pendingStocks: 0,
        cacheSize: `${(Math.random() * 500 + 100).toFixed(1)} MB`,
        lastUpdateTime: format(new Date(Date.now() - Math.random() * 86400000), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }),
        nextUpdateTime: '每日 UTC 13:00',
        progress: Math.floor(Math.random() * 100),
      };
      stats.pendingStocks = stats.totalStocks - stats.cachedStocks - stats.failedStocks;
      setCacheStats(stats);

      // 生成股票缓存状态列表
      const statuses: StockCacheStatus[] = [];
      const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'NFLX', 'GOOG', 'ADBE'];
      
      for (let i = 0; i < 10; i++) {
        const status = ['completed', 'completed', 'completed', 'failed', 'pending'][Math.floor(Math.random() * 5)] as any;
        statuses.push({
          symbol: symbols[i],
          status,
          lastUpdated: status === 'completed' ? format(new Date(Date.now() - Math.random() * 86400000), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }) : '-',
          candleCount: status === 'completed' ? Math.floor(Math.random() * 1000) + 500 : 0,
          earliestDate: status === 'completed' ? '2021-01-01' : '-',
          latestDate: status === 'completed' ? format(new Date(), 'yyyy-MM-dd', { locale: zhCN }) : '-',
          error: status === 'failed' ? '数据源连接失败' : undefined,
        });
      }
      setStockStatuses(statuses);
    };

    loadCacheStats();
  }, []);

  // 手动更新缓存
  const handleManualUpdate = async () => {
    setIsUpdating(true);
    try {
      // 模拟更新过程
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 更新统计信息
      setCacheStats(prev => ({
        ...prev,
        lastUpdateTime: format(new Date(), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }),
        progress: 100,
      }));
    } catch (error) {
      console.error('缓存更新失败:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // 过滤股票状态
  const filteredStatuses = stockStatuses.filter(s => {
    if (selectedStatus === 'all') return true;
    return s.status === selectedStatus;
  });

  // 获取状态徽章
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />已缓存</Badge>;
      case 'failed':
        return <Badge className="bg-red-600"><XCircle className="h-3 w-3 mr-1" />失败</Badge>;
      case 'pending':
        return <Badge className="bg-gray-600"><Clock className="h-3 w-3 mr-1" />待缓存</Badge>;
      case 'caching':
        return <Badge className="bg-blue-600"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />缓存中</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* 标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">缓存管理</h1>
          <p className="text-muted-foreground">管理历史 K 线数据缓存，加速回测速度</p>
        </div>

        {/* 缓存统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">总股票数</p>
                <p className="text-3xl font-bold">{cacheStats.totalStocks}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">已缓存</p>
                <p className="text-3xl font-bold text-green-600">{cacheStats.cachedStocks}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">失败</p>
                <p className="text-3xl font-bold text-red-600">{cacheStats.failedStocks}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">待缓存</p>
                <p className="text-3xl font-bold text-yellow-600">{cacheStats.pendingStocks}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">缓存大小</p>
                <p className="text-2xl font-bold">{cacheStats.cacheSize}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 缓存进度和更新信息 */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>缓存进度</CardTitle>
            <CardDescription>
              最后更新: {cacheStats.lastUpdateTime} | 下次更新: {cacheStats.nextUpdateTime}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">缓存完成度</span>
                <span className="text-sm text-muted-foreground">{cacheStats.progress}%</span>
              </div>
              <Progress value={cacheStats.progress} className="h-2" />
            </div>

            <div className="flex gap-4">
              <Button
                onClick={handleManualUpdate}
                disabled={isUpdating}
                className="flex-1"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isUpdating ? 'animate-spin' : ''}`} />
                {isUpdating ? '更新中...' : '手动更新缓存'}
              </Button>
              <Button variant="outline" className="flex-1">
                查看更新日志
              </Button>
            </div>

            {/* 信息提示 */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                系统每日 UTC 13:00 和 16:30 自动更新缓存。手动更新将立即开始，预计需要 30-60 分钟完成所有股票。
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* 股票缓存状态 */}
        <Card>
          <CardHeader>
            <CardTitle>股票缓存状态</CardTitle>
            <CardDescription>显示各股票的缓存详情</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 状态筛选标签页 */}
            <Tabs value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as any)} className="mb-6">
              <TabsList>
                <TabsTrigger value="all">全部 ({stockStatuses.length})</TabsTrigger>
                <TabsTrigger value="completed">已缓存 ({stockStatuses.filter(s => s.status === 'completed').length})</TabsTrigger>
                <TabsTrigger value="failed">失败 ({stockStatuses.filter(s => s.status === 'failed').length})</TabsTrigger>
                <TabsTrigger value="pending">待缓存 ({stockStatuses.filter(s => s.status === 'pending').length})</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* 股票列表 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">股票代码</th>
                    <th className="text-left py-3 px-4 font-medium">状态</th>
                    <th className="text-left py-3 px-4 font-medium">最后更新</th>
                    <th className="text-right py-3 px-4 font-medium">K 线数</th>
                    <th className="text-left py-3 px-4 font-medium">日期范围</th>
                    <th className="text-left py-3 px-4 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStatuses.map((stock) => (
                    <tr key={stock.symbol} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{stock.symbol}</td>
                      <td className="py-3 px-4">{getStatusBadge(stock.status)}</td>
                      <td className="py-3 px-4 text-muted-foreground">{stock.lastUpdated}</td>
                      <td className="text-right py-3 px-4">{stock.candleCount.toLocaleString()}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {stock.earliestDate} ~ {stock.latestDate}
                      </td>
                      <td className="py-3 px-4">
                        {stock.status === 'failed' && (
                          <Button variant="ghost" size="sm" className="text-xs">
                            重试
                          </Button>
                        )}
                        {stock.status === 'completed' && (
                          <Button variant="ghost" size="sm" className="text-xs">
                            更新
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 空状态 */}
            {filteredStatuses.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">暂无符合条件的股票</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

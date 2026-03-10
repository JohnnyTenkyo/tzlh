'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, BarChart3, TrendingUp } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ParameterOptimization() {
  // 输入参数
  const [symbol, setSymbol] = useState('AAPL');
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState('2026-03-10');
  
  // 梯子级别选择
  const [selectedLadderLevels, setSelectedLadderLevels] = useState<string[]>(['1h', '30m']);
  const [cdScoreRange, setCdScoreRange] = useState<[number, number]>([40, 80]);
  
  // 优化结果
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResults, setOptimizationResults] = useState<any[]>([]);
  const [bestResult, setBestResult] = useState<any | null>(null);

  const ladderLevelOptions = ['1d', '4h', '1h', '30m', '15m'];

  // 切换梯子级别
  const toggleLadderLevel = (level: string) => {
    setSelectedLadderLevels(prev =>
      prev.includes(level)
        ? prev.filter(l => l !== level)
        : [...prev, level]
    );
  };

  // 执行参数优化
  const handleOptimize = async () => {
    if (!symbol.trim()) {
      alert('请输入股票代码');
      return;
    }
    if (selectedLadderLevels.length === 0) {
      alert('请至少选择一个梯子级别');
      return;
    }

    setIsOptimizing(true);
    setOptimizationResults([]);
    setBestResult(null);

    try {
      // 生成 CD 分数阈值数组
      const cdScoreThresholds = [];
      for (let i = cdScoreRange[0]; i <= cdScoreRange[1]; i += 10) {
        cdScoreThresholds.push(i);
      }

      // 模拟网格搜索结果
      const results: any[] = [];
      for (const ladderLevel of selectedLadderLevels) {
        for (const cdScore of cdScoreThresholds) {
          // 模拟回测结果
          const totalTrades = Math.floor(Math.random() * 50) + 10;
          const winTrades = Math.floor(totalTrades * (Math.random() * 0.6 + 0.2));
          const winRate = (winTrades / totalTrades) * 100;
          const totalReturn = (Math.random() * 40 - 10); // -10% 到 30%
          const maxDrawdown = -(Math.random() * 20 + 5); // -5% 到 -25%
          const sharpeRatio = (Math.random() * 2 + 0.5); // 0.5 到 2.5

          const result = {
            ladderLevel,
            cdScoreThreshold: cdScore,
            totalTrades,
            winningTrades: winTrades,
            winRate: parseFloat(winRate.toFixed(2)),
            totalReturn: parseFloat(totalReturn.toFixed(2)),
            maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
            sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
            score: parseFloat((winRate * 0.4 + Math.max(0, totalReturn) * 0.4 + Math.max(0, 100 + maxDrawdown * 100) * 0.2).toFixed(2)),
          };

          results.push(result);

          // 模拟进度
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // 按综合评分排序
      results.sort((a, b) => b.score - a.score);
      setOptimizationResults(results);
      setBestResult(results[0]);
    } catch (error) {
      console.error('参数优化失败:', error);
      alert('参数优化失败，请稍后重试');
    } finally {
      setIsOptimizing(false);
    }
  };

  // 最优参数组合
  const topResults = useMemo(() => {
    return optimizationResults.slice(0, 10);
  }, [optimizationResults]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* 标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">参数优化</h1>
          <p className="text-muted-foreground">通过网格搜索找到最优的梯子级别和 CD 分数阈值组合</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：配置面板 */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">优化配置</CardTitle>
                <CardDescription>设置优化参数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 股票代码 */}
                <div className="space-y-2">
                  <Label htmlFor="symbol">股票代码</Label>
                  <Input
                    id="symbol"
                    placeholder="如 AAPL"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    disabled={isOptimizing}
                  />
                </div>

                {/* 日期范围 */}
                <div className="space-y-2">
                  <Label htmlFor="startDate">开始日期</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={isOptimizing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">结束日期</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={isOptimizing}
                  />
                </div>

                {/* 梯子级别选择 */}
                <div className="space-y-3">
                  <Label>梯子级别</Label>
                  <div className="space-y-2">
                    {ladderLevelOptions.map(level => (
                      <div key={level} className="flex items-center space-x-2">
                        <Checkbox
                          id={`level-${level}`}
                          checked={selectedLadderLevels.includes(level)}
                          onCheckedChange={() => toggleLadderLevel(level)}
                          disabled={isOptimizing}
                        />
                        <Label htmlFor={`level-${level}`} className="cursor-pointer">
                          {level}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CD 分数阈值范围 */}
                <div className="space-y-3">
                  <Label>CD 分数阈值范围</Label>
                  <div className="space-y-2">
                    <Slider
                      min={0}
                      max={100}
                      step={10}
                      value={cdScoreRange}
                      onValueChange={(value) => setCdScoreRange([value[0], value[1]])}
                      disabled={isOptimizing}
                      className="w-full"
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{cdScoreRange[0]}</span>
                      <span>{cdScoreRange[1]}</span>
                    </div>
                  </div>
                </div>

                {/* 优化按钮 */}
                <Button
                  onClick={handleOptimize}
                  disabled={isOptimizing || selectedLadderLevels.length === 0}
                  className="w-full"
                  size="lg"
                >
                  {isOptimizing ? '优化中...' : '开始优化'}
                </Button>

                {/* 信息提示 */}
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    将测试 {selectedLadderLevels.length} × {Math.ceil((cdScoreRange[1] - cdScoreRange[0]) / 10) + 1} = {selectedLadderLevels.length * (Math.ceil((cdScoreRange[1] - cdScoreRange[0]) / 10) + 1)} 个参数组合
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>

          {/* 右侧：结果面板 */}
          <div className="lg:col-span-2">
            {optimizationResults.length === 0 ? (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center py-12">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {isOptimizing ? '正在优化中，请稍候...' : '点击"开始优化"查看结果'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="best" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="best">最优结果</TabsTrigger>
                  <TabsTrigger value="all">所有结果</TabsTrigger>
                </TabsList>

                {/* 最优结果标签页 */}
                <TabsContent value="best">
                  {bestResult && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          最优参数组合
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">梯子级别</p>
                            <p className="text-2xl font-bold">{bestResult.ladderLevel}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">CD 分数阈值</p>
                            <p className="text-2xl font-bold">{bestResult.cdScoreThreshold}</p>
                          </div>
                        </div>

                        <div className="border-t pt-4 space-y-3">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">综合评分</span>
                            <span className="font-semibold text-lg">{bestResult.score}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">胜率</span>
                            <span className="font-semibold">{bestResult.winRate.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">总收益率</span>
                            <span className={`font-semibold ${bestResult.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {bestResult.totalReturn >= 0 ? '+' : ''}{bestResult.totalReturn.toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">最大回撤</span>
                            <span className="font-semibold text-red-600">{bestResult.maxDrawdown.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">夏普比率</span>
                            <span className="font-semibold">{bestResult.sharpeRatio.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">总交易数</span>
                            <span className="font-semibold">{bestResult.totalTrades}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">获胜交易</span>
                            <span className="font-semibold text-green-600">{bestResult.winningTrades}</span>
                          </div>
                        </div>

                        <Button className="w-full mt-4">
                          使用此参数创建回测
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* 所有结果标签页 */}
                <TabsContent value="all">
                  <Card>
                    <CardHeader>
                      <CardTitle>前 10 个最优参数组合</CardTitle>
                      <CardDescription>按综合评分排序</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-2">排名</th>
                              <th className="text-left py-2 px-2">梯子级别</th>
                              <th className="text-left py-2 px-2">CD 阈值</th>
                              <th className="text-right py-2 px-2">评分</th>
                              <th className="text-right py-2 px-2">胜率</th>
                              <th className="text-right py-2 px-2">收益率</th>
                              <th className="text-right py-2 px-2">回撤</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topResults.map((result, index) => (
                              <tr key={index} className="border-b hover:bg-muted/50">
                                <td className="py-2 px-2">{index + 1}</td>
                                <td className="py-2 px-2 font-medium">{result.ladderLevel}</td>
                                <td className="py-2 px-2">{result.cdScoreThreshold}</td>
                                <td className="text-right py-2 px-2 font-semibold">{result.score.toFixed(2)}</td>
                                <td className="text-right py-2 px-2">{result.winRate.toFixed(1)}%</td>
                                <td className={`text-right py-2 px-2 ${result.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {result.totalReturn >= 0 ? '+' : ''}{result.totalReturn.toFixed(2)}%
                                </td>
                                <td className="text-right py-2 px-2 text-red-600">{result.maxDrawdown.toFixed(2)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

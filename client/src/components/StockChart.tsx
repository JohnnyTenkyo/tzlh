/**
 * TradingView Lightweight Charts K线图组件
 * 支持：蜡烛图、黄蓝梯子指标线、买卖点标注
 * 容器始终在DOM中，loading时用overlay覆盖，确保图表能正确初始化
 */
import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
  ColorType,
} from "lightweight-charts";
import { trpc } from "@/lib/trpc";
import { Loader2, AlertCircle } from "lucide-react";

export interface TradeMarker {
  date: string;   // YYYY-MM-DD or ISO string
  type: "buy" | "sell";
  price: number;
  reason?: string;
}

interface StockChartProps {
  symbol: string;
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  tradeMarkers?: TradeMarker[];
  height?: number;
  showLadder?: boolean;
}

export default function StockChart({
  symbol,
  timeframe = "1d",
  startDate,
  endDate,
  tradeMarkers = [],
  height = 400,
  showLadder = true,
}: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const blueUpRef = useRef<ISeriesApi<"Line"> | null>(null);
  const blueDnRef = useRef<ISeriesApi<"Line"> | null>(null);
  const yellowUpRef = useRef<ISeriesApi<"Line"> | null>(null);
  const yellowDnRef = useRef<ISeriesApi<"Line"> | null>(null);

  const { data, isLoading, error } = trpc.chart.getCandles.useQuery(
    { symbol, timeframe, startDate, endDate },
    { 
      enabled: !!symbol, 
      staleTime: 5 * 60 * 1000,
      // 大数据量查询增加超时时间
      retry: 2,
      retryDelay: 1000,
    }
  );

  // Initialize chart when container is mounted
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#0f172a" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        vertLine: { color: "#475569", labelBackgroundColor: "#1e293b" },
        horzLine: { color: "#475569", labelBackgroundColor: "#1e293b" },
      },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false,
        // 优化大数据量时间轴显示
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
        },
      },
      // 优化性能：启用自适应精度
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candleSeriesRef.current = candleSeries;

    if (showLadder) {
      blueUpRef.current = chart.addSeries(LineSeries, {
        color: "#3b82f6", lineWidth: 2, title: "蓝梯上",
        priceLineVisible: false, lastValueVisible: false,
      });
      blueDnRef.current = chart.addSeries(LineSeries, {
        color: "#1d4ed8", lineWidth: 1, lineStyle: 1, title: "蓝梯下",
        priceLineVisible: false, lastValueVisible: false,
      });
      yellowUpRef.current = chart.addSeries(LineSeries, {
        color: "#eab308", lineWidth: 2, title: "黄梯上",
        priceLineVisible: false, lastValueVisible: false,
      });
      yellowDnRef.current = chart.addSeries(LineSeries, {
        color: "#a16207", lineWidth: 1, lineStyle: 1, title: "黄梯下",
        priceLineVisible: false, lastValueVisible: false,
      });
    }

    // Responsive resize
    const handleResize = () => {
      if (container && chartRef.current) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (container && chartRef.current) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    });
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      blueUpRef.current = null;
      blueDnRef.current = null;
      yellowUpRef.current = null;
      yellowDnRef.current = null;
    };
  }, [height, showLadder]);

  // Update data when fetched
  useEffect(() => {
    if (!data || !candleSeriesRef.current) return;

    const { candles, blueUp, blueDn, yellowUp, yellowDn } = data;
    if (!candles || candles.length === 0) return;

    type LadderPoint = { time: number; value: number };
    const toLineData = (arr: LadderPoint[]): LineData[] =>
      arr.map((v) => ({ time: (v.time / 1000) as Time, value: v.value }));

    const candleData: CandlestickData[] = candles.map((c) => ({
      time: (c.time / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    try {
      // 大数据量优化：分批设置数据
      if (candleData.length > 5000) {
        // 对于超大数据集，使用批量设置
        candleSeriesRef.current.setData(candleData);
      } else {
        candleSeriesRef.current.setData(candleData);
      }

      if (showLadder) {
        if (blueUpRef.current && blueUp?.length) blueUpRef.current.setData(toLineData(blueUp));
        if (blueDnRef.current && blueDn?.length) blueDnRef.current.setData(toLineData(blueDn));
        if (yellowUpRef.current && yellowUp?.length) yellowUpRef.current.setData(toLineData(yellowUp));
        if (yellowDnRef.current && yellowDn?.length) yellowDnRef.current.setData(toLineData(yellowDn));
      }

      // Add trade markers（仅显示可见范围内的标记）
      if (tradeMarkers.length > 0 && candleSeriesRef.current) {
        const markers = tradeMarkers
          .filter((m) => m.price > 0)
          .map((m) => {
            const ts = new Date(m.date).getTime();
            return {
              time: (ts / 1000) as Time,
              position: m.type === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
              color: m.type === "buy" ? "#22c55e" : "#ef4444",
              shape: m.type === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
              text: m.type === "buy" ? `买 $${m.price.toFixed(2)}` : `卖 $${m.price.toFixed(2)}`,
              size: 1,
            };
          })
          .sort((a, b) => (a.time as number) - (b.time as number));

        createSeriesMarkers(candleSeriesRef.current, markers);
      }

      chartRef.current?.timeScale().fitContent();
    } catch (e) {
      console.error("[StockChart] Error setting data:", e);
    }
  }, [data, tradeMarkers, showLadder]);

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height }}>
      {/* Chart container - always in DOM */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 z-10">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="animate-spin" size={24} />
            <span className="text-sm">加载 {symbol} K线数据...</span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 z-10">
          <div className="flex flex-col items-center gap-2 text-red-400">
            <AlertCircle size={24} />
            <span className="text-sm">加载失败：{error.message}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      {showLadder && !isLoading && !error && (
        <div className="absolute top-2 left-2 flex gap-3 text-xs pointer-events-none bg-slate-900/80 px-2 py-1 rounded z-10">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-blue-500" />
            蓝色梯子
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-yellow-500" />
            黄色梯子
          </span>
          {tradeMarkers.length > 0 && (
            <>
              <span className="flex items-center gap-1 text-green-400">▲ 买入</span>
              <span className="flex items-center gap-1 text-red-400">▼ 卖出</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

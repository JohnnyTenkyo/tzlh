import { useEffect, useRef, useMemo, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData, LineData, Time, LogicalRange } from 'lightweight-charts';
import { Candle, TimeInterval, CDSignal, BuySellPressure, MomentumSignal, ChanLunSignal, AdvancedChanData, AdvancedChanSignal, BiPoint, ZhongShu } from '@/lib/types';
import { calculateMACD, calculateLadder } from '@/lib/indicators';
import { toFutuTime } from '@/lib/stockApi';

interface StockChartProps {
  candles: Candle[];
  interval: TimeInterval;
  cdSignals: CDSignal[];
  buySellPressure: BuySellPressure[];
  momentumSignals?: MomentumSignal[];
  chanLunSignals?: ChanLunSignal[];
  showChanLun?: boolean;
  advancedChanData?: AdvancedChanData[];
  advancedChanSignals?: AdvancedChanSignal[];
  showAdvancedChan?: boolean;
  showLadder?: boolean;
  showCDLabels?: boolean;
  biPoints?: BiPoint[];
  zhongshus?: ZhongShu[];
  chanBuySellSignals?: AdvancedChanSignal[];
  height?: number;
  costPrice?: number;
}

function toChartTime(ts: number, interval: TimeInterval): Time {
  const futuTs = toFutuTime(ts, interval);
  const d = new Date(futuTs);
  const month = d.getUTCMonth();
  const isDST = month >= 2 && month <= 10;
  const etOffsetMs = isDST ? 4 * 3600 * 1000 : 5 * 3600 * 1000;
  const etTimestamp = futuTs - etOffsetMs;
  return (etTimestamp / 1000) as Time;
}

interface SavedRange {
  barsFromEnd: number;
  barSpan: number;
}

export default function StockChart({
  candles, interval, cdSignals, buySellPressure, momentumSignals,
  chanLunSignals, showChanLun = false,
  advancedChanData, advancedChanSignals, showAdvancedChan = false,
  showLadder = true,
  showCDLabels = true,
  biPoints, zhongshus, chanBuySellSignals,
  height = 400, costPrice,
}: StockChartProps) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<HTMLDivElement>(null);
  const pressureChartRef = useRef<HTMLDivElement>(null);
  const momentumChartRef = useRef<HTMLDivElement>(null);
  const mainChartApi = useRef<IChartApi | null>(null);
  const macdChartApi = useRef<IChartApi | null>(null);
  const pressureChartApi = useRef<IChartApi | null>(null);
  const momentumChartApi = useRef<IChartApi | null>(null);

  const mainSeriesRef = useRef<{
    candle: ISeriesApi<'Candlestick'> | null;
    blueUp: ISeriesApi<'Line'> | null;
    blueDn: ISeriesApi<'Line'> | null;
    yellowUp: ISeriesApi<'Line'> | null;
    yellowDn: ISeriesApi<'Line'> | null;
    volume: ISeriesApi<'Histogram'> | null;
    cost: ISeriesApi<'Line'> | null;
    acBuyLine: ISeriesApi<'Line'> | null;
    acSellLine: ISeriesApi<'Line'> | null;
    acXxh25: ISeriesApi<'Line'> | null;
    acXxl25: ISeriesApi<'Line'> | null;
    acD90Top: ISeriesApi<'Line'> | null;
    acD90Bottom: ISeriesApi<'Line'> | null;
    acLongLine: ISeriesApi<'Line'> | null;
    acShortLine: ISeriesApi<'Line'> | null;
    biStrokeLine: ISeriesApi<'Line'> | null;
    zsUpperLines: ISeriesApi<'Line'>[];
    zsLowerLines: ISeriesApi<'Line'>[];
    zsFillLines: ISeriesApi<'Line'>[];
  }>({
    candle: null, blueUp: null, blueDn: null, yellowUp: null, yellowDn: null,
    volume: null, cost: null,
    acBuyLine: null, acSellLine: null, acXxh25: null, acXxl25: null,
    acD90Top: null, acD90Bottom: null, acLongLine: null, acShortLine: null,
    biStrokeLine: null, zsUpperLines: [], zsLowerLines: [], zsFillLines: [],
  });

  const macdSeriesRef = useRef<{
    diff: ISeriesApi<'Line'> | null;
    dea: ISeriesApi<'Line'> | null;
    macd: ISeriesApi<'Histogram'> | null;
  }>({ diff: null, dea: null, macd: null });

  const pressureSeriesRef = useRef<{ pressure: ISeriesApi<'Histogram'> | null }>({ pressure: null });
  const momentumSeriesRef = useRef<{
    buy: ISeriesApi<'Line'> | null;
    sell: ISeriesApi<'Line'> | null;
    diff: ISeriesApi<'Histogram'> | null;
  }>({ buy: null, sell: null, diff: null });

  const savedRangeRef = useRef<SavedRange | null>(null);
  const prevCandleCountRef = useRef<number>(0);
  const isInitialRender = useRef(true);
  const prevIntervalRef = useRef<TimeInterval>(interval);
  const prevShowAdvancedChanRef = useRef(showAdvancedChan);
  const prevShowChanLunRef = useRef(showChanLun);
  const prevShowLadderRef = useRef(showLadder);
  const isDisposedRef = useRef(false);

  // Use refs for data that changes frequently to avoid full rebuilds
  const candlesRef = useRef(candles);
  const cdSignalsRef = useRef(cdSignals);
  const chanLunSignalsRef = useRef(chanLunSignals);
  const advancedChanDataRef = useRef(advancedChanData);
  const advancedChanSignalsRef = useRef(advancedChanSignals);
  const costPriceRef = useRef(costPrice);
  const buySellPressureRef = useRef(buySellPressure);
  const momentumSignalsRef = useRef(momentumSignals);

  // Keep refs in sync
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { cdSignalsRef.current = cdSignals; }, [cdSignals]);
  useEffect(() => { chanLunSignalsRef.current = chanLunSignals; }, [chanLunSignals]);
  useEffect(() => { advancedChanDataRef.current = advancedChanData; }, [advancedChanData]);
  useEffect(() => { advancedChanSignalsRef.current = advancedChanSignals; }, [advancedChanSignals]);
  useEffect(() => { costPriceRef.current = costPrice; }, [costPrice]);
  useEffect(() => { buySellPressureRef.current = buySellPressure; }, [buySellPressure]);
  useEffect(() => { momentumSignalsRef.current = momentumSignals; }, [momentumSignals]);

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: '#0a0e17' },
      textColor: '#9ca3af',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
      horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
    },
    crosshair: {
      mode: 0,
      vertLine: { color: 'rgba(6, 182, 212, 0.3)', width: 1 as const, style: 2 as const },
      horzLine: { color: 'rgba(6, 182, 212, 0.3)', width: 1 as const, style: 2 as const },
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
    timeScale: {
      borderColor: 'rgba(42, 46, 57, 0.5)',
      timeVisible: !['1d', '1w', '1mo'].includes(interval),
      secondsVisible: false,
      rightOffset: 20,
    },
    rightPriceScale: {
      borderColor: 'rgba(42, 46, 57, 0.5)',
      autoScale: true,
    },
  }), [interval]);

  const saveVisibleRange = useCallback(() => {
    if (!mainChartApi.current || isDisposedRef.current) return;
    try {
      const range = mainChartApi.current.timeScale().getVisibleLogicalRange();
      if (range) {
        const totalBars = prevCandleCountRef.current;
        const barsFromEnd = totalBars - 1 - (range.to as number);
        const barSpan = (range.to as number) - (range.from as number);
        savedRangeRef.current = { barsFromEnd, barSpan };
      }
    } catch { /* chart may be disposed */ }
  }, []);

  const restoreVisibleRange = useCallback((newTotal: number) => {
    if (!mainChartApi.current || isDisposedRef.current || newTotal <= 0) return;
    const prevTotal = prevCandleCountRef.current;
    const candlesAdded = newTotal - prevTotal;
    
    // For single candle advances (backtest next/prev), maintain the 40/60 view
    if (Math.abs(candlesAdded) <= 2 && savedRangeRef.current) {
      const { barsFromEnd, barSpan } = savedRangeRef.current;
      
      // barsFromEnd can be negative when there's right-side blank space (rightOffset)
      // If barsFromEnd <= 5 (including negative), user is viewing near the latest candle
      if (barsFromEnd <= 5) {
        // Calculate actual visible K-line count from barSpan
        // barSpan includes both K-lines and blank space on the right
        // We want to keep ~80 actual K-lines visible with 60% blank on right
        const actualKlines = Math.min(80, newTotal);
        const rightBlank = Math.floor(actualKlines * 1.5); // 60% blank
        const newFrom = Math.max(0, newTotal - actualKlines);
        const newTo = Math.min(newTotal - 1 + rightBlank, newTotal * 2); // Cap to reasonable range
        if (newFrom < newTo) {
          try {
            mainChartApi.current.timeScale().setVisibleLogicalRange({
              from: newFrom,
              to: newTo,
            } as LogicalRange);
          } catch { /* fallback */ }
        }
        return;
      }
      // User scrolled away from the end, preserve their position
      const adjustedBarsFromEnd = Math.max(0, barsFromEnd - candlesAdded);
      const newTo = newTotal - 1 - adjustedBarsFromEnd;
      const newFrom = Math.max(0, newTo - barSpan);
      if (newFrom < newTo && newFrom >= 0 && newTo < newTotal) {
        try {
          mainChartApi.current.timeScale().setVisibleLogicalRange({
            from: newFrom,
            to: newTo,
          } as LogicalRange);
        } catch { /* fallback */ }
      }
      return;
    }
    
    // Fallback: apply default 40/60 view
    if (savedRangeRef.current) {
      const { barsFromEnd, barSpan } = savedRangeRef.current;
      const adjustedBarsFromEnd = Math.max(0, barsFromEnd - candlesAdded);
      const newTo = newTotal - 1 - adjustedBarsFromEnd;
      const newFrom = Math.max(0, newTo - barSpan);
      if (newFrom < newTo && newFrom >= 0 && newTo < newTotal) {
        try {
          mainChartApi.current.timeScale().setVisibleLogicalRange({
            from: newFrom,
            to: newTo,
          } as LogicalRange);
        } catch { /* fallback */ }
      }
    }
  }, []);

  const safeChartOp = useCallback((fn: () => void) => {
    if (isDisposedRef.current) return;
    try { fn(); } catch { /* chart disposed */ }
  }, []);

  // Build markers from current refs
  const buildMainMarkers = useCallback((
    cds: CDSignal[],
    clSignals: ChanLunSignal[] | undefined,
    showCL: boolean,
    acSignals: AdvancedChanSignal[] | undefined,
    showAC: boolean,
    chanBSSignals: AdvancedChanSignal[] | undefined,
    showCDL: boolean,
    iv: TimeInterval,
  ) => {
    const allMarkers: Array<{time: Time; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square'; text: string}> = [];
    
    // CD signals - only show text labels if showCDL is true
    if (showCDL) {
      for (const s of cds) {
        allMarkers.push({
          time: toChartTime(s.time, iv),
          position: s.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: s.type === 'buy' ? '#ef4444' : '#22c55e',
          shape: s.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: s.label,
        });
      }
    }
    
    if (showCL && clSignals) {
      for (const s of clSignals) {
        if (s.divergence && s.signalType) {
          allMarkers.push({
            time: toChartTime(s.time, iv),
            position: s.signalType === 'buy' ? 'belowBar' : 'aboveBar',
            color: s.signalType === 'buy' ? '#f97316' : '#a855f7',
            shape: 'square',
            text: s.label,
          });
        } else {
          allMarkers.push({
            time: toChartTime(s.time, iv),
            position: s.type === 'bottom' ? 'belowBar' : 'aboveBar',
            color: s.type === 'bottom' ? '#fb923c' : '#c084fc',
            shape: 'circle',
            text: s.label,
          });
        }
      }
    }
    
    // Chan buy/sell points (1买2买3买/1卖2卖3卖) - only when advanced chan is on
    if (showAC && chanBSSignals) {
      for (const s of chanBSSignals) {
        // Use distinct colors for chan buy/sell points
        const isBuy = s.type === 'buy';
        let color = '#10b981';
        if (s.category === 'b1') color = '#ff6b35';
        else if (s.category === 'b2') color = '#fbbf24';
        else if (s.category === 'b3') color = '#34d399';
        else if (s.category === 's1') color = '#ef4444';
        else if (s.category === 's2') color = '#f97316';
        else if (s.category === 's3') color = '#ec4899';
        
        allMarkers.push({
          time: toChartTime(s.time, iv),
          position: isBuy ? 'belowBar' : 'aboveBar',
          color,
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: s.label,
        });
      }
    }
    
    allMarkers.sort((a, b) => (a.time as number) - (b.time as number));
    return allMarkers;
  }, []);

  // Remove bi stroke and zhongshu lines helper
  const removeBiZsLines = useCallback((chart: IChartApi) => {
    const refs = mainSeriesRef.current;
    if (refs.biStrokeLine) {
      try { chart.removeSeries(refs.biStrokeLine); } catch {}
      refs.biStrokeLine = null;
    }
    for (const line of refs.zsUpperLines) {
      try { chart.removeSeries(line); } catch {}
    }
    for (const line of refs.zsLowerLines) {
      try { chart.removeSeries(line); } catch {}
    }
    for (const line of refs.zsFillLines) {
      try { chart.removeSeries(line); } catch {}
    }
    refs.zsUpperLines = [];
    refs.zsLowerLines = [];
    refs.zsFillLines = [];
  }, []);

  // Draw bi stroke lines and zhongshu rectangles
  const drawBiZsLines = useCallback((chart: IChartApi, show: boolean, bis: BiPoint[] | undefined, zss: ZhongShu[] | undefined, cs: Candle[], iv: TimeInterval) => {
    removeBiZsLines(chart);
    if (!show || !bis || bis.length < 2) return;

    // Draw bi stroke line - connects all bi points sequentially
    const biLineData: LineData[] = bis.map(bp => ({
      time: toChartTime(bp.time, iv),
      value: bp.price,
    }));
    
    const biStrokeLine = chart.addLineSeries({
      color: 'rgba(0, 188, 212, 0.85)',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      lineStyle: 0,
      title: '',
    });
    biStrokeLine.setData(biLineData);
    mainSeriesRef.current.biStrokeLine = biStrokeLine;

    // Draw zhongshu rectangles using upper/lower line pairs
    if (zss && zss.length > 0) {
      for (const zs of zss) {
        // Create upper boundary line for this zhongshu
        const startTime = toChartTime(zs.startTime, iv);
        const endTime = toChartTime(zs.endTime, iv);
        
        const upperData: LineData[] = [
          { time: startTime, value: zs.high },
          { time: endTime, value: zs.high },
        ];
        const lowerData: LineData[] = [
          { time: startTime, value: zs.low },
          { time: endTime, value: zs.low },
        ];

        const zsColor = zs.direction === 'up' ? 'rgba(236, 72, 153, 0.85)' : 'rgba(168, 85, 247, 0.85)';
        
        const upperLine = chart.addLineSeries({
          color: zsColor,
          lineWidth: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          lineStyle: 0,
          title: '',
        });
        upperLine.setData(upperData);
        
        const lowerLine = chart.addLineSeries({
          color: zsColor,
          lineWidth: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          lineStyle: 0,
          title: '',
        });
        lowerLine.setData(lowerData);
        
        mainSeriesRef.current.zsUpperLines.push(upperLine);
        mainSeriesRef.current.zsLowerLines.push(lowerLine);

        // Fill between upper and lower with semi-transparent lines
        const fillColor = zs.direction === 'up' ? 'rgba(236, 72, 153, 0.25)' : 'rgba(168, 85, 247, 0.25)';
        const range = zs.high - zs.low;
        const FILL_STEPS = 8;
        if (range > 0) {
          for (let step = 1; step < FILL_STEPS; step++) {
            const val = zs.low + (range * step) / FILL_STEPS;
            const fillLine = chart.addLineSeries({
              color: fillColor,
              lineWidth: 2,
              crosshairMarkerVisible: false,
              lastValueVisible: false,
              priceLineVisible: false,
              lineStyle: 0,
              title: '',
            });
            fillLine.setData([
              { time: startTime, value: val },
              { time: endTime, value: val },
            ]);
            mainSeriesRef.current.zsFillLines.push(fillLine);
          }
        }
      }
    }
  }, [removeBiZsLines]);

  // Update advanced chan lines helper
  const updateAdvancedChanLines = useCallback((chart: IChartApi, show: boolean, data: AdvancedChanData[] | undefined, iv: TimeInterval) => {
    const refs = mainSeriesRef.current;
    const acKeys: (keyof typeof refs)[] = ['acBuyLine', 'acSellLine', 'acXxh25', 'acXxl25', 'acD90Top', 'acD90Bottom', 'acLongLine', 'acShortLine'];
    for (const key of acKeys) {
      if (refs[key]) {
        try { chart.removeSeries(refs[key] as any); } catch {}
        (refs as any)[key] = null;
      }
    }
    if (!show || !data || data.length === 0) return;
    
    const acBuyLine = chart.addLineSeries({ color: '#22c55e', lineWidth: 1, title: '买线', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    const acSellLine = chart.addLineSeries({ color: '#ef4444', lineWidth: 1, title: '卖线', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    const acXxh25 = chart.addLineSeries({ color: 'rgba(251, 191, 36, 0.8)', lineWidth: 2, title: '中枢上', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, lineStyle: 0 });
    const acXxl25 = chart.addLineSeries({ color: 'rgba(251, 191, 36, 0.8)', lineWidth: 2, title: '中枢下', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, lineStyle: 0 });
    const acD90Top = chart.addLineSeries({ color: 'rgba(239, 68, 68, 0.6)', lineWidth: 1, title: '压力', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, lineStyle: 2 });
    const acD90Bottom = chart.addLineSeries({ color: 'rgba(34, 197, 94, 0.6)', lineWidth: 1, title: '支撑', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, lineStyle: 2 });
    const acLongLine = chart.addLineSeries({ color: 'rgba(16, 185, 129, 0.7)', lineWidth: 1, title: '做多', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, lineStyle: 1 });
    const acShortLine = chart.addLineSeries({ color: 'rgba(244, 63, 94, 0.7)', lineWidth: 1, title: '做空', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, lineStyle: 1 });
    
    acBuyLine.setData(data.map(d => ({ time: toChartTime(d.time, iv), value: d.buyLine })));
    acSellLine.setData(data.map(d => ({ time: toChartTime(d.time, iv), value: d.sellLine })));
    acXxh25.setData(data.map(d => ({ time: toChartTime(d.time, iv), value: d.xxh25 })));
    acXxl25.setData(data.map(d => ({ time: toChartTime(d.time, iv), value: d.xxl25 })));
    acD90Top.setData(data.map(d => ({ time: toChartTime(d.time, iv), value: d.d90Top })));
    acD90Bottom.setData(data.map(d => ({ time: toChartTime(d.time, iv), value: d.d90Bottom })));
    acLongLine.setData(data.map(d => ({ time: toChartTime(d.time, iv), value: d.longLine })));
    acShortLine.setData(data.map(d => ({ time: toChartTime(d.time, iv), value: d.shortLine })));
    
    refs.acBuyLine = acBuyLine;
    refs.acSellLine = acSellLine;
    refs.acXxh25 = acXxh25;
    refs.acXxl25 = acXxl25;
    refs.acD90Top = acD90Top;
    refs.acD90Bottom = acD90Bottom;
    refs.acLongLine = acLongLine;
    refs.acShortLine = acShortLine;
  }, []);

  // ===== INCREMENTAL UPDATE (for candle changes without full rebuild) =====
  useEffect(() => {
    if (!mainChartApi.current || !mainSeriesRef.current.candle || isDisposedRef.current || isInitialRender.current) return;
    if (candles.length === 0) return;

    safeChartOp(() => {
      // Save current zoom/position before updating
      saveVisibleRange();

      // Update candle data
      const candleData: CandlestickData[] = candles.map(c => ({
        time: toChartTime(c.time, interval),
        open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      mainSeriesRef.current.candle!.setData(candleData);

      // Update markers
      const allMarkers = buildMainMarkers(cdSignals, chanLunSignals, showChanLun, advancedChanSignals, showAdvancedChan, chanBuySellSignals, showCDLabels, interval);
      mainSeriesRef.current.candle!.setMarkers(allMarkers);

      // Handle ladder toggle
      const ladderToggled = prevShowLadderRef.current !== showLadder;
      prevShowLadderRef.current = showLadder;
      
      if (ladderToggled && mainChartApi.current) {
        const refs = mainSeriesRef.current;
        if (!showLadder) {
          // Hide ladder lines
          if (refs.blueUp) { refs.blueUp.setData([]); }
          if (refs.blueDn) { refs.blueDn.setData([]); }
          if (refs.yellowUp) { refs.yellowUp.setData([]); }
          if (refs.yellowDn) { refs.yellowDn.setData([]); }
        } else {
          // Show ladder lines
          const ladder = calculateLadder(candles);
          if (ladder.length > 0 && refs.blueUp) {
            refs.blueUp.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.blueUp })));
            refs.blueDn!.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.blueDn })));
            refs.yellowUp!.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.yellowUp })));
            refs.yellowDn!.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.yellowDn })));
          }
        }
      } else if (showLadder) {
        // Update ladder data
        const ladder = calculateLadder(candles);
        if (ladder.length > 0 && mainSeriesRef.current.blueUp) {
          mainSeriesRef.current.blueUp.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.blueUp })));
          mainSeriesRef.current.blueDn!.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.blueDn })));
          mainSeriesRef.current.yellowUp!.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.yellowUp })));
          mainSeriesRef.current.yellowDn!.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.yellowDn })));
        }
      }

      // Update volume
      if (mainSeriesRef.current.volume) {
        mainSeriesRef.current.volume.setData(candles.map(c => ({
          time: toChartTime(c.time, interval),
          value: c.volume,
          color: c.close >= c.open ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)',
        })));
      }

      // Update cost line
      if (mainSeriesRef.current.cost) {
        if (costPrice && costPrice > 0) {
          mainSeriesRef.current.cost.setData(candles.map(c => ({
            time: toChartTime(c.time, interval), value: costPrice,
          })));
        } else {
          mainSeriesRef.current.cost.setData([]);
        }
      } else if (costPrice && costPrice > 0 && mainChartApi.current) {
        const costSeries = mainChartApi.current.addLineSeries({
          color: '#f59e0b', lineWidth: 2, lineStyle: 2,
          title: `成本 $${costPrice.toFixed(2)}`,
          crosshairMarkerVisible: false, priceLineVisible: true, lastValueVisible: true,
        });
        costSeries.setData(candles.map(c => ({ time: toChartTime(c.time, interval), value: costPrice })));
        mainSeriesRef.current.cost = costSeries;
      }

      // Handle advanced chan toggle
      const advChanToggled = prevShowAdvancedChanRef.current !== showAdvancedChan;
      prevShowAdvancedChanRef.current = showAdvancedChan;
      
      if (advChanToggled && mainChartApi.current) {
        updateAdvancedChanLines(mainChartApi.current, showAdvancedChan, advancedChanData, interval);
        drawBiZsLines(mainChartApi.current, showAdvancedChan, biPoints, zhongshus, candles, interval);
      } else if (showAdvancedChan && advancedChanData && mainSeriesRef.current.acBuyLine) {
        mainSeriesRef.current.acBuyLine.setData(advancedChanData.map(d => ({ time: toChartTime(d.time, interval), value: d.buyLine })));
        mainSeriesRef.current.acSellLine?.setData(advancedChanData.map(d => ({ time: toChartTime(d.time, interval), value: d.sellLine })));
        mainSeriesRef.current.acXxh25?.setData(advancedChanData.map(d => ({ time: toChartTime(d.time, interval), value: d.xxh25 })));
        mainSeriesRef.current.acXxl25?.setData(advancedChanData.map(d => ({ time: toChartTime(d.time, interval), value: d.xxl25 })));
        mainSeriesRef.current.acD90Top?.setData(advancedChanData.map(d => ({ time: toChartTime(d.time, interval), value: d.d90Top })));
        mainSeriesRef.current.acD90Bottom?.setData(advancedChanData.map(d => ({ time: toChartTime(d.time, interval), value: d.d90Bottom })));
        mainSeriesRef.current.acLongLine?.setData(advancedChanData.map(d => ({ time: toChartTime(d.time, interval), value: d.longLine })));
        mainSeriesRef.current.acShortLine?.setData(advancedChanData.map(d => ({ time: toChartTime(d.time, interval), value: d.shortLine })));
        // Update bi/zs lines too
        if (mainChartApi.current) {
          drawBiZsLines(mainChartApi.current, true, biPoints, zhongshus, candles, interval);
        }
      }

      // Restore zoom/position - KEY FIX: don't reset view on candle advance
      restoreVisibleRange(candles.length);
      prevCandleCountRef.current = candles.length;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, cdSignals, chanLunSignals, showChanLun, advancedChanData, advancedChanSignals, showAdvancedChan, showLadder, showCDLabels, costPrice, biPoints, zhongshus, chanBuySellSignals]);

  // ===== FULL REBUILD (only on interval change or initial render) =====
  useEffect(() => {
    if (!mainChartRef.current || candles.length === 0) return;

    const intervalChanged = prevIntervalRef.current !== interval;
    prevIntervalRef.current = interval;

    // Only do full rebuild on initial render or interval change
    if (!isInitialRender.current && !intervalChanged) return;

    isDisposedRef.current = false;
    if (mainChartApi.current) {
      try { mainChartApi.current.remove(); } catch {}
      mainChartApi.current = null;
    }
    mainSeriesRef.current = {
      candle: null, blueUp: null, blueDn: null, yellowUp: null, yellowDn: null,
      volume: null, cost: null,
      acBuyLine: null, acSellLine: null, acXxh25: null, acXxl25: null,
      acD90Top: null, acD90Bottom: null, acLongLine: null, acShortLine: null,
      biStrokeLine: null, zsUpperLines: [], zsLowerLines: [], zsFillLines: [],
    };

    const chart = createChart(mainChartRef.current, {
      ...chartOptions,
      width: mainChartRef.current.clientWidth,
      height,
    });
    mainChartApi.current = chart;

    // Candlestick - NO border, clean style
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#ef4444',
      downColor: '#22c55e',
      borderVisible: false,
      wickUpColor: '#ef4444',
      wickDownColor: '#22c55e',
    });
    candleSeries.setData(candles.map(c => ({
      time: toChartTime(c.time, interval),
      open: c.open, high: c.high, low: c.low, close: c.close,
    })));
    mainSeriesRef.current.candle = candleSeries;

    // Ladder - THICKER and BRIGHTER (always create series, conditionally set data)
    const ladder = calculateLadder(candles);
    if (ladder.length > 0) {
      const blueUp = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: '蓝梯A', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
      const blueDn = chart.addLineSeries({ color: '#60a5fa', lineWidth: 2, title: '蓝梯B', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
      const yellowUp = chart.addLineSeries({ color: '#eab308', lineWidth: 3, title: '黄梯A1', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
      const yellowDn = chart.addLineSeries({ color: '#facc15', lineWidth: 3, title: '黄梯B1', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
      if (showLadder) {
        blueUp.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.blueUp })));
        blueDn.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.blueDn })));
        yellowUp.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.yellowUp })));
        yellowDn.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.yellowDn })));
      }
      mainSeriesRef.current.blueUp = blueUp;
      mainSeriesRef.current.blueDn = blueDn;
      mainSeriesRef.current.yellowUp = yellowUp;
      mainSeriesRef.current.yellowDn = yellowDn;
    }

    // Markers
    const allMarkers = buildMainMarkers(cdSignals, chanLunSignals, showChanLun, advancedChanSignals, showAdvancedChan, chanBuySellSignals, showCDLabels, interval);
    if (allMarkers.length > 0) candleSeries.setMarkers(allMarkers);

    // Cost price line
    if (costPrice && costPrice > 0) {
      const costSeries = chart.addLineSeries({
        color: '#f59e0b', lineWidth: 2, lineStyle: 2,
        title: `成本 $${costPrice.toFixed(2)}`,
        crosshairMarkerVisible: false, priceLineVisible: true, lastValueVisible: true,
      });
      costSeries.setData(candles.map(c => ({ time: toChartTime(c.time, interval), value: costPrice })));
      mainSeriesRef.current.cost = costSeries;
    }

    // Advanced Chan lines
    if (showAdvancedChan && advancedChanData && advancedChanData.length > 0) {
      updateAdvancedChanLines(chart, true, advancedChanData, interval);
    }

    // Bi stroke lines and zhongshu rectangles
    if (showAdvancedChan && biPoints && biPoints.length >= 2) {
      drawBiZsLines(chart, true, biPoints, zhongshus, candles, interval);
    }

    // Volume
    const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volumeSeries.setData(candles.map(c => ({
      time: toChartTime(c.time, interval),
      value: c.volume,
      color: c.close >= c.open ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)',
    })));
    mainSeriesRef.current.volume = volumeSeries;

    // Initial view: show last ~80 candles on left 40%, right 60% blank
    if (savedRangeRef.current) {
      // Restore previous position if available
      restoreVisibleRange(candles.length);
    } else {
      const totalBars = candles.length;
      // Show a reasonable number of recent candles (not all of them)
      const visibleBars = Math.min(80, Math.floor(totalBars * 0.4));
      const rightBlank = Math.floor(visibleBars * 1.5); // 60% blank on right
      const newFrom = Math.max(0, totalBars - visibleBars);
      const newTo = Math.min(totalBars - 1 + rightBlank, totalBars * 2);
      if (newFrom < newTo) {
        try {
          chart.timeScale().setVisibleLogicalRange({
            from: newFrom,
            to: newTo,
          } as LogicalRange);
        } catch {
          // Fallback: just fit content if range calculation fails
          chart.timeScale().fitContent();
        }
      }
    }

    prevCandleCountRef.current = candles.length;
    prevShowAdvancedChanRef.current = showAdvancedChan;
    prevShowChanLunRef.current = showChanLun;
    isInitialRender.current = false;

    const handleResize = () => {
      if (mainChartRef.current && !isDisposedRef.current) {
        try { chart.applyOptions({ width: mainChartRef.current.clientWidth }); } catch {}
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      isDisposedRef.current = true;
      try { chart.remove(); } catch {}
      mainChartApi.current = null;
      mainSeriesRef.current = {
        candle: null, blueUp: null, blueDn: null, yellowUp: null, yellowDn: null,
        volume: null, cost: null,
        acBuyLine: null, acSellLine: null, acXxh25: null, acXxl25: null,
        acD90Top: null, acD90Bottom: null, acLongLine: null, acShortLine: null,
        biStrokeLine: null, zsUpperLines: [], zsLowerLines: [], zsFillLines: [],
      };
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, height, chartOptions]);

  // ===== MACD SUB-CHART =====
  useEffect(() => {
    if (!macdChartRef.current || candles.length === 0) return;

    // Incremental update
    if (macdChartApi.current && macdSeriesRef.current.diff && !isDisposedRef.current) {
      safeChartOp(() => {
        const { diff, dea, macd } = calculateMACD(candles);
        macdSeriesRef.current.diff!.setData(candles.map((c, i) => ({ time: toChartTime(c.time, interval), value: diff[i] })));
        macdSeriesRef.current.dea!.setData(candles.map((c, i) => ({ time: toChartTime(c.time, interval), value: dea[i] })));
        macdSeriesRef.current.macd!.setData(candles.map((c, i) => ({
          time: toChartTime(c.time, interval),
          value: macd[i],
          color: macd[i] >= 0
            ? (macd[i] >= (i > 0 ? macd[i-1] : 0) ? '#ef4444' : '#b91c1c')
            : (macd[i] <= (i > 0 ? macd[i-1] : 0) ? '#22c55e' : '#15803d'),
        })));

        if (cdSignals.length > 0) {
          macdSeriesRef.current.diff!.setMarkers(cdSignals.map(s => ({
            time: toChartTime(s.time, interval),
            position: s.type === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
            color: s.type === 'buy' ? '#ef4444' : '#22c55e',
            shape: 'circle' as const,
            text: s.label,
          })));
        }
      });
      return;
    }

    // Full rebuild
    if (macdChartApi.current) {
      try { macdChartApi.current.remove(); } catch {}
      macdChartApi.current = null;
    }
    macdSeriesRef.current = { diff: null, dea: null, macd: null };

    const chart = createChart(macdChartRef.current, {
      ...chartOptions,
      width: macdChartRef.current.clientWidth,
      height: 180,
    });
    macdChartApi.current = chart;

    const { diff, dea, macd } = calculateMACD(candles);
    const diffSeries = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, title: 'DIFF' });
    const deaSeries = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'DEA' });
    const macdSeries = chart.addHistogramSeries({ title: 'MACD' });

    diffSeries.setData(candles.map((c, i) => ({ time: toChartTime(c.time, interval), value: diff[i] })));
    deaSeries.setData(candles.map((c, i) => ({ time: toChartTime(c.time, interval), value: dea[i] })));
    macdSeries.setData(candles.map((c, i) => ({
      time: toChartTime(c.time, interval),
      value: macd[i],
      color: macd[i] >= 0
        ? (macd[i] >= (i > 0 ? macd[i-1] : 0) ? '#ef4444' : '#b91c1c')
        : (macd[i] <= (i > 0 ? macd[i-1] : 0) ? '#22c55e' : '#15803d'),
    })));

    macdSeriesRef.current = { diff: diffSeries, dea: deaSeries, macd: macdSeries };

    if (cdSignals.length > 0) {
      diffSeries.setMarkers(cdSignals.map(s => ({
        time: toChartTime(s.time, interval),
        position: s.type === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
        color: s.type === 'buy' ? '#ef4444' : '#22c55e',
        shape: 'circle' as const,
        text: s.label,
      })));
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (macdChartRef.current) { try { chart.applyOptions({ width: macdChartRef.current.clientWidth }); } catch {} }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try { chart.remove(); } catch {}
      macdChartApi.current = null;
      macdSeriesRef.current = { diff: null, dea: null, macd: null };
    };
  }, [candles, interval, cdSignals, chartOptions, safeChartOp]);

  // ===== BUY/SELL PRESSURE SUB-CHART =====
  useEffect(() => {
    if (!pressureChartRef.current || buySellPressure.length === 0) return;

    if (pressureChartApi.current && pressureSeriesRef.current.pressure) {
      safeChartOp(() => {
        pressureSeriesRef.current.pressure!.setData(buySellPressure.map(p => ({
          time: toChartTime(p.time, interval),
          value: p.pressure,
          color: p.pressure >= 0 ? (p.signal === 'strong_up' ? '#a855f7' : '#ef4444') : (p.signal === 'strong_down' ? '#a855f7' : '#22c55e'),
        })));
        
        // Add markers for strong momentum changes (⚡💀)
        const pressureMarkers: Array<{time: Time; position: 'aboveBar' | 'belowBar'; color: string; shape: 'circle'; text: string}> = [];
        for (let i = 1; i < buySellPressure.length; i++) {
          const curr = buySellPressure[i];
          const prev = buySellPressure[i - 1];
          if (!curr || !prev) continue;
          
          // ⚡ 闪电：买入动能比前一天高1倍（2x）
          if (curr.pressure > 0 && prev.pressure > 0 && curr.pressure >= prev.pressure * 2) {
            pressureMarkers.push({
              time: toChartTime(curr.time, interval),
              position: 'aboveBar',
              color: '#eab308',
              shape: 'circle',
              text: '⚡',
            });
          }
          // 💀 骷髅头：卖出动能比前一天高1倍（2x）
          else if (curr.pressure < 0 && prev.pressure < 0 && curr.pressure <= prev.pressure * 2) {
            pressureMarkers.push({
              time: toChartTime(curr.time, interval),
              position: 'belowBar',
              color: '#ef4444',
              shape: 'circle',
              text: '💀',
            });
          }
        }
        pressureSeriesRef.current.pressure!.setMarkers(pressureMarkers);
      });
      return;
    }

    if (pressureChartApi.current) {
      try { pressureChartApi.current.remove(); } catch {}
      pressureChartApi.current = null;
    }
    pressureSeriesRef.current = { pressure: null };

    const chart = createChart(pressureChartRef.current, {
      ...chartOptions,
      width: pressureChartRef.current.clientWidth,
      height: 100,
    });
    pressureChartApi.current = chart;

    const pressureSeries = chart.addHistogramSeries({ title: '买卖力道' });
    pressureSeries.setData(buySellPressure.map(p => ({
      time: toChartTime(p.time, interval),
      value: p.pressure,
      color: p.pressure >= 0 ? (p.signal === 'strong_up' ? '#a855f7' : '#ef4444') : (p.signal === 'strong_down' ? '#a855f7' : '#22c55e'),
    })));
    
    // Add markers for strong momentum changes (⚡💀)
    const pressureMarkers: Array<{time: Time; position: 'aboveBar' | 'belowBar'; color: string; shape: 'circle'; text: string}> = [];
    for (let i = 1; i < buySellPressure.length; i++) {
      const curr = buySellPressure[i];
      const prev = buySellPressure[i - 1];
      if (!curr || !prev) continue;
      
      // ⚡ 闪电：买入动能比前一天高1倍（2x）
      if (curr.pressure > 0 && prev.pressure > 0 && curr.pressure >= prev.pressure * 2) {
        pressureMarkers.push({
          time: toChartTime(curr.time, interval),
          position: 'aboveBar',
          color: '#eab308',
          shape: 'circle',
          text: '⚡',
        });
      }
      // 💀 骷髅头：卖出动能比前一天高1倍（2x）
      else if (curr.pressure < 0 && prev.pressure < 0 && curr.pressure <= prev.pressure * 2) {
        pressureMarkers.push({
          time: toChartTime(curr.time, interval),
          position: 'belowBar',
          color: '#ef4444',
          shape: 'circle',
          text: '💀',
        });
      }
    }
    pressureSeries.setMarkers(pressureMarkers);
    pressureSeriesRef.current.pressure = pressureSeries;

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (pressureChartRef.current) { try { chart.applyOptions({ width: pressureChartRef.current.clientWidth }); } catch {} }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try { chart.remove(); } catch {}
      pressureChartApi.current = null;
      pressureSeriesRef.current = { pressure: null };
    };
  }, [buySellPressure, interval, chartOptions, safeChartOp]);

  // ===== MOMENTUM SUB-CHART =====
  useEffect(() => {
    if (!momentumChartRef.current || !momentumSignals || momentumSignals.length === 0) return;

    if (momentumChartApi.current && momentumSeriesRef.current.buy) {
      safeChartOp(() => {
        momentumSeriesRef.current.buy!.setData(momentumSignals!.map(m => ({ time: toChartTime(m.time, interval), value: m.buyMomentum })));
        momentumSeriesRef.current.sell!.setData(momentumSignals!.map(m => ({ time: toChartTime(m.time, interval), value: m.sellMomentum })));
        momentumSeriesRef.current.diff!.setData(momentumSignals!.map(m => ({
          time: toChartTime(m.time, interval),
          value: m.diff,
          color: m.diff >= 0 ? '#ef4444' : '#22c55e',
        })));
        
        // Add markers for momentum signals (⚡💀 + 弱转强/强转弱)
        const momentumMarkers: Array<{time: Time; position: 'aboveBar' | 'belowBar'; color: string; shape: 'circle' | 'arrowUp' | 'arrowDown'; text: string}> = [];
        for (let i = 1; i < momentumSignals!.length; i++) {
          const curr = momentumSignals![i];
          const prev = momentumSignals![i - 1];
          if (!curr || !prev) continue;
          
          // ⚡ 闪电：买压红柱高于前一天100%
          if (curr.diff > 0 && prev.diff > 0 && curr.diff >= prev.diff * 2) {
            momentumMarkers.push({
              time: toChartTime(curr.time, interval),
              position: 'aboveBar',
              color: '#eab308',
              shape: 'circle',
              text: '⚡',
            });
          }
          // 💀 骷髅头：卖压绿柱高于前一天100%
          else if (curr.diff < 0 && prev.diff < 0 && Math.abs(curr.diff) >= Math.abs(prev.diff) * 2) {
            momentumMarkers.push({
              time: toChartTime(curr.time, interval),
              position: 'belowBar',
              color: '#ef4444',
              shape: 'circle',
              text: '💀',
            });
          }
          
          // 弱转强：黄线穿过绿线 + 红柱高于前一天100%
          if (prev.buyMomentum <= prev.sellMomentum && curr.buyMomentum > curr.sellMomentum && 
              curr.diff > 0 && prev.diff > 0 && curr.diff >= prev.diff * 2) {
            momentumMarkers.push({
              time: toChartTime(curr.time, interval),
              position: 'aboveBar',
              color: '#10b981',
              shape: 'circle',
              text: '弱转强',
            });
          }
          // 强转弱：绿线穿过黄线 + 绿柱高于前一天100%
          else if (prev.sellMomentum <= prev.buyMomentum && curr.sellMomentum > curr.buyMomentum && 
                   curr.diff < 0 && prev.diff < 0 && Math.abs(curr.diff) >= Math.abs(prev.diff) * 2) {
            momentumMarkers.push({
              time: toChartTime(curr.time, interval),
              position: 'belowBar',
              color: '#ef4444',
              shape: 'circle',
              text: '强转弱',
            });
          }
        }
        momentumSeriesRef.current.diff!.setMarkers(momentumMarkers);
      });
      return;
    }

    if (momentumChartApi.current) {
      try { momentumChartApi.current.remove(); } catch {}
      momentumChartApi.current = null;
    }
    momentumSeriesRef.current = { buy: null, sell: null, diff: null };

    const chart = createChart(momentumChartRef.current, {
      ...chartOptions,
      width: momentumChartRef.current.clientWidth,
      height: 150,
    });
    momentumChartApi.current = chart;

    const buySeries = chart.addLineSeries({ color: '#eab308', lineWidth: 2, title: '买入动能' });
    const sellSeries = chart.addLineSeries({ color: '#22c55e', lineWidth: 2, title: '卖出动能' });
    const diffSeries = chart.addHistogramSeries({ title: '动能差' });

    buySeries.setData(momentumSignals.map(m => ({ time: toChartTime(m.time, interval), value: m.buyMomentum })));
    sellSeries.setData(momentumSignals.map(m => ({ time: toChartTime(m.time, interval), value: m.sellMomentum })));
    diffSeries.setData(momentumSignals.map(m => ({
      time: toChartTime(m.time, interval),
      value: m.diff,
      color: m.diff >= 0 ? '#ef4444' : '#22c55e',
    })));
    
    // Add markers for momentum signals (⚡💀 + 弱转强/强转弱)
    const momentumMarkers: Array<{time: Time; position: 'aboveBar' | 'belowBar'; color: string; shape: 'circle' | 'arrowUp' | 'arrowDown'; text: string}> = [];
    for (let i = 1; i < momentumSignals.length; i++) {
      const curr = momentumSignals[i];
      const prev = momentumSignals[i - 1];
      if (!curr || !prev) continue;
      
      // ⚡ 闪电：买压红柱高于前一天100%
      if (curr.diff > 0 && prev.diff > 0 && curr.diff >= prev.diff * 2) {
        momentumMarkers.push({
          time: toChartTime(curr.time, interval),
          position: 'aboveBar',
          color: '#eab308',
          shape: 'circle',
          text: '⚡',
        });
      }
      // 💀 骷髅头：卖压绿柱高于前一天100%
      else if (curr.diff < 0 && prev.diff < 0 && Math.abs(curr.diff) >= Math.abs(prev.diff) * 2) {
        momentumMarkers.push({
          time: toChartTime(curr.time, interval),
          position: 'belowBar',
          color: '#ef4444',
          shape: 'circle',
          text: '💀',
        });
      }
      
      // 弱转强：黄线穿过绿线 + 红柱高于前一天100%
      if (prev.buyMomentum <= prev.sellMomentum && curr.buyMomentum > curr.sellMomentum && 
          curr.diff > 0 && prev.diff > 0 && curr.diff >= prev.diff * 2) {
        momentumMarkers.push({
          time: toChartTime(curr.time, interval),
          position: 'aboveBar',
          color: '#10b981',
          shape: 'arrowUp',
          text: '弱转强',
        });
      }
      // 强转弱：绿线穿过黄线 + 绿柱高于前一天100%
      else if (prev.sellMomentum <= prev.buyMomentum && curr.sellMomentum > curr.buyMomentum && 
               curr.diff < 0 && prev.diff < 0 && Math.abs(curr.diff) >= Math.abs(prev.diff) * 2) {
        momentumMarkers.push({
          time: toChartTime(curr.time, interval),
          position: 'belowBar',
          color: '#ef4444',
          shape: 'arrowDown',
          text: '强转弱',
        });
      }
    }
    diffSeries.setMarkers(momentumMarkers);

    momentumSeriesRef.current = { buy: buySeries, sell: sellSeries, diff: diffSeries };

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (momentumChartRef.current) { try { chart.applyOptions({ width: momentumChartRef.current.clientWidth }); } catch {} }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try { chart.remove(); } catch {}
      momentumChartApi.current = null;
      momentumSeriesRef.current = { buy: null, sell: null, diff: null };
    };
  }, [momentumSignals, interval, chartOptions, safeChartOp]);

  // Sync time scales: main chart is the leader, sub-charts follow
  const isSyncingRef = useRef(false);
  useEffect(() => {
    const mainChart = mainChartApi.current;
    const subCharts = [macdChartApi.current, pressureChartApi.current, momentumChartApi.current].filter(Boolean) as IChartApi[];
    if (!mainChart || subCharts.length === 0) return;

    const syncFns: Array<{ chart: IChartApi; fn: (range: any) => void }> = [];
    
    // Main chart drives all sub-charts
    const mainToSubs = (range: any) => {
      if (isSyncingRef.current || !range) return;
      isSyncingRef.current = true;
      for (const sub of subCharts) {
        try { sub.timeScale().setVisibleLogicalRange(range); } catch {}
      }
      isSyncingRef.current = false;
    };
    try { mainChart.timeScale().subscribeVisibleLogicalRangeChange(mainToSubs); } catch {}
    syncFns.push({ chart: mainChart, fn: mainToSubs });
    
    // Sub-charts can also drive main chart (for user scrolling on sub-charts)
    for (const sub of subCharts) {
      const subToMain = (range: any) => {
        if (isSyncingRef.current || !range) return;
        isSyncingRef.current = true;
        try { mainChart.timeScale().setVisibleLogicalRange(range); } catch {}
        for (const otherSub of subCharts) {
          if (otherSub !== sub) {
            try { otherSub.timeScale().setVisibleLogicalRange(range); } catch {}
          }
        }
        isSyncingRef.current = false;
      };
      try { sub.timeScale().subscribeVisibleLogicalRangeChange(subToMain); } catch {}
      syncFns.push({ chart: sub, fn: subToMain });
    }

    // Apply main chart's current range to all sub-charts immediately
    try {
      const currentRange = mainChart.timeScale().getVisibleLogicalRange();
      if (currentRange) {
        for (const sub of subCharts) {
          try { sub.timeScale().setVisibleLogicalRange(currentRange); } catch {}
        }
      }
    } catch {}

    return () => {
      syncFns.forEach(({ chart, fn }) => {
        try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(fn); } catch {}
      });
    };
  }, [candles, buySellPressure, momentumSignals]);

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-2 flex-wrap">
        <span className="font-medium text-foreground">主图</span>
        <span>K线{showLadder ? ' + 黄蓝梯子' : ''}</span>
        {showChanLun && (
          <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 text-xs font-medium">
            缠论分型
          </span>
        )}
        {showAdvancedChan && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-xs font-medium">
            高级禅动
          </span>
        )}
      </div>
      <div ref={mainChartRef} className="w-full rounded-md overflow-hidden border border-border" />
      
      {/* 指标说明 */}
      {(showChanLun || showAdvancedChan) && (
        <div className="px-2 py-1.5 rounded bg-card/50 border border-border text-xs text-muted-foreground space-y-1">
          {showChanLun && (
            <div>
              <span className="font-medium text-orange-400">缠论分型：</span>
              <span className="text-orange-300">●</span> 底分型 / <span className="text-purple-300">●</span> 顶分型 / 
              <span className="text-orange-400">■</span> 底背离买入 / <span className="text-purple-400">■</span> 顶背离卖出
              <span className="ml-2 text-muted-foreground/70">（K线包含处理 → 顶底分型识别 → MACD背离检测）</span>
            </div>
          )}
          {showAdvancedChan && (
            <div>
              <span className="font-medium text-emerald-400">高级禅动：</span>
              <span className="text-cyan-400">━</span> 笔连接线 / 
              <span className="text-red-400/60">█</span><span className="text-green-400/60">█</span> 中枢区域（填充） / 
              <span className="text-green-400">━</span> 买线 / <span className="text-red-400">━</span> 卖线 / 
              <span className="text-yellow-400">━━</span> 主力中枢(上/下) / 
              <span className="text-orange-500">▲</span> 1买 / <span className="text-yellow-500">▲</span> 2买 / <span className="text-emerald-500">▲</span> 3买 / 
              <span className="text-red-500">▼</span> 1卖 / <span className="text-orange-400">▼</span> 2卖 / <span className="text-pink-500">▼</span> 3卖
              <span className="ml-2 text-muted-foreground/70">（笔段中枢 → 1买2买3买/1卖2卖3卖）</span>
            </div>
          )}
        </div>
      )}
      
      <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-2">
        <span className="font-medium text-foreground">副图</span>
        <span>CD抄底指标 (MACD)</span>
        <span className="text-xs text-red-400 ml-1">抄底</span>
        <span className="text-xs text-green-400">/</span>
        <span className="text-xs text-green-400">卖出</span>
      </div>
      <div ref={macdChartRef} className="w-full rounded-md overflow-hidden border border-border" />
      
      <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-2">
        <span className="font-medium text-purple">副图</span>
        <span className="text-purple">买卖力道</span>
        <span className="text-xs">双位数上涨 = 动能强劲 ⚡ | 双位数下跌 = 动能衰竭 💀</span>
      </div>
      <div ref={pressureChartRef} className="w-full rounded-md overflow-hidden border border-border" />
      
      {momentumSignals && momentumSignals.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-2">
            <span className="font-medium text-cyan-400">副图</span>
            <span className="text-cyan-400">买卖动能</span>
            <span className="text-xs">黄线=买入动能 | 绿线=卖出动能 | 红柱=买压 | 绿柱=卖压</span>
          </div>
          <div ref={momentumChartRef} className="w-full rounded-md overflow-hidden border border-border" />
        </>
      )}
    </div>
  );
}

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { TrendingUp, RefreshCcw, Brain, Search, Info, Loader2, Eye, EyeOff, AlertCircle, Settings, Cpu, Activity, Database, ListPlus } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Brush,
  Area,
  LineChart
} from 'recharts';

declare const process: any;

// --------------------------------------------------------------------------------
// Utilities & AI logic
// --------------------------------------------------------------------------------

// --------------------------------------------------------------------------------
// Memoized Sub-components for Performance
// --------------------------------------------------------------------------------

const CustomCandlestick = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  const { open, close, high, low } = payload;
  if (open == null || close == null || high == null || low == null) return null;

  const isGrowing = close >= open;
  const color = isGrowing ? '#22c55e' : '#ef4444';
  const vRange = high - low;
  const yRatio = vRange > 0 ? height / vRange : 0;
  const yTop = y + (high - Math.max(open, close)) * yRatio;
  const yBottom = y + (high - Math.min(open, close)) * yRatio;
  const bodyHeight = Math.max(Math.abs(yTop - yBottom), 1);

  return (
    <g stroke={color} fill="none" strokeWidth="2">
      <path d={`M${x + width / 2},${y} L${x + width / 2},${yTop}`} />
      <path d={`M${x + width / 2},${yBottom} L${x + width / 2},${y + height}`} />
      <rect x={x} y={yTop} width={Math.max(width, 1)} height={bodyHeight} fill={isGrowing ? 'transparent' : color} stroke={color} />
    </g>
  );
};

const DashboardHeader = React.memo(({ searchQuery, setSearchQuery, selectedSymbol, setSelectedSymbol, timeRange, setTimeRange, suggestions, isSearching, showSuggestions, setShowSuggestions }: any) => {
  const [localQuery, setLocalQuery] = useState(searchQuery);

  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== searchQuery) {
        setSearchQuery(localQuery);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localQuery, setSearchQuery, searchQuery]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
      <div className="flex items-center gap-3 w-full md:w-auto">
         <TrendingUp className="text-blue-600 dark:text-blue-400 w-8 h-8" />
         <div>
           <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">NIFTY 100 AI Predictor</h1>
           <p className="text-xs text-zinc-500">AR-LSTM Feature Engineering & Forecasting</p>
         </div>
      </div>
      <div className="flex items-center gap-3 w-full md:w-auto overflow-visible relative">
        <div className="relative w-full md:w-64">
         <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4", isSearching ? "text-blue-500" : "text-zinc-500")} />
         <input
           type="text"
           value={localQuery}
           onChange={(e) => { setLocalQuery(e.target.value); setShowSuggestions(true); }}
           onFocus={() => setShowSuggestions(true)}
           onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
           placeholder={selectedSymbol || "Search NIFTY 100 / global..."}
           className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-9 pr-9 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-zinc-100"
         />
         {isSearching && (
           <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
         )}
         {showSuggestions && (localQuery.trim().length > 0) && (
           <div className="absolute top-full mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
              {isSearching ? <div className="p-3 text-sm text-zinc-500 text-center">Searching...</div> : suggestions.length > 0 ? (
                 <div className="max-h-60 overflow-y-auto custom-scrollbar">
                   {suggestions.map((s: any, i: number) => (
                     <div key={i} onClick={() => { setSelectedSymbol(s.symbol); setLocalQuery(""); setSearchQuery(""); setShowSuggestions(false); }} className="px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                       <div className="flex justify-between items-center text-sm"><span className="font-semibold text-zinc-900 dark:text-white">{s.symbol}</span><span className="text-[10px] bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-zinc-500">{s.quoteType}</span></div>
                       <div className="text-xs text-zinc-500 truncate">{s.shortname || s.longname}</div>
                     </div>
                   ))}
                 </div>
              ) : <div className="p-3 text-sm text-zinc-500 text-center">No results found</div>}
           </div>
         )}
        </div>
        <select value={timeRange} onChange={e => setTimeRange(e.target.value)} className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="1mo">1 Month</option><option value="3mo">3 Months</option><option value="6mo">6 Months</option><option value="1y">1 Year</option><option value="5y">Multiyr (5y)</option>
        </select>
      </div>
    </div>
  );
});

const QuantSignalsBlock = React.memo(({ predictions, symbol }: any) => {
  const [showMethodology, setShowMethodology] = useState(false);

  if (predictions && predictions.error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800 rounded-lg">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-xs uppercase mb-1">
          <Info className="w-3 h-3" /> Analysis Unavailable
        </div>
        <p className="text-[11px] text-red-500/80 leading-relaxed font-medium">{predictions.error}</p>
      </div>
    );
  }

  if (!predictions) return <div className="h-40 flex items-center justify-center animate-pulse text-zinc-400 text-sm">Model is training on latest sequences...</div>;
  
  return (
    <div className="space-y-6">
      {predictions.quantSignals && (
        <div className="space-y-3">
          <div className="flex justify-between items-end mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Quant Momentum Score</span>
                <button 
                  onClick={() => setShowMethodology(!showMethodology)}
                  className="text-zinc-400 hover:text-blue-500 transition-colors"
                  title="View Calculation Methodology"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className={cn("text-sm font-bold transition-colors duration-500", predictions.quantSignals.score > 0 ? 'text-green-500' : predictions.quantSignals.score < 0 ? 'text-red-500' : 'text-zinc-500')}>
                {predictions.quantSignals.score > 0 ? '+' : ''}{Math.round(predictions.quantSignals.score)}
              </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden ring-1 ring-zinc-200 dark:ring-zinc-700">
             <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-zinc-400 to-green-500 opacity-20 w-full" />
             <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-zinc-900 dark:border-zinc-200 rounded-full shadow-md transition-all duration-700 ease-out" style={{ left: `calc(${((Math.round(predictions.quantSignals.score) + 100) / 200) * 100}% - 8px)` }}></div>
          </div>

          {predictions.localAiMetrics && (
            <div className="flex bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 rounded-lg p-2.5 gap-4 mt-2">
              <div className="flex flex-col gap-0.5 w-1/2">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Forecast Model</span>
                <span className="text-sm font-semibold tracking-tight text-purple-600 dark:text-purple-400">
                  AR-LSTM v2
                </span>
              </div>
              <div className="w-px bg-zinc-200 dark:bg-zinc-700/50"></div>
              <div className="flex flex-col gap-0.5 w-1/2 align-right">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Complexity</span>
                <span className="text-sm font-semibold tracking-tight text-blue-600 dark:text-blue-400">
                  Optimized
                </span>
               </div>
            </div>
          )}

          {showMethodology && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg border border-zinc-100 dark:border-zinc-800 animate-in slide-in-from-top-1 duration-200">
              <h4 className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Scoring Methodology (-100 to +100)</h4>
              <div className="grid grid-cols-1 gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-1">
                  <span>Ichimoku Cloud Regime</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-200">+/- 30 pts</span>
                </div>
                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-1">
                  <span>Trend Alignment (MA 20/50 Cross)</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-200">+/- 40 pts</span>
                </div>
                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-1">
                  <span>Momentum (StochRSI/Standard RSI)</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-200">+/- 25 pts</span>
                </div>
                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-1">
                  <span>Pattern Reversal (Candlesticks)</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-200">+/- 30 pts</span>
                </div>
                <div className="flex justify-between">
                  <span>Volatility & Volume Confirmation</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-200">+/- 20 pts</span>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-wrap gap-2">
             {predictions.quantSignals.signals?.map((sig: any, idx: number) => (
               <span key={idx} className={cn("text-[10px] px-2 py-1 rounded-md border", sig.impact === 'bullish' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : sig.impact === 'bearish' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' : 'bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300')}>{sig.name}</span>
             ))}
          </div>
        </div>
      )}
    </div>
  );
});

// --------------------------------------------------------------------------------
// Main Dashboard Component
// --------------------------------------------------------------------------------


// --------------------------------------------------------------------------------
// Prediction Line Animation (Line Drawing Effect)
// --------------------------------------------------------------------------------
const AnimatedPredictionLine = ({ dataKey, stroke, ...props }: any) => {
  return (
    <Line
      {...props}
      dataKey={dataKey}
      stroke={stroke}
      strokeWidth={3}
      strokeDasharray="5 5"
      dot={{ r: 2, fill: "#fff", stroke: stroke, strokeWidth: 1 }}
      activeDot={{ r: 6 }}
      isAnimationActive={true}
      animationDuration={2500}
      animationEasing="ease-in-out"
    />
  );
};

export default function Dashboard() {
  const [symbols, setSymbols] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('^NSEI');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(['^NSEI', 'RELIANCE.NS']);
  const [showWatchlist, setShowWatchlist] = useState(false);
  
  const handleSymbolChange = useCallback((sym: string) => {
      setSelectedSymbol(sym);
      setWatchlist(prev => {
          if (!prev.includes(sym)) {
              return [sym, ...prev];
          }
          return prev;
      });
  }, []);

  // Atomic state for the chart to prevent intermediate inconsistent renders
  const [chartSource, setChartSource] = useState({
    history: [] as any[],
    predictions: null as any
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('1y');
  const [brushRange, setBrushRange] = useState<{ startIndex?: number; endIndex?: number }>({});
  const [showIchimoku, setShowIchimoku] = useState(false);
  const [showStochRsi, setShowStochRsi] = useState(false);
  const [showBB, setShowBB] = useState(false);
  
  // Brush and Zoom states
  
  // Interaction tracking
  const isUpdatingRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const fetchSafe = async (url: string) => {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      return await res.json();
    }
    const text = await res.text();
    throw new Error(`Invalid response format (expected JSON, got ${contentType || 'unknown'}). Body: ${text.substring(0, 100)}`);
  };

  useEffect(() => {
    fetchSafe('/api/stocks').then(setSymbols).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedSymbol) return;
    loadDashboardData(selectedSymbol, timeRange);
  }, [selectedSymbol, timeRange]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSuggestions([]); return; }
    let isMounted = true;
    const fetchSearch = async () => {
      setIsSearching(true);
      try {
        const data = await fetchSafe(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        if (isMounted) setSuggestions(data);
      } catch (err) { 
        console.error(err); 
      } finally { 
        if (isMounted) setIsSearching(false); 
      }
    };
    fetchSearch();
    return () => { isMounted = false; };
  }, [searchQuery]);

  useEffect(() => {
    const interval = setInterval(() => { loadDashboardData(selectedSymbol, timeRange, true); }, 3600000);
    return () => clearInterval(interval);
  }, [selectedSymbol, timeRange]);

  const loadDashboardData = async (symbol: string, range: string, silent = false) => {
    if (!silent) {
      setLoading(true);
      setBrushRange({}); // Clear zoom on explicit symbol/range switch
    }
    setError('');
    isUpdatingRef.current = true; // Signal that we are performing an auto-update
    try {
      const histUrl = `/api/history/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`;
      const hDataRaw = await fetchSafe(histUrl);

      const chartData = hDataRaw.map((d: any) => ({
        date: d.date, 
        displayDate: format(new Date(d.date), 'MMM dd'),
        open: d.open, 
        high: d.high, 
        low: d.low, 
        close: d.close, 
        sma20: d.sma20, 
        sma50: d.sma50, 
        candleRange: [d.low, d.high],
        ichiTenkan: d.ichimoku?.conversion,
        ichiKijun: d.ichimoku?.base,
        ichiSpanA: d.ichimoku?.spanA,
        ichiSpanB: d.ichimoku?.spanB,
        stochK: d.stochRsi?.stochRSI,
        stochD: d.stochRsi?.d,
        bbUpper: d.bollinger?.upper,
        bbMiddle: d.bollinger?.middle,
        bbLower: d.bollinger?.lower
      }));

      // Immediately show history to unblock the user
      setChartSource({
        history: chartData,
        predictions: null
      });

      if (!silent) setLoading(false);

      // Fetch predictions in background
      const predictUrl = `/api/ml/predict/${encodeURIComponent(symbol)}`;
      try {
        const pDataRaw = await fetchSafe(predictUrl);
        
        if (pDataRaw.error && !pDataRaw.futurePoints) {
            console.warn("Prediction Error:", pDataRaw.error);
        }

        setChartSource(prev => ({
          ...prev,
          predictions: pDataRaw
        }));
      } catch (pErr: any) {
        console.error("Predict Fetch Error:", pErr);
        setChartSource(prev => ({
            ...prev,
            predictions: { error: `ML Fetch Error: ${pErr.message}` }
        }));
      }

      setTimeout(() => { isUpdatingRef.current = false; }, 1000);
    } catch(err: any) {
      setError(err.message);
      if (!silent) setLoading(false);
      isUpdatingRef.current = false;
    }
  };

  const combinedData = useMemo(() => {
    const combined = [...chartSource.history];
    if (chartSource.predictions && chartSource.predictions.futurePoints && chartSource.history.length > 0) {
      combined[combined.length - 1] = { 
        ...combined[combined.length - 1], 
        predictedClose: combined[combined.length - 1].close,
        uncertaintyHigh: combined[combined.length - 1].close,
        uncertaintyLow: combined[combined.length - 1].close
      };
      chartSource.predictions.futurePoints.forEach((fp: any) => {
        combined.push({ 
          date: fp.date,
          displayDate: format(new Date(fp.date), 'MMM dd'), 
          predicted: fp.predicted, 
          upperBand: fp.upperBand,
          lowerBand: fp.lowerBand,
          confidence: fp.confidence,
          isFuture: true 
        });
      });
    }
    return combined;
  }, [chartSource.history, chartSource.predictions]);

  const { minPrice, maxPrice } = useMemo(() => {
    let visibleData = combinedData;
    if (brushRange.startIndex !== undefined && brushRange.endIndex !== undefined) {
      // slice the data based on the brush range so the Y Axis scales to the zoom view
      visibleData = combinedData.slice(
        brushRange.startIndex,
        Math.max(brushRange.startIndex + 1, brushRange.endIndex + 1)
      );
    }

    const allPrices = visibleData.reduce((acc: number[], d: any) => {
      // Apply filters if zoomed, for better Y scale calculation
      acc.push(d.low, d.high, d.predicted, d.upperBand, d.lowerBand);
      if (showIchimoku) acc.push(d.ichiSpanA, d.ichiSpanB);
      if (showBB) acc.push(d.bbUpper, d.bbLower);
      return acc.filter(val => typeof val === 'number' && !isNaN(val));
    }, []);
    const sorted = allPrices.sort((a, b) => a - b);
    return { minPrice: sorted.length > 0 ? sorted[0] * 0.99 : 0, maxPrice: sorted.length > 0 ? sorted[sorted.length - 1] * 1.01 : 0 };
  }, [combinedData, showIchimoku, showBB, brushRange]);

  const brushTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleBrushChange = useCallback((range: any) => {
    if (brushTimeout.current) clearTimeout(brushTimeout.current);
    brushTimeout.current = setTimeout(() => {
      setBrushRange(range);
    }, 150); // Small debounce so chart doesn't lag intensely when dragging
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <DashboardHeader 
        searchQuery={searchQuery} setSearchQuery={setSearchQuery} 
        selectedSymbol={selectedSymbol} setSelectedSymbol={handleSymbolChange} 
        timeRange={timeRange} setTimeRange={setTimeRange} 
        suggestions={suggestions} isSearching={isSearching} 
        showSuggestions={showSuggestions} setShowSuggestions={setShowSuggestions} 
      />

      {error && <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center gap-2 mb-4"><AlertCircle className="w-5 h-5" /><p>{error}</p></div>}
      {chartSource.predictions?.error && (
          <div className="p-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-xl flex items-center gap-2 mb-4 animate-in fade-in">
              <Brain className="w-5 h-5 text-purple-500" />
              <p className="text-sm font-medium">AI Analysis Note: {chartSource.predictions.error}</p>
          </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Watchlist Sidebar */}
        {showWatchlist && (
          <div className="w-full md:w-64 shrink-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm animate-in slide-in-from-left-4 mt-0">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <h3 className="font-bold text-sm tracking-tight flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                <ListPlus className="w-4 h-4 text-blue-500" /> Watchlist
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              {watchlist.map(sym => (
                <button
                  key={sym}
                  onClick={() => handleSymbolChange(sym)}
                  className={cn(
                    "text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
                    selectedSymbol === sym 
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                      : "bg-transparent text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center justify-between">
                     <span>{sym}</span>
                  </div>
                </button>
              ))}
              <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-xs text-zinc-500 text-center leading-relaxed">Search via the top bar to analyze. Quick filters for local NIFTY limits.</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Chart Column */}
        <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm min-h-[400px]">
          <div className="flex items-center justify-between mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
           <div className="flex items-center gap-4 text-zinc-500">
              <span className="text-xs font-bold uppercase tracking-wider">Indicator Controls:</span>
              <button 
                onClick={() => setShowIchimoku(!showIchimoku)}
                className={cn("text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2", showIchimoku ? "bg-purple-100 border-purple-200 text-purple-700 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400" : "bg-zinc-50 border-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400")}
              >
                Ichimoku Cloud {showIchimoku ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={() => setShowStochRsi(!showStochRsi)}
                className={cn("text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2", showStochRsi ? "bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400" : "bg-zinc-50 border-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400")}
              >
                Stochastic RSI {showStochRsi ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={() => setShowBB(!showBB)}
                className={cn("text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2", showBB ? "bg-orange-100 border-orange-200 text-orange-700 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400" : "bg-zinc-50 border-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400")}
              >
                Bollinger Bands {showBB ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
           </div>
        </div>
        {loading ? (
          <div className="w-full h-[400px] flex items-center justify-center animate-pulse flex-col items-center gap-2 text-zinc-500"><RefreshCcw className="w-8 h-8 animate-spin" /><span>Analyzing market data...</span></div>
        ) : (
          <div className="space-y-4">
            <div className={cn("w-full transition-all duration-300", showStochRsi ? "h-[400px]" : "h-[500px]")}>
               <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart 
                    data={combinedData} 
                    margin={{ top: 10, right: 30, left: 20, bottom: 0 }}
                 >
                    <defs>
                     <linearGradient id="predictionGradient" x1="0" y1="0" x2="1" y2="0">
                       <stop offset="0%" stopColor="#a855f7" stopOpacity={0.9} />
                       <stop offset="100%" stopColor="#a855f7" stopOpacity={0.3} />
                     </linearGradient>
                     <linearGradient id="colorPrediction" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.8}/><stop offset="100%" stopColor="#D946EF" stopOpacity={1}/></linearGradient>
                     <linearGradient id="cloudUp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.1}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                     <linearGradient id="cloudDown" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                     <linearGradient id="uncertaintyGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.15}/><stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02}/></linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                   <XAxis 
                     dataKey="date" 
                     tick={{ fontSize: 10, fill: '#71717A' }} 
                     tickLine={false} 
                     axisLine={false} 
                     minTickGap={60} 
                     tickFormatter={(val) => {
                        try {
                           return format(new Date(val), 'MMM dd');
                        } catch(e) { return val; }
                     }}
                   />
                   <YAxis domain={[minPrice, maxPrice]} tick={{ fontSize: 12, fill: '#71717A' }} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val.toLocaleString('en-IN')}`} />
                   <Tooltip 
                     content={({ active, payload }) => {
                       if (!active || !payload?.length) return null;
                       const data = payload[0].payload;
                       return (
                         <div className="bg-gray-900/95 border border-gray-700 rounded-lg p-3 shadow-xl backdrop-blur-sm">
                           <p className="text-xs text-gray-400">{format(new Date(data.date), 'PPP')}</p>
                           {data.close != null && (
                             <p className="text-sm font-bold text-white">
                               ₹{data.close.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                             </p>
                           )}
                           {data.predicted != null && (
                             <p className="text-sm text-purple-400">
                               Predicted: ₹{data.predicted.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                               {data.confidence != null && <span className="text-xs text-purple-500/80 ml-2">({data.confidence}% conf)</span>}
                             </p>
                           )}
                           {data.rsi != null && (
                             <p className="text-xs text-gray-500 mt-1">RSI: {data.rsi.toFixed(1)}</p>
                           )}
                         </div>
                       );
                     }}
                   />
                   
                   {showIchimoku && (
                     <>
                        <Line type="monotone" dataKey="ichiTenkan" stroke="#3b82f6" strokeWidth={1} dot={false} name="ichiTenkan" isAnimationActive={false} />
                        <Line type="monotone" dataKey="ichiKijun" stroke="#ef4444" strokeWidth={1} dot={false} name="ichiKijun" isAnimationActive={false} />
                        <Area type="monotone" dataKey="ichiSpanA" stroke="#22c55e" strokeWidth={0.5} fill="url(#cloudUp)" fillOpacity={1} strokeOpacity={0.5} name="ichiSpanA" dot={false} isAnimationActive={false} />
                        <Area type="monotone" dataKey="ichiSpanB" stroke="#ef4444" strokeWidth={0.5} fill="url(#cloudDown)" fillOpacity={0.1} strokeOpacity={0.5} name="ichiSpanB" dot={false} isAnimationActive={false} />
                     </>
                   )}

                   {showBB && (
                     <>
                        <Line type="monotone" dataKey="bbUpper" stroke="#f59e0b" strokeWidth={1} strokeDasharray="5 5" dot={false} name="bbUpper" isAnimationActive={false} />
                        <Line type="monotone" dataKey="bbMiddle" stroke="#f59e0b" strokeWidth={1} strokeOpacity={0.5} dot={false} name="bbMiddle" isAnimationActive={false} />
                        <Line type="monotone" dataKey="bbLower" stroke="#f59e0b" strokeWidth={1} strokeDasharray="5 5" dot={false} name="bbLower" isAnimationActive={false} />
                        <Area type="monotone" dataKey="bbUpper" stroke="none" fill="#f59e0b" fillOpacity={0.05} name="bbArea" dot={false} isAnimationActive={false} />
                     </>
                   )}

                   <Bar dataKey="candleRange" shape={<CustomCandlestick />} name="Market Price" isAnimationActive={false} />
                   <Line type="monotone" dataKey="sma20" stroke="#60a5fa" strokeWidth={1} strokeOpacity={0.6} dot={false} name="SMA 20" />
                   <Line type="monotone" dataKey="sma50" stroke="#fbbf24" strokeWidth={1} strokeOpacity={0.6} dot={false} name="SMA 50" />
                   
                   <Area 
                     type="monotone" 
                     dataKey="upperBand" 
                     // @ts-ignore
                     baseValue="dataMin" 
                     stroke="none" 
                     fill="rgba(168, 85, 247, 0.08)" 
                     isAnimationActive={false} 
                     connectNulls={true} 
                     name="Confidence Cap"
                   />
                   <Area 
                     type="monotone" 
                     dataKey="lowerBand" 
                     // @ts-ignore
                     baseValue="dataMax" 
                     stroke="none" 
                     fill="rgba(168, 85, 247, 0.08)" 
                     isAnimationActive={false} 
                     connectNulls={true} 
                     name="Confidence Floor"
                   />

                   <Line 
                     type="monotone" 
                     dataKey="predicted" 
                     stroke="url(#predictionGradient)" 
                     strokeWidth={2.5} 
                     strokeDasharray="8 4" 
                     dot={false} 
                     activeDot={{ r: 7, fill: "#C084FC" }} 
                     name="predicted" 
                     connectNulls={true} 
                     isAnimationActive={true}
                     animationDuration={2000}
                     animationEasing="ease-out"
                   />
                 
                 {chartSource.predictions && combinedData.length > chartSource.history.length && (
                   <>
                     <ReferenceLine x={combinedData[chartSource.history.length - 1]?.date} stroke="#A855F7" strokeWidth={2} strokeDasharray="3 3" label={{ position: 'top', value: 'Prediction Start \u2192', fill: '#A855F7', fontSize: 13, fontWeight: 'bold' }} />
                     {/* @ts-ignore */}
                     <ReferenceArea x1={combinedData[chartSource.history.length - 1]?.date} x2={combinedData[combinedData.length - 1]?.date} fill="#8B5CF6" fillOpacity={0.08} />
                   </>
                 )}
                 
                 <Brush 
                    key={`brush-${selectedSymbol}-${timeRange}`}
                    data={combinedData}
                    dataKey="date" height={30} stroke="#8B5CF6" fill="transparent" tickFormatter={() => ''} 
                    startIndex={brushRange.startIndex} 
                    endIndex={brushRange.endIndex}
                    onChange={handleBrushChange}
                 />
               </ComposedChart>
             </ResponsiveContainer>
            </div>

            {showStochRsi && (
              <div className="h-[150px] w-full border-t border-zinc-100 dark:border-zinc-800 pt-4 animate-in fade-in slide-in-from-bottom-2">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-2">
                       <Brain className="w-3 h-3 text-blue-500" /> Stochastic RSI Oscillator
                    </span>
                    <div className="flex gap-4 text-[9px] font-bold">
                       <span className="text-blue-500 flex items-center gap-1"><div className="w-2 h-0.5 bg-blue-500" /> %K</span>
                       <span className="text-orange-500 flex items-center gap-1"><div className="w-2 h-0.5 bg-orange-500" /> %D Signal</span>
                    </div>
                 </div>
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={combinedData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#52525B" opacity={0.1} />
                      <XAxis dataKey="date" hide />
                      <YAxis domain={[0, 100]} hide />
                      <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.3} />
                      <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
                      <Line type="monotone" dataKey="stochK" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="stochD" stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 2" dot={false} isAnimationActive={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181B', borderColor: '#27272A', color: '#fff', borderRadius: '8px', fontSize: '10px' }} />
                   </LineChart>
                 </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 mt-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
             <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Local TFJS Prediction Summary</h2>
             </div>
             <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowWatchlist(!showWatchlist)} 
                  className={cn("text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors", showWatchlist ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400")}
                >
                  <ListPlus className="w-4 h-4" /> Watchlist
                </button>
                <button 
                  onClick={() => setShowDiagnostics(!showDiagnostics)} 
                  className={cn("text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors", showDiagnostics ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400")}
                >
                  <Settings className="w-4 h-4" /> Diagnostics
                </button>
             </div>
          </div>
          
          {/* Diagnostic Panel */}
          {showDiagnostics && chartSource.predictions?.localAiMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 mb-2 animate-in slide-in-from-top-4">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-zinc-500"><Activity className="w-3 h-3 text-green-500" /> Validation Loss</span>
                <span className="text-sm font-mono text-zinc-900 dark:text-zinc-200">{chartSource.predictions.localAiMetrics.loss.toFixed(4)} MSE</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-zinc-500"><Cpu className="w-3 h-3 text-orange-500" /> Tensors Active</span>
                <span className="text-sm font-mono text-zinc-900 dark:text-zinc-200">{chartSource.predictions.localAiMetrics.tfTensors} ({(chartSource.predictions.localAiMetrics.memoryMB)} MB)</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-zinc-500"><Database className="w-3 h-3 text-blue-500" /> Training Sequences</span>
                <span className="text-sm font-mono text-zinc-900 dark:text-zinc-200">{chartSource.predictions.localAiMetrics.samples} windows</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-zinc-500"><RefreshCcw className="w-3 h-3 text-purple-500" /> Synthetic Data Ratio</span>
                <span className="text-sm font-mono text-zinc-900 dark:text-zinc-200">~{chartSource.predictions.localAiMetrics.syntheticRatio}% augmented</span>
              </div>
            </div>
          )}

          <QuantSignalsBlock predictions={chartSource.predictions} symbol={selectedSymbol} />
        </div>
        {/* Prediction Table */}
        {chartSource.predictions && chartSource.predictions.futurePoints && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm overflow-hidden">
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-4 tracking-wide uppercase">60-Day Forecast Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Day</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Predicted</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {chartSource.predictions.futurePoints.filter((_: any, i: number) => i % 5 === 0 || i === 59).map((fp: any, idx: number) => {
                    const refPrice = chartSource.history[chartSource.history.length - 1]?.close || 1;
                    const changePct = ((fp.predicted - refPrice) / refPrice) * 100;
                    const isPositive = changePct >= 0;
                    let signalStr = "⚪ Low Conf";
                    if (fp.confidence > 70) signalStr = isPositive ? "🟢 Bullish" : "🔴 Bearish";
                    else if (fp.confidence > 40) signalStr = "🟡 Neutral";
                    
                    // The day number is roughly the index assuming business days
                    const dayIdx = chartSource.predictions.futurePoints.indexOf(fp) + 1;

                    return (
                      <tr key={idx} className="border-b border-zinc-100 dark:border-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3 font-mono text-zinc-500">{dayIdx}</td>
                        <td className="px-4 py-3 text-zinc-900 dark:text-zinc-200">{format(new Date(fp.date), 'MMM dd')}</td>
                        <td className="px-4 py-3 font-medium text-purple-600 dark:text-purple-400">
                          ₹{fp.predicted.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          <span className={cn("ml-2 text-xs font-mono", isPositive ? "text-green-500" : "text-red-500")}>
                            {isPositive ? "+" : ""}{changePct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-500">{fp.confidence}%</td>
                        <td className="px-4 py-3">{signalStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

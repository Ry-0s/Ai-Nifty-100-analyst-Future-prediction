import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { GoogleGenAI, Type } from '@google/genai';
import { PlayCircle, TrendingUp, TrendingDown, RefreshCcw, Newspaper, Brain, AlertCircle, Search } from 'lucide-react';
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
  Brush
} from 'recharts';

declare const process: any;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

// AI Inferencing logic (Natively handled by AI Studio on frontend)
const generateAIAnalysis = async (dataSample: any, symbol: string) => {
    try {
        const prompt = `
        You are an elite quantitative technical analyst AI engine with an exhaustive knowledge of advanced charting.
        I am providing you with the exact daily OHLCV candlestick data for the last 45 trading days for ${symbol}.
        Identify recognized patterns (Macro Formations, Harmonic Patterns, Japanese Candlestick variations).
        Data: ${JSON.stringify(dataSample)}
        `;

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        patterns: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    patternName: { type: Type.STRING },
                                    confidence: { type: Type.NUMBER },
                                    description: { type: Type.STRING },
                                    trendImpact: { type: Type.STRING, enum: ["bullish", "bearish", "neutral"] }
                                }
                            }
                        },
                        overallSummary: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(aiResponse.text || "{}");
    } catch (err: any) {
        console.error(err);
        return { overallSummary: "AI Analysis unavailable. Check Gemini API key.", patterns: [] };
    }
};

const generateSentimentAnalysis = async (newsArr: any[], symbol: string) => {
    try {
        if (!newsArr || newsArr.length === 0) return { sentiment: "neutral", sentimentScore: 50, summary: "No recent news found." };
        const prompt = `
        Analyze the sentiment of the following financial news headlines for the stock symbol ${symbol}.
        Score from 0 (neg) to 100 (pos).
        News: ${JSON.stringify(newsArr)}
        `;

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        sentiment: { type: Type.STRING, enum: ["positive", "negative", "neutral"] },
                        sentimentScore: { type: Type.NUMBER },
                        summary: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(aiResponse.text || "{}");
    } catch(err) {
        console.error(err);
        return { sentiment: "neutral", sentimentScore: 50, summary: "Sentiment analysis unavailable." };
    }
};

const CustomCandlestick = (props: any) => {
  const { x, y, width, height, payload } = props;
  
  if (!payload) return null;
  const { open, close, high, low } = payload;
  
  if (open == null || close == null || high == null || low == null) return null;

  const isGrowing = close >= open;
  const color = isGrowing ? '#22c55e' : '#ef4444'; // Tailwind green-500 : red-500

  const vRange = high - low;
  const yRatio = vRange > 0 ? height / vRange : 0;
  
  const yTop = y + (high - Math.max(open, close)) * yRatio;
  const yBottom = y + (high - Math.min(open, close)) * yRatio;
  const yHigh = y;
  const yLow = y + height;
  const bodyHeight = Math.max(Math.abs(yTop - yBottom), 1);

  return (
    <g stroke={color} fill="none" strokeWidth="2">
      {/* Wick Top */}
      <path d={`M${x + width / 2},${yHigh} L${x + width / 2},${yTop}`} />
      {/* Wick Bottom */}
      <path d={`M${x + width / 2},${yBottom} L${x + width / 2},${yLow}`} />
      {/* Body */}
      <rect
        x={x}
        y={yTop}
        width={Math.max(width, 1)}
        height={bodyHeight}
        fill={isGrowing ? 'transparent' : color}
        stroke={color}
      />
    </g>
  );
};

export default function Dashboard() {
  const [symbols, setSymbols] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('^NSEI');
  
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any>(null);
  const [newsData, setNewsData] = useState<any>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('1y');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetch('/api/stocks')
      .then(r => r.json())
      .then(setSymbols)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedSymbol) return;
    loadDashboardData(selectedSymbol, timeRange);
  }, [selectedSymbol, timeRange]);

  // Autocomplete debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 400); // 400ms debounce
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadDashboardData(selectedSymbol, timeRange, true);
    }, 60000); // 1 min refresh for streaming effect
    return () => clearInterval(interval);
  }, [autoRefresh, selectedSymbol, timeRange]);

  const loadDashboardData = async (symbol: string, range: string, silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    
    try {
      // 1. Fetch History and Predictions in parallel for visual stability
      const [histRes, predictRes] = await Promise.all([
        fetch(`/api/history/${symbol}?range=${range}`),
        fetch(`/api/ml/predict/${symbol}`)
      ]);

      if (!histRes.ok) throw new Error("Failed to fetch historical data");
      const histData = await histRes.json();
      
      const chartData = histData.map((d: any) => ({
        date: format(new Date(d.date), 'MMM dd'),
        rawDate: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        sma20: d.sma20,
        sma50: d.sma50,
        candleRange: [d.low, d.high]
      }));

      // Update states
      setHistoryData(chartData);
      
      if (predictRes.ok) {
        const predictData = await predictRes.json();
        setPredictions(predictData); 
        
        // AI background processing
        generateAIAnalysis(predictData.dataSampleForAI, symbol).then((aiData) => {
            setPredictions((prev: any) => ({...prev, aiPatternAnalysis: aiData}));
        });
      }

      // 3. Fetch News separately
      fetch(`/api/news/${symbol}`)
        .then(r => r.json())
        .then(async (newsData) => {
            setNewsData(newsData);
            const sentimentData = await generateSentimentAnalysis(newsData.news, symbol);
            setNewsData((prev: any) => ({...prev, ...sentimentData}));
        })
        .catch(console.error);

    } catch(err: any) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Combine history and predicted future points in one array for the chart
  const combinedData = [...historyData];
  if (predictions && predictions.futurePoints && historyData.length > 0) {
    // Seed the last historical point with predictedClose to connect the line
    combinedData[combinedData.length - 1] = {
      ...combinedData[combinedData.length - 1],
      predictedClose: combinedData[combinedData.length - 1].close
    };
    
    predictions.futurePoints.forEach((fp: any) => {
      combinedData.push({
        date: format(new Date(fp.date), 'MMM dd'),
        predictedClose: fp.predictedClose,
        isFuture: true
      });
    });
  }

  // Find y-axis domain safely by extracting all possible price points
  const allPrices = combinedData.reduce((acc: number[], d: any) => {
    if (typeof d.low === 'number' && !isNaN(d.low)) acc.push(d.low);
    if (typeof d.high === 'number' && !isNaN(d.high)) acc.push(d.high);
    if (typeof d.predictedClose === 'number' && !isNaN(d.predictedClose)) acc.push(d.predictedClose);
    return acc;
  }, []);

  // Filter out any mathematical outliers that might still exist
  const sortedPrices = allPrices.sort((a, b) => a - b);
  const minPrice = sortedPrices.length > 0 ? sortedPrices[0] * 0.99 : 0;
  const maxPrice = sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] * 1.01 : 0;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      
      {/* Header controls */}
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
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
           <input
             type="text"
             value={searchQuery}
             onChange={(e) => {
               setSearchQuery(e.target.value);
               setShowSuggestions(true);
             }}
             onFocus={() => setShowSuggestions(true)}
             onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
             placeholder={selectedSymbol || "Search NIFTY 100 / global..."}
             className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-zinc-100"
           />
           {showSuggestions && (searchQuery.trim().length > 0) && (
             <div className="absolute top-full mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
                {isSearching ? (
                   <div className="p-3 text-sm text-zinc-500 text-center">Searching...</div>
                ) : suggestions.length > 0 ? (
                   <div className="max-h-60 overflow-y-auto custom-scrollbar">
                     {suggestions.map((s: any, i: number) => (
                       <div 
                         key={i} 
                         onClick={() => {
                           setSelectedSymbol(s.symbol);
                           setSearchQuery(""); // Clear search field to show placeholder
                           setShowSuggestions(false);
                         }}
                         className="px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                       >
                         <div className="flex justify-between items-center">
                           <span className="font-semibold text-sm text-zinc-900 dark:text-white">{s.symbol}</span>
                           <span className="text-[10px] bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-zinc-500">{s.quoteType}</span>
                         </div>
                         <div className="text-xs text-zinc-500 truncate">{s.shortname || s.longname}</div>
                       </div>
                     ))}
                   </div>
                ) : (
                   <div className="p-3 text-sm text-zinc-500 text-center">No results found</div>
                )}
             </div>
           )}
          </div>

          <select 
            value={timeRange}
            onChange={e => setTimeRange(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="1mo">1 Month</option>
            <option value="3mo">3 Months</option>
            <option value="6mo">6 Months</option>
            <option value="1y">1 Year</option>
            <option value="5y">Multiyr (5y)</option>
          </select>

          <button 
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors",
              autoRefresh 
                ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                : "bg-white text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
            )}
          >
            <RefreshCcw className={cn("w-4 h-4", autoRefresh && "animate-spin")} />
            Live Stream
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
      )}

      {/* Main Chart Area */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm min-h-[400px]">
        {loading ? (
          <div className="w-full h-[400px] flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-2 text-zinc-500">
              <RefreshCcw className="w-8 h-8 animate-spin" />
              <span>Analyzing market data...</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-[500px]">
             <ResponsiveContainer width="100%" height="100%">
               <ComposedChart data={combinedData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                 <defs>
                   <linearGradient id="colorPrediction" x1="0" y1="0" x2="1" y2="0">
                     <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.8}/>
                     <stop offset="100%" stopColor="#D946EF" stopOpacity={1}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#52525B" opacity={0.2} />
                 <XAxis 
                   dataKey="date" 
                   tick={{ fontSize: 12, fill: '#71717A' }}
                   tickLine={false}
                   axisLine={false}
                   minTickGap={40}
                 />
                 <YAxis 
                   domain={[minPrice, maxPrice]} 
                   tick={{ fontSize: 12, fill: '#71717A' }}
                   tickLine={false}
                   axisLine={false}
                   tickFormatter={(val) => `\u20B9${val.toFixed(0)}`}
                 />
                 <Tooltip
                   contentStyle={{ backgroundColor: '#18181B', borderColor: '#27272A', color: '#fff', borderRadius: '8px' }}
                   itemStyle={{ color: '#E4E4E7' }}
                   formatter={(value: any, name: string) => {
                     if (name === 'Close') return null; // Handled by custom tooltip below if needed, or just let it show
                     const numVal = Array.isArray(value) ? value[1] : value;
                     if (!numVal || isNaN(numVal)) return null;
                     const label = name === 'predictedClose' ? 'AI Forecast' : (name === 'candleRange' ? 'Market Price' : name);
                     return [`₹${Number(numVal).toFixed(2)}`, label];
                   }}
                 />
                 
                 {/* Candlestick Series using Bar with Custom Shape */}
                 <Bar 
                   dataKey="candleRange" 
                   shape={<CustomCandlestick />}
                   name="Market Price"
                   isAnimationActive={false}
                 />

                 {/* Indicators */}
                 <Line type="monotone" dataKey="sma20" stroke="#3B82F6" strokeWidth={1} dot={false} name="SMA 20" />
                 <Line type="monotone" dataKey="sma50" stroke="#F59E0B" strokeWidth={1} dot={false} name="SMA 50" />
                 
                 {/* AI Prediction Line */}
                 <Line 
                   type="monotone" 
                   dataKey="predictedClose" 
                   stroke="url(#colorPrediction)" 
                   strokeWidth={4} 
                   strokeDasharray="6 4" 
                   dot={{ r: 3, fill: "#A855F7", stroke: "#fff", strokeWidth: 1 }} 
                   activeDot={{ r: 7, fill: "#C084FC" }} 
                   name="AI Forecast" 
                   connectNulls={true} 
                   filter="drop-shadow(0px 0px 4px rgba(168,85,247,0.8))"
                 />
                 
                 {/* Separator between history and future */}
                 {predictions && combinedData.length > historyData.length && (
                   <>
                     <ReferenceLine 
                       x={combinedData[historyData.length - 1]?.date} 
                       stroke="#A855F7" 
                       strokeWidth={2}
                       strokeDasharray="3 3" 
                       label={{ position: 'top', value: 'Prediction Start \u2192', fill: '#A855F7', fontSize: 13, fontWeight: 'bold' }} 
                     />
                     <ReferenceArea 
                       x1={combinedData[historyData.length - 1]?.date} 
                       x2={combinedData[combinedData.length - 1]?.date} 
                       fill="#8B5CF6" 
                       fillOpacity={0.08} 
                     />
                   </>
                 )}
                 
                 {/* Brush for zooming and panning */}
                 <Brush 
                   dataKey="date" 
                   height={30} 
                   stroke="#8B5CF6" 
                   fill="transparent"
                   tickFormatter={() => ''} 
                 />
               </ComposedChart>
             </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ML Pattern Analysis & Quant Signals */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <Brain className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Predictive AI & TA Quant Signals</h2>
          </div>
          
          {!predictions ? (
            <div className="h-40 flex items-center justify-center animate-pulse text-zinc-400 text-sm">
              Model is analyzing latest sequences & algorithmic data...
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Quant Logic Display */}
              {predictions.quantSignals && (
                <div className="space-y-3">
                  <div className="flex justify-between items-end mb-1">
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Quant Momentum Score</span>
                      <span className={cn(
                        "text-sm font-bold",
                        predictions.quantSignals.score > 0 ? 'text-green-500' :
                        predictions.quantSignals.score < 0 ? 'text-red-500' : 'text-zinc-500'
                      )}>
                        {predictions.quantSignals.score > 0 ? '+' : ''}{predictions.quantSignals.score}
                      </span>
                  </div>
                  {/* Score progress bar from -100 to 100 */}
                  <div className="w-full h-2.5 rounded-full bg-gradient-to-r from-red-500 via-zinc-300 to-green-500 relative">
                     <div 
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-zinc-900 rounded-full shadow-sm"
                        style={{ left: `calc(${((predictions.quantSignals.score + 100) / 200) * 100}% - 8px)` }}
                     ></div>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2">
                     {predictions.quantSignals.signals?.map((sig: any, idx: number) => (
                       <span key={idx} className={cn(
                          "text-[10px] px-2 py-1 rounded-md border",
                          sig.impact === 'bullish' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' :
                          sig.impact === 'bearish' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' :
                          'bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300'
                       )}>
                         {sig.name}
                       </span>
                     ))}
                     {predictions.quantSignals.signals.length === 0 && (
                        <span className="text-xs text-zinc-500">No strong TA momentum signals currently isolated.</span>
                     )}
                  </div>
                </div>
              )}

              {/* Separator */}
              <div className="border-t border-zinc-100 dark:border-zinc-800"></div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Gemini Generative Breakdown</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
                  {predictions.aiPatternAnalysis?.overallSummary || 'No specific overarching trend identified.'}
                </p>
                {predictions.aiPatternAnalysis?.patterns?.length > 0 ? (
                  predictions.aiPatternAnalysis.patterns.map((p: any, i: number) => (
                    <div key={i} className="flex flex-col gap-1 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-sm text-zinc-900 dark:text-white">{p.patternName}</span>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          p.trendImpact === 'bullish' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          p.trendImpact === 'bearish' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        )}>
                          {p.trendImpact}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">{p.description}</p>
                      <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5 mt-1">
                        <div 
                           className="bg-purple-500 h-1.5 rounded-full" 
                           style={{ width: `${p.confidence}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] text-right text-zinc-400">{p.confidence}% Confidence</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No strong classic patterns recognized in recent timeframe.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* News & Sentiment Analysis */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <Newspaper className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Live News Sentiment</h2>
          </div>

          {!newsData ? (
            <div className="h-40 flex items-center justify-center animate-pulse text-zinc-400 text-sm">
              Gathering news and evaluating sentiment...
            </div>
          ) : (
            <div className="space-y-4">
               {/* Sentiment Score Bar */}
               <div>
                  <div className="flex justify-between items-end mb-1">
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Overall Market Sentiment</span>
                      <span className={cn(
                        "text-sm font-bold",
                        newsData.sentiment === 'positive' ? 'text-green-500' :
                        newsData.sentiment === 'negative' ? 'text-red-500' : 'text-zinc-500'
                      )}>
                        {newsData.sentimentScore}/100 ({newsData.sentiment})
                      </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-gradient-to-r from-red-500 via-zinc-300 to-green-500 relative">
                     <div 
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-zinc-900 rounded-full shadow-sm"
                        style={{ left: `calc(${newsData.sentimentScore}% - 8px)` }}
                     ></div>
                  </div>
               </div>

               <p className="text-zinc-600 dark:text-zinc-400 text-sm italic">
                  "{newsData.summary}"
               </p>

               <div className="space-y-2 mt-4 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                 {newsData.news?.map((n: any, i: number) => (
                   <a 
                     key={i} 
                     href={n.link} 
                     target="_blank" 
                     rel="noreferrer"
                     className="block p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800 transition-colors"
                   >
                     <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400 line-clamp-2">{n.title}</h4>
                     <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-500">
                       <span className="font-semibold">{n.publisher}</span>
                       <span>•</span>
                       <span>{format(new Date(n.time), 'MMM dd, h:mm a')}</span>
                     </div>
                   </a>
                 ))}
               </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

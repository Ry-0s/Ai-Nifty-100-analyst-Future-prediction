import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { GoogleGenAI, Type } from '@google/genai';
import { TrendingUp, RefreshCcw, Newspaper, Brain, AlertCircle, Search, Info, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
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
// Utilities & AI logic
// --------------------------------------------------------------------------------

let globalLockUntil = 0;

const handleAIError = (e: any, context: string) => {
    const msg = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
    console.error(`${context} Error Detail:`, e);

    if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
        globalLockUntil = Date.now() + 65000;
        return { 
            error: "Quota Exceeded", 
            message: "The Gemini Pro free tier has a limit of 15 requests per minute. Pattern discovery and sentiment parsing are paused for 60 seconds to avoid further rate limiting.",
            type: 'quota'
        };
    }
    
    if (msg.includes("403") || msg.includes("API_KEY_INVALID") || msg.includes("permission")) {
        return { 
            error: "API Key Issue", 
            message: "The provided Gemini API key is invalid or lacks necessary permissions. Please check your credentials in the environment settings.",
            type: 'auth'
        };
    }

    if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
        return { 
            error: "Connectivity Error", 
            message: "Unable to reach the AI Engine. Please check your internet connection.",
            type: 'network'
        };
    }

    return { 
        error: "AI Engine Busy", 
        message: `An unexpected error occurred during ${context}. The system will retry on the next data refresh.`,
        type: 'general'
    };
};

const ErrorDisplay = ({ err, retry }: { err: any, retry?: () => void }) => (
    <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg flex flex-col gap-2 transition-all animate-in fade-in zoom-in-95">
        <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400 font-bold text-sm">
            <AlertCircle className="w-4 h-4" />
            {err.error || "Analysis Error"}
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">{err.message || "Something went wrong while processing the AI signals."}</p>
        <div className="flex justify-end pt-1 gap-3">
            {retry && (
                <button 
                  onClick={retry} 
                  className="text-[10px] font-bold text-blue-500 hover:text-blue-600 transition-colors uppercase tracking-widest flex items-center gap-1"
                >
                    <RefreshCcw className="w-3 h-3" />
                    Retry Analysis
                </button>
            )}
            {!retry && (
                <button onClick={() => window.location.reload()} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-500 uppercase tracking-widest">Re-attempt Sync</button>
            )}
        </div>
    </div>
);

// Persistent Cache for AI results (stays valid across refreshes)
const getCachedResult = (symbol: string, type: 'analysis' | 'sentiment') => {
    try {
        const key = `ai_cache_${symbol}_${type}`;
        const cachedStr = localStorage.getItem(key);
        if (!cachedStr) return null;
        
        const cached = JSON.parse(cachedStr);
        const CACHE_TTL = 60 * 60 * 1000; // Extend to 60 minute TTL 
        
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
        localStorage.removeItem(key);
    } catch (e) {
        console.warn("Storage access failed:", e);
    }
    return null;
};

const setCachedResult = (symbol: string, type: 'analysis' | 'sentiment', data: any) => {
    try {
        const key = `ai_cache_${symbol}_${type}`;
        localStorage.setItem(key, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn("Storage write failed:", e);
    }
};

const cleanAIJSON = (text: string) => {
    if (!text) return {};
    try {
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("AI JSON Parse Error:", e, text);
        return { overallSummary: text, error: "Format mismatch." };
    }
};

const getAIAnalysis = async (dataSample: any, symbol: string) => {
    const cached = getCachedResult(symbol, 'analysis');
    if (cached) return cached;

    if (Date.now() < globalLockUntil) {
        return { 
            error: "Cooldown Period", 
            message: "API quota threshold reached. Waiting 60s for structural analysis reset.",
            type: 'quota'
        };
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'undefined' || key.length < 10) {
        return { error: "Gemini API Key is invalid or missing. Update it in Settings > Secrets." };
    }
    try {
        const ai = new GoogleGenAI({ apiKey: key });
        const prompt = `Perform a high-precision technical analysis for the stock ${symbol}. 
        Analyze the following data points (History & Indicators): ${JSON.stringify(dataSample)}. 
        Focus on trend strength, potential reversals, and volume-price divergent patterns.`;

        const response = await ai.models.generateContent({
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
                                 },
                                 required: ["patternName", "confidence", "description", "trendImpact"]
                             } 
                        },
                        overallSummary: { type: Type.STRING }
                    },
                    required: ["patterns", "overallSummary"]
                }
            }
        });
        
        const result = cleanAIJSON(response.text);
        if (!result.error) setCachedResult(symbol, 'analysis', result);
        return result;
    } catch (e: any) { 
        return handleAIError(e, "Pattern Discovery");
    }
};

const getSentimentAnalysis = async (newsArr: any[], symbol: string) => {
    const cached = getCachedResult(symbol, 'sentiment');
    if (cached) return cached;
    
    if (Date.now() < globalLockUntil) {
        return { 
            error: "Cooldown Period", 
            message: "API quota threshold reached. Waiting 60s for sentiment engine reset.",
            type: 'quota'
        };
    }

    if (!newsArr || newsArr.length === 0) {
        return { summary: "No recent news found for this symbol.", sentimentScore: 50, sentiment: 'neutral' };
    }
    
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'undefined' || key.length < 10) {
        return { error: "API Key missing." };
    }
    try {
        const ai = new GoogleGenAI({ apiKey: key });
        const prompt = `Analyze sentiment for ${symbol}. Headlines: ${JSON.stringify(newsArr.slice(0, 10))}. 
        Return a sentiment score between 0 and 100, where 0 is extremely negative, 50 is neutral, and 100 is extremely positive. 
        IMPORTANT: Ensure sentimentScore is an INTEGER between 0 and 100.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        sentiment: { type: Type.STRING, enum: ["positive", "negative", "neutral"] },
                        sentimentScore: { 
                            type: Type.NUMBER,
                            description: "An integer between 0 and 100 representing the sentiment intensity."
                        },
                        summary: { type: Type.STRING }
                    },
                    required: ["sentiment", "sentimentScore", "summary"]
                }
            }
        });
        const result = cleanAIJSON(response.text);
        if (!result.error) setCachedResult(symbol, 'sentiment', result);
        return result;
    } catch (e: any) { 
        return handleAIError(e, "Sentiment Extraction");
    }
};

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
         <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
         <input
           type="text"
           value={searchQuery}
           onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
           onFocus={() => setShowSuggestions(true)}
           onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
           placeholder={selectedSymbol || "Search NIFTY 100 / global..."}
           className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-zinc-100"
         />
         {showSuggestions && (searchQuery.trim().length > 0) && (
           <div className="absolute top-full mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
              {isSearching ? <div className="p-3 text-sm text-zinc-500 text-center">Searching...</div> : suggestions.length > 0 ? (
                 <div className="max-h-60 overflow-y-auto custom-scrollbar">
                   {suggestions.map((s: any, i: number) => (
                     <div key={i} onClick={() => { setSelectedSymbol(s.symbol); setSearchQuery(""); setShowSuggestions(false); }} className="px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer border-b border-zinc-100 dark:border-zinc-800 last:border-0">
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

const AIAnalysisBlock = React.memo(({ predictions, symbol }: any) => {
  const [showMethodology, setShowMethodology] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    if (predictions && predictions.dataSampleForAI) {
      setAnalysisLoading(true);
      setAnalysis(null);
      try {
        const res = await getAIAnalysis(predictions.dataSampleForAI, symbol);
        setAnalysis(res);
      } finally {
        setAnalysisLoading(false);
      }
    }
  }, [predictions, symbol]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  if (!predictions) return <div className="h-40 flex items-center justify-center animate-pulse text-zinc-400 text-sm">Model is analyzing latest sequences...</div>;
  if (analysis?.error) return <ErrorDisplay err={analysis} retry={fetchAnalysis} />;
  
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
              <p className="mt-2 text-[10px] text-zinc-400 italic">Scores are aggregated and normalized with active sentiment bias applied.</p>
            </div>
          )}

          <div className="pt-2 flex flex-wrap gap-2">
             {predictions.quantSignals.signals?.map((sig: any, idx: number) => (
               <span key={idx} className={cn("text-[10px] px-2 py-1 rounded-md border", sig.impact === 'bullish' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : sig.impact === 'bearish' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' : 'bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300')}>{sig.name}</span>
             ))}
          </div>
        </div>
      )}
      <div className="border-t border-zinc-100 dark:border-zinc-800"></div>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">AI/ML Generative Breakdown</h3>
        {analysisLoading && !analysis ? (
             <div className="h-40 flex items-center justify-center animate-pulse text-zinc-400 text-xs uppercase tracking-widest">Generating Pattern Analysis...</div>
        ) : (
            <>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">{analysis?.overallSummary || 'No specific overarching trend identified.'}</p>
                {analysis?.patterns?.map((p: any, i: number) => (
                  <div key={i} className="flex flex-col gap-1 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                    <div className="flex justify-between items-center text-sm font-semibold text-zinc-900 dark:text-white"><span>{p.patternName}</span><span className={cn("text-xs px-2 py-0.5 rounded-full", p.trendImpact === 'bullish' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : p.trendImpact === 'bearish' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400")}>{p.trendImpact}</span></div>
                    <p className="text-xs text-zinc-500">{p.description}</p>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1 mt-1"><div className="bg-purple-500 h-1 rounded-full" style={{ width: `${p.confidence}%` }}></div></div>
                  </div>
                ))}
            </>
        )}
      </div>
    </div>
  );
});

const NewsSentimentBlock = React.memo(({ newsData, symbol }: any) => {
  const [sentiment, setSentiment] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchSentiment = useCallback(async () => {
    if (newsData && newsData.news && newsData.news.length > 0) {
      setLoading(true);
      setSentiment(null);
      try {
        const res = await getSentimentAnalysis(newsData.news, symbol);
        setSentiment(res);
      } finally {
        setLoading(false);
      }
    }
  }, [newsData, symbol]);

  useEffect(() => {
    fetchSentiment();
  }, [fetchSentiment]);

  if (!newsData || !newsData.news || newsData.news.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-zinc-400 text-sm flex-col gap-2">
        <RefreshCcw className="w-5 h-5 opacity-20" />
        No news coverage found for this ticker.
      </div>
    );
  }

  if (sentiment?.error) return <ErrorDisplay err={sentiment} retry={fetchSentiment} />;
  
  const displayData = sentiment || newsData; // Fallback to raw data if AI fails gracefully but didn't return error object
  
  return (
    <div className="space-y-4">
       {loading && !sentiment ? (
         <div className="h-40 flex items-center justify-center animate-pulse text-zinc-400 text-xs uppercase tracking-widest">Generating AI Sentiment...</div>
       ) : (
         <>
           <div>
              <div className="flex justify-between items-end mb-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                <span>Overall Market Sentiment</span>
                <span className={cn("text-sm font-bold", (displayData.sentiment || 'neutral') === 'positive' ? 'text-green-500' : (displayData.sentiment || 'neutral') === 'negative' ? 'text-red-500' : 'text-zinc-500')}>
                  {displayData.sentimentScore ? (displayData.sentimentScore <= 1 ? Math.round(displayData.sentimentScore * 100) : Math.round(displayData.sentimentScore)) : 50}/100 ({(displayData.sentiment || 'neutral').toUpperCase()})
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden ring-1 ring-zinc-200 dark:ring-zinc-700">
                 <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-zinc-400 to-green-500 opacity-20 w-full" />
                 <div className="absolute top-0 bottom-0 w-1 bg-zinc-900 dark:bg-white transition-all duration-1000 z-10" style={{ left: `${displayData.sentimentScore ? (displayData.sentimentScore <= 1 ? displayData.sentimentScore * 100 : displayData.sentimentScore) : 50}%`, transform: 'translateX(-50%)' }} />
              </div>
           </div>
           
           <p className="text-zinc-600 dark:text-zinc-400 text-sm italic leading-relaxed">
             {displayData.summary ? `"${displayData.summary}"` : "AI Analysis pending stable news input..."}
           </p>
         </>
       )}
       
       <div className="space-y-2 mt-4 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
         {newsData.news?.map((n: any, i: number) => (
           <a key={i} href={n.link} target="_blank" rel="noreferrer" className="block p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800 transition-colors">
             <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400 line-clamp-2">{n.title}</h4>
             <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500"><span>{n.publisher}</span><span>•</span><span>{format(new Date(n.time), 'MMM dd, h:mm a')}</span></div>
           </a>
         ))}
       </div>
    </div>
  );
});

// --------------------------------------------------------------------------------
// Main Dashboard Component
// --------------------------------------------------------------------------------

export default function Dashboard() {
  const [symbols, setSymbols] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('^NSEI');
  
  // Atomic state for the chart to prevent intermediate inconsistent renders
  const [chartSource, setChartSource] = useState({
    history: [] as any[],
    predictions: null as any
  });
  
  const [newsData, setNewsData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('1y');
  const [brushRange, setBrushRange] = useState<{ startIndex?: number; endIndex?: number }>({});
  const [showIchimoku, setShowIchimoku] = useState(false);
  const [showStochRsi, setShowStochRsi] = useState(false);
  const [showBB, setShowBB] = useState(false);
  
  // Interaction tracking
  const isUpdatingRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetch('/api/stocks').then(r => r.json()).then(setSymbols).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedSymbol) return;
    loadDashboardData(selectedSymbol, timeRange);
  }, [selectedSymbol, timeRange]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSuggestions([]); return; }
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSuggestions(data);
      } catch (err) { console.error(err); } finally { setIsSearching(false); }
    }, 400);
    return () => clearTimeout(timeoutId);
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
      const [histRes, predictRes] = await Promise.all([
        fetch(`/api/history/${symbol}?range=${range}`),
        fetch(`/api/ml/predict/${symbol}`)
      ]);
      
      if (!histRes.ok) throw new Error("Failed to fetch historical data");
      
      const [hDataRaw, pDataRaw] = await Promise.all([
        histRes.json(),
        predictRes.ok ? predictRes.json() : Promise.resolve(null)
      ]);

      const chartData = hDataRaw.map((d: any) => ({
        date: format(new Date(d.date), 'MMM dd'),
        rawDate: d.date, 
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

      // Atomic update of history and predictions
      setChartSource({
        history: chartData,
        predictions: pDataRaw
      });
      
      fetch(`/api/news/${symbol}`).then(r => r.json()).then(async (nData) => {
          setNewsData({
            news: nData.news || [],
            sentimentScore: 50,
            sentiment: 'neutral',
            summary: "AI Sentiment analysis is being calculated..."
          });
      }).catch(console.error);
      
    } catch(err: any) { setError(err.message); } finally { 
      if (!silent) setLoading(false); 
      // Reset after re-render cycle likely complete (rough approximation)
      setTimeout(() => { isUpdatingRef.current = false; }, 1000);
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
          date: format(new Date(fp.date), 'MMM dd'), 
          predictedClose: fp.predictedClose, 
          uncertaintyHigh: fp.uncertaintyHigh,
          uncertaintyLow: fp.uncertaintyLow,
          isFuture: true 
        });
      });
    }
    return combined;
  }, [chartSource.history, chartSource.predictions]);

  const { minPrice, maxPrice } = useMemo(() => {
    const allPrices = combinedData.reduce((acc: number[], d: any) => {
      if (typeof d.low === 'number' && !isNaN(d.low)) acc.push(d.low);
      if (typeof d.high === 'number' && !isNaN(d.high)) acc.push(d.high);
      if (typeof d.predictedClose === 'number' && !isNaN(d.predictedClose)) acc.push(d.predictedClose);
      if (showIchimoku) {
        if (d.ichiSpanA) acc.push(d.ichiSpanA);
        if (d.ichiSpanB) acc.push(d.ichiSpanB);
      }
      if (showBB) {
        if (d.bbUpper) acc.push(d.bbUpper);
        if (d.bbLower) acc.push(d.bbLower);
      }
      return acc;
    }, []);
    const sorted = allPrices.sort((a, b) => a - b);
    return { minPrice: sorted.length > 0 ? sorted[0] * 0.99 : 0, maxPrice: sorted.length > 0 ? sorted[sorted.length - 1] * 1.01 : 0 };
  }, [combinedData]);

  // Decoupled Brush Handler
  const handleBrushChange = useCallback((range: any) => {
    // If the Brush triggers an onChange during an auto-refresh (resetting towards full range),
    // and we have a valid zoom stored, we might want to be careful.
    // However, Recharts usually only triggers this on user action OR if props change in a way that forces a reset.
    setBrushRange(range);
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <DashboardHeader 
        searchQuery={searchQuery} setSearchQuery={setSearchQuery} 
        selectedSymbol={selectedSymbol} setSelectedSymbol={setSelectedSymbol} 
        timeRange={timeRange} setTimeRange={setTimeRange} 
        suggestions={suggestions} isSearching={isSearching} 
        showSuggestions={showSuggestions} setShowSuggestions={setShowSuggestions} 
      />

      {error && <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center gap-2"><AlertCircle className="w-5 h-5" /><p>{error}</p></div>}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm min-h-[400px]">
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
                 <ComposedChart data={combinedData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                   <defs>
                     <linearGradient id="colorPrediction" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.8}/><stop offset="100%" stopColor="#D946EF" stopOpacity={1}/></linearGradient>
                     <linearGradient id="cloudUp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.1}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                     <linearGradient id="cloudDown" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                     <linearGradient id="uncertaintyGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.15}/><stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02}/></linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#52525B" opacity={0.2} />
                   <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#71717A' }} tickLine={false} axisLine={false} minTickGap={40} />
                   <YAxis domain={[minPrice, maxPrice]} tick={{ fontSize: 12, fill: '#71717A' }} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val.toFixed(0)}`} />
                   <Tooltip contentStyle={{ backgroundColor: '#18181B', borderColor: '#27272A', color: '#fff', borderRadius: '8px' }} itemStyle={{ color: '#E4E4E7' }} formatter={(value: any, name: string) => {
                     const numVal = Array.isArray(value) ? value[1] : value;
                     if (numVal == null || isNaN(numVal)) return null;
                     
                     const nameMap: any = {
                        predictedClose: 'AI Forecast',
                        uncertaintyHigh: 'Confidence Cap',
                        uncertaintyLow: 'Confidence Floor',
                        candleRange: 'Market Price',
                        ichiTenkan: 'Tenkan-sen',
                        ichiKijun: 'Kijun-sen',
                        ichiSpanA: 'Senkou Span A',
                        ichiSpanB: 'Senkou Span B',
                        stochK: 'Stoch RSI %K',
                        stochD: 'Stoch RSI %D',
                        bbUpper: 'BB Upper',
                        bbMiddle: 'BB Middle',
                        bbLower: 'BB Lower'
                     };
                     
                     if (name === 'uncertaintyHigh' || name === 'uncertaintyLow') return null;
                     
                     return [`₹${Number(numVal).toFixed(2)}`, nameMap[name] || name];
                   }} />
                   
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
                     dataKey="uncertaintyHigh" 
                     // @ts-ignore
                     baseValue="uncertaintyLow" 
                     stroke="none" 
                     fill="url(#uncertaintyGradient)" 
                     fillOpacity={1} 
                     isAnimationActive={false} 
                     connectNulls={true} 
                     name="Confidence Band"
                   />

                   <Line type="monotone" dataKey="predictedClose" stroke="url(#colorPrediction)" strokeWidth={4} strokeDasharray="6 4" dot={{ r: 3, fill: "#A855F7", stroke: "#fff", strokeWidth: 1 }} activeDot={{ r: 7, fill: "#C084FC" }} name="predictedClose" connectNulls={true} filter="drop-shadow(0px 0px 4px rgba(168,85,247,0.8))" />
                 
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800"><Brain className="w-5 h-5 text-purple-500" /><h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Predictive AI & TA Quant Signals</h2></div>
          <AIAnalysisBlock predictions={chartSource.predictions} symbol={selectedSymbol} />
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800"><Newspaper className="w-5 h-5 text-blue-500" /><h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Live News Sentiment</h2></div>
          <NewsSentimentBlock newsData={newsData} symbol={selectedSymbol} />
        </div>
      </div>
    </div>
  );
}

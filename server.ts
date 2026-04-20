import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import YahooFinance from 'yahoo-finance2';
import { linearRegression } from 'simple-statistics';
import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import { 
  RSI, MACD, SMA, StochasticRSI, BollingerBands, ADX, ATR, CCI, IchimokuCloud,
  bullishengulfingpattern, bearishengulfingpattern, morningstar, eveningstar
} from 'technicalindicators';

const yahooFinance = new YahooFinance();
const tfModelCache = new Map<string, tf.Sequential>();
const isTrainingCache = new Map<string, boolean>();
const lastTrainedCache = new Map<string, number>();
const lastLossCache = new Map<string, number>();
const samplesCache = new Map<string, number>();

// Load synthetic data once at startup
let syntheticData: any[] = [];
try {
    let syntheticPath = path.join(process.cwd(), 'synthetic_training_data.json');
    
    // In packaged Electron, paths are relative to resourcesPath
    if (process.env.ELECTRON === 'true') {
        const resPath = process.env.RESOURCES_PATH || '';
        let unpackedPath = resPath;
        if (resPath.endsWith('.asar')) {
            unpackedPath = resPath + '.unpacked';
        }

        const potentialPaths = [
            path.join(resPath, 'synthetic_training_data.json'),
            path.join(resPath, 'app', 'synthetic_training_data.json'),
            path.join(unpackedPath, 'synthetic_training_data.json'),
            path.join(unpackedPath, 'app', 'synthetic_training_data.json'),
            path.join(process.cwd(), 'synthetic_training_data.json')
        ];
        for (const p of potentialPaths) {
            if (fs.existsSync(p)) {
                syntheticPath = p;
                break;
            }
        }
    }

    if (fs.existsSync(syntheticPath)) {
        const raw = fs.readFileSync(syntheticPath, 'utf8');
        syntheticData = JSON.parse(raw);
    }
} catch (e) {
    console.error("Failed to load synthetic data:", e);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // NIFTY 100 sample + Global valid symbols
  const SYMBOLS = [
    { symbol: '^NSEI', name: 'NIFTY 50 Index' },
    { symbol: '^NSEBANK', name: 'NIFTY Bank Index' },
    { symbol: 'RELIANCE.NS', name: 'Reliance Industries' },
    { symbol: 'TCS.NS', name: 'Tata Consultancy Services' },
    { symbol: 'HDFCBANK.NS', name: 'HDFC Bank' },
    { symbol: 'ICICIBANK.NS', name: 'ICICI Bank' },
    { symbol: 'INFY.NS', name: 'Infosys' },
    { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel' },
    { symbol: 'SBIN.NS', name: 'State Bank of India' },
    { symbol: 'LICI.NS', name: 'Life Insurance Corp' },
    { symbol: 'ITC.NS', name: 'ITC Limited' },
    { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever' },
    { symbol: 'LT.NS', name: 'Larsen & Toubro' },
    { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance' },
    { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank' },
    { symbol: 'ADANIENT.NS', name: 'Adani Enterprises' },
    { symbol: 'SUNPHARMA.NS', name: 'Sun Pharma' },
    { symbol: 'AXISBANK.NS', name: 'Axis Bank' },
    { symbol: 'TITAN.NS', name: 'Titan Company' },
    { symbol: 'ULTRACEMCO.NS', name: 'UltraTech Cement' },
    { symbol: 'ADANIPORTS.NS', name: 'Adani Ports' },
    { symbol: 'ASIANPAINT.NS', name: 'Asian Paints' },
    { symbol: 'COALINDIA.NS', name: 'Coal India' },
    { symbol: 'MARUTI.NS', name: 'Maruti Suzuki' },
    { symbol: 'BAJAJFINSV.NS', name: 'Bajaj Finserv' },
    { symbol: 'POWERGRID.NS', name: 'Power Grid' },
    { symbol: 'NTPC.NS', name: 'NTPC Limited' },
    { symbol: 'TATASTEEL.NS', name: 'Tata Steel' },
    { symbol: 'M&M.NS', name: 'Mahindra & Mahindra' },
    { symbol: 'HCLTECH.NS', name: 'HCL Technologies' },
    { symbol: 'TATAMOTORS.NS', name: 'Tata Motors' },
    { symbol: 'ADANIPOWER.NS', name: 'Adani Power' },
    { symbol: 'INDUSINDBK.NS', name: 'IndusInd Bank' },
    { symbol: 'SBILIFE.NS', name: 'SBI Life Insurance' },
    { symbol: 'JSWSTEEL.NS', name: 'JSW Steel' },
    { symbol: 'GRASIM.NS', name: 'Grasim Industries' },
    { symbol: 'HINDALCO.NS', name: 'Hindalco' },
    { symbol: 'NESTLEIND.NS', name: 'Nestle India' },
    { symbol: 'BAJAJ-AUTO.NS', name: 'Bajaj Auto' },
    { symbol: 'WIPRO.NS', name: 'Wipro Limited' },
    { symbol: 'ONGC.NS', name: 'ONGC' },
    { symbol: 'APOLLOHOSP.NS', name: 'Apollo Hospitals' },
    { symbol: 'DRREDDY.NS', name: 'Dr. Reddys Labs' },
    { symbol: 'ADANIGREEN.NS', name: 'Adani Green Energy' },
    { symbol: 'LTIM.NS', name: 'LTIMindtree' },
    { symbol: 'DIVISLAB.NS', name: 'Divis Labs' },
    { symbol: 'EICHERMOT.NS', name: 'Eicher Motors' },
    { symbol: 'BPCL.NS', name: 'BPCL' },
    { symbol: 'HDFCLIFE.NS', name: 'HDFC Life' },
    { symbol: 'ADANIENSOL.NS', name: 'Adani Energy Sol' },
    { symbol: 'TATACONSUM.NS', name: 'Tata Consumer' },
    { symbol: 'SHREECEM.NS', name: 'Shree Cement' },
    { symbol: 'BRITANNIA.NS', name: 'Britannia Ind' },
    { symbol: 'CIPLA.NS', name: 'Cipla Limited' },
    { symbol: 'HEROMOTOCO.NS', name: 'Hero MotoCorp' },
    { symbol: 'TECHM.NS', name: 'Tech Mahindra' },
    { symbol: 'UPL.NS', name: 'UPL Limited' },
    { symbol: 'JINDALSTEL.NS', name: 'Jindal Steel' },
    { symbol: 'TATAELXSI.NS', name: 'Tata Elxsi' },
    { symbol: 'ICICIPRULI.NS', name: 'ICICI Prulife' },
    { symbol: 'HAVELLS.NS', name: 'Havells India' },
    { symbol: 'GAIL.NS', name: 'GAIL India' },
    { symbol: 'PIDILITIND.NS', name: 'Pidilite Ind' },
    { symbol: 'VBL.NS', name: 'Varun Beverages' },
    { symbol: 'AMBUJACEM.NS', name: 'Ambuja Cements' },
    { symbol: 'IOC.NS', name: 'Indian Oil' },
    { symbol: 'SIEMENS.NS', name: 'Siemens' },
    { symbol: 'ABB.NS', name: 'ABB India' },
    { symbol: 'BEL.NS', name: 'Bharat Electronics' },
    { symbol: 'BHEL.NS', name: 'BHEL' },
    { symbol: 'IRCTC.NS', name: 'IRCTC' },
    { symbol: 'POLYCAB.NS', name: 'Polycab India' },
    { symbol: 'HAL.NS', name: 'Hindustan Aeronautics' },
    { symbol: 'TRENT.NS', name: 'Trent Limited' },
    { symbol: 'CHOLAFIN.NS', name: 'Cholamandalam' },
    { symbol: 'DLF.NS', name: 'DLF Limited' },
    { symbol: 'LODHA.NS', name: 'Macrotech Developers' },
    { symbol: 'CANBK.NS', name: 'Canara Bank' },
    { symbol: 'PNB.NS', name: 'Punjab National Bank' },
    { symbol: 'BANKBARODA.NS', name: 'Bank of Baroda' },
    { symbol: 'IDFCFIRSTB.NS', name: 'IDFC First Bank' },
    { symbol: 'YESBANK.NS', name: 'Yes Bank' },
    { symbol: 'ZOMATO.NS', name: 'Zomato Limited' },
    { symbol: 'PAYTM.NS', name: 'Paytm' },
    { symbol: 'NYKAA.NS', name: 'FSN E-Commerce' },
    { symbol: 'DELHIVERY.NS', name: 'Delhivery' },
    { symbol: 'POLICYBZR.NS', name: 'PB Fintech' },
    { symbol: 'GODREJCP.NS', name: 'Godrej Consumer' },
    { symbol: 'DABUR.NS', name: 'Dabur India' },
    { symbol: 'MARICO.NS', name: 'Marico Limited' },
    { symbol: 'BERGEPAINT.NS', name: 'Berger Paints' },
    { symbol: 'COLPAL.NS', name: 'Colgate-Palmolive' },
    { symbol: 'TATACOMM.NS', name: 'Tata Communications' },
    { symbol: 'PERSISTENT.NS', name: 'Persistent Systems' },
    { symbol: 'DIXON.NS', name: 'Dixon Tech' },
    { symbol: 'MPHASIS.NS', name: 'Mphasis Limited' },
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'NVDA', name: 'Nvidia Corp.' },
    { symbol: 'MSFT', name: 'Microsoft Corp.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  ];

  app.get('/api/stocks', (req, res) => {
    res.json(SYMBOLS);
  });

  app.get('/api/search', async (req, res) => {
    try {
      const q = (req.query.q as string || '').toUpperCase();
      if (!q) return res.json([]);

      // 1. Instant Local Match
      const localMatches = SYMBOLS.filter(s => 
          s.symbol.includes(q) || s.name.toUpperCase().includes(q)
      ).slice(0, 10);

      // If we have good local results and query is short, return fast
      if (localMatches.length > 3 && q.length < 5) {
          return res.json(localMatches);
      }

      // 2. Fallback to Global Yahoo Search
      const searchResult = await yahooFinance.search(q);
      const quotes = (searchResult.quotes || [])
        .filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'INDEX' || q.quoteType === 'ETF')
        .map(q => ({
            symbol: q.symbol,
            name: q.shortname || q.longname || q.symbol
        }));
      
      // Merge unique
      const merged = [...localMatches];
      quotes.forEach(ext => {
          if (!merged.find(m => m.symbol === (ext as any).symbol)) merged.push(ext as any);
      });
      
      res.json(merged.slice(0, 12));
    } catch (e: any) {
      console.error('Search error:', e.message);
      // If global search fails, just return local matches to avoid breaking the UI
      const q = (req.query.q as string || '').toUpperCase();
      const fallbackMatches = SYMBOLS.filter(s => 
          s.symbol.includes(q) || s.name.toUpperCase().includes(q)
      ).slice(0, 12);
      res.json(fallbackMatches);
    }
  });

  // Calculate simple moving average
  const calculateSMA = (data: number[], window: number) => {
    let result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < window - 1) {
            result.push(null);
        } else {
            const sum = data.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / window);
        }
    }
    return result;
  };

  app.get('/api/history/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const { interval = '1d', range = '1y' } = req.query;

      // Calculate period1 based on range
      const now = new Date();
      let period1Date = new Date();
      
      if (range === '1mo') period1Date.setMonth(now.getMonth() - 1);
      else if (range === '3mo') period1Date.setMonth(now.getMonth() - 3);
      else if (range === '6mo') period1Date.setMonth(now.getMonth() - 6);
      else if (range === '1y') period1Date.setFullYear(now.getFullYear() - 1);
      else if (range === '5y') period1Date.setFullYear(now.getFullYear() - 5);
      else period1Date.setFullYear(now.getFullYear() - 1);

      // Validate interval to prevent InvalidOptionsError
      const validIntervals = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'];
      const safeInterval = validIntervals.includes(interval as string) ? (interval as any) : '1d';

      const queryOptions: any = { 
        interval: safeInterval,
        period1: Math.floor(period1Date.getTime() / 1000) // Seconds since epoch is most stable
      };

      let chartData: any;
      try {
        chartData = await yahooFinance.chart(symbol, queryOptions);
      } catch (e: any) {
        if (e.message.includes('No data found') || e.message.includes('delisted')) {
          // Fallback: try with the smallest possible window
          const fallbackPeriod = new Date();
          fallbackPeriod.setMonth(fallbackPeriod.getMonth() - 1);
          chartData = await yahooFinance.chart(symbol, { 
            interval: '1d', 
            period1: Math.floor(fallbackPeriod.getTime() / 1000) 
          } as any);
        } else {
          throw e;
        }
      }

      const results: any[] = (chartData.quotes || []).filter((q: any) => q.close != null && q.open != null && q.high != null && q.low != null);
      
      if (results.length === 0) {
        return res.status(404).json({ error: "Symbol not found or data unavailable for this range." });
      }
      
      // Compute Indicators (SMA20, SMA50, Ichimoku, StochRSI)
      const closes = results.map(r => r.close);
      const highs = results.map(r => r.high);
      const lows = results.map(r => r.low);
      
      const sma20 = calculateSMA(closes, 20);
      const sma50 = calculateSMA(closes, 50);

      const ichimoku = IchimokuCloud.calculate({
          high: highs, low: lows,
          conversionPeriod: 9, basePeriod: 26, spanPeriod: 52, displacement: 26
      });

      const stochRsi = StochasticRSI.calculate({
          values: closes, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3
      });

      const bb = BollingerBands.calculate({
          values: closes, period: 20, stdDev: 2
      });

      const enhancedResults = results.map((r, i) => {
        // Pad Indicators
        const ichiOffset = results.length - ichimoku.length;
        const stochOffset = results.length - stochRsi.length;
        const bbOffset = results.length - bb.length;
        
        return {
          ...r,
          sma20: sma20[i],
          sma50: sma50[i],
          ichimoku: i >= ichiOffset ? ichimoku[i - ichiOffset] : null,
          stochRsi: i >= stochOffset ? stochRsi[i - stochOffset] : null,
          bollinger: i >= bbOffset ? bb[i - bbOffset] : null
        };
      });

      res.json(enhancedResults);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/ml/predict/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;

        let chartData: any;
        const period1_2y = new Date();
        period1_2y.setFullYear(period1_2y.getFullYear() - 2);

        try {
            // Use period1 for ML prediction
            chartData = await yahooFinance.chart(symbol, {
                period1: Math.floor(period1_2y.getTime() / 1000),
                interval: '1d'
            } as any);
        } catch (e: any) {
             if (e.message.includes('No data found') || e.message.includes('delisted')) {
                 // Try a shorter window if 2y fails
                 const period1_1y = new Date();
                 period1_1y.setFullYear(period1_1y.getFullYear() - 1);
                 chartData = await yahooFinance.chart(symbol, { 
                    period1: Math.floor(period1_1y.getTime() / 1000), 
                    interval: '1d' 
                } as any);
             } else {
                 throw e;
             }
        }

        const rawData: any[] = chartData.quotes || [];

        if (rawData.length < 100) {
            return res.json({ error: "Not enough historical data for optimized ML model." });
        }

        const filteredData = rawData.filter(d => d.close != null && d.open != null && d.high != null && d.low != null);
        
        // Merge with Synthetic Data for robustness
        const mergedHistorical = [...filteredData];
        if (syntheticData.length > 0) {
            // Include up to 2500 synthetic points to provide sufficient regimen variation to the model
            const subset = syntheticData.sort(() => 0.5 - Math.random()).slice(0, 2500);
            subset.forEach(s => {
                mergedHistorical.push({
                    date: new Date(s.date),
                    open: s.open, high: s.high, low: s.low, close: s.close, volume: s.volume
                });
            });
        }

        const closes = mergedHistorical.map(d => d.close);
        const highs = mergedHistorical.map(d => d.high);
        const lows = mergedHistorical.map(d => d.low);
        const opens = mergedHistorical.map(d => d.open);

        const rsiValues = RSI.calculate({ values: closes, period: 14 });
        const macdValues = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
        const bbValues = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
        const sma20Values = SMA.calculate({ values: closes, period: 20 });
        const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
        const cciValues = CCI.calculate({ high: highs, low: lows, close: closes, period: 20 });
        
        const rsiFull = new Array(closes.length - rsiValues.length).fill(50).concat(rsiValues);
        const macdFull = new Array(closes.length - macdValues.length).fill({ MACD: 0, signal: 0, histogram: 0 }).concat(macdValues);
        const bbFull = new Array(closes.length - bbValues.length).fill({ upper: closes[0], lower: closes[0], middle: closes[0] }).concat(bbValues);
        const sma20Full = new Array(closes.length - sma20Values.length).fill(closes[0]).concat(sma20Values);
        const atrFull = new Array(closes.length - atrValues.length).fill(0).concat(atrValues);
        const cciFull = new Array(closes.length - cciValues.length).fill(0).concat(cciValues);

        const enrichedData = mergedHistorical.map((d, i) => ({
            ...d,
            rsi: rsiFull[i],
            macd: macdFull[i].MACD - macdFull[i].signal,
            bbPos: bbFull[i].upper === bbFull[i].lower ? 0.5 : (d.close - bbFull[i].lower) / (bbFull[i].upper - bbFull[i].lower),
            smaDist: (d.close - sma20Full[i]) / sma20Full[i],
            atr: atrFull[i],
            cci: cciFull[i]
        }));
        
        // Quant Momentum Matrix (Deterministic)
        let quantScore = 0;
        let detectedSignals: Array<{name: string, impact: string}> = [];
        const lastActual = enrichedData[enrichedData.length - 1];
        
        try {
            const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
            const currentAdx = adx[adx.length - 1];

            if (lastActual.rsi < 35) { quantScore += 20; detectedSignals.push({ name: 'RSI Support', impact: 'bullish' }); }
            else if (lastActual.rsi > 65) { quantScore -= 20; detectedSignals.push({ name: 'RSI Resistance', impact: 'bearish' }); }
            
            if (currentAdx && currentAdx.adx > 25) {
                const trendDir = closes[closes.length - 1] > closes[closes.length - 20] ? 1 : -1;
                quantScore += (trendDir * 20);
                detectedSignals.push({ name: 'Strong Trend Power', impact: trendDir > 0 ? 'bullish' : 'bearish' });
            }
        } catch(e) {}

        // Instead of calculating a global minPrice/maxPrice which corrupts data when mixing synthetic regimes 
        // with real assets, we'll normalize each 30-day window independently
        const maxVol = Math.max(...mergedHistorical.map(d => d.volume || 1)) || 1;
        const maxAtr = Math.max(...atrFull) || 1;

        const WINDOW_SIZE = 45;
        const FORECAST_DAYS = 60;
        
        let model = tfModelCache.get(symbol);
        if (!model) {
            model = tf.sequential();
            model.add(tf.layers.lstm({ units: 64, returnSequences: true, inputShape: [WINDOW_SIZE, 11] }));
            model.add(tf.layers.dropout({ rate: 0.1 }));
            model.add(tf.layers.lstm({ units: 32, returnSequences: false }));
            model.add(tf.layers.leakyReLU({ alpha: 0.1 })); // Use LeakyReLU for hidden
            model.add(tf.layers.dense({ units: FORECAST_DAYS, activation: 'linear' })); 
            model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
            tfModelCache.set(symbol, model);
        }

        const xs: number[][][] = [];
        const ys: number[][] = [];
        
        for (let i = 0; i < enrichedData.length - WINDOW_SIZE - FORECAST_DAYS; i += 4) { // Faster training step
            const windowSlice = enrichedData.slice(i, i + WINDOW_SIZE);
            const targetSlice = enrichedData.slice(i + WINDOW_SIZE, i + WINDOW_SIZE + FORECAST_DAYS);
            
            // Per-window normalization
            const windowCloses = windowSlice.map(d => d.close);
            const windowMin = Math.min(...windowCloses);
            const windowMax = Math.max(...windowCloses);
            const windowRange = windowMax - windowMin || 1;
            
            const windowVols = windowSlice.map(d => d.volume || 1);
            const windowMaxVol = Math.max(...windowVols) || 1;
            
            const windowAtrs = windowSlice.map(d => d.atr || 1);
            const windowMaxAtr = Math.max(...windowAtrs) || 1;

            if (windowRange < 0.01 || windowSlice.length < WINDOW_SIZE) continue;

            const window = windowSlice.map(d => [
                (d.open - windowMin) / windowRange, 
                (d.high - windowMin) / windowRange, 
                (d.low - windowMin) / windowRange, 
                (d.close - windowMin) / windowRange,
                (d.volume || 0) / windowMaxVol, 
                (d.rsi || 50) / 100, 
                (d.macd || 0) + 0.5, 
                d.bbPos || 0.5, 
                (d.smaDist || 0) + 0.5, 
                (d.atr || 0) / windowMaxAtr, 
                (d.cci || 0) / 200 + 0.5
            ]);
            // Target is also normalized relative to the current window's span
            const targetLine = targetSlice.map(d => (d.close - windowMin) / windowRange);
            if (targetLine.length === FORECAST_DAYS) {
                xs.push(window);
                ys.push(targetLine);
            }
        }

        if (xs.length > 0) {
            samplesCache.set(symbol, xs.length);
            const tfXs = tf.tensor3d(xs);
            const tfYs = tf.tensor2d(ys);
            
            const lastTrained = lastTrainedCache.get(symbol) || 0;
            const now = Date.now();
            // Force retrain if data size changed significantly or cache is old
            if (now - lastTrained > 20 * 60 * 1000 && !isTrainingCache.get(symbol)) {
                isTrainingCache.set(symbol, true);
                try {
                    const history = await model.fit(tfXs, tfYs, { 
                        epochs: 15, batchSize: 32, validationSplit: 0.1, verbose: 0,
                        callbacks: [
                            tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 3 })
                        ]
                    });
                    
                    const finalLoss = history.history.loss[history.history.loss.length - 1];
                    if(typeof finalLoss === 'number') {
                        lastLossCache.set(symbol, Number(finalLoss.toFixed(4)));
                    }

                    lastTrainedCache.set(symbol, now);
                } catch (trainErr) {
                    console.error("Training failed:", trainErr);
                } finally {
                    isTrainingCache.set(symbol, false);
                }
            }
            tfXs.dispose();
            tfYs.dispose();
        }

        // Single pass prediction using real historical data (not synthetic)
        // We always use the actual historical stock data for the final prediction inference
        const realEnrichedData = enrichedData.slice(0, filteredData.length);
        if (realEnrichedData.length < WINDOW_SIZE) {
            return res.json({ 
                error: `Not enough historical data for ${symbol}. Need at least ${WINDOW_SIZE} days.`,
                localAiMetrics: { lastTrained: 0, samples: 0, loss: 0 } 
            });
        }
        const lastWindowSlice = realEnrichedData.slice(-WINDOW_SIZE);
        
        const realCloses = lastWindowSlice.map(d => d.close);
        const inferenceMin = Math.min(...realCloses);
        const inferenceMax = Math.max(...realCloses);
        const inferenceRange = inferenceMax - inferenceMin || 1;
        
        const realVols = lastWindowSlice.map(d => d.volume || 1);
        const infMaxVol = Math.max(...realVols) || 1;
        
        const realAtrs = lastWindowSlice.map(d => d.atr || 1);
        const infMaxAtr = Math.max(...realAtrs) || 1;

        const lastWindow = lastWindowSlice.map(d => [
            (d.open - inferenceMin) / inferenceRange, 
            (d.high - inferenceMin) / inferenceRange, 
            (d.low - inferenceMin) / inferenceRange, 
            (d.close - inferenceMin) / inferenceRange,
            (d.volume || 0) / infMaxVol, 
            (d.rsi || 50) / 100, 
            (d.macd || 0) + 0.5, 
            d.bbPos || 0.5, 
            (d.smaDist || 0) + 0.5, 
            (d.atr || 0) / infMaxAtr, 
            (d.cci || 0) / 200 + 0.5
        ]);
        
        const inputTensor = tf.tensor3d([lastWindow]);
        const predictionRaw = (model.predict(inputTensor) as tf.Tensor).dataSync();
        inputTensor.dispose();

        const lastDate = new Date(filteredData[filteredData.length - 1].date);
        const futurePoints: any[] = [];
        
        const finalQuantScore = isNaN(quantScore) ? 0 : quantScore;
        const trendMod = (finalQuantScore / 1500); // Very mild bias
        
        // Base volatility for confidence bands. 
        // ATR is already represented in absolute value points here, so do NOT multiply by lastPrice.
        const lastPrice = realEnrichedData[realEnrichedData.length - 1].close || 1;
        const lastATR = realEnrichedData[realEnrichedData.length - 1].atr || (lastPrice * 0.015);
        const baseVolatility = lastATR;  
        
        const normalizedPreds = Array.from(predictionRaw);
        
        // Calculate the anchor-shift to ensure the generated projection spline starts 
        // organically right off of the newest candle's closing price
        const clampedFirst = Math.max(-1.0, Math.min(3.0, normalizedPreds[0]));
        const initialRawPrice = (clampedFirst * inferenceRange) + inferenceMin;
        const lineShift = lastPrice - initialRawPrice;

        // Force a zero-day anchor explicitly into the frontend mapping so Recharts 
        // strictly draws the sequence physically attached to the close 
        futurePoints.push({
            date: new Date(lastDate).toISOString(),
            predicted: lastPrice,
            upperBand: lastPrice,
            lowerBand: lastPrice,
            confidence: 100
        });

        let validPredictionCount = 0;
        normalizedPreds.forEach((val, i) => {
            const fDate = new Date(lastDate);
            // Move forward by actual days, skipping weekends doesn't correspond to exactly +i days 
            // but we approximate by just skipping over Saturdays/Sundays
            let addedDays = 0;
            while(validPredictionCount <= i) {
                addedDays++;
                fDate.setDate(new Date(lastDate).getDate() + addedDays);
                if (fDate.getDay() !== 0 && fDate.getDay() !== 6) {
                    validPredictionCount++;
                }
            }

            const clamped = Math.max(-1.0, Math.min(3.0, val));
            let pPrice = (clamped * inferenceRange) + inferenceMin + lineShift;
            pPrice *= (1 + (trendMod * (i + 1))); // Drift
            
            const maxDeviation = lastPrice * 0.30;
            pPrice = Math.max(
                lastPrice - maxDeviation,
                Math.min(lastPrice + maxDeviation, pPrice)
            );
            
            const uncertainty = baseVolatility * Math.sqrt(i + 1) * 1.5;

            futurePoints.push({
                date: fDate.toISOString(),
                predicted: Math.round(pPrice * 100) / 100,
                upperBand: Math.round((pPrice + uncertainty) * 100) / 100,
                lowerBand: Math.round((pPrice - uncertainty) * 100) / 100,
                confidence: Math.max(0, Math.round((1 - (i / 60) * 0.7) * 100)),
            });
        });

        const memInfo = process.memoryUsage();
        const tfMem = tf.memory();

        res.json({
            futurePoints,
            quantSignals: { score: finalQuantScore, signals: detectedSignals },
            localAiMetrics: { 
                loss: lastLossCache.get(symbol) || 0,
                epochs: 15,
                samples: samplesCache.get(symbol) || 0, 
                memoryMB: Math.round(memInfo.heapUsed / 1024 / 1024),
                tfTensors: tfMem.numTensors,
                lastTrained: lastTrainedCache.get(symbol) || 0,
                syntheticRatio: Math.round((syntheticData.length / enrichedData.length) * 100)
            }
        });
    } catch(err: any) {
        console.error("ML Error:", err);
        res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/news/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const searchResult: any = await yahooFinance.search(symbol, { newsCount: 5 });
      const newsInfo = searchResult.news || [];
      
      const limitedNews = newsInfo.map((n: any) => ({
          title: n.title,
          publisher: n.publisher,
          link: n.link,
          time: new Date(n.providerPublishTime * 1000).toISOString()
      }));

      if (limitedNews.length === 0) {
          return res.json({ news: [] });
      }

      res.json({
          news: limitedNews
      });

    } catch (error: any) {
      console.error("News Fetch Error:", error.message);
      // Suppress "No data" / "delisted" errors for news to keep dashboard clean
      res.json({ news: [], error: error.message.includes('No data') ? undefined : error.message });
    }
  });

  // 404 handler for API routes
  app.all('/api/*', (req, res) => {
    console.warn(`[Backend] 404 on API route: ${req.method} ${req.path}`);
    res.status(404).json({ 
        error: "API endpoint not found",
        method: req.method,
        path: req.path
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production' && !process.env.ELECTRON) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production / Electron configuration
    let distPath = '';
    const isElectron = process.env.ELECTRON === 'true';
    
    if (isElectron) {
        // utilityProcess.fork sets cwd to appPath or specified path
        const appPath = process.cwd();
        
        const potentialDistPaths = [
            path.join(appPath, 'dist'),
            path.join(appPath, 'app', 'dist'),
            path.join(__dirname, '..', 'dist'), // Relative to dist/server.cjs in some versions
            path.join(__dirname, 'dist'),
            path.join(process.resourcesPath, 'app', 'dist')
        ];

        for (const p of potentialDistPaths) {
            if (fs.existsSync(path.join(p, 'index.html'))) {
                distPath = p;
                break;
            }
        }
    }

    if (!distPath) {
        distPath = path.join(process.cwd(), 'dist');
    }

    console.log(`[Backend] Resolved UI Path: ${distPath}`);
    app.use(express.static(distPath));
    
    // Health check for Electron
    app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.2.0' }));
    
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
          return next();
      }
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
      } else {
          res.status(404).send(`UI not found at: ${indexPath}`);
      }
    });
  }

  console.log(`[Backend] Attempting to listen on port ${PORT}...`);
  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`[Backend] SUCCESS: Server running on http://127.0.0.1:${PORT}`);
  });

  server.on('error', (e: any) => {
    console.error('[Backend] FAILED to start server:', e);
    if (e.code === 'EADDRINUSE') {
      console.error(`[Backend] Port ${PORT} is already in use.`);
    }
  });
}

process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import YahooFinance from 'yahoo-finance2';
import { linearRegression, linearRegressionLine } from 'simple-statistics';
import { 
  RSI, MACD, SMA, stochastic, CCI, ADX, BollingerBands,
  bullishengulfingpattern, bearishengulfingpattern, morningstar, eveningstar,
  threeblackcrows, threewhitesoldiers, IchimokuCloud, StochasticRSI
} from 'technicalindicators';

const yahooFinance = new YahooFinance();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // NIFTY 100 sample + Global valid symbols
  const SYMBOLS = [
    { symbol: '^NSEI', name: 'NIFTY 50 Index' },
    { symbol: 'RELIANCE.NS', name: 'Reliance Industries' },
    { symbol: 'TCS.NS', name: 'Tata Consultancy Services' },
    { symbol: 'HDFCBANK.NS', name: 'HDFC Bank' },
    { symbol: 'INFY.NS', name: 'Infosys' },
    { symbol: 'ICICIBANK.NS', name: 'ICICI Bank' },
    { symbol: 'SBIN.NS', name: 'State Bank of India' },
    { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel' },
    { symbol: 'ITC.NS', name: 'ITC Limited' },
    { symbol: 'LT.NS', name: 'Larsen & Toubro' },
    { symbol: 'ADANIENT.NS', name: 'Adani Enterprises' },
    { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance' },
    { symbol: 'COALINDIA.NS', name: 'Coal India' },
    { symbol: 'SUNPHARMA.NS', name: 'Sun Pharma' },
    { symbol: 'TATAMOTORS.NS', name: 'Tata Motors' },
    { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever' },
    { symbol: 'AXISBANK.NS', name: 'Axis Bank' },
    { symbol: 'ADANIPORTS.NS', name: 'Adani Ports' },
    { symbol: 'ASIANPAINT.NS', name: 'Asian Paints' },
    { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank' },
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'NVDA', name: 'Nvidia Corp.' },
  ];

  app.get('/api/stocks', (req, res) => {
    res.json(SYMBOLS);
  });

  app.get('/api/search', async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q) return res.json([]);
      const searchResult = await yahooFinance.search(q);
      const quotes = searchResult.quotes
        .filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'INDEX' || q.quoteType === 'ETF')
        .slice(0, 8);
      res.json(quotes);
    } catch (e: any) {
      console.error('Search error:', e.message);
      res.status(500).json({ error: e.message });
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

      // Map range to period1
      const queryOptions: any = { interval };
      const now = new Date();
      let period1 = new Date();
      
      if (range === '1mo') period1.setMonth(now.getMonth() - 1);
      else if (range === '3mo') period1.setMonth(now.getMonth() - 3);
      else if (range === '6mo') period1.setMonth(now.getMonth() - 6);
      else if (range === '1y') period1.setFullYear(now.getFullYear() - 1);
      else if (range === '5y') period1.setFullYear(now.getFullYear() - 5);
      
      queryOptions.period1 = period1.toISOString();

      const chartData: any = await yahooFinance.chart(symbol, queryOptions);
      const results: any[] = (chartData.quotes || []).filter((q: any) => q.close != null && q.open != null && q.high != null && q.low != null);
      
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
        const now = new Date();
        const period1 = new Date();
        period1.setFullYear(now.getFullYear() - 1); // Get 1 year of data for training

        const chartData: any = await yahooFinance.chart(symbol, {
            period1: period1.toISOString(),
            interval: '1d'
        });
        const rawData: any[] = chartData.quotes || [];

        if (rawData.length < 50) {
            return res.json({ error: "Not enough historical data for ML model." });
        }

        // Extraction arrays for Quantitative TA
        const closes = rawData.map(d => d.close).filter(c => c != null);
        const highs = rawData.map(d => d.high).filter(h => h != null);
        const lows = rawData.map(d => d.low).filter(l => l != null);
        const opens = rawData.map(d => d.open).filter(o => o != null);
        const volumes = rawData.map(d => d.volume).filter(v => v != null);
        
        // 1. Core Technical Indicators processing
        let quantScore = 0; // -100 to 100 momentum matrix
        let detectedSignals: Array<{name: string, impact: string}> = [];
        
        // Advanced Regime Detection Variables
        let currentRsi: any = 50;
        let currentCci: any = 0;
        let currentBB: any = null;
        let currentAdx: any = { adx: 25 };
        let currentIchimoku: any = null;
        let currentStochRsi: any = null;
        let volumeProfile = 1.0; 

        try {
            const rsi = RSI.calculate({ values: closes, period: 14 });
            const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
            const stoch = stochastic({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
            const bb = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
            const cci = CCI.calculate({ high: highs, low: lows, close: closes, period: 20 });
            const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
            const ichimoku = IchimokuCloud.calculate({
                high: highs, low: lows,
                conversionPeriod: 9, basePeriod: 26, spanPeriod: 52, displacement: 26
            });
            const stochRsi = StochasticRSI.calculate({
                values: closes, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3
            });
            
            currentRsi = rsi[rsi.length - 1];
            const currentMacd = macd[macd.length - 1];
            const currentStoch = stoch[stoch.length - 1];
            currentBB = bb[bb.length - 1];
            currentCci = cci[cci.length - 1];
            currentAdx = adx[adx.length - 1];
            currentIchimoku = ichimoku[ichimoku.length - 1];
            currentStochRsi = stochRsi[stochRsi.length - 1];
            const currentClose = closes[closes.length - 1];

            // 1a. Ichimoku Cloud Regime Processing
            if (currentIchimoku) {
              const { spanA, spanB, conversion, base } = currentIchimoku;
              const cloudTop = Math.max(spanA, spanB);
              const cloudBottom = Math.min(spanA, spanB);

              if (currentClose > cloudTop) {
                  quantScore += 30; detectedSignals.push({ name: 'Price Above Ichimoku Cloud', impact: 'bullish' });
              } else if (currentClose < cloudBottom) {
                  quantScore -= 30; detectedSignals.push({ name: 'Price Below Ichimoku Cloud', impact: 'bearish' });
              } else {
                  detectedSignals.push({ name: 'Price Inside Ichimoku Cloud', impact: 'neutral' });
              }

              if (conversion > base) {
                  quantScore += 15; detectedSignals.push({ name: 'TK Cross Bullish', impact: 'bullish' });
              } else {
                  quantScore -= 10; detectedSignals.push({ name: 'TK Cross Bearish', impact: 'bearish' });
              }
            }

            // 1b. Stochastic RSI Logic
            if (currentStochRsi) {
              if (currentStochRsi.stochRSI < 20) {
                  quantScore += 20; detectedSignals.push({ name: 'StochRSI Oversold Rebound', impact: 'bullish' });
              } else if (currentStochRsi.stochRSI > 80) {
                  quantScore -= 20; detectedSignals.push({ name: 'StochRSI Overbought Pullback', impact: 'bearish' });
              }
            }

            // Volume Analysis
            if (volumes.length > 20) {
                const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
                volumeProfile = volumes[volumes.length - 1] / avgVol;
                if (volumeProfile > 1.5) {
                   quantScore += (currentClose > opens[opens.length - 1]) ? 10 : -10;
                   detectedSignals.push({ name: 'High Volume Confirmation', impact: currentClose > opens[opens.length - 1] ? 'bullish' : 'bearish' });
                }
            }

            // Indicator Logic Routing (Weighted)
            if (currentRsi < 30) { quantScore += 25; detectedSignals.push({ name: 'RSI Deep Oversold', impact: 'bullish' }); }
            else if (currentRsi > 70) { quantScore -= 25; detectedSignals.push({ name: 'RSI Extreme Overbought', impact: 'bearish' }); }

            if (currentStoch && currentStoch.k < 20 && currentStoch.k > currentStoch.d) { quantScore += 15; detectedSignals.push({ name: 'Stochastic Bullish Hook', impact: 'bullish'}); }
            else if (currentStoch && currentStoch.k > 80 && currentStoch.k < currentStoch.d) { quantScore -= 15; detectedSignals.push({ name: 'Stochastic Bearish Crossover', impact: 'bearish'}); }

            if (currentMacd && currentMacd.MACD && currentMacd.signal) {
                const macdGap = currentMacd.MACD - currentMacd.signal;
                if (macdGap > 0) { quantScore += 15; }
                else { quantScore -= 15; }
                if (Math.abs(macdGap) > Math.abs(macd[macd.length - 2]?.MACD - macd[macd.length - 2]?.signal)) {
                   quantScore += (macdGap > 0) ? 5 : -5;
                }
            }

            if (currentBB && currentClose <= currentBB.lower) { quantScore += 20; detectedSignals.push({ name: 'Volatility Band Support', impact: 'bullish'}); }
            else if (currentBB && currentClose >= currentBB.upper) { quantScore -= 20; detectedSignals.push({ name: 'Volatility Band Resistance', impact: 'bearish'}); }

            // Moving Average Crossovers (High weight)
            const ma20 = calculateSMA(closes, 20);
            const ma50 = calculateSMA(closes, 50);
            if (ma20[ma20.length - 1] > ma50[ma50.length - 1] && ma20[ma20.length - 2] <= ma50[ma50.length - 2]) {
                quantScore += 40; detectedSignals.push({ name: 'Golden Cross (Trend Alert)', impact: 'bullish'});
            } else if (ma20[ma20.length - 1] < ma50[ma50.length - 1] && ma20[ma20.length - 2] >= ma50[ma50.length - 2]) {
                quantScore -= 40; detectedSignals.push({ name: 'Death Cross (Trend Alert)', impact: 'bearish'});
            }

            // Candlestick Pattern Extraction
            const last5Data = { open: opens.slice(-5), high: highs.slice(-5), low: lows.slice(-5), close: closes.slice(-5) };
            if (bullishengulfingpattern(last5Data)) { quantScore += 25; detectedSignals.push({ name: 'Bullish Engulfing', impact: 'bullish'}); }
            if (bearishengulfingpattern(last5Data)) { quantScore -= 25; detectedSignals.push({ name: 'Bearish Engulfing', impact: 'bearish'}); }
            if (morningstar(last5Data)) { quantScore += 30; detectedSignals.push({ name: 'Morning Star Reversal', impact: 'bullish'}); }
            if (eveningstar(last5Data)) { quantScore -= 30; detectedSignals.push({ name: 'Evening Star Reversal', impact: 'bearish'}); }
            if (threeblackcrows(last5Data)) { quantScore -= 40; detectedSignals.push({ name: 'Three Black Crows', impact: 'bearish'}); }
            if (threewhitesoldiers(last5Data)) { quantScore += 40; detectedSignals.push({ name: 'Three White Soldiers', impact: 'bullish'}); }
            
        } catch (quantErr) {
            console.error("Quant Analytics Error:", quantErr);
        }

        // 2. Sentiment Integration (Drift Bias)
        let sentimentBias = 0;
        try {
            const newsRes = await yahooFinance.search(symbol, { newsCount: 5 });
            const news = newsRes.news || [];
            // Simple keyword-based sentiment for internal scoring if AI isn't called yet
            const keywords = { pos: ['up', 'growth', 'buy', 'gain', 'positive', 'profit'], neg: ['down', 'fall', 'sell', 'loss', 'negative', 'crash'] };
            news.forEach(n => {
                const tit = n.title.toLowerCase();
                keywords.pos.forEach(w => { if(tit.includes(w)) sentimentBias += 5; });
                keywords.neg.forEach(w => { if(tit.includes(w)) sentimentBias -= 5; });
            });
        } catch(e) {}

        // Keep quant score bounded tightly
        quantScore = Math.max(-100, Math.min(100, quantScore + (sentimentBias * 2)));
        const trendModifier = (quantScore / 100); 

        // 3. Ensemble AR-I-MA-Prophet Hybrid Engine (60-Day Horizon)
        const recentData = rawData.slice(-120).filter(d => d.close != null);
        const prices = recentData.map(d => d.close);
        
        // Integrated (I) - Differencing via Log Returns
        const logReturns = [];
        for(let i = 1; i < prices.length; i++){
            logReturns.push(Math.log(prices[i] / prices[i-1]));
        }

        // Dynamic Volatility Calculation (Recent Price Action)
        const recentLogReturns = logReturns.slice(-30);
        const logMean = recentLogReturns.reduce((a, b) => a + b, 0) / recentLogReturns.length || 0;
        const logVariance = recentLogReturns.reduce((sq, n) => sq + Math.pow(n - logMean, 2), 0) / recentLogReturns.length || 0.0001;
        const recentVolatility = Math.sqrt(logVariance);

        // Seasonality (Daily/Prophet-like weekly estimation)
        const dailyAverages = new Array(7).fill(0);
        const dailyCounts = new Array(7).fill(0);
        recentData.forEach((d, i) => {
            if (i > 0) {
                const day = new Date(d.date).getDay();
                const ret = Math.log(d.close / recentData[i-1].close);
                dailyAverages[day] += ret;
                dailyCounts[day]++;
            }
        });
        const weekdayExpectancy = dailyAverages.map((val, i) => dailyCounts[i] > 0 ? val / dailyCounts[i] : 0);

        // Holt-Winters level/trend
        let level = prices[0];
        let trend = prices[1] - prices[0];
        const alpha = 0.25, beta = 0.15; 
        for(let i = 1; i < prices.length; i++) {
            const lastLevel = level;
            level = alpha * prices[i] + (1 - alpha) * (level + trend);
            trend = beta * (level - lastLevel) + (1 - beta) * trend;
        }

        const dataForRegression = recentData.map((d, i) => [i, d.close]);
        const regression = linearRegression(dataForRegression);
        const lastDate = new Date(recentData[recentData.length - 1].date);
        
        // 4. Advanced Ensemble Meta-Learner (Elastic Softmax + Market Correlation)
        let marketVolatility = 0.015;
        let marketCorrelation = 0.5;
        try {
            const p1 = new Date();
            p1.setMonth(p1.getMonth() - 3);
            const marketData = await yahooFinance.chart('^NSEI', { interval: '1d', period1: p1.toISOString() });
            const mQuotes = marketData.quotes.filter((q: any) => q.close != null);
            if (mQuotes.length > 20) {
                const mReturns = [];
                const sReturns = [];
                const lookback = Math.min(mQuotes.length, prices.length) - 1;
                
                for(let j = 1; j <= 30 && j <= lookback; j++) {
                    const sPrev = prices[prices.length - 1 - j];
                    const sCurr = prices[prices.length - j];
                    const mPrev = mQuotes[mQuotes.length - 1 - j].close;
                    const mCurr = mQuotes[mQuotes.length - j].close;
                    sReturns.push(Math.log(sCurr / sPrev));
                    mReturns.push(Math.log(mCurr / mPrev));
                }

                // Market Volatility
                const mMean = mReturns.reduce((a, b) => a + b, 0) / mReturns.length;
                const mVar = mReturns.reduce((sq, n) => sq + Math.pow(n - mMean, 2), 0) / mReturns.length;
                marketVolatility = Math.sqrt(mVar);

                // Correlation
                const sMean = sReturns.reduce((a, b) => a + b, 0) / sReturns.length;
                let num = 0, denS = 0, denM = 0;
                for(let k = 0; k < sReturns.length; k++) {
                    const ds = sReturns[k] - sMean;
                    const dm = mReturns[k] - mMean;
                    num += ds * dm;
                    denS += ds * ds;
                    denM += dm * dm;
                }
                marketCorrelation = Math.abs(num / Math.sqrt(denS * denM)) || 0.5;
            }
        } catch(e) { console.warn("Correlation fetch failed:", e); }

        // Evaluate sub-models over backtest window
        let trendError = 0;
        let meanRevError = 0;
        const testWindow = 15;
        for (let i = prices.length - testWindow; i < prices.length; i++) {
            const actual = prices[i];
            const tPred = level + (trend * (i - (prices.length - 1)));
            const mPred = regression.b + (regression.m * i);
            trendError += Math.abs(actual - tPred) / actual; // Use Normalized MAE
            meanRevError += Math.abs(actual - mPred) / actual;
        }
        
        // Elastic Softmax Weighting
        // We use a high temperature to penalize high errors exponentially
        const temp = 0.05;
        const eTrend = Math.exp(-trendError / temp);
        const eMean = Math.exp(-meanRevError / temp);
        let finalTrendWeight = eTrend / (eTrend + eMean);
        let finalMeanRevWeight = eMean / (eTrend + eMean);

        // 4b. Regime Modulation (ADX + CCI influence)
        // ADX determines "TrendingNESS", CCI determines "Cyclical Momentum"
        if (currentAdx && currentAdx.adx > 30) {
            finalTrendWeight = Math.min(0.9, finalTrendWeight * 1.5);
            finalMeanRevWeight = 1 - finalTrendWeight;
        } else if (currentAdx && currentAdx.adx < 18 && Math.abs(currentCci) < 100) {
            finalMeanRevWeight = Math.min(0.9, finalMeanRevWeight * 1.5);
            finalTrendWeight = 1 - finalMeanRevWeight;
        }

        let predictedClose = recentData[recentData.length - 1].close;
        const bbBandwidth = currentBB ? (currentBB.upper - currentBB.lower) / currentBB.middle : 0.05;
        
        // 5. Volatility Scaling (Market-Beta Adjusted)
        // volatility is idiosyncratic + (systemic * correlation)
        const systemicRisk = marketVolatility * marketCorrelation;
        const idiosyncraticRisk = recentVolatility * (1 - marketCorrelation);
        const combinedVolatility = (idiosyncraticRisk * 0.7) + (systemicRisk * 0.3) + (bbBandwidth * 0.05); 
        const volatilityScaler = Math.max(0.008, combinedVolatility);
        const regimeBias = quantScore / 100;

        const futurePoints = [];
        for (let i = 1; i <= 60; i++) {
            const fDate = new Date(lastDate);
            fDate.setDate(fDate.getDate() + i);
            const dayOfWeek = fDate.getDay();
            
            // 1. Ensemble Consensus Drift (Decaying Horizon)
            const structuralDrift = (trend / predictedClose) * 0.45 * finalTrendWeight;
            const regTarget = (regression.b + regression.m * (recentData.length - 1 + i));
            const meanReversionForce = (regTarget - predictedClose) / predictedClose * 0.15 * finalMeanRevWeight;
            
            // 2. Seasonality & Regime
            const seasonalDrift = weekdayExpectancy[dayOfWeek] * 0.45;
            const biasDecay = Math.exp(-i / 25); 
            const biasForce = regimeBias * 0.015 * biasDecay;
            
            // 3. Dynamic Volatility & Variance (Exponential growth with time)
            const stochRsiHeat = currentStochRsi ? (currentStochRsi.stochRSI / 100) : 0.5;
            const variance = volatilityScaler * (1 + (stochRsiHeat * 0.4)) * Math.sqrt(i) * 0.12;

            // Boosting heuristic
            const alignmentBonus = (Math.sign(structuralDrift) === Math.sign(biasForce)) ? 1.25 : 0.75;
            
            const netDrift = (structuralDrift + meanReversionForce + biasForce + seasonalDrift) * alignmentBonus;
            const noise = (Math.random() - 0.5) * variance;
            const cappedDrift = Math.tanh(netDrift * 15) / 15;
            const dailyChange = Math.max(-0.05, Math.min(0.05, cappedDrift + noise));

            predictedClose = predictedClose * (1 + dailyChange);

            futurePoints.push({
                date: fDate.toISOString(),
                predictedClose: parseFloat(predictedClose.toFixed(2))
            });
        }

        // Pass data back to frontend for client-side AI analysis
        const dataSampleForAI = recentData.slice(-45).filter((d: any) => d.open != null && d.close != null).map((d: any) => ({
            date: d.date.toISOString().split("T")[0],
            open: (d.open || 0).toFixed(2),
            high: (d.high || 0).toFixed(2),
            low: (d.low || 0).toFixed(2),
            close: (d.close || 0).toFixed(2),
            volume: d.volume || 0
        }));

        res.json({
            futurePoints,
            trendGradient: regression.m,
            dataSampleForAI, // Pass the formatted structure seamlessly downwards
            quantSignals: {
               score: quantScore,
               signals: detectedSignals
            }
        });
    } catch(err: any) {
        console.error("Prediction Error:", err);
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
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

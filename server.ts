import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import YahooFinance from 'yahoo-finance2';
import { GoogleGenAI, Type } from '@google/genai';
import { linearRegression, linearRegressionLine } from 'simple-statistics';
import { 
  RSI, MACD, SMA, stochastic, CCI, ADX, BollingerBands,
  bullishengulfingpattern, bearishengulfingpattern, doji, morningstar, eveningstar, 
  hammerpattern, bearishharami, bullishharami, piercingline, darkcloudcover, shootingstar,
  abandonedbaby, downsidetasukigap, dragonflydoji, gravestonedoji, bullishharamicross, bearishharamicross,
  eveningdojistar, morningdojistar, bullishmarubozu, bearishmarubozu, bullishspinningtop, bearishspinningtop,
  threeblackcrows, threewhitesoldiers, tweezertop, tweezerbottom
} from 'technicalindicators';

const yahooFinance = new YahooFinance();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  // Clean JSON output from AI
  const cleanAIJSON = (text: string) => {
    try {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("AI JSON Parse Error:", e, text);
      return {};
    }
  };

  // AI Backend Routes
  app.post('/api/ai/analyze-patterns', async (req, res) => {
    try {
      const { dataSample, symbol } = req.body;
      const prompt = `Analyze Stock Patterns for ${symbol}. Identifiy Macro Formations and Candlestick variations. Data: ${JSON.stringify(dataSample)}`;
      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              patterns: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { patternName: { type: Type.STRING }, confidence: { type: Type.NUMBER }, description: { type: Type.STRING }, trendImpact: { type: Type.STRING, enum: ["bullish", "bearish", "neutral"] } } } },
              overallSummary: { type: Type.STRING }
            }
          }
        }
      });
      res.json(cleanAIJSON(aiResponse.text || "{}"));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ai/analyze-sentiment', async (req, res) => {
    try {
      const { newsArr, symbol } = req.body;
      const prompt = `Analyze Sentiment (Score 0-100) for ${symbol}. News: ${JSON.stringify(newsArr)}`;
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
      res.json(cleanAIJSON(aiResponse.text || "{}"));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

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
    { symbol: 'AAPL', name: 'Apple Inc. (Global test)' },
    { symbol: 'TSLA', name: 'Tesla Inc. (Global test)' },
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
      
      // Compute Indicators (SMA20, SMA50)
      const closes = results.map(r => r.close);
      const sma20 = calculateSMA(closes, 20);
      const sma50 = calculateSMA(closes, 50);

      const enhancedResults = results.map((r, i) => ({
        ...r,
        sma20: sma20[i],
        sma50: sma50[i]
      }));

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
        
        // 1. Core Technical Indicators processing
        let quantScore = 0; // -100 to 100 momentum matrix
        let detectedSignals: Array<{name: string, impact: string}> = [];
        
        let currentRsi: any = 50;
        let currentCci: any = 0;
        let currentBB: any = null;
        let currentAdx: any = { adx: 25 };

        try {
            const rsi = RSI.calculate({ values: closes, period: 14 });
            const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
            const stoch = stochastic({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
            const bb = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
            const cci = CCI.calculate({ high: highs, low: lows, close: closes, period: 20 });
            const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
            
            currentRsi = rsi[rsi.length - 1];
            const currentMacd = macd[macd.length - 1];
            const currentStoch = stoch[stoch.length - 1];
            currentBB = bb[bb.length - 1];
            currentCci = cci[cci.length - 1];
            currentAdx = adx[adx.length - 1];
            const currentClose = closes[closes.length - 1];

            // Indicator Logic Routing
            if (currentRsi < 30) { quantScore += 20; detectedSignals.push({ name: 'RSI Bullish Divergence', impact: 'bullish' }); }
            else if (currentRsi > 70) { quantScore -= 20; detectedSignals.push({ name: 'RSI Overbought', impact: 'bearish' }); }

            if (currentStoch && currentStoch.k < 20 && currentStoch.k > currentStoch.d) { quantScore += 15; detectedSignals.push({ name: 'Stochastic Cross Base', impact: 'bullish'}); }
            else if (currentStoch && currentStoch.k > 80 && currentStoch.k < currentStoch.d) { quantScore -= 15; detectedSignals.push({ name: 'Stochastic Cross Peak', impact: 'bearish'}); }

            if (currentMacd && currentMacd.MACD && currentMacd.signal && currentMacd.histogram) {
                if (currentMacd.MACD > currentMacd.signal && currentMacd.histogram > 0) { quantScore += 15; detectedSignals.push({ name: 'MACD Bullish Momentum', impact: 'bullish'}); }
                else if (currentMacd.MACD < currentMacd.signal && currentMacd.histogram < 0) { quantScore -= 15; detectedSignals.push({ name: 'MACD Bearish Momentum', impact: 'bearish'}); }
            }

            if (currentBB && currentClose <= currentBB.lower) { quantScore += 20; detectedSignals.push({ name: 'BB Lower Bounce', impact: 'bullish'}); }
            else if (currentBB && currentClose >= currentBB.upper) { quantScore -= 20; detectedSignals.push({ name: 'BB Upper Extension', impact: 'bearish'}); }

            if (currentCci < -100) { quantScore += 10; detectedSignals.push({ name: 'CCI Oversold', impact: 'bullish'}); }
            else if (currentCci > 100) { quantScore -= 10; detectedSignals.push({ name: 'CCI Overbought', impact: 'bearish'}); }

            // Candlestick Pattern Extraction (Last 5 Days - exhaustive pattern array)
            const last5Data = {
               open: opens.slice(-5),
               high: highs.slice(-5),
               low: lows.slice(-5),
               close: closes.slice(-5)
            };
            
            if (bullishengulfingpattern(last5Data)) { quantScore += 25; detectedSignals.push({ name: 'Bullish Engulfing', impact: 'bullish'}); }
            if (bearishengulfingpattern(last5Data)) { quantScore -= 25; detectedSignals.push({ name: 'Bearish Engulfing', impact: 'bearish'}); }
            if (morningstar(last5Data)) { quantScore += 25; detectedSignals.push({ name: 'Morning Star', impact: 'bullish'}); }
            if (eveningstar(last5Data)) { quantScore -= 25; detectedSignals.push({ name: 'Evening Star', impact: 'bearish'}); }
            if (doji(last5Data)) { detectedSignals.push({ name: 'Doji Reversal Marker', impact: 'neutral'}); }
            if (hammerpattern(last5Data)) { quantScore += 15; detectedSignals.push({ name: 'Hammer Reversal', impact: 'bullish'}); }
            if (shootingstar(last5Data)) { quantScore -= 15; detectedSignals.push({ name: 'Shooting Star', impact: 'bearish'}); }
            if (bullishharami(last5Data)) { quantScore += 15; detectedSignals.push({ name: 'Bullish Harami', impact: 'bullish'}); }
            if (bearishharami(last5Data)) { quantScore -= 15; detectedSignals.push({ name: 'Bearish Harami', impact: 'bearish'}); }
            if (piercingline(last5Data)) { quantScore += 20; detectedSignals.push({ name: 'Piercing Line', impact: 'bullish'}); }
            if (darkcloudcover(last5Data)) { quantScore -= 20; detectedSignals.push({ name: 'Dark Cloud Cover', impact: 'bearish'}); }
            
            // Expanded Programmatic Formations
            if (abandonedbaby(last5Data)) { quantScore += 25; detectedSignals.push({ name: 'Abandoned Baby Bullish', impact: 'bullish'}); }
            if (downsidetasukigap(last5Data)) { quantScore -= 20; detectedSignals.push({ name: 'Downside Tasuki Gap', impact: 'bearish'}); }
            if (dragonflydoji(last5Data)) { quantScore += 10; detectedSignals.push({ name: 'Dragonfly Doji', impact: 'bullish'}); }
            if (gravestonedoji(last5Data)) { quantScore -= 10; detectedSignals.push({ name: 'Gravestone Doji', impact: 'bearish'}); }
            if (bullishharamicross(last5Data)) { quantScore += 15; detectedSignals.push({ name: 'Bullish Harami Cross', impact: 'bullish'}); }
            if (bearishharamicross(last5Data)) { quantScore -= 15; detectedSignals.push({ name: 'Bearish Harami Cross', impact: 'bearish'}); }
            if (eveningdojistar(last5Data)) { quantScore -= 25; detectedSignals.push({ name: 'Evening Doji Star', impact: 'bearish'}); }
            if (morningdojistar(last5Data)) { quantScore += 25; detectedSignals.push({ name: 'Morning Doji Star', impact: 'bullish'}); }
            if (bullishmarubozu(last5Data)) { quantScore += 20; detectedSignals.push({ name: 'Bullish Marubozu', impact: 'bullish'}); }
            if (bearishmarubozu(last5Data)) { quantScore -= 20; detectedSignals.push({ name: 'Bearish Marubozu', impact: 'bearish'}); }
            if (bullishspinningtop(last5Data)) { detectedSignals.push({ name: 'Bullish Spinning Top', impact: 'neutral'}); }
            if (bearishspinningtop(last5Data)) { detectedSignals.push({ name: 'Bearish Spinning Top', impact: 'neutral'}); }
            if (threeblackcrows(last5Data)) { quantScore -= 35; detectedSignals.push({ name: 'Three Black Crows', impact: 'bearish'}); }
            if (threewhitesoldiers(last5Data)) { quantScore += 35; detectedSignals.push({ name: 'Three White Soldiers', impact: 'bullish'}); }
            if (tweezertop(last5Data)) { quantScore -= 20; detectedSignals.push({ name: 'Tweezer Top', impact: 'bearish'}); }
            if (tweezerbottom(last5Data)) { quantScore += 20; detectedSignals.push({ name: 'Tweezer Bottom', impact: 'bullish'}); }
            
        } catch (quantErr) {
            console.error("Quant Analytics Error:", quantErr);
        }

        // Keep quant score bounded tightly
        quantScore = Math.max(-100, Math.min(100, quantScore));
        const trendModifier = (quantScore / 100); // Output between -1.0 and +1.0

        // Machine Learning & Feature Engineering
        // Replacing simple regression mapping with an Advanced LSTM-inspired Autoregressive Heuristic Sequence (AR-LSTM emulation algorithm)
        const recentData = rawData.slice(-100).filter(d => d.close != null);
        const dataForRegression = recentData.map((d, i) => [i, d.close]);
        const regression = linearRegression(dataForRegression);
        const baselineLine = linearRegressionLine(regression);

        const futurePoints = [];
        const lastDate = new Date(recentData[recentData.length - 1].date);
        
        let predictedClose = recentData[recentData.length - 1].close;
        
        // Feature Extracted Variables from Technical Indicators
        const adxValue = currentAdx ? currentAdx.adx : 25; // Trend Strength (0-100)
        const cciMomentum = currentCci ? Math.max(-1, Math.min(1, currentCci / 200)) : 0; // Normalized Momentum [-1 to 1]
        const bbBandwidth = currentBB ? (currentBB.upper - currentBB.lower) / currentBB.middle : 0.05; // Volatility
        const rsiFactor = currentRsi ? (50 - currentRsi) / 100 : 0; // Mean reversion pressure from RSI

        // LSTM Memory Cell emulation factors
        let hiddenState = trendModifier * 0.02; // Base drift from quant signals
        let cellState = 0; // Accumulated momentum memory
        
        const trendStrengthMultiplier = Math.min(1, adxValue / 50); // Scale 0 to 1 based on ADX

        for (let i = 1; i <= 30; i++) {
            const fDate = new Date(lastDate);
            fDate.setDate(fDate.getDate() + i);
            
            // 1. Forget & Update Gate simulation
            const regressionMean = baselineLine(recentData.length - 1 + i);
            const priceToMeanDistance = (regressionMean - predictedClose) / predictedClose;
            
            // Reversion pushes price back to mean if Trend (ADX) is weak. If ADX is high, it ignores the mean.
            const reversionPull = priceToMeanDistance * (1 - trendStrengthMultiplier) * 0.1;
            
            // Momentum carries forward based on CCI and previous hidden state
            const momentumDrift = cciMomentum * bbBandwidth * 0.5 * trendStrengthMultiplier;

            // RNN/LSTM combination
            cellState = (cellState * 0.85) + (momentumDrift + reversionPull + (hiddenState * 2) + (rsiFactor * 0.1)) * 0.15;
            const outputGate = Math.tanh(cellState) * 0.04; // Limit daily change to ~4% max for realism
            
            // Add slight brownian noise
            const noise = (Math.random() - 0.5) * 0.005;
            predictedClose = predictedClose * (1 + outputGate + noise);

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

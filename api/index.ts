import express from 'express';
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

const app = express();
const yahooFinance = new YahooFinance();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

app.use(express.json());

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
        res.json(JSON.parse(aiResponse.text || "{}"));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ai/analyze-sentiment', async (req, res) => {
    try {
        const { newsArr, symbol } = req.body;
        if (!newsArr || newsArr.length === 0) return res.json({ sentiment: "neutral", sentimentScore: 50, summary: "No news." });
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
        res.json(JSON.parse(aiResponse.text || "{}"));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

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
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
];

const calculateSMA = (data: number[], window: number) => {
    let result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < window - 1) result.push(null);
        else {
            const sum = data.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / window);
        }
    }
    return result;
};

app.get('/api/stocks', (req, res) => res.json(SYMBOLS));

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
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/history/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { interval = '1d', range = '1y' } = req.query;
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
        
        const closes = results.map(r => r.close);
        const sma20 = calculateSMA(closes, 20);
        const sma50 = calculateSMA(closes, 50);

        res.json(results.map((r, i) => ({ ...r, sma20: sma20[i], sma50: sma50[i] })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/ml/predict/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const now = new Date();
        const period1 = new Date();
        period1.setFullYear(now.getFullYear() - 1);

        const chartData: any = await yahooFinance.chart(symbol, { period1: period1.toISOString(), interval: '1d' });
        const rawData: any[] = (chartData.quotes || []).filter((q: any) => q.close != null);
        if (rawData.length < 50) return res.json({ error: "Not enough data" });

        const closes = rawData.map(d => d.close);
        const highs = rawData.map(d => d.high).filter(h => h != null);
        const lows = rawData.map(d => d.low).filter(l => l != null);
        const opens = rawData.map(d => d.open).filter(o => o != null);
        
        let quantScore = 0;
        let detectedSignals: any[] = [];
        
        try {
            const rsi = RSI.calculate({ values: closes, period: 14 });
            const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
            const stoch = stochastic({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
            const bb = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
            const cci = CCI.calculate({ high: highs, low: lows, close: closes, period: 20 });
            const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
            
            const currentRsi = rsi[rsi.length - 1];
            const currentMacd = macd[macd.length - 1];
            const currentStoch = stoch[stoch.length - 1];
            const currentBB = bb[bb.length - 1];
            const currentCci = cci[cci.length - 1];
            const currentAdx = adx[adx.length - 1];
            const currentClose = closes[closes.length - 1];

            if (currentRsi < 30) { quantScore += 20; detectedSignals.push({ name: 'RSI Bullish', impact: 'bullish' }); }
            else if (currentRsi > 70) { quantScore -= 20; detectedSignals.push({ name: 'RSI Overbought', impact: 'bearish' }); }

            if (currentMacd && currentMacd.MACD > currentMacd.signal) { quantScore += 15; detectedSignals.push({ name: 'MACD Bullish', impact: 'bullish' }); }
            else { quantScore -= 15; detectedSignals.push({ name: 'MACD Bearish', impact: 'bearish' }); }

            const last5 = { open: opens.slice(-5), high: highs.slice(-5), low: lows.slice(-5), close: closes.slice(-5) };
            if (bullishengulfingpattern(last5)) { quantScore += 25; detectedSignals.push({ name: 'Bullish Engulfing', impact: 'bullish' }); }
            if (bearishengulfingpattern(last5)) { quantScore -= 25; detectedSignals.push({ name: 'Bearish Engulfing', impact: 'bearish' }); }
            if (hammerpattern(last5)) { quantScore += 15; detectedSignals.push({ name: 'Hammer Pattern', impact: 'bullish' }); }
            if (shootingstar(last5)) { quantScore -= 15; detectedSignals.push({ name: 'Shooting Star', impact: 'bearish' }); }

            // AR-LSTM Emulation (Enhanced for visible variance)
            const recentDataFiltered = rawData.slice(-100).filter(d => d.close != null);
            const dataForReg = recentDataFiltered.map((d, i) => [i, d.close]);
            const regression = linearRegression(dataForReg);
            const baselineLine = linearRegressionLine(regression);
            
            const futurePoints = [];
            let lastPrice = closes[closes.length - 1];
            let predictedClose = lastPrice;
            const adxValue = currentAdx ? currentAdx.adx : 25;
            const cciMomentum = currentCci ? Math.max(-1, Math.min(1, currentCci / 200)) : 0;
            const trendModifier = quantScore / 100;

            // RNN Hidden Persistence
            let cellState = trendModifier * 0.02; 
            const trendStrength = Math.min(1, adxValue / 40);

            for (let i = 1; i <= 30; i++) {
                const fDate = new Date(recentDataFiltered[recentDataFiltered.length - 1].date);
                fDate.setDate(fDate.getDate() + i);
                
                // Drift from regression slope vs Current Hidden State
                const regSlopeDrift = (regression.m / predictedClose) * 0.8; 
                const regMean = baselineLine(recentDataFiltered.length - 1 + i);
                const meanReversion = (regMean - predictedClose) / predictedClose * (1 - trendStrength) * 0.15;
                
                // Momentum update
                const bias = (trendModifier * 0.01) + (cciMomentum * 0.005) + regSlopeDrift;
                cellState = (cellState * 0.85) + (bias + meanReversion) * 0.15;
                
                // Final calculation (Boosted for visibility)
                const outputGate = Math.tanh(cellState) * 0.04; 
                const noise = (Math.random() - 0.5) * 0.005;
                predictedClose = predictedClose * (1 + outputGate + noise);

                futurePoints.push({ 
                    date: fDate.toISOString(), 
                    predictedClose: parseFloat(predictedClose.toFixed(2)) 
                });
            }

            res.json({
                futurePoints,
                trendGradient: regression.m,
                dataSampleForAI: rawData.slice(-45).map(d => ({
                    date: d.date.toISOString().split("T")[0],
                    open: d.open.toFixed(2), high: d.high.toFixed(2), low: d.low.toFixed(2), close: d.close.toFixed(2), volume: d.volume
                })),
                quantSignals: { score: quantScore, signals: detectedSignals }
            });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    } catch(err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/news/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const searchResult: any = await yahooFinance.search(symbol, { newsCount: 5 });
        const news = (searchResult.news || []).map((n: any) => ({
            title: n.title, publisher: n.publisher, link: n.link,
            time: new Date(n.providerPublishTime * 1000).toISOString()
        }));
        res.json({ news });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default app;

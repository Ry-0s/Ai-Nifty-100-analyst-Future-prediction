import express from 'express';
import YahooFinance from 'yahoo-finance2';
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

app.use(express.json());

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
        const rawData: any[] = chartData.quotes || [];
        if (rawData.length < 50) return res.json({ error: "Not enough data" });

        const closes = rawData.map(d => d.close).filter(c => c != null);
        const highs = rawData.map(d => d.high).filter(h => h != null);
        const lows = rawData.map(d => d.low).filter(l => l != null);
        const opens = rawData.map(d => d.open).filter(o => o != null);
        
        // Re-implement the AR-LSTM emulation logic concisely
        let quantScore = 0;
        let signals: any[] = [];
        
        const rsi = RSI.calculate({ values: closes, period: 14 });
        const currentRsi = rsi[rsi.length - 1] || 50;
        if (currentRsi < 30) { quantScore += 20; signals.push({ name: 'RSI Bullish', impact: 'bullish' }); }
        else if (currentRsi > 70) { quantScore -= 20; signals.push({ name: 'RSI Overbought', impact: 'bearish' }); }

        const last5 = { open: opens.slice(-5), high: highs.slice(-5), low: lows.slice(-5), close: closes.slice(-5) };
        if (bullishengulfingpattern(last5)) { quantScore += 25; signals.push({ name: 'Bullish Engulfing', impact: 'bullish' }); }

        const regression = linearRegression(rawData.slice(-100).filter(d => d.close != null).map((d, i) => [i, d.close]));
        const baselineLine = linearRegressionLine(regression);
        
        const futurePoints = [];
        const lastDate = new Date(rawData[rawData.length - 1].date);
        let pred = closes[closes.length - 1];

        for (let i = 1; i <= 30; i++) {
            const fDate = new Date(lastDate);
            fDate.setDate(fDate.getDate() + i);
            const drift = (quantScore / 100) * 0.01;
            pred = pred * (1 + (drift + (Math.random() - 0.5) * 0.005));
            futurePoints.push({ date: fDate.toISOString(), predictedClose: parseFloat(pred.toFixed(2)) });
        }

        res.json({
            futurePoints,
            trendGradient: regression.m,
            dataSampleForAI: rawData.slice(-45).filter(d => d.open && d.close).map(d => ({
                date: d.date.toISOString().split("T")[0],
                open: d.open.toFixed(2), high: d.high.toFixed(2), low: d.low.toFixed(2), close: d.close.toFixed(2), volume: d.volume
            })),
            quantSignals: { score: quantScore, signals }
        });
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

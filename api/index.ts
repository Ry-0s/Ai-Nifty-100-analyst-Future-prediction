import express from 'express';
import YahooFinance from 'yahoo-finance2';
import { linearRegression, linearRegressionLine } from 'simple-statistics';
import { 
  RSI, MACD, SMA, stochastic, CCI, ADX, BollingerBands,
  bullishengulfingpattern, bearishengulfingpattern, morningstar, eveningstar,
  threeblackcrows, threewhitesoldiers, IchimokuCloud, StochasticRSI,
  hammerpattern, shootingstar
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

        res.json(results.map((r, i) => {
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
        }));
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
        
        let currentIchimoku: any = null;
        let currentStochRsi: any = null;
        
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
            
            const currentRsi = rsi[rsi.length - 1];
            const currentMacd = macd[macd.length - 1];
            const currentStoch = stoch[stoch.length - 1];
            const currentBB = bb[bb.length - 1];
            const currentCci = cci[cci.length - 1];
            const currentAdx = adx[adx.length - 1];
            currentIchimoku = ichimoku[ichimoku.length - 1];
            currentStochRsi = stochRsi[stochRsi.length - 1];
            const currentClose = closes[closes.length - 1];

            if (currentRsi < 30) { quantScore += 20; detectedSignals.push({ name: 'RSI Bullish', impact: 'bullish' }); }
            else if (currentRsi > 70) { quantScore -= 20; detectedSignals.push({ name: 'RSI Overbought', impact: 'bearish' }); }

            // Ichimoku Regime
            if (currentIchimoku) {
                const cloudTop = Math.max(currentIchimoku.spanA, currentIchimoku.spanB);
                const cloudBottom = Math.min(currentIchimoku.spanA, currentIchimoku.spanB);
                if (currentClose > cloudTop) quantScore += 30;
                else if (currentClose < cloudBottom) quantScore -= 30;
            }

            if (currentMacd && currentMacd.MACD > currentMacd.signal) { quantScore += 15; detectedSignals.push({ name: 'MACD Bullish', impact: 'bullish' }); }
            else { quantScore -= 15; detectedSignals.push({ name: 'MACD Bearish', impact: 'bearish' }); }

            const last5 = { open: opens.slice(-5), high: highs.slice(-5), low: lows.slice(-5), close: closes.slice(-5) };
            if (bullishengulfingpattern(last5)) { quantScore += 25; detectedSignals.push({ name: 'Bullish Engulfing', impact: 'bullish' }); }
            if (bearishengulfingpattern(last5)) { quantScore -= 25; detectedSignals.push({ name: 'Bearish Engulfing', impact: 'bearish' }); }
            if (hammerpattern(last5)) { quantScore += 15; detectedSignals.push({ name: 'Hammer Pattern', impact: 'bullish' }); }
            if (shootingstar(last5)) { quantScore -= 15; detectedSignals.push({ name: 'Shooting Star', impact: 'bearish' }); }

            // Ensemble AR-I-MA-Prophet Engine (60-Day Horizon)
            const recentDataFiltered = rawData.slice(-120).filter(d => d.close != null);
            const prices = recentDataFiltered.map(d => d.close);

            // Integrated (I) - Differencing
            const dailyAverages = new Array(7).fill(0);
            const dailyCounts = new Array(7).fill(0);
            recentDataFiltered.forEach((d, i) => {
                if (i > 0) {
                    const day = new Date(d.date).getDay();
                    const ret = Math.log(d.close / recentDataFiltered[i-1].close);
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

            const dataForReg = recentDataFiltered.map((d, i) => [i, d.close]);
            const regression = linearRegression(dataForReg);
            
            // 4. Advanced Ensemble Meta-Learner (Elastic Softmax + Market Correlation)
            let marketVolatility = 0.015;
            let marketCorrelation = 0.5;
            const logReturns = [];
            for(let k = 1; k < prices.length; k++) logReturns.push(Math.log(prices[k] / prices[k-1]));
            const recentVolatility = Math.sqrt(logReturns.slice(-30).reduce((sq, n) => sq + Math.pow(n, 2), 0) / 30 || 0.0001);

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

                    const mMean = mReturns.reduce((a, b) => a + b, 0) / mReturns.length;
                    const mVar = mReturns.reduce((sq, n) => sq + Math.pow(n - mMean, 2), 0) / mReturns.length;
                    marketVolatility = Math.sqrt(mVar);

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

            let trendError = 0;
            let meanRevError = 0;
            const testWindow = 15;
            for (let i = prices.length - testWindow; i < prices.length; i++) {
                const actual = prices[i];
                const tPred = level + (trend * (i - (prices.length - 1)));
                const mPred = regression.b + (regression.m * i);
                trendError += Math.abs(actual - tPred) / actual;
                meanRevError += Math.abs(actual - mPred) / actual;
            }
            
            const temp = 0.05;
            const eTrend = Math.exp(-trendError / temp);
            const eMean = Math.exp(-meanRevError / temp);
            let finalTrendWeight = eTrend / (eTrend + eMean);
            let finalMeanRevWeight = eMean / (eTrend + eMean);

            if (currentAdx && currentAdx.adx > 30) {
                finalTrendWeight = Math.min(0.9, finalTrendWeight * 1.5);
                finalMeanRevWeight = 1 - finalTrendWeight;
            } else if (currentAdx && currentAdx.adx < 18) {
                finalMeanRevWeight = Math.min(0.9, finalMeanRevWeight * 1.5);
                finalTrendWeight = 1 - finalMeanRevWeight;
            }

            const systemicRisk = marketVolatility * marketCorrelation;
            const idiosyncraticRisk = recentVolatility * (1 - marketCorrelation);
            const bbBandwidth = currentBB ? (currentBB.upper - currentBB.lower) / currentBB.middle : 0.05;
            const combinedVolatility = (idiosyncraticRisk * 0.7) + (systemicRisk * 0.3) + (bbBandwidth * 0.05); 
            const volatilityScaler = Math.max(0.008, combinedVolatility);

            const futurePoints = [];
            let predictedClose = prices[prices.length - 1];
            const regimeBias = quantScore / 100;

            for (let i = 1; i <= 60; i++) {
                const fDate = new Date(recentDataFiltered[recentDataFiltered.length - 1].date);
                fDate.setDate(fDate.getDate() + i);
                const dayOfWeek = fDate.getDay();
                
                const structuralDrift = (trend / predictedClose) * 0.45 * finalTrendWeight;
                const regTarget = (regression.b + regression.m * (recentDataFiltered.length - 1 + i));
                const meanReversion = (regTarget - predictedClose) / predictedClose * 0.15 * finalMeanRevWeight;
                const seasonalDrift = weekdayExpectancy[dayOfWeek] * 0.45;
                const biasDecay = Math.exp(-i / 25); 
                const biasForce = regimeBias * 0.015 * biasDecay;
                
                const stochRsiHeat = currentStochRsi ? (currentStochRsi.stochRSI / 100) : 0.5;
                const variance = volatilityScaler * (1 + (stochRsiHeat * 0.4)) * Math.sqrt(i) * 0.12;

                const alignmentBonus = (Math.sign(structuralDrift) === Math.sign(biasForce)) ? 1.25 : 0.75;
                const netDrift = (structuralDrift + meanReversion + biasForce + seasonalDrift) * alignmentBonus;
                const cappedDrift = Math.tanh(netDrift * 15) / 15;
                const noise = (Math.random() - 0.5) * variance;
                const change = Math.max(-0.05, Math.min(0.05, cappedDrift + noise));
                
                predictedClose = predictedClose * (1 + change);

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

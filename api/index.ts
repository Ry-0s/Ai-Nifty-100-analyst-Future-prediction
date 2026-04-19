import express from 'express';
import YahooFinance from 'yahoo-finance2';
import { linearRegression, linearRegressionLine } from 'simple-statistics';
import * as tf from '@tensorflow/tfjs';
import { 
  RSI, MACD, SMA, stochastic, CCI, ADX, BollingerBands, ATR,
  bullishengulfingpattern, bearishengulfingpattern, morningstar, eveningstar,
  threeblackcrows, threewhitesoldiers, IchimokuCloud, StochasticRSI,
  hammerpattern, shootingstar, dragonflydoji, gravestonedoji,
  bullishharami, bearishharami, bullishharamicross, bearishharamicross,
  bullishmarubozu, bearishmarubozu, piercingline, darkcloudcover,
  hangingman, bullishspinningtop, bearishspinningtop
} from 'technicalindicators';

const app = express();
const yahooFinance = new YahooFinance();
const tfModelCache = new Map<string, tf.Sequential>();
const isTrainingCache = new Map<string, boolean>();

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
        
        // Calculate period1 based on range
        const now = new Date();
        let period1Date = new Date();
        
        if (range === '1mo') period1Date.setMonth(now.getMonth() - 1);
        else if (range === '3mo') period1Date.setMonth(now.getMonth() - 3);
        else if (range === '6mo') period1Date.setMonth(now.getMonth() - 6);
        else if (range === '1y') period1Date.setFullYear(now.getFullYear() - 1);
        else if (range === '5y') period1Date.setFullYear(now.getFullYear() - 5);
        else period1Date.setFullYear(now.getFullYear() - 1);

        // Validate interval
        const validIntervals = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'];
        const safeInterval = validIntervals.includes(interval as string) ? (interval as any) : '1d';

        const queryOptions: any = { 
            interval: safeInterval,
            period1: Math.floor(period1Date.getTime() / 1000)
        };

        let chartData: any;
        try {
            chartData = await yahooFinance.chart(symbol, queryOptions);
        } catch (e: any) {
            if (e.message.includes('No data found') || e.message.includes('delisted')) {
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

        const rawData: any[] = (chartData.quotes || []);
        const filteredData = rawData.filter(d => d.close != null && d.open != null && d.high != null && d.low != null);
        
        if (filteredData.length < 50) return res.json({ error: "Not enough valid data" });

        const closes = filteredData.map(d => d.close);
        const highs = filteredData.map(d => d.high);
        const lows = filteredData.map(d => d.low);
        const opens = filteredData.map(d => d.open);
        const volumes = filteredData.map(d => d.volume);

        // Pre-calculate indicators for the entire range to use as ML features
        const rsiValues = RSI.calculate({ values: closes, period: 14 });
        const macdValues = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
        const bbValues = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
        const sma20Values = SMA.calculate({ values: closes, period: 20 });
        const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
        const cciValues = CCI.calculate({ high: highs, low: lows, close: closes, period: 20 });
        
        // Pad indicators to match price data length
        const rsiFull = new Array(closes.length - rsiValues.length).fill(50).concat(rsiValues);
        const macdFull = new Array(closes.length - macdValues.length).fill({ MACD: 0, signal: 0, histogram: 0 }).concat(macdValues);
        const bbFull = new Array(closes.length - bbValues.length).fill({ upper: 0, lower: 0, middle: 0 }).concat(bbValues);
        const sma20Full = new Array(closes.length - sma20Values.length).fill(closes[0]).concat(sma20Values);
        const atrFull = new Array(closes.length - atrValues.length).fill(0).concat(atrValues);
        const cciFull = new Array(closes.length - cciValues.length).fill(0).concat(cciValues);

        // Map technical data for easy lookup
        const enrichedData = filteredData.map((d, i) => ({
            ...d,
            rsi: rsiFull[i],
            macd: macdFull[i].MACD - macdFull[i].signal,
            bbPos: bbFull[i].upper === bbFull[i].lower ? 0.5 : (d.close - bbFull[i].lower) / (bbFull[i].upper - bbFull[i].lower),
            smaDist: (d.close - sma20Full[i]) / sma20Full[i],
            atr: atrFull[i],
            cci: cciFull[i]
        }));
        
        if (enrichedData.length < 50) return res.json({ error: "Not enough valid data" });
        
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

            if (currentMacd && typeof currentMacd.MACD === 'number' && typeof currentMacd.signal === 'number') {
                const macdGap = currentMacd.MACD - currentMacd.signal;
                if (macdGap > 0) { quantScore += 15; detectedSignals.push({ name: 'MACD Bullish Momentum', impact: 'bullish' }); }
                else { quantScore -= 15; detectedSignals.push({ name: 'MACD Bearish Pressure', impact: 'bearish' }); }
            }

            const last5 = { open: opens.slice(-5), high: highs.slice(-5), low: lows.slice(-5), close: closes.slice(-5) };
            const beArr = bullishengulfingpattern(last5);
            if (beArr && beArr[beArr.length - 1]) { quantScore += 25; detectedSignals.push({ name: 'Bullish Engulfing', impact: 'bullish' }); }
            const bgeArr = bearishengulfingpattern(last5);
            if (bgeArr && bgeArr[bgeArr.length - 1]) { quantScore -= 25; detectedSignals.push({ name: 'Bearish Engulfing', impact: 'bearish' }); }
            const hpArr = hammerpattern(last5);
            if (hpArr && hpArr[hpArr.length - 1]) { quantScore += 15; detectedSignals.push({ name: 'Hammer Pattern', impact: 'bullish' }); }
            const ssArr = shootingstar(last5);
            if (ssArr && ssArr[ssArr.length - 1]) { quantScore -= 15; detectedSignals.push({ name: 'Shooting Star', impact: 'bearish' }); }
            
            const ddArr = dragonflydoji(last5);
            if (ddArr && ddArr[ddArr.length - 1]) { quantScore += 10; detectedSignals.push({ name: 'Dragonfly Doji', impact: 'bullish' }); }
            const gdArr = gravestonedoji(last5);
            if (gdArr && gdArr[gdArr.length - 1]) { quantScore -= 10; detectedSignals.push({ name: 'Gravestone Doji', impact: 'bearish' }); }
            const bhArr = bullishharami(last5);
            if (bhArr && bhArr[bhArr.length - 1]) { quantScore += 20; detectedSignals.push({ name: 'Bullish Harami', impact: 'bullish' }); }
            const behArr = bearishharami(last5);
            if (behArr && behArr[behArr.length - 1]) { quantScore -= 20; detectedSignals.push({ name: 'Bearish Harami', impact: 'bearish' }); }
            const bhcArr = bullishharamicross(last5);
            if (bhcArr && bhcArr[bhcArr.length - 1]) { quantScore += 25; detectedSignals.push({ name: 'Bullish Harami Cross', impact: 'bullish' }); }
            const behcArr = bearishharamicross(last5);
            if (behcArr && behcArr[behcArr.length - 1]) { quantScore -= 25; detectedSignals.push({ name: 'Bearish Harami Cross', impact: 'bearish' }); }
            const bmArr = bullishmarubozu(last5);
            if (bmArr && bmArr[bmArr.length - 1]) { quantScore += 15; detectedSignals.push({ name: 'Bullish Marubozu', impact: 'bullish' }); }
            const bemArr = bearishmarubozu(last5);
            if (bemArr && bemArr[bemArr.length - 1]) { quantScore -= 15; detectedSignals.push({ name: 'Bearish Marubozu', impact: 'bearish' }); }
            const plArr = piercingline(last5);
            if (plArr && plArr[plArr.length - 1]) { quantScore += 25; detectedSignals.push({ name: 'Piercing Line', impact: 'bullish' }); }
            const dccArr = darkcloudcover(last5);
            if (dccArr && dccArr[dccArr.length - 1]) { quantScore -= 25; detectedSignals.push({ name: 'Dark Cloud Cover', impact: 'bearish' }); }
            const hmArr = hangingman(last5);
            if (hmArr && hmArr[hmArr.length - 1]) { quantScore -= 15; detectedSignals.push({ name: 'Hanging Man', impact: 'bearish' }); }
            const bstArr = bullishspinningtop(last5);
            if (bstArr && bstArr[bstArr.length - 1]) { quantScore += 5; detectedSignals.push({ name: 'Bullish Spinning Top', impact: 'bullish' }); }
            const bestArr = bearishspinningtop(last5);
            if (bestArr && bestArr[bestArr.length - 1]) { quantScore -= 5; detectedSignals.push({ name: 'Bearish Spinning Top', impact: 'bearish' }); }

            // Moving Average Speed
            const ma20 = SMA.calculate({ values: closes, period: 20 });
            const ma50 = SMA.calculate({ values: closes, period: 50 });
            const lastMa20 = ma20[ma20.length - 1];
            const lastMa50 = ma50[ma50.length - 1];
            if (lastMa20 > lastMa50) {
                quantScore += 20; 
                if (ma20[ma20.length - 2] <= ma50[ma50.length - 2]) {
                    detectedSignals.push({ name: 'Golden Cross (Major)', impact: 'bullish' });
                    quantScore += 20;
                }
            } else {
                quantScore -= 15;
            }

            // ADX Trend Strength weight
            if (currentAdx && currentAdx.adx > 25) {
                const trendDir = closes[closes.length - 1] > closes[closes.length - 20] ? 1 : -1;
                quantScore += (trendDir * 10);
                detectedSignals.push({ name: `Strong ${trendDir > 0 ? 'Bullish' : 'Bearish'} Trend (ADX)`, impact: trendDir > 0 ? 'bullish' : 'bearish' });
            }

            // 3. TFJS Local Machine Learning Model
            const recentEnriched = enrichedData.slice(-500);
            
            const WINDOW_SIZE = 30; // Increased window for pattern diversity
            if (recentEnriched.length < WINDOW_SIZE + 5) throw new Error("Not enough data to train local AI model.");

            const minPrice = Math.min(...recentEnriched.map(d => d.low));
            const maxPrice = Math.max(...recentEnriched.map(d => d.high));
            const range = maxPrice - minPrice || 1;
            const maxVol = Math.max(...recentEnriched.map(d => d.volume || 1));
            
            let model = tfModelCache.get(symbol);
            if (!model) {
                model = tf.sequential();
                // Multivariate Input: [WINDOW_SIZE, 11 features]
                model.add(tf.layers.lstm({ units: 64, returnSequences: true, inputShape: [WINDOW_SIZE, 11] }));
                model.add(tf.layers.dropout({ rate: 0.1 }));
                model.add(tf.layers.lstm({ units: 32, returnSequences: false }));
                model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
                model.add(tf.layers.dense({ units: 1, activation: 'linear' }));
                model.compile({ 
                    optimizer: tf.train.adam(0.005), 
                    loss: 'meanSquaredError' 
                });
                tfModelCache.set(symbol, model);
            }

            const xs: number[][][] = [];
            const ys: number[][] = [];
            const maxAtr = Math.max(...recentEnriched.map(d => d.atr || 1)) || 1;

            for (let i = 0; i < recentEnriched.length - WINDOW_SIZE; i++) {
                const windowData = recentEnriched.slice(i, i + WINDOW_SIZE).map(d => [
                    (d.open - minPrice) / range,
                    (d.high - minPrice) / range,
                    (d.low - minPrice) / range,
                    (d.close - minPrice) / range,
                    (d.volume || 0) / maxVol,
                    (d.rsi || 50) / 100,
                    (d.macd || 0) + 0.5,
                    (d.bbPos || 0.5),
                    (d.smaDist || 0) + 0.5,
                    (d.atr || 0) / maxAtr,
                    (d.cci || 0) / 200 + 0.5
                ]);
                xs.push(windowData);
                ys.push([(recentEnriched[i + WINDOW_SIZE].close - minPrice) / range]);
            }
            
            const tfXs = tf.tensor3d(xs);
            const tfYs = tf.tensor2d(ys);
            
            const EPOCHS = 25;

            if (!isTrainingCache.get(symbol)) {
                isTrainingCache.set(symbol, true);
                try {
                    await model.fit(tfXs, tfYs, { 
                        epochs: EPOCHS, 
                        batchSize: 32, 
                        verbose: 0,
                        validationSplit: 0.1,
                        callbacks: {
                            onEpochEnd: (epoch, logs) => {
                                if (logs && typeof logs.loss === 'number' && logs.loss < 0.00005) {
                                    if (model) model.stopTraining = true;
                                }
                            }
                        }
                    }); 
                } finally {
                    isTrainingCache.set(symbol, false);
                }
            }
            
            // Calculate MAPE on training data
            const predsTensor = model.predict(tfXs) as tf.Tensor;
            const predsArray = predsTensor.dataSync();
            const actualArray = tfYs.dataSync();
            let mapeSum = 0;
            let validCount = 0;
            for (let i = 0; i < actualArray.length; i++) {
                const actual = (actualArray[i] * range) + minPrice;
                const pred = (predsArray[i] * range) + minPrice;
                if (actual !== 0) {
                    mapeSum += Math.abs((actual - pred) / actual);
                    validCount++;
                }
            }
            const mape = validCount > 0 ? (mapeSum / validCount) * 100 : 0;
            
            predsTensor.dispose();
            tfXs.dispose();
            tfYs.dispose();

            const dataForReg = recentEnriched.map((d, i) => [i, d.close]);
            const regression = linearRegression(dataForReg);
            const logReturns: number[] = [];
            for(let i = 1; i < recentEnriched.length; i++) {
                if (recentEnriched[i-1].close > 0) {
                    logReturns.push(Math.log(recentEnriched[i].close / recentEnriched[i-1].close));
                }
            }
            const recentVolatility = Math.sqrt(logReturns.slice(-30).reduce((sq, n) => sq + Math.pow(n, 2), 0) / 30 || 0.0001);

            const futurePoints: any[] = [];
            const lastDate = new Date(recentEnriched[recentEnriched.length - 1].date);
            
            // Get the latest window for prediction
            let currentWindow = recentEnriched.slice(-WINDOW_SIZE).map(d => [
                (d.open - minPrice) / range,
                (d.high - minPrice) / range,
                (d.low - minPrice) / range,
                (d.close - minPrice) / range,
                (d.volume || 0) / maxVol,
                (d.rsi || 50) / 100,
                (d.macd || 0) + 0.5,
                (d.bbPos || 0.5),
                (d.smaDist || 0) + 0.5
            ]);
            
            const trendModifier = (quantScore / 100);

            for (let i = 1; i <= 60; i++) {
                const fDate = new Date(lastDate);
                fDate.setDate(fDate.getDate() + i);
                
                if (fDate.getDay() !== 0 && fDate.getDay() !== 6) {
                    const inputTensor = tf.tensor3d([currentWindow]);
                    const predNormalized = (model.predict(inputTensor) as tf.Tensor).dataSync()[0];
                    inputTensor.dispose();
                    
                    let predictedClose = (predNormalized * range) + minPrice;
                    predictedClose = predictedClose * (1 + (trendModifier * 0.002));
                    
                    futurePoints.push({
                        date: fDate.toISOString(),
                        predictedClose: parseFloat(predictedClose.toFixed(2)),
                        uncertaintyHigh: parseFloat((predictedClose * (1 + (recentVolatility * 3.0 * Math.sqrt(i)))).toFixed(2)),
                        uncertaintyLow: parseFloat((predictedClose * (1 - (recentVolatility * 3.0 * Math.sqrt(i)))).toFixed(2))
                    });
                    
                    currentWindow.shift();
                    currentWindow.push([
                        predNormalized, predNormalized, predNormalized, predNormalized, 
                        currentWindow[currentWindow.length - 1][4],
                        currentWindow[currentWindow.length - 1][5],
                        currentWindow[currentWindow.length - 1][6],
                        currentWindow[currentWindow.length - 1][7],
                        currentWindow[currentWindow.length - 1][8]
                    ]);
                }
            }

            res.json({
                futurePoints,
                trendGradient: regression.m,
                dataSampleForAI: recentEnriched.slice(-45).map(d => ({
                    date: d.date.toISOString().split("T")[0],
                    open: d.open.toFixed(2), high: d.high.toFixed(2), low: d.low.toFixed(2), close: d.close.toFixed(2), volume: d.volume
                })),
                quantSignals: { score: Math.max(-100, Math.min(100, quantScore)), signals: detectedSignals },
                localAiMetrics: { mape: mape, epochs: 30 }
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

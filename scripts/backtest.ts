
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { linearRegression } from 'simple-statistics';
import { ADX, BollingerBands, StochasticRSI } from 'technicalindicators';

// Reusable logic from the server/api
export async function runBacktest(symbol: string) {
    try {
        const p1 = new Date();
        p1.setMonth(p1.getMonth() - 13);
        const data: any = await yahooFinance.chart(symbol, { 
            interval: '1d', 
            period1: Math.floor(p1.getTime() / 1000) 
        } as any);
        const quotes = data.quotes.filter((q: any) => q.close != null);
        
        if (quotes.length < 100) return null;

        // Split data: 1 year for "training/context", last 30 days for "validation"
        const validationDays = 20;
        const trainingData = quotes.slice(0, -validationDays);
        const actuals = quotes.slice(-validationDays);
        
        // --- Prediction Logic Logic (Mini Version of server logic) ---
        const prices = trainingData.map((d: any) => d.close);
        const lastPrice = prices[prices.length - 1];
        
        // Regression
        const dataForReg = trainingData.map((d: any, i: number) => [i, d.close]);
        const regression = linearRegression(dataForReg);
        
        // Indicators
        const adxRes = ADX.calculate({
            high: trainingData.map((d: any) => d.high),
            low: trainingData.map((d: any) => d.low),
            close: prices,
            period: 14
        });
        const currentAdx = adxRes[adxRes.length - 1];

        // Perform 20 day prediction
        let predictedClose = lastPrice;
        const predictions = [];
        
        const trend = (prices[prices.length - 1] - prices[prices.length - 21]) / 20;

        for (let i = 1; i <= validationDays; i++) {
             // Simplified version of the damped-drift model we refined
             const horizonDamping = Math.pow(0.965, i);
             const structuralDrift = (trend / predictedClose) * 0.4 * horizonDamping;
             
             const regTarget = (regression.b + regression.m * (trainingData.length - 1 + i));
             const meanReversionForce = (regTarget - predictedClose) / predictedClose * 0.2;
             
             const totalChange = (structuralDrift + meanReversionForce);
             predictedClose = predictedClose * (1 + totalChange);
             predictions.push(predictedClose);
        }

        // Calculate Accuracy
        let totalError = 0;
        for (let i = 0; i < validationDays; i++) {
            totalError += Math.abs(predictions[i] - actuals[i].close) / actuals[i].close;
        }
        
        const mape = (totalError / validationDays) * 100;
        return {
            symbol,
            mape,
            startPrice: lastPrice,
            endPriceActual: actuals[validationDays-1].close,
            endPricePred: predictions[validationDays-1]
        };
    } catch (e) {
        return null;
    }
}

async function runBatch() {
    const nifty100 = [
        'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'LT.NS', 'ADANIENT.NS',
        'BAJFINANCE.NS', 'COALINDIA.NS', 'SUNPHARMA.NS', 'TATAMOTORS.NS', 'HINDUNILVR.NS', 'AXISBANK.NS', 'ADANIPORTS.NS', 'ASIANPAINT.NS', 'KOTAKBANK.NS', 'MARUTI.NS',
        'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX', 'BRK-B', 'V', 'JPM', 'JNJ', 'WMT', 'PG', 'MA', 
        'ETH-USD', 'BTC-USD', 'GOLD', 'OIL'
    ];
    console.log(`Running Performance Test on ${nifty100.length} Symbols...`);
    const results = [];
    for (const s of nifty100) {
        process.stdout.write(`Testing ${s}... `);
        const res = await runBacktest(s);
        if (res) {
            results.push(res);
            console.log(`Error: ${res.mape.toFixed(2)}%`);
        } else {
            console.log("Failed");
        }
    }
    
    const avgMAPE = results.reduce((a, b) => a + b.mape, 0) / results.length;
    console.log(`\n==========================================`);
    console.log(`Average Prediction Error (MAPE): ${avgMAPE.toFixed(2)}%`);
    console.log(`Best Performer: ${results.sort((a,b)=>a.mape-b.mape)[0].symbol}`);
    console.log(`Worst Performer: ${results.sort((a,b)=>b.mape-a.mape)[0].symbol}`);
    console.log(`==========================================`);
}

runBatch();

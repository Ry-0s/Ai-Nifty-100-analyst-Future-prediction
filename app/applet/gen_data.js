const fs = require('fs');

const regimes = [
    { name: 'bull_trend', drift: 0.002, vol: 0.015, base: 2000 },
    { name: 'bear_trend', drift: -0.002, vol: 0.018, base: 2500 },
    { name: 'mean_reversion', drift: 0, vol: 0.012, base: 1900 },
    { name: 'breakout', drift: 0.0005, vol: 0.01, base: 1750 },
    { name: 'crash_recovery', drift: 0, vol: 0.03, base: 2600 }
];

let allData = [];
let date = new Date('2023-01-01');

regimes.forEach(r => {
    let currentClose = r.base;
    for (let i = 0; i < 200; i++) {
        date.setDate(date.getDate() + 1);
        if (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + (date.getDay()===6 ? 2 : 1));

        let localDrift = r.drift;
        let shock = 0;
        
        if (r.name === 'breakout' && i === 50) shock = 0.05;
        if (r.name === 'crash_recovery') {
            if (i < 60) localDrift = -0.015;
            else if (i < 100) localDrift = 0;
            else localDrift = 0.008;
        }
        if (r.name === 'mean_reversion') {
            localDrift = (r.base - currentClose) / r.base * 0.05;
        }

        let change = localDrift + shock + (Math.random() - 0.5) * r.vol;
        
        let open = currentClose * (1 + (Math.random() - 0.5) * 0.005);
        let close = open * (1 + change);
        let high = Math.max(open, close) * (1 + Math.random() * (r.vol/2));
        let low = Math.min(open, close) * (1 - Math.random() * (r.vol/2));
        
        currentClose = close;

        // Simulate indicator values
        let rsi = Math.max(10, Math.min(90, 50 + (close - open) / open * 1000 + (r.drift * 5000)));
        let macd = (close - open) / open;
        let bbPos = Math.max(-0.2, Math.min(1.2, 0.5 + (close - open) / open * 20));
        let smaDist = (close - r.base) / r.base; // approximate
        let atr = Math.abs(high - low) / close;
        let cci = Math.max(-200, Math.min(200, (close - open) / open * 5000));

        allData.push({
            date: date.toISOString().split('T')[0],
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            volume: Math.floor(1000000 + Math.random() * 5000000),
            rsi: parseFloat(rsi.toFixed(2)),
            macd: parseFloat(macd.toFixed(6)),
            bbPos: parseFloat(bbPos.toFixed(4)),
            smaDist: parseFloat(smaDist.toFixed(6)),
            atr: parseFloat(atr.toFixed(6)),
            cci: parseFloat(cci.toFixed(2)),
            regime: r.name
        });
    }
});

fs.writeFileSync('./synthetic_training_data.json', JSON.stringify(allData, null, 2));
console.log('Generated synthetic_training_data.json');

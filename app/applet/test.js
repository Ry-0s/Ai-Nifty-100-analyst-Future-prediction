import http from 'http';

http.get('http://localhost:3000/api/ml/predict/RELIANCE.NS', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const parsed = JSON.parse(data);
    console.log(JSON.stringify(parsed.quantSignals, null, 2));
  });
});

import axios from 'axios';

const symbols = ['AAPL', 'TSLA', 'MSFT'];
const timeframes = ['1d', '1h', '30m', '15m'];

async function testFinnhub() {
  console.log('\n=== Testing Finnhub Data Coverage ===');
  const apiKey = process.env.FINNHUB_API_KEY;
  
  for (const tf of timeframes) {
    const resMap = { '15m': '15', '30m': '30', '1h': '60', '1d': 'D' };
    const daysMap = { '15m': 60, '30m': 60, '1h': 730, '1d': 3650 };
    
    const resolution = resMap[tf];
    const days = daysMap[tf];
    const now = Math.floor(Date.now() / 1000);
    const from = now - days * 86400;
    
    try {
      const res = await axios.get('https://finnhub.io/api/v1/stock/candle', {
        params: { symbol: 'AAPL', resolution, from, to: now, token: apiKey },
        timeout: 5000
      });
      
      if (res.data.s === 'ok' && res.data.t) {
        const firstTime = new Date(res.data.t[0] * 1000).toISOString().split('T')[0];
        const lastTime = new Date(res.data.t[res.data.t.length - 1] * 1000).toISOString().split('T')[0];
        console.log(`${tf}: ${res.data.t.length} candles | ${firstTime} to ${lastTime}`);
      }
    } catch (err) {
      console.log(`${tf}: Error - ${err.message}`);
    }
  }
}

async function testTiingo() {
  console.log('\n=== Testing Tiingo Data Coverage ===');
  const apiKey = process.env.TIINGO_API_KEY;
  
  for (const tf of ['1d', '1h', '30m', '15m']) {
    const resMap = { '15m': '15min', '30m': '30min', '1h': '1hour', '1d': 'daily' };
    const resolution = resMap[tf];
    
    const now = new Date();
    const startDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];
    
    try {
      const res = await axios.get(`https://api.tiingo.com/tiingo/daily/AAPL/prices`, {
        params: { startDate, endDate, resampleFreq: resolution, token: apiKey },
        timeout: 5000
      });
      
      if (Array.isArray(res.data) && res.data.length > 0) {
        const firstTime = res.data[0].date;
        const lastTime = res.data[res.data.length - 1].date;
        console.log(`${tf}: ${res.data.length} candles | ${firstTime} to ${lastTime}`);
      }
    } catch (err) {
      console.log(`${tf}: Error - ${err.message}`);
    }
  }
}

async function testAlphaVantage() {
  console.log('\n=== Testing Alpha Vantage Data Coverage ===');
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  
  for (const tf of ['1d', '1h', '30m', '15m']) {
    const funcMap = { '15m': 'TIME_SERIES_INTRADAY', '30m': 'TIME_SERIES_INTRADAY', '1h': 'TIME_SERIES_INTRADAY', '1d': 'TIME_SERIES_DAILY' };
    const intervalMap = { '15m': '15min', '30m': '30min', '1h': '60min', '1d': '' };
    
    const func = funcMap[tf];
    const interval = intervalMap[tf];
    
    try {
      const params = { symbol: 'AAPL', apikey: apiKey, outputsize: 'full', function: func };
      if (interval) params.interval = interval;
      
      const res = await axios.get('https://www.alphavantage.co/query', {
        params,
        timeout: 5000
      });
      
      const timeSeriesKey = Object.keys(res.data).find(k => k.startsWith('Time Series'));
      if (timeSeriesKey && res.data[timeSeriesKey]) {
        const ts = res.data[timeSeriesKey];
        const times = Object.keys(ts).sort();
        console.log(`${tf}: ${times.length} candles | ${times[0]} to ${times[times.length - 1]}`);
      }
    } catch (err) {
      console.log(`${tf}: Error - ${err.message}`);
    }
  }
}

await testFinnhub();
await testTiingo();
await testAlphaVantage();

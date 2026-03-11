import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data.db');

const db = new Database(dbPath);

const symbol = 'AAPL';
const startDate = '2025-12-01';
const endDate = '2026-03-07';

console.log(`\n=== 检查 ${symbol} 的数据覆盖范围 ===`);
console.log(`时间范围: ${startDate} 到 ${endDate}`);

try {
  // 检查日线数据
  console.log('\n1. 检查数据库中的日线数据...');
  const dailyData = db.prepare(`
    SELECT COUNT(*) as count, MIN(date) as earliest, MAX(date) as latest
    FROM candle_cache
    WHERE symbol = ? AND timeframe = '1d' AND date >= ? AND date <= ?
  `).get(symbol, startDate, endDate);
  
  console.log(`   日线数据: ${dailyData.count} 根`);
  if (dailyData.count > 0) {
    console.log(`   - 最早: ${dailyData.earliest}`);
    console.log(`   - 最新: ${dailyData.latest}`);
  }

  // 检查 30m 数据
  console.log('\n2. 检查数据库中的 30m 数据...');
  const data30m = db.prepare(`
    SELECT COUNT(*) as count, MIN(date) as earliest, MAX(date) as latest
    FROM candle_cache
    WHERE symbol = ? AND timeframe = '30m' AND date >= ? AND date <= ?
  `).get(symbol, startDate, endDate);
  
  console.log(`   30m 数据: ${data30m.count} 根`);
  if (data30m.count > 0) {
    console.log(`   - 最早: ${data30m.earliest}`);
    console.log(`   - 最新: ${data30m.latest}`);
  }

  // 检查所有时间框架的数据覆盖
  console.log('\n3. 检查所有时间框架的数据覆盖...');
  const allTimeframes = db.prepare(`
    SELECT DISTINCT timeframe, COUNT(*) as count, MIN(date) as earliest, MAX(date) as latest
    FROM candle_cache
    WHERE symbol = ? AND date >= ? AND date <= ?
    GROUP BY timeframe
    ORDER BY timeframe
  `).all(symbol, startDate, endDate);
  
  for (const tf of allTimeframes) {
    console.log(`   ${tf.timeframe}: ${tf.count} 根 (${tf.earliest} ~ ${tf.latest})`);
  }

  // 检查 2025-12-01 之前的数据
  console.log('\n4. 检查 2025-12-01 之前的数据...');
  const beforeDec = db.prepare(`
    SELECT DISTINCT timeframe, COUNT(*) as count, MAX(date) as latest
    FROM candle_cache
    WHERE symbol = ? AND date < '2025-12-01'
    GROUP BY timeframe
    ORDER BY timeframe
  `).all(symbol);
  
  if (beforeDec.length === 0) {
    console.log('   ❌ 没有 2025-12-01 之前的数据！');
  } else {
    for (const tf of beforeDec) {
      console.log(`   ${tf.timeframe}: ${tf.count} 根 (最新: ${tf.latest})`);
    }
  }

} catch (err) {
  console.error('错误:', err.message);
}

db.close();
process.exit(0);

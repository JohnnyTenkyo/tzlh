import { fetchHistoricalCandles } from "./marketData";

async function check() {
  const candles = await fetchHistoricalCandles("TSLA", "1d", "2025-12-01", "2026-03-07");
  console.log(`Total candles: ${candles.length}`);
  console.log(`\nLast 10 candles:`);
  candles.slice(-10).forEach((c, i) => {
    const date = new Date(c.time);
    console.log(`  ${candles.length - 10 + i}. ${date.toISOString().split('T')[0]} (${date.toISOString()}), close=${c.close}`);
  });
}

check();

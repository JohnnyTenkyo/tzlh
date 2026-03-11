import { describe, it, expect } from "vitest";
import axios from "axios";

describe("Alpaca API Key", () => {
  it("should connect to Alpaca API successfully", async () => {
    const apiKey = process.env.ALPACA_API_KEY;
    const secretKey = process.env.ALPACA_SECRET_KEY;
    expect(apiKey, "ALPACA_API_KEY must be set").toBeTruthy();
    expect(secretKey, "ALPACA_SECRET_KEY must be set").toBeTruthy();

    // 测试 Alpaca Markets Data API - 获取 AAPL 最近一根日线 bar
    const res = await axios.get(
      "https://data.alpaca.markets/v2/stocks/bars",
      {
        params: {
          symbols: "AAPL",
          timeframe: "1Day",
          limit: 1,
          feed: "iex",
        },
        headers: {
          "APCA-API-KEY-ID": apiKey,
          "APCA-API-SECRET-KEY": secretKey,
        },
        timeout: 10000,
      }
    );
    expect(res.status).toBe(200);
    expect(res.data).toBeDefined();
    console.log("✓ Alpaca API Key validated successfully");
    console.log("  Sample data:", JSON.stringify(res.data).slice(0, 200));
  }, 15000);
});

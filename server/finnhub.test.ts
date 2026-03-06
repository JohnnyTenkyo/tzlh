import { describe, it, expect } from "vitest";
import axios from "axios";

describe("Finnhub API Key", () => {
  it("should connect to Finnhub API successfully", async () => {
    const apiKey = process.env.FINNHUB_API_KEY;
    expect(apiKey).toBeTruthy();

    // Test with a simple quote request for AAPL
    const res = await axios.get("https://finnhub.io/api/v1/quote", {
      params: { symbol: "AAPL", token: apiKey },
      timeout: 10000,
    });

    expect(res.status).toBe(200);
    expect(res.data).toBeDefined();
    expect(typeof res.data.c).toBe("number"); // current price
    expect(res.data.c).toBeGreaterThan(0);
  }, 15000);
});

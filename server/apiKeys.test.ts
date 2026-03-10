import { describe, it, expect } from "vitest";
import axios from "axios";

describe("API Keys Validation", () => {
  it("should validate Tiingo API Key", async () => {
    const apiKey = process.env.TIINGO_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey?.length).toBeGreaterThan(0);

    // 验证 API 密钥格式（40 个十六进制字符）
    expect(apiKey).toMatch(/^[a-f0-9]{40}$/);
    console.log(`✓ Tiingo API Key format validated successfully`);
  });

  it("should validate Alpha Vantage API Key", async () => {
    const apiKey = process.env.ALPHAVANTAGE_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey?.length).toBeGreaterThan(0);

    // 验证 Alpha Vantage API 密钥格式（大写字母数字组合）
    expect(apiKey).toMatch(/^[A-Z0-9]+$/);
    console.log(`✓ Alpha Vantage API Key format validated successfully`);
  });
});

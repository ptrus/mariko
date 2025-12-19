/**
 * Tests for the update-prices script
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { loadPrices, mergePrices, sortPricesByDate, savePrices } from "./update-prices.js";

describe("update-prices script", () => {
  let tempDir;
  let tempFile;

  beforeEach(() => {
    // Create a temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "update-prices-test-"));
    tempFile = path.join(tempDir, "test-prices.json");
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  describe("loadPrices", () => {
    it("should load existing prices from file", () => {
      const testPrices = {
        "2024-01-01": 0.1,
        "2024-01-02": 0.11,
      };
      fs.writeFileSync(tempFile, JSON.stringify(testPrices));

      const loaded = loadPrices(tempFile);

      expect(loaded).toEqual(testPrices);
    });

    it("should return empty object if file does not exist", () => {
      const loaded = loadPrices("/nonexistent/path/prices.json");

      expect(loaded).toEqual({});
    });

    it("should handle empty JSON file", () => {
      fs.writeFileSync(tempFile, "{}");

      const loaded = loadPrices(tempFile);

      expect(loaded).toEqual({});
    });
  });

  describe("mergePrices", () => {
    it("should add new dates that do not exist", () => {
      const existing = {
        "2024-01-01": 0.1,
        "2024-01-02": 0.11,
      };
      const newPrices = [
        { date: "2024-01-03", price: 0.12 },
        { date: "2024-01-04", price: 0.13 },
      ];

      const { merged, added } = mergePrices(existing, newPrices);

      expect(merged).toEqual({
        "2024-01-01": 0.1,
        "2024-01-02": 0.11,
        "2024-01-03": 0.12,
        "2024-01-04": 0.13,
      });
      expect(added).toEqual([
        { date: "2024-01-03", price: 0.12 },
        { date: "2024-01-04", price: 0.13 },
      ]);
    });

    it("should NOT overwrite existing dates", () => {
      const existing = {
        "2024-01-01": 0.1,
        "2024-01-02": 0.11,
      };
      const newPrices = [
        { date: "2024-01-01", price: 0.99 }, // Already exists - should be ignored
        { date: "2024-01-02", price: 0.88 }, // Already exists - should be ignored
        { date: "2024-01-03", price: 0.12 }, // New - should be added
      ];

      const { merged, added } = mergePrices(existing, newPrices);

      // Existing values should be preserved
      expect(merged["2024-01-01"]).toBe(0.1);
      expect(merged["2024-01-02"]).toBe(0.11);
      expect(merged["2024-01-03"]).toBe(0.12);

      // Only the new date should be in added
      expect(added).toEqual([{ date: "2024-01-03", price: 0.12 }]);
    });

    it("should return empty added array when all dates exist", () => {
      const existing = {
        "2024-01-01": 0.1,
        "2024-01-02": 0.11,
      };
      const newPrices = [
        { date: "2024-01-01", price: 0.99 },
        { date: "2024-01-02", price: 0.88 },
      ];

      const { merged, added } = mergePrices(existing, newPrices);

      expect(added).toEqual([]);
      expect(merged).toEqual(existing);
    });

    it("should handle empty existing prices", () => {
      const existing = {};
      const newPrices = [
        { date: "2024-01-01", price: 0.1 },
        { date: "2024-01-02", price: 0.11 },
      ];

      const { merged, added } = mergePrices(existing, newPrices);

      expect(merged).toEqual({
        "2024-01-01": 0.1,
        "2024-01-02": 0.11,
      });
      expect(added).toEqual(newPrices);
    });

    it("should handle empty new prices", () => {
      const existing = {
        "2024-01-01": 0.1,
      };
      const newPrices = [];

      const { merged, added } = mergePrices(existing, newPrices);

      expect(merged).toEqual(existing);
      expect(added).toEqual([]);
    });
  });

  describe("sortPricesByDate", () => {
    it("should sort prices by date ascending", () => {
      const unsorted = {
        "2024-01-15": 0.15,
        "2024-01-01": 0.1,
        "2024-01-10": 0.12,
        "2024-01-05": 0.11,
      };

      const sorted = sortPricesByDate(unsorted);
      const keys = Object.keys(sorted);

      expect(keys).toEqual(["2024-01-01", "2024-01-05", "2024-01-10", "2024-01-15"]);
    });

    it("should handle already sorted prices", () => {
      const alreadySorted = {
        "2024-01-01": 0.1,
        "2024-01-02": 0.11,
        "2024-01-03": 0.12,
      };

      const sorted = sortPricesByDate(alreadySorted);
      const keys = Object.keys(sorted);

      expect(keys).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
    });

    it("should handle empty object", () => {
      const sorted = sortPricesByDate({});

      expect(sorted).toEqual({});
    });

    it("should preserve values after sorting", () => {
      const unsorted = {
        "2024-01-03": 0.33,
        "2024-01-01": 0.11,
        "2024-01-02": 0.22,
      };

      const sorted = sortPricesByDate(unsorted);

      expect(sorted["2024-01-01"]).toBe(0.11);
      expect(sorted["2024-01-02"]).toBe(0.22);
      expect(sorted["2024-01-03"]).toBe(0.33);
    });
  });

  describe("savePrices", () => {
    it("should save prices to file sorted by date", () => {
      const prices = {
        "2024-01-03": 0.12,
        "2024-01-01": 0.1,
        "2024-01-02": 0.11,
      };

      savePrices(prices, tempFile);

      const content = fs.readFileSync(tempFile, "utf-8");
      const parsed = JSON.parse(content);
      const keys = Object.keys(parsed);

      expect(keys).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
    });

    it("should format JSON with 2-space indentation", () => {
      const prices = {
        "2024-01-01": 0.1,
      };

      savePrices(prices, tempFile);

      const content = fs.readFileSync(tempFile, "utf-8");

      expect(content).toContain("  "); // 2-space indent
      expect(content.endsWith("\n")).toBe(true); // Trailing newline
    });
  });

  describe("integration: load, merge, save cycle", () => {
    it("should correctly update prices over multiple runs", () => {
      // Run 1: Initial prices
      const run1Prices = [
        { date: "2024-01-01", price: 0.1 },
        { date: "2024-01-02", price: 0.11 },
      ];

      const existing1 = loadPrices(tempFile);
      const { merged: merged1 } = mergePrices(existing1, run1Prices);
      savePrices(merged1, tempFile);

      expect(Object.keys(loadPrices(tempFile)).length).toBe(2);

      // Run 2: Some overlap, some new
      const run2Prices = [
        { date: "2024-01-02", price: 0.99 }, // Overlap - should be ignored
        { date: "2024-01-03", price: 0.12 }, // New
      ];

      const existing2 = loadPrices(tempFile);
      const { merged: merged2, added: added2 } = mergePrices(existing2, run2Prices);
      savePrices(merged2, tempFile);

      const final = loadPrices(tempFile);

      expect(Object.keys(final).length).toBe(3);
      expect(final["2024-01-02"]).toBe(0.11); // Original value preserved
      expect(final["2024-01-03"]).toBe(0.12); // New value added
      expect(added2.length).toBe(1);

      // Run 3: All overlap - no changes
      const run3Prices = [
        { date: "2024-01-01", price: 0.5 },
        { date: "2024-01-02", price: 0.5 },
        { date: "2024-01-03", price: 0.5 },
      ];

      const existing3 = loadPrices(tempFile);
      const { added: added3 } = mergePrices(existing3, run3Prices);

      expect(added3.length).toBe(0);
    });
  });

  describe("Binance API response parsing", () => {
    // Test the parsing logic without making actual API calls
    it("should correctly parse Binance kline response format", () => {
      // Simulated Binance kline response
      const mockKlines = [
        [
          1704067200000, // Open time (2024-01-01 00:00:00 UTC)
          "0.10000000", // Open
          "0.11000000", // High
          "0.09500000", // Low
          "0.10500000", // Close (this is what we want)
          "1000000.00000000", // Volume
          1704153599999, // Close time
          "100000.00000000", // Quote asset volume
          1000, // Number of trades
          "500000.00000000", // Taker buy base asset volume
          "50000.00000000", // Taker buy quote asset volume
          "0", // Ignore
        ],
        [
          1704153600000, // Open time (2024-01-02 00:00:00 UTC)
          "0.10500000", // Open
          "0.12000000", // High
          "0.10000000", // Low
          "0.11500000", // Close
          "2000000.00000000", // Volume
          1704239999999, // Close time
          "200000.00000000",
          2000,
          "1000000.00000000",
          "100000.00000000",
          "0",
        ],
      ];

      // Parse like the actual function does
      const parsed = mockKlines.map((kline) => {
        const [openTime, , , , close] = kline;
        const date = new Date(openTime).toISOString().split("T")[0];
        return { date, price: parseFloat(close) };
      });

      expect(parsed).toEqual([
        { date: "2024-01-01", price: 0.105 },
        { date: "2024-01-02", price: 0.115 },
      ]);
    });

    it("should handle various price formats", () => {
      const testCases = [
        { input: "0.10000000", expected: 0.1 },
        { input: "1.23456789", expected: 1.23456789 },
        { input: "0.00001234", expected: 0.00001234 },
        { input: "123.45", expected: 123.45 },
      ];

      for (const { input, expected } of testCases) {
        expect(parseFloat(input)).toBe(expected);
      }
    });

    it("should correctly convert timestamps to dates", () => {
      const testCases = [
        { timestamp: 1704067200000, expected: "2024-01-01" },
        { timestamp: 1704153600000, expected: "2024-01-02" },
        { timestamp: 1735689600000, expected: "2025-01-01" },
      ];

      for (const { timestamp, expected } of testCases) {
        const date = new Date(timestamp).toISOString().split("T")[0];
        expect(date).toBe(expected);
      }
    });
  });
});

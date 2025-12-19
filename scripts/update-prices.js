/**
 * Fetches latest ROSE/USD prices from Binance and updates the price file.
 * Only adds new dates that don't already exist.
 *
 * Usage:
 *   node scripts/update-prices.js [--dry-run]
 *
 * Options:
 *   --dry-run  Print what would be added without modifying the file
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRICE_FILE = path.join(__dirname, "..", "src", "prices", "rose-usd.json");
const BINANCE_API = "https://api.binance.com/api/v3/klines";
const SYMBOL = "ROSEUSDT";
const DAYS_TO_FETCH = 30;

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch daily prices from Binance API with retry logic.
 * @param {number} limit - Number of days to fetch
 * @param {number} retries - Number of retries on failure
 * @param {number} retryDelay - Delay between retries in ms
 * @returns {Promise<Array<{date: string, price: number}>>}
 */
export async function fetchPricesFromBinance(limit = DAYS_TO_FETCH, retries = 3, retryDelay = 5000) {
  const url = `${BINANCE_API}?symbol=${SYMBOL}&interval=1d&limit=${limit}`;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching prices from Binance (attempt ${attempt}/${retries})...`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("No data returned from Binance API");
      }

      return data.map((kline) => {
        const [openTime, , , , close] = kline;
        const date = new Date(openTime).toISOString().split("T")[0];
        return { date, price: parseFloat(close) };
      });
    } catch (err) {
      lastError = err;
      console.error(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        console.log(`Retrying in ${retryDelay / 1000} seconds...`);
        await sleep(retryDelay);
      }
    }
  }

  throw new Error(`Failed after ${retries} attempts: ${lastError.message}`);
}

/**
 * Load existing prices from the JSON file.
 * @param {string} filePath - Path to the price file
 * @returns {object} - Object mapping dates to prices
 */
export function loadPrices(filePath = PRICE_FILE) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Merge new prices into existing prices, only adding dates that don't exist.
 * @param {object} existing - Existing prices {date: price}
 * @param {Array<{date: string, price: number}>} newPrices - New prices from API
 * @returns {{merged: object, added: Array<{date: string, price: number}>}}
 */
export function mergePrices(existing, newPrices) {
  const merged = { ...existing };
  const added = [];

  for (const { date, price } of newPrices) {
    if (!(date in merged)) {
      merged[date] = price;
      added.push({ date, price });
    }
  }

  return { merged, added };
}

/**
 * Sort prices by date and return as a new object.
 * @param {object} prices - Prices object
 * @returns {object} - Sorted prices object
 */
export function sortPricesByDate(prices) {
  const sortedKeys = Object.keys(prices).sort();
  const sorted = {};
  for (const key of sortedKeys) {
    sorted[key] = prices[key];
  }
  return sorted;
}

/**
 * Save prices to the JSON file.
 * @param {object} prices - Prices object
 * @param {string} filePath - Path to the price file
 */
export function savePrices(prices, filePath = PRICE_FILE) {
  const sorted = sortPricesByDate(prices);
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n");
}

/**
 * Main function to update prices.
 * @param {object} options
 * @param {boolean} options.dryRun - If true, don't write to file
 * @param {string} options.filePath - Path to price file
 * @returns {Promise<{added: Array, total: number}>}
 */
export async function updatePrices(options = {}) {
  const { dryRun = false, filePath = PRICE_FILE } = options;

  // Fetch new prices from Binance
  const newPrices = await fetchPricesFromBinance();
  console.log(`Fetched ${newPrices.length} prices from Binance`);

  // Load existing prices
  const existing = loadPrices(filePath);
  console.log(`Loaded ${Object.keys(existing).length} existing prices`);

  // Merge prices (only add new dates)
  const { merged, added } = mergePrices(existing, newPrices);

  if (added.length === 0) {
    console.log("No new prices to add");
    return { added: [], total: Object.keys(existing).length };
  }

  console.log(`Adding ${added.length} new price(s):`);
  for (const { date, price } of added) {
    console.log(`  ${date}: ${price}`);
  }

  if (!dryRun) {
    savePrices(merged, filePath);
    console.log(`Saved ${Object.keys(merged).length} total prices`);
  } else {
    console.log("(dry run - not saving)");
  }

  return { added, total: Object.keys(merged).length };
}

// CLI entry point
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  const dryRun = process.argv.includes("--dry-run");
  updatePrices({ dryRun })
    .then(({ added, total }) => {
      console.log(`\nDone! Added ${added.length} prices, total: ${total}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}

#!/usr/bin/env node
/**
 * Backfill historical ROSE/USD prices from Binance.
 * This script is meant to be run once to populate the initial price data.
 */

const fs = require('fs');
const path = require('path');

const BINANCE_API = 'https://api.binance.com/api/v3/klines';
const SYMBOL = 'ROSEUSDT';
const INTERVAL = '1d';
const LIMIT = 1000; // Max per request

async function fetchKlines(startTime) {
  const url = `${BINANCE_API}?symbol=${SYMBOL}&interval=${INTERVAL}&startTime=${startTime}&limit=${LIMIT}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }
  return response.json();
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

async function main() {
  console.log('Fetching ROSE/USD historical prices from Binance...');

  const prices = {};
  let startTime = 0; // Start from the beginning
  let totalDays = 0;

  while (true) {
    const klines = await fetchKlines(startTime);

    if (klines.length === 0) {
      break;
    }

    for (const kline of klines) {
      const [openTime, , , , close] = kline;
      const date = formatDate(openTime);
      prices[date] = parseFloat(close);
    }

    totalDays += klines.length;
    console.log(`Fetched ${totalDays} days so far (latest: ${formatDate(klines[klines.length - 1][0])})`);

    if (klines.length < LIMIT) {
      break; // No more data
    }

    // Next batch starts after the last kline's close time
    startTime = klines[klines.length - 1][6] + 1;

    // Small delay to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Sort by date and write to file
  const sortedPrices = Object.keys(prices)
    .sort()
    .reduce((obj, key) => {
      obj[key] = prices[key];
      return obj;
    }, {});

  const outputPath = path.join(__dirname, '..', 'src', 'prices', 'rose-usd.json');
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(sortedPrices, null, 2) + '\n');

  console.log(`\nDone! Wrote ${Object.keys(sortedPrices).length} price entries to ${outputPath}`);
  console.log(`Date range: ${Object.keys(sortedPrices)[0]} to ${Object.keys(sortedPrices).slice(-1)[0]}`);
}

main().catch(console.error);

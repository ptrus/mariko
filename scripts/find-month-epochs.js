/**
 * Find epochs closest to month boundaries for 2024 and 2025
 */

import axios from "axios";

const NEXUS_API = "https://nexus.oasis.io/v1";

async function getEpochTimestamp(epochId) {
  try {
    const epochInfo = await axios.get(`${NEXUS_API}/consensus/epochs/${epochId}`);
    const blockInfo = await axios.get(`${NEXUS_API}/consensus/blocks/${epochInfo.data.start_height}`);
    return new Date(blockInfo.data.timestamp);
  } catch (e) {
    return null;
  }
}

async function findFirstEpochOnOrAfter(targetDate, estimatedEpoch) {
  // Search in a wider range
  for (let e = estimatedEpoch - 50; e <= estimatedEpoch + 100; e++) {
    const ts = await getEpochTimestamp(e);
    if (!ts) continue;
    if (ts >= targetDate) {
      return { epoch: e, timestamp: ts };
    }
  }
  return null;
}

async function main() {
  console.log("Finding month boundary epochs for 2024 and 2025...\n");

  // Known: Jan 1 2024 00:00 UTC is around epoch 28808-28809
  // Roughly 24 epochs per day (1 per hour)

  const dates2024 = [
    { month: 1, target: new Date("2024-01-01T00:00:00Z"), est: 28808 },
    { month: 2, target: new Date("2024-02-01T00:00:00Z"), est: 28808 + 31 * 24 },
    { month: 3, target: new Date("2024-03-01T00:00:00Z"), est: 28808 + 60 * 24 },
    { month: 4, target: new Date("2024-04-01T00:00:00Z"), est: 28808 + 91 * 24 },
    { month: 5, target: new Date("2024-05-01T00:00:00Z"), est: 28808 + 121 * 24 },
    { month: 6, target: new Date("2024-06-01T00:00:00Z"), est: 28808 + 152 * 24 },
    { month: 7, target: new Date("2024-07-01T00:00:00Z"), est: 28808 + 182 * 24 },
    { month: 8, target: new Date("2024-08-01T00:00:00Z"), est: 28808 + 213 * 24 },
    { month: 9, target: new Date("2024-09-01T00:00:00Z"), est: 28808 + 244 * 24 },
    { month: 10, target: new Date("2024-10-01T00:00:00Z"), est: 28808 + 274 * 24 },
    { month: 11, target: new Date("2024-11-01T00:00:00Z"), est: 28808 + 305 * 24 },
    { month: 12, target: new Date("2024-12-01T00:00:00Z"), est: 28808 + 335 * 24 },
    { month: 13, target: new Date("2025-01-01T00:00:00Z"), est: 37689 }, // End of 2024
  ];

  console.log("const MONTH_EPOCHS_2024 = {");
  const results2024 = [];
  for (const d of dates2024) {
    const result = await findFirstEpochOnOrAfter(d.target, d.est);
    if (result) {
      const monthName = d.month <= 12
        ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.month - 1] + " 1"
        : "End (Jan 1 2025)";
      console.log(`  ${d.month}: ${result.epoch}, // ${monthName} - actual: ${result.timestamp.toISOString()}`);
      results2024.push({ month: d.month, epoch: result.epoch, timestamp: result.timestamp });
    } else {
      console.log(`  ${d.month}: null, // Not found`);
    }
  }
  console.log("};");

  // 2025 - start from known Jan 1 2025 epoch
  const startEpoch2025 = 37690;
  const dates2025 = [
    { month: 1, target: new Date("2025-01-01T00:00:00Z"), est: startEpoch2025 },
    { month: 2, target: new Date("2025-02-01T00:00:00Z"), est: startEpoch2025 + 31 * 24 },
    { month: 3, target: new Date("2025-03-01T00:00:00Z"), est: startEpoch2025 + 59 * 24 },
    { month: 4, target: new Date("2025-04-01T00:00:00Z"), est: startEpoch2025 + 90 * 24 },
    { month: 5, target: new Date("2025-05-01T00:00:00Z"), est: startEpoch2025 + 120 * 24 },
    { month: 6, target: new Date("2025-06-01T00:00:00Z"), est: startEpoch2025 + 151 * 24 },
    { month: 7, target: new Date("2025-07-01T00:00:00Z"), est: startEpoch2025 + 181 * 24 },
    { month: 8, target: new Date("2025-08-01T00:00:00Z"), est: startEpoch2025 + 212 * 24 },
    { month: 9, target: new Date("2025-09-01T00:00:00Z"), est: startEpoch2025 + 243 * 24 },
    { month: 10, target: new Date("2025-10-01T00:00:00Z"), est: startEpoch2025 + 273 * 24 },
    { month: 11, target: new Date("2025-11-01T00:00:00Z"), est: startEpoch2025 + 304 * 24 },
    { month: 12, target: new Date("2025-12-01T00:00:00Z"), est: startEpoch2025 + 334 * 24 },
    { month: 13, target: new Date("2026-01-01T00:00:00Z"), est: startEpoch2025 + 365 * 24 }, // End of 2025
  ];

  console.log("\nconst MONTH_EPOCHS_2025 = {");
  for (const d of dates2025) {
    // Skip if target date is in the future
    if (d.target > new Date()) {
      console.log(`  ${d.month}: null, // Future date`);
      continue;
    }
    const result = await findFirstEpochOnOrAfter(d.target, d.est);
    if (result) {
      const monthName = d.month <= 12
        ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.month - 1] + " 1"
        : "End (Jan 1 2026)";
      console.log(`  ${d.month}: ${result.epoch}, // ${monthName} - actual: ${result.timestamp.toISOString()}`);
    } else {
      console.log(`  ${d.month}: null, // Not found`);
    }
  }
  console.log("};");

  // Verify the 2024 results make sense
  console.log("\n// Verification - days between each epoch:");
  for (let i = 1; i < results2024.length; i++) {
    const prev = results2024[i - 1];
    const curr = results2024[i];
    const epochDiff = curr.epoch - prev.epoch;
    const daysDiff = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60 * 24);
    console.log(`//   Month ${prev.month} -> ${curr.month}: ${epochDiff} epochs, ${daysDiff.toFixed(1)} days`);
  }
}

main().catch(console.error);

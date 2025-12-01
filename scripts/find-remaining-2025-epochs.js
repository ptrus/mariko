/**
 * Find remaining month boundary epochs for 2025 (Aug-Dec)
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
  // Search in a much wider range
  for (let e = estimatedEpoch - 100; e <= estimatedEpoch + 200; e++) {
    const ts = await getEpochTimestamp(e);
    if (!ts) continue;
    if (ts >= targetDate) {
      return { epoch: e, timestamp: ts };
    }
  }
  return null;
}

async function main() {
  console.log("Finding remaining 2025 month boundary epochs...\n");

  // We know Jul 1 2025 = epoch 42126
  // Roughly 730-750 epochs per month
  const jul2025 = 42126;

  const dates = [
    { month: 8, target: new Date("2025-08-01T00:00:00Z"), est: jul2025 + 750 },
    { month: 9, target: new Date("2025-09-01T00:00:00Z"), est: jul2025 + 750 * 2 },
    { month: 10, target: new Date("2025-10-01T00:00:00Z"), est: jul2025 + 750 * 3 },
    { month: 11, target: new Date("2025-11-01T00:00:00Z"), est: jul2025 + 750 * 4 },
    { month: 12, target: new Date("2025-12-01T00:00:00Z"), est: jul2025 + 750 * 5 },
  ];

  console.log("// Additional 2025 month epochs:");
  for (const d of dates) {
    const result = await findFirstEpochOnOrAfter(d.target, d.est);
    if (result) {
      const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.month - 1];
      console.log(`  ${d.month}: ${result.epoch}, // ${monthName} 1 2025 (actual: ${result.timestamp.toISOString()})`);
    } else {
      console.log(`  ${d.month}: null, // Not found (target: ${d.target.toISOString()})`);
    }
  }
}

main().catch(console.error);

/**
 * Live integration test for staking rewards
 * Tests the real API with address oasis1qpnzqwj58m48sra4uuvazpqnw0zwlqfvnvjctldl
 *
 * Run with: node scripts/test-staking-rewards.js
 */

import { fetchStakingRewards } from "../src/fetchStakingRewards.js";
import { NEXUS_API } from "../src/constants.js";

const TEST_ADDRESS = "oasis1qpnzqwj58m48sra4uuvazpqnw0zwlqfvnvjctldl";

async function runTest() {
  console.log("=== Live Staking Rewards Test ===\n");
  console.log(`Address: ${TEST_ADDRESS}`);
  console.log(`API: ${NEXUS_API}\n`);

  // Test yearly granularity
  console.log("--- Testing YEARLY granularity (2024) ---");
  const yearlyResults = await fetchStakingRewards(
    NEXUS_API,
    TEST_ADDRESS,
    2024,
    "year",
    (msg) => console.log(`  [Progress] ${msg}`)
  );

  console.log(`\nYearly Results (${yearlyResults.length} rows):`);
  for (const row of yearlyResults) {
    console.log(`  Validator: ${row.validator}`);
    console.log(`    Start: ${row.start_timestamp} (epoch ${row.start_epoch})`);
    console.log(`    End:   ${row.end_timestamp} (epoch ${row.end_epoch})`);
    console.log(`    Shares: ${row.shares}`);
    console.log(`    Share Price: ${row.share_price} ROSE`);
    console.log(`    Delegation Value: ${row.delegation_value} ROSE`);
    console.log(`    Rewards: ${row.rewards} ROSE`);
    console.log();
  }

  // Test monthly granularity
  console.log("\n--- Testing MONTHLY granularity (2024) ---");
  const monthlyResults = await fetchStakingRewards(
    NEXUS_API,
    TEST_ADDRESS,
    2024,
    "month",
    (msg) => console.log(`  [Progress] ${msg}`)
  );

  console.log(`\nMonthly Results (${monthlyResults.length} rows):`);

  // Group by validator
  const byValidator = {};
  for (const row of monthlyResults) {
    if (!byValidator[row.validator]) byValidator[row.validator] = [];
    byValidator[row.validator].push(row);
  }

  for (const [validator, rows] of Object.entries(byValidator)) {
    console.log(`\n  Validator: ${validator}`);
    let totalRewards = 0;
    for (const row of rows) {
      const rewards = parseFloat(row.rewards);
      totalRewards += rewards;
      console.log(`    ${row.end_timestamp} (epoch ${row.end_epoch}): ${row.rewards} ROSE`);
    }
    console.log(`    --- Monthly Sum: ${totalRewards.toFixed(9)} ROSE`);
  }

  // Compare yearly vs monthly sum
  console.log("\n=== Validation ===");
  const yearlyRewards = yearlyResults.reduce((sum, r) => sum + parseFloat(r.rewards), 0);
  const monthlySum = monthlyResults.reduce((sum, r) => sum + parseFloat(r.rewards), 0);

  console.log(`Yearly total rewards: ${yearlyRewards.toFixed(9)} ROSE`);
  console.log(`Monthly sum rewards:  ${monthlySum.toFixed(9)} ROSE`);
  console.log(`Difference: ${Math.abs(yearlyRewards - monthlySum).toFixed(9)} ROSE`);

  const tolerance = yearlyRewards * 0.05;
  if (Math.abs(yearlyRewards - monthlySum) < tolerance) {
    console.log("✅ PASS: Monthly sum matches yearly total (within 5% tolerance)");
  } else {
    console.log("❌ FAIL: Monthly sum does NOT match yearly total");
  }

  // Check rewards != delegation_value (bug check)
  for (const row of yearlyResults) {
    if (row.rewards === row.delegation_value) {
      console.log(`❌ FAIL: rewards equals delegation_value for ${row.validator} (likely bug)`);
    } else {
      console.log(`✅ PASS: rewards (${row.rewards}) != delegation_value (${row.delegation_value})`);
    }
  }
}

runTest().catch(console.error);

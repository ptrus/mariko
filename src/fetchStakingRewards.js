import axios from "axios";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches staking rewards data for a given address and year.
 *
 * Algorithm:
 * 1. Find epoch range for the year
 * 2. Fetch initial delegation state at the start of the year
 * 3. Fetch delegation events (add_escrow, debonding_start) for the year
 * 4. Identify all validators the user delegated to
 * 5. Fetch validator history (share values per epoch) for each validator
 * 6. Build time-sliced data (per epoch, day, week, or month)
 * 7. Calculate earned rewards using the formula:
 *    earned = (num_shares_end × share_value_end) - (num_shares_start × share_value_start)
 *           - Σ(delegations × share_value_at_delegation)
 *           + Σ(undelegations × share_value_at_undelegation)
 */

/**
 * Fetch all events with pagination
 */
const fetchAllEvents = async (NEXUS_API, address, type) => {
  let allEvents = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const response = await axios.get(`${NEXUS_API}/consensus/events`, {
      params: {
        rel: address,
        type: type,
        limit: limit,
        offset: offset,
      },
    });

    const events = response.data.events || [];
    allEvents = [...allEvents, ...events];

    // Fix pagination: check if we got a full page and there might be more
    if (
      events.length === limit &&
      (response.data.is_total_count_clipped === true ||
        response.data.total_count > offset + events.length)
    ) {
      offset += events.length;
      await sleep(100);
    } else {
      break;
    }
  }

  return allEvents;
};

/**
 * Fetch validator history for a given epoch range
 */
const fetchValidatorHistory = async (NEXUS_API, validatorAddress, fromEpoch, toEpoch) => {
  let allHistory = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const response = await axios.get(
      `${NEXUS_API}/consensus/validators/${validatorAddress}/history`,
      {
        params: {
          from: fromEpoch,
          to: toEpoch,
          limit: limit,
          offset: offset,
        },
      }
    );

    const history = response.data.history || [];
    allHistory = [...allHistory, ...history];

    if (
      history.length === limit &&
      (response.data.is_total_count_clipped === true ||
        response.data.total_count > offset + history.length)
    ) {
      offset += history.length;
      await sleep(100);
    } else {
      break;
    }
  }

  // Sort by epoch ascending for easier lookup
  allHistory.sort((a, b) => a.epoch - b.epoch);
  return allHistory;
};

/**
 * Fetch current delegations for an address
 */
const fetchDelegations = async (NEXUS_API, address) => {
  let allDelegations = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const response = await axios.get(
      `${NEXUS_API}/consensus/accounts/${address}/delegations`,
      {
        params: {
          limit: limit,
          offset: offset,
        },
      }
    );

    const delegations = response.data.delegations || [];
    allDelegations = [...allDelegations, ...delegations];

    if (
      delegations.length === limit &&
      (response.data.is_total_count_clipped === true ||
        response.data.total_count > offset + delegations.length)
    ) {
      offset += delegations.length;
      await sleep(100);
    } else {
      break;
    }
  }

  return allDelegations;
};

/**
 * Fetch epoch info to get start_height for timestamp lookups
 */
const fetchEpochInfo = async (NEXUS_API, epochId) => {
  const response = await axios.get(`${NEXUS_API}/consensus/epochs/${epochId}`);
  return response.data;
};

/**
 * Fetch block to get timestamp
 */
const fetchBlockTimestamp = async (NEXUS_API, height) => {
  const response = await axios.get(`${NEXUS_API}/consensus/blocks/${height}`);
  return response.data.timestamp;
};

/**
 * Find epochs for a given year using binary search
 */
const findEpochsForYear = async (NEXUS_API, year, setProgress) => {
  setProgress(`Finding epochs for ${year}...`);

  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${parseInt(year) + 1}-01-01T00:00:00Z`).getTime();

  // Get the latest epoch
  const latestResponse = await axios.get(`${NEXUS_API}/consensus/epochs`, {
    params: { limit: 1 },
  });
  const latestEpoch = latestResponse.data.epochs[0].id;

  // Binary search for start epoch (first epoch >= yearStart)
  let low = 1;
  let high = latestEpoch;
  let startEpoch = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      const epochInfo = await fetchEpochInfo(NEXUS_API, mid);
      const blockTimestamp = await fetchBlockTimestamp(NEXUS_API, epochInfo.start_height);
      const epochTime = new Date(blockTimestamp).getTime();

      if (epochTime < yearStart) {
        low = mid + 1;
      } else {
        startEpoch = mid;
        high = mid - 1;
      }
    } catch {
      low = mid + 1;
    }
    await sleep(50);
  }

  // Binary search for end epoch (last epoch < yearEnd)
  low = startEpoch || 1;
  high = latestEpoch;
  let endEpoch = latestEpoch;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      const epochInfo = await fetchEpochInfo(NEXUS_API, mid);
      const blockTimestamp = await fetchBlockTimestamp(NEXUS_API, epochInfo.start_height);
      const epochTime = new Date(blockTimestamp).getTime();

      if (epochTime < yearEnd) {
        endEpoch = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } catch {
      high = mid - 1;
    }
    await sleep(50);
  }

  return { startEpoch, endEpoch };
};

/**
 * Calculate share value from validator history entry
 * share_value = active_balance / active_shares
 * Returns scaled by 1e18 for precision
 */
const calculateShareValue = (historyEntry) => {
  const balance = BigInt(historyEntry.active_balance || "0");
  const shares = BigInt(historyEntry.active_shares || "1");
  if (shares === 0n) return 0n;
  return (balance * BigInt(1e18)) / shares;
};

/**
 * Find the closest history entry for a given epoch (at or before)
 */
const findHistoryEntryForEpoch = (history, targetEpoch) => {
  if (!history || history.length === 0) return null;

  // Binary search for the closest epoch <= targetEpoch
  let low = 0;
  let high = history.length - 1;
  let result = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (history[mid].epoch <= targetEpoch) {
      result = history[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
};

/**
 * Main function to fetch staking rewards
 */
export const fetchStakingRewards = async (
  NEXUS_API,
  address,
  year,
  granularity,
  setProgress
) => {
  try {
    // Step 1: Find epoch range for the year
    const { startEpoch, endEpoch } = await findEpochsForYear(NEXUS_API, year, setProgress);

    if (!startEpoch) {
      setProgress("Could not determine epoch range for this year.");
      return [];
    }

    setProgress(`Epoch range: ${startEpoch} - ${endEpoch}. Fetching delegation events...`);

    // Step 2: Fetch all delegation events
    const addEscrowEvents = await fetchAllEvents(
      NEXUS_API,
      address,
      "staking.escrow.add"
    );

    const debondingEvents = await fetchAllEvents(
      NEXUS_API,
      address,
      "staking.escrow.debonding_start"
    );

    // Step 3: Filter events by owner and by epoch range
    const relevantAddEvents = addEscrowEvents.filter((ev) => {
      if (ev.body.owner.toLowerCase() !== address.toLowerCase()) return false;
      const eventEpoch = ev.body.epoch || 0;
      return eventEpoch >= startEpoch && eventEpoch <= endEpoch;
    });

    const relevantDebondEvents = debondingEvents.filter((ev) => {
      if (ev.body.owner.toLowerCase() !== address.toLowerCase()) return false;
      const eventEpoch = ev.body.epoch || 0;
      return eventEpoch >= startEpoch && eventEpoch <= endEpoch;
    });

    // Also get events BEFORE the year to compute initial state
    const priorAddEvents = addEscrowEvents.filter((ev) => {
      if (ev.body.owner.toLowerCase() !== address.toLowerCase()) return false;
      const eventEpoch = ev.body.epoch || 0;
      return eventEpoch < startEpoch;
    });

    const priorDebondEvents = debondingEvents.filter((ev) => {
      if (ev.body.owner.toLowerCase() !== address.toLowerCase()) return false;
      const eventEpoch = ev.body.epoch || 0;
      return eventEpoch < startEpoch;
    });

    setProgress(`Found ${relevantAddEvents.length} delegations and ${relevantDebondEvents.length} undelegations in ${year}`);

    // Step 4: Find all unique validators (from all events + current delegations)
    const validatorSet = new Set();

    for (const ev of [...addEscrowEvents, ...debondingEvents]) {
      if (ev.body.owner.toLowerCase() === address.toLowerCase()) {
        validatorSet.add(ev.body.escrow.toLowerCase());
      }
    }

    // Also fetch current delegations to catch validators we're still delegated to
    setProgress("Fetching current delegations...");
    const currentDelegations = await fetchDelegations(NEXUS_API, address);
    for (const del of currentDelegations) {
      if (del.validator) {
        validatorSet.add(del.validator.toLowerCase());
      }
    }

    const validators = Array.from(validatorSet);

    if (validators.length === 0) {
      setProgress("No staking activity found for this address.");
      return [];
    }

    setProgress(`Found ${validators.length} validators. Fetching validator histories...`);

    // Step 5: Fetch validator histories
    const validatorHistories = {};
    for (let i = 0; i < validators.length; i++) {
      const validator = validators[i];
      setProgress(`Fetching history for validator ${i + 1}/${validators.length}...`);

      // Fetch history for slightly before start to get initial share values
      const history = await fetchValidatorHistory(
        NEXUS_API,
        validator,
        Math.max(1, startEpoch - 100),
        endEpoch
      );
      validatorHistories[validator] = history;
      await sleep(100);
    }

    // Step 6: Compute initial shares per validator from prior events
    setProgress("Computing initial state...");
    const sharesPerValidator = {};
    for (const validator of validators) {
      sharesPerValidator[validator] = 0n;
    }

    // Apply all prior events to get initial state at startEpoch
    for (const ev of priorAddEvents) {
      const validator = ev.body.escrow.toLowerCase();
      const shares = BigInt(ev.body.new_shares || "0");
      sharesPerValidator[validator] = (sharesPerValidator[validator] || 0n) + shares;
    }

    for (const ev of priorDebondEvents) {
      const validator = ev.body.escrow.toLowerCase();
      const shares = BigInt(ev.body.debonding_shares || "0");
      sharesPerValidator[validator] = (sharesPerValidator[validator] || 0n) - shares;
      if (sharesPerValidator[validator] < 0n) {
        sharesPerValidator[validator] = 0n;
      }
    }

    // Step 7: Build epoch -> events map for the year
    const eventsByEpoch = {};

    for (const ev of relevantAddEvents) {
      const epoch = ev.body.epoch || startEpoch;
      if (!eventsByEpoch[epoch]) eventsByEpoch[epoch] = [];
      eventsByEpoch[epoch].push({
        type: "add",
        validator: ev.body.escrow.toLowerCase(),
        shares: BigInt(ev.body.new_shares || "0"),
        amount: BigInt(ev.body.amount || "0"),
      });
    }

    for (const ev of relevantDebondEvents) {
      const epoch = ev.body.epoch || startEpoch;
      if (!eventsByEpoch[epoch]) eventsByEpoch[epoch] = [];
      eventsByEpoch[epoch].push({
        type: "debond",
        validator: ev.body.escrow.toLowerCase(),
        shares: BigInt(ev.body.debonding_shares || "0"),
        amount: BigInt(ev.body.amount || "0"),
      });
    }

    // Step 8: Determine which epochs to sample based on granularity
    setProgress("Building time slices...");
    let epochsToProcess = [];
    const totalEpochs = endEpoch - startEpoch + 1;

    if (granularity === "epoch") {
      for (let e = startEpoch; e <= endEpoch; e++) {
        epochsToProcess.push(e);
      }
    } else {
      let targetSamples;
      if (granularity === "day") targetSamples = 365;
      else if (granularity === "week") targetSamples = 52;
      else targetSamples = 12; // month

      const step = Math.max(1, Math.floor(totalEpochs / targetSamples));
      for (let e = startEpoch; e <= endEpoch; e += step) {
        epochsToProcess.push(e);
      }
      if (epochsToProcess[epochsToProcess.length - 1] !== endEpoch) {
        epochsToProcess.push(endEpoch);
      }
    }

    // Step 9: Fetch timestamps for sampled epochs
    setProgress("Fetching epoch timestamps...");
    const epochTimestamps = {};

    for (let i = 0; i < epochsToProcess.length; i++) {
      const epoch = epochsToProcess[i];
      if (i % 10 === 0) {
        setProgress(`Fetching timestamps... ${i + 1}/${epochsToProcess.length}`);
      }
      try {
        const epochInfo = await fetchEpochInfo(NEXUS_API, epoch);
        const timestamp = await fetchBlockTimestamp(NEXUS_API, epochInfo.start_height);
        epochTimestamps[epoch] = timestamp;
      } catch {
        // Skip epochs that don't exist
      }
      await sleep(50);
    }

    // Step 10: Build results with proper earned calculation
    setProgress("Calculating rewards...");
    const results = [];

    // Track state for each validator
    const validatorState = {};
    for (const validator of validators) {
      validatorState[validator] = {
        shares: sharesPerValidator[validator],
        prevTotalValue: 0n,
        // Track delegation/undelegation value adjustments within each period
        periodDelegationValue: 0n,
        periodUndelegationValue: 0n,
      };
    }

    let lastProcessedEpoch = startEpoch - 1;

    for (let i = 0; i < epochsToProcess.length; i++) {
      const epoch = epochsToProcess[i];
      const timestamp = epochTimestamps[epoch];

      if (!timestamp) continue;

      // Apply events from lastProcessedEpoch+1 to current epoch
      for (let e = lastProcessedEpoch + 1; e <= epoch; e++) {
        const events = eventsByEpoch[e] || [];
        for (const ev of events) {
          const state = validatorState[ev.validator];
          if (!state) continue;

          // Get share value at event time
          const history = validatorHistories[ev.validator] || [];
          const historyEntry = findHistoryEntryForEpoch(history, e);
          const shareValueAtEvent = historyEntry ? calculateShareValue(historyEntry) : 0n;

          if (ev.type === "add") {
            state.shares += ev.shares;
            // Track the value added (principal, not reward)
            const delegationValue = (ev.shares * shareValueAtEvent) / BigInt(1e18);
            state.periodDelegationValue += delegationValue;
          } else if (ev.type === "debond") {
            state.shares -= ev.shares;
            if (state.shares < 0n) state.shares = 0n;
            // Track the value removed
            const undelegationValue = (ev.shares * shareValueAtEvent) / BigInt(1e18);
            state.periodUndelegationValue += undelegationValue;
          }
        }
      }

      lastProcessedEpoch = epoch;

      // Output a row for each validator with shares
      for (const validator of validators) {
        const state = validatorState[validator];
        if (state.shares === 0n && state.prevTotalValue === 0n) continue;

        const history = validatorHistories[validator] || [];
        const historyEntry = findHistoryEntryForEpoch(history, epoch);

        if (!historyEntry) continue;

        const shareValueScaled = calculateShareValue(historyEntry);
        const totalValue = (state.shares * shareValueScaled) / BigInt(1e18);

        // Calculate earned using the proper formula:
        // earned = total_value_now - total_value_prev
        //        - delegations_principal + undelegations_principal
        // This isolates actual rewards from principal changes
        const earned = totalValue - state.prevTotalValue
          - state.periodDelegationValue
          + state.periodUndelegationValue;

        results.push({
          timestamp: timestamp,
          epoch: epoch,
          shares_address: validator,
          num_shares: state.shares.toString(),
          share_value: shareValueScaled.toString(),
          total_value: totalValue.toString(),
          earned: earned.toString(),
        });

        // Update state for next period
        state.prevTotalValue = totalValue;
        state.periodDelegationValue = 0n;
        state.periodUndelegationValue = 0n;
      }
    }

    setProgress(`Generated ${results.length} rows. Ready for download!`);
    return results;

  } catch (error) {
    console.error("Error fetching staking rewards:", error);
    throw error;
  }
};

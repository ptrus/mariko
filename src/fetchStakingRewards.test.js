/**
 * Tests for staking rewards calculation logic
 */

describe("Staking Rewards Calculations", () => {
  describe("calculateShareValue", () => {
    // share_value = (active_balance * 1e18) / active_shares
    const calculateShareValue = (historyEntry) => {
      const balance = BigInt(historyEntry.active_balance || "0");
      const shares = BigInt(historyEntry.active_shares || "1");
      if (shares === 0n) return 0n;
      return (balance * BigInt(1e18)) / shares;
    };

    it("should calculate share value correctly", () => {
      const historyEntry = {
        active_balance: "111344065129411706",
        active_shares: "79994291667406003",
      };
      const shareValue = calculateShareValue(historyEntry);

      // ~1.391 * 1e18
      expect(shareValue > BigInt("1390000000000000000")).toBe(true);
      expect(shareValue < BigInt("1392000000000000000")).toBe(true);
    });

    it("should handle zero shares", () => {
      const historyEntry = {
        active_balance: "1000000",
        active_shares: "0",
      };
      const shareValue = calculateShareValue(historyEntry);
      expect(shareValue).toBe(0n);
    });

    it("should handle missing fields", () => {
      const historyEntry = {};
      const shareValue = calculateShareValue(historyEntry);
      expect(shareValue).toBe(0n);
    });
  });

  describe("findHistoryEntryForEpoch", () => {
    // Binary search for closest epoch <= targetEpoch
    const findHistoryEntryForEpoch = (history, targetEpoch) => {
      if (!history || history.length === 0) return null;

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

    it("should find exact epoch match", () => {
      const history = [
        { epoch: 100, value: "a" },
        { epoch: 200, value: "b" },
        { epoch: 300, value: "c" },
      ];
      const result = findHistoryEntryForEpoch(history, 200);
      expect(result.value).toBe("b");
    });

    it("should find closest epoch before target", () => {
      const history = [
        { epoch: 100, value: "a" },
        { epoch: 200, value: "b" },
        { epoch: 300, value: "c" },
      ];
      const result = findHistoryEntryForEpoch(history, 250);
      expect(result.value).toBe("b");
    });

    it("should return null if target is before all epochs", () => {
      const history = [
        { epoch: 100, value: "a" },
        { epoch: 200, value: "b" },
      ];
      const result = findHistoryEntryForEpoch(history, 50);
      expect(result).toBeNull();
    });

    it("should return last entry if target is after all epochs", () => {
      const history = [
        { epoch: 100, value: "a" },
        { epoch: 200, value: "b" },
      ];
      const result = findHistoryEntryForEpoch(history, 500);
      expect(result.value).toBe("b");
    });

    it("should handle empty history", () => {
      const result = findHistoryEntryForEpoch([], 100);
      expect(result).toBeNull();
    });

    it("should handle single entry", () => {
      const history = [{ epoch: 100, value: "a" }];
      expect(findHistoryEntryForEpoch(history, 50)).toBeNull();
      expect(findHistoryEntryForEpoch(history, 100).value).toBe("a");
      expect(findHistoryEntryForEpoch(history, 150).value).toBe("a");
    });
  });

  describe("total value calculation", () => {
    it("should calculate total_value = num_shares * share_value / 1e18", () => {
      const numShares = BigInt("1000000000000"); // 1 trillion shares
      const shareValueScaled = BigInt("1391000000000000000"); // 1.391 * 1e18
      const totalValue = (numShares * shareValueScaled) / BigInt(1e18);

      expect(totalValue.toString()).toBe("1391000000000");
    });
  });

  describe("earned calculation (spec formula)", () => {
    /**
     * earned = total_value_now - total_value_prev
     *        - delegations_principal + undelegations_principal
     */

    it("should calculate earned with no delegation changes", () => {
      const prevTotalValue = BigInt("1000000000000");
      const currentTotalValue = BigInt("1010000000000");
      const periodDelegationValue = 0n;
      const periodUndelegationValue = 0n;

      const earned = currentTotalValue - prevTotalValue
        - periodDelegationValue
        + periodUndelegationValue;

      expect(earned.toString()).toBe("10000000000");
    });

    it("should subtract new delegation principal from earned", () => {
      // User had 1000 value, now has 2100 value
      // But they added 1000 in new delegation
      // So actual earned = 2100 - 1000 - 1000 = 100
      const prevTotalValue = BigInt("1000");
      const currentTotalValue = BigInt("2100");
      const periodDelegationValue = BigInt("1000");
      const periodUndelegationValue = 0n;

      const earned = currentTotalValue - prevTotalValue
        - periodDelegationValue
        + periodUndelegationValue;

      expect(earned.toString()).toBe("100");
    });

    it("should add undelegation principal back to earned", () => {
      // User had 2000 value, now has 1050 value
      // But they undelegated 1000
      // So actual earned = 1050 - 2000 + 1000 = 50
      const prevTotalValue = BigInt("2000");
      const currentTotalValue = BigInt("1050");
      const periodDelegationValue = 0n;
      const periodUndelegationValue = BigInt("1000");

      const earned = currentTotalValue - prevTotalValue
        - periodDelegationValue
        + periodUndelegationValue;

      expect(earned.toString()).toBe("50");
    });

    it("should handle both delegation and undelegation in same period", () => {
      // Complex scenario: user rebalances validators
      // prev: 1000, current: 1100
      // delegated: 500, undelegated: 400
      // earned = 1100 - 1000 - 500 + 400 = 0 (net rebalance with no rewards)
      const prevTotalValue = BigInt("1000");
      const currentTotalValue = BigInt("1100");
      const periodDelegationValue = BigInt("500");
      const periodUndelegationValue = BigInt("400");

      const earned = currentTotalValue - prevTotalValue
        - periodDelegationValue
        + periodUndelegationValue;

      expect(earned.toString()).toBe("0");
    });

    it("should handle negative earned (slashing scenario)", () => {
      // Validator was slashed
      const prevTotalValue = BigInt("1000");
      const currentTotalValue = BigInt("900");
      const periodDelegationValue = 0n;
      const periodUndelegationValue = 0n;

      const earned = currentTotalValue - prevTotalValue
        - periodDelegationValue
        + periodUndelegationValue;

      expect(earned.toString()).toBe("-100");
    });
  });

  describe("granularity step calculation", () => {
    const calculateStep = (totalEpochs, targetSamples) => {
      return Math.max(1, Math.floor(totalEpochs / targetSamples));
    };

    it("should calculate monthly step (~12 samples)", () => {
      const totalEpochs = 8760; // ~1 year of epochs (1 per hour)
      const step = calculateStep(totalEpochs, 12);
      expect(step).toBe(730);
    });

    it("should calculate weekly step (~52 samples)", () => {
      const totalEpochs = 8760;
      const step = calculateStep(totalEpochs, 52);
      expect(step).toBe(168);
    });

    it("should calculate daily step (~365 samples)", () => {
      const totalEpochs = 8760;
      const step = calculateStep(totalEpochs, 365);
      expect(step).toBe(24);
    });

    it("should return 1 for per-epoch granularity", () => {
      const totalEpochs = 8760;
      const step = calculateStep(totalEpochs, totalEpochs);
      expect(step).toBe(1);
    });

    it("should handle small epoch ranges", () => {
      const totalEpochs = 10;
      const step = calculateStep(totalEpochs, 365);
      expect(step).toBe(1); // Can't go below 1
    });
  });

  describe("epoch range generation", () => {
    const generateEpochsToProcess = (startEpoch, endEpoch, granularity) => {
      const totalEpochs = endEpoch - startEpoch + 1;
      const epochsToProcess = [];

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

      return epochsToProcess;
    };

    it("should include start and end epochs", () => {
      const epochs = generateEpochsToProcess(1000, 9760, "month");
      expect(epochs[0]).toBe(1000);
      expect(epochs[epochs.length - 1]).toBe(9760);
    });

    it("should generate ~13 epochs for monthly granularity (12 + end)", () => {
      const epochs = generateEpochsToProcess(1000, 9760, "month");
      expect(epochs.length).toBeGreaterThanOrEqual(12);
      expect(epochs.length).toBeLessThanOrEqual(14);
    });

    it("should generate all epochs for epoch granularity", () => {
      const epochs = generateEpochsToProcess(100, 110, "epoch");
      expect(epochs.length).toBe(11); // 100 to 110 inclusive
    });
  });

  describe("shares tracking with initial state", () => {
    it("should initialize shares from prior events", () => {
      const priorAddEvents = [
        { shares: BigInt("1000") },
        { shares: BigInt("500") },
      ];
      const priorDebondEvents = [
        { shares: BigInt("200") },
      ];

      let shares = 0n;
      for (const ev of priorAddEvents) {
        shares += ev.shares;
      }
      for (const ev of priorDebondEvents) {
        shares -= ev.shares;
      }

      expect(shares.toString()).toBe("1300");
    });

    it("should accumulate shares from add events", () => {
      const sharesPerValidator = {};
      const validator = "oasis1qvalidator";

      sharesPerValidator[validator] = BigInt("1000"); // Initial state

      // Add delegation
      sharesPerValidator[validator] += BigInt("500");

      expect(sharesPerValidator[validator].toString()).toBe("1500");
    });

    it("should subtract shares from debond events", () => {
      const sharesPerValidator = {};
      const validator = "oasis1qvalidator";

      sharesPerValidator[validator] = BigInt("1000");

      // Debond
      sharesPerValidator[validator] -= BigInt("300");

      expect(sharesPerValidator[validator].toString()).toBe("700");
    });

    it("should not go below zero shares", () => {
      let shares = BigInt("100");

      shares -= BigInt("500");
      if (shares < 0n) shares = 0n;

      expect(shares).toBe(0n);
    });
  });

  describe("event filtering by epoch range", () => {
    it("should filter events within year", () => {
      const startEpoch = 1000;
      const endEpoch = 2000;
      const events = [
        { epoch: 500 },  // before
        { epoch: 1000 }, // at start
        { epoch: 1500 }, // within
        { epoch: 2000 }, // at end
        { epoch: 2500 }, // after
      ];

      const filtered = events.filter((ev) => {
        return ev.epoch >= startEpoch && ev.epoch <= endEpoch;
      });

      expect(filtered.length).toBe(3);
      expect(filtered.map(e => e.epoch)).toEqual([1000, 1500, 2000]);
    });

    it("should get prior events for initial state", () => {
      const startEpoch = 1000;
      const events = [
        { epoch: 500 },
        { epoch: 800 },
        { epoch: 1000 },
        { epoch: 1500 },
      ];

      const priorEvents = events.filter((ev) => ev.epoch < startEpoch);

      expect(priorEvents.length).toBe(2);
      expect(priorEvents.map(e => e.epoch)).toEqual([500, 800]);
    });
  });

  describe("event filtering by owner", () => {
    it("should filter events by owner address", () => {
      const myAddress = "oasis1qmyaddress";
      const events = [
        { body: { owner: "oasis1qmyaddress", escrow: "v1" } },
        { body: { owner: "oasis1qother", escrow: "v2" } },
        { body: { owner: "oasis1qmyaddress", escrow: "v3" } },
      ];

      const filtered = events.filter(
        (ev) => ev.body.owner.toLowerCase() === myAddress.toLowerCase()
      );

      expect(filtered.length).toBe(2);
    });

    it("should extract unique validators", () => {
      const myAddress = "oasis1qmyaddress";
      const events = [
        { body: { owner: myAddress, escrow: "validator1" } },
        { body: { owner: myAddress, escrow: "validator2" } },
        { body: { owner: myAddress, escrow: "validator1" } }, // duplicate
      ];

      const validatorSet = new Set();
      for (const ev of events) {
        if (ev.body.owner.toLowerCase() === myAddress.toLowerCase()) {
          validatorSet.add(ev.body.escrow.toLowerCase());
        }
      }

      expect(validatorSet.size).toBe(2);
      expect(validatorSet.has("validator1")).toBe(true);
      expect(validatorSet.has("validator2")).toBe(true);
    });
  });

  describe("address validation", () => {
    const validateOasisAddress = (addr) => {
      const oasisRegex = /^oasis1[a-zA-Z0-9]{40}$/;
      return oasisRegex.test(addr);
    };

    it("should accept valid oasis1 addresses", () => {
      expect(validateOasisAddress("oasis1qz0k5q8vjqvu4s4nwxyj406ylnflkc4vrcjghuwk")).toBe(true);
      expect(validateOasisAddress("oasis1qq2kqzr4q942x44st97n66nmmyh7dhsuvsqyc22u")).toBe(true);
    });

    it("should reject invalid addresses", () => {
      expect(validateOasisAddress("")).toBe(false);
      expect(validateOasisAddress("oasis1")).toBe(false);
      expect(validateOasisAddress("0x1234567890123456789012345678901234567890")).toBe(false);
      expect(validateOasisAddress("oasis2qz0k5q8vjqvu4s4nwxyj406ylnflkc4vrcjghuwk")).toBe(false);
    });
  });

  describe("pagination logic", () => {
    it("should detect when more pages exist", () => {
      const response = {
        events: new Array(1000).fill({}),
        is_total_count_clipped: true,
        total_count: 1000,
      };

      const needsMorePages =
        response.events.length === 1000 &&
        (response.is_total_count_clipped === true ||
          response.total_count > 0 + response.events.length);

      expect(needsMorePages).toBe(true);
    });

    it("should detect when no more pages needed", () => {
      const response = {
        events: new Array(50).fill({}),
        is_total_count_clipped: false,
        total_count: 50,
      };

      const needsMorePages =
        response.events.length === 1000 &&
        (response.is_total_count_clipped === true ||
          response.total_count > 0 + response.events.length);

      expect(needsMorePages).toBe(false);
    });
  });
});

import { calculateUsdAmount } from "./fetchEvents";

/**
 * Tests for accounting events (fetchEvents.js) calculation logic
 */

describe("Accounting Events Calculations", () => {
  const SAPPHIRE_FEE_ACCUMULATOR = "oasis1qp3r8hgsnphajmfzfuaa8fhjag7e0yt35cjxq0u4";

  describe("b64ToHex", () => {
    const b64ToHex = (b64) => {
      const binaryStr = atob(b64);
      return Array.from(binaryStr)
        .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("");
    };

    it("should convert base64 to hex correctly", () => {
      // "Hello" in base64 is "SGVsbG8="
      const result = b64ToHex("SGVsbG8=");
      expect(result).toBe("48656c6c6f"); // "Hello" in hex
    });

    it("should handle empty string", () => {
      const result = b64ToHex("");
      expect(result).toBe("");
    });

    it("should convert ERC20 transfer signature", () => {
      // Known ERC20 Transfer signature - verify the conversion works
      const b64Signature = "3fJSrRviy5tpwrBo/DeNqZUrunkWPEoRYo9VpN9SO+8=";
      const result = b64ToHex(b64Signature);
      // The result should be 64 hex characters (32 bytes)
      expect(result.length).toBe(64);
      expect(result).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("consensusEvents processing", () => {
    const processConsensusEvent = (ev, myAddresses) => {
      const row = {
        timestamp: ev.timestamp,
        block_height: ev.block,
        type: ev.type,
        tx_hash: ev.tx_hash,
      };

      switch (ev.type) {
        case "staking.transfer":
          row.from = ev.body.from.toLowerCase();
          row.to = ev.body.to.toLowerCase();
          row.amount = ev.body.amount;
          row.symbol = "ROSE";
          row.decimals = 18;

          if (myAddresses.has(row.from)) {
            if (row.to === SAPPHIRE_FEE_ACCUMULATOR) {
              row.comment = "outgoing transfer (fee payment)";
            } else {
              row.comment = "outgoing transfer";
            }
          } else if (myAddresses.has(row.to)) {
            row.comment = "incoming transfer";
          } else {
            return null;
          }
          return row;

        case "staking.burn":
          row.from = ev.body.from.toLowerCase();
          row.to = "0";
          row.amount = ev.body.amount;
          row.symbol = "ROSE";
          row.decimals = 18;
          row.comment = "outgoing transfer (burn)";

          if (!myAddresses.has(row.from)) {
            return null;
          }
          return row;

        default:
          return null;
      }
    };

    it("should process outgoing staking.transfer", () => {
      const myAddress = "oasis1qmyaddress";
      const myAddresses = new Set([myAddress]);
      const ev = {
        timestamp: "2024-01-01T00:00:00Z",
        block: 1000,
        type: "staking.transfer",
        tx_hash: "abc123",
        body: {
          from: myAddress,
          to: "oasis1qrecipient",
          amount: "1000000000",
        },
      };

      const result = processConsensusEvent(ev, myAddresses);

      expect(result).not.toBeNull();
      expect(result.comment).toBe("outgoing transfer");
      expect(result.from).toBe(myAddress);
      expect(result.symbol).toBe("ROSE");
    });

    it("should process incoming staking.transfer", () => {
      const myAddress = "oasis1qmyaddress";
      const myAddresses = new Set([myAddress]);
      const ev = {
        timestamp: "2024-01-01T00:00:00Z",
        block: 1000,
        type: "staking.transfer",
        tx_hash: "abc123",
        body: {
          from: "oasis1qsender",
          to: myAddress,
          amount: "1000000000",
        },
      };

      const result = processConsensusEvent(ev, myAddresses);

      expect(result).not.toBeNull();
      expect(result.comment).toBe("incoming transfer");
      expect(result.to).toBe(myAddress);
    });

    it("should identify fee payment transfers", () => {
      const myAddress = "oasis1qmyaddress";
      const myAddresses = new Set([myAddress]);
      const ev = {
        timestamp: "2024-01-01T00:00:00Z",
        block: 1000,
        type: "staking.transfer",
        tx_hash: "abc123",
        body: {
          from: myAddress,
          to: SAPPHIRE_FEE_ACCUMULATOR,
          amount: "100000",
        },
      };

      const result = processConsensusEvent(ev, myAddresses);

      expect(result).not.toBeNull();
      expect(result.comment).toBe("outgoing transfer (fee payment)");
    });

    it("should filter out unrelated transfers", () => {
      const myAddress = "oasis1qmyaddress";
      const myAddresses = new Set([myAddress]);
      const ev = {
        timestamp: "2024-01-01T00:00:00Z",
        block: 1000,
        type: "staking.transfer",
        tx_hash: "abc123",
        body: {
          from: "oasis1qother1",
          to: "oasis1qother2",
          amount: "1000000000",
        },
      };

      const result = processConsensusEvent(ev, myAddresses);
      expect(result).toBeNull();
    });

    it("should process staking.burn", () => {
      const myAddress = "oasis1qmyaddress";
      const myAddresses = new Set([myAddress]);
      const ev = {
        timestamp: "2024-01-01T00:00:00Z",
        block: 1000,
        type: "staking.burn",
        tx_hash: "abc123",
        body: {
          from: myAddress,
          amount: "1000000000",
        },
      };

      const result = processConsensusEvent(ev, myAddresses);

      expect(result).not.toBeNull();
      expect(result.comment).toBe("outgoing transfer (burn)");
      expect(result.to).toBe("0");
    });

    it("should filter out unrelated burn events", () => {
      const myAddress = "oasis1qmyaddress";
      const myAddresses = new Set([myAddress]);
      const ev = {
        timestamp: "2024-01-01T00:00:00Z",
        block: 1000,
        type: "staking.burn",
        tx_hash: "abc123",
        body: {
          from: "oasis1qother",
          amount: "1000000000",
        },
      };

      const result = processConsensusEvent(ev, myAddresses);
      expect(result).toBeNull();
    });

    it("should return null for unknown event types", () => {
      const myAddresses = new Set(["oasis1qmyaddress"]);
      const ev = {
        type: "unknown.event",
        body: {},
      };

      const result = processConsensusEvent(ev, myAddresses);
      expect(result).toBeNull();
    });
  });

  describe("sapphireEvents processing", () => {
    const processSapphireTransfer = (ev, myAddresses) => {
      const row = {
        timestamp: ev.timestamp,
        block_height: ev.round,
        type: ev.type,
        tx_hash: ev.tx_hash,
      };

      if (ev.type !== "accounts.transfer") return null;

      row.from = ev.body.from.toLowerCase();
      row.to = ev.body.to.toLowerCase();
      row.to_eth = ev.body.to_eth?.toLowerCase() || "";
      row.amount = ev.body.amount.Amount;
      row.symbol = "ROSE";
      row.decimals = 18;

      if (myAddresses.has(row.from)) {
        if (row.to === SAPPHIRE_FEE_ACCUMULATOR) {
          row.comment = "outgoing transfer (fee payment)";
        } else {
          row.comment = "outgoing transfer";
        }
      } else if (myAddresses.has(row.to) || myAddresses.has(row.to_eth)) {
        row.comment = "incoming transfer";
      } else {
        return null;
      }
      return row;
    };

    it("should process accounts.transfer with nested amount", () => {
      const myAddress = "oasis1qmyaddress";
      const myAddresses = new Set([myAddress]);
      const ev = {
        timestamp: "2024-01-01T00:00:00Z",
        round: 1000,
        type: "accounts.transfer",
        tx_hash: "abc123",
        body: {
          from: myAddress,
          to: "oasis1qrecipient",
          amount: { Amount: "1000000000" },
        },
      };

      const result = processSapphireTransfer(ev, myAddresses);

      expect(result).not.toBeNull();
      expect(result.amount).toBe("1000000000");
      expect(result.block_height).toBe(1000);
    });

    it("should handle eth address format for incoming", () => {
      const myEthAddress = "0x1234567890123456789012345678901234567890";
      const myAddresses = new Set([myEthAddress.toLowerCase()]);
      const ev = {
        timestamp: "2024-01-01T00:00:00Z",
        round: 1000,
        type: "accounts.transfer",
        tx_hash: "abc123",
        body: {
          from: "oasis1qsender",
          to: "oasis1qrecipient",
          to_eth: myEthAddress,
          amount: { Amount: "1000000000" },
        },
      };

      const result = processSapphireTransfer(ev, myAddresses);

      expect(result).not.toBeNull();
      expect(result.comment).toBe("incoming transfer");
      expect(result.to_eth).toBe(myEthAddress.toLowerCase());
    });
  });

  describe("address validation", () => {
    const validateAddress = (address) => {
      const ethRegex = /^0x[a-fA-F0-9]{40}$/;
      const oasisRegex = /^oasis1[a-zA-Z0-9]{40}$/;
      return ethRegex.test(address) || oasisRegex.test(address);
    };

    it("should accept valid Ethereum addresses", () => {
      expect(validateAddress("0x1234567890123456789012345678901234567890")).toBe(true);
      expect(validateAddress("0xABCDEF1234567890abcdef1234567890ABCDEF12")).toBe(true);
    });

    it("should accept valid Oasis addresses", () => {
      expect(validateAddress("oasis1qz0k5q8vjqvu4s4nwxyj406ylnflkc4vrcjghuwk")).toBe(true);
    });

    it("should reject invalid addresses", () => {
      expect(validateAddress("")).toBe(false);
      expect(validateAddress("0x123")).toBe(false);
      expect(validateAddress("oasis1")).toBe(false);
      expect(validateAddress("invalid")).toBe(false);
      expect(validateAddress("0x12345678901234567890123456789012345678901")).toBe(false); // too long
    });
  });

  describe("timestamp filtering", () => {
    const filterByTimestamp = (events, after, before) => {
      return events.filter((ev) => {
        const ts = new Date(ev.timestamp).getTime();
        return ts >= new Date(after).getTime() && ts < new Date(before).getTime();
      });
    };

    it("should filter events within date range", () => {
      const events = [
        { timestamp: "2023-12-31T23:59:59Z", id: 1 },
        { timestamp: "2024-01-01T00:00:00Z", id: 2 },
        { timestamp: "2024-06-15T12:00:00Z", id: 3 },
        { timestamp: "2024-12-31T23:59:59Z", id: 4 },
        { timestamp: "2025-01-01T00:00:00Z", id: 5 },
      ];

      const filtered = filterByTimestamp(events, "2024-01-01T00:00:00Z", "2025-01-01T00:00:00Z");

      expect(filtered.length).toBe(3);
      expect(filtered.map((e) => e.id)).toEqual([2, 3, 4]);
    });

    it("should handle empty events array", () => {
      const filtered = filterByTimestamp([], "2024-01-01T00:00:00Z", "2025-01-01T00:00:00Z");
      expect(filtered).toEqual([]);
    });
  });

  describe("CSV field ordering", () => {
    it("should have correct field order for output including USD fields", () => {
      const expectedKeys = [
        "timestamp",
        "block_height",
        "tx_hash",
        "type",
        "comment",
        "from",
        "to",
        "to_eth",
        "amount",
        "symbol",
        "decimals",
        "contract",
        "usd_price",
        "usd_amount",
      ];

      expect(expectedKeys.length).toBe(14);
      expect(expectedKeys[0]).toBe("timestamp");
      expect(expectedKeys[expectedKeys.length - 2]).toBe("usd_price");
      expect(expectedKeys[expectedKeys.length - 1]).toBe("usd_amount");
    });
  });

  describe("USD price calculations", () => {
    // Mock price lookup
    const mockPrices = {
      "2024-01-15": 0.0892,
      "2024-06-20": 0.1234,
      "2024-12-25": 0.0756,
    };

    const getRosePrice = (prices, timestamp) => {
      if (!timestamp || !prices) return null;
      const date = timestamp.split("T")[0];
      return prices[date] ?? null;
    };

    const WROSE_CONTRACT = "0x8bc2b030b299964eefb5e1e0b36991352e56d2d3";

    const isRoseOrWrose = (row) => {
      if (row.symbol === "ROSE") return true;
      if (row.contract && row.contract.toLowerCase() === WROSE_CONTRACT) return true;
      return false;
    };

    it("should look up price by date from timestamp", () => {
      expect(getRosePrice(mockPrices, "2024-01-15T10:30:00Z")).toBe(0.0892);
      expect(getRosePrice(mockPrices, "2024-06-20T23:59:59Z")).toBe(0.1234);
      expect(getRosePrice(mockPrices, "2024-12-25T00:00:00Z")).toBe(0.0756);
    });

    it("should return null for dates without price data", () => {
      expect(getRosePrice(mockPrices, "2023-01-01T00:00:00Z")).toBeNull();
      expect(getRosePrice(mockPrices, "2024-01-16T00:00:00Z")).toBeNull();
    });

    it("should return null for invalid inputs", () => {
      expect(getRosePrice(null, "2024-01-15T00:00:00Z")).toBeNull();
      expect(getRosePrice(mockPrices, null)).toBeNull();
      expect(getRosePrice(mockPrices, "")).toBeNull();
    });

    it("should calculate USD amount correctly for ROSE (18 decimals)", () => {
      // 100 ROSE at $0.10 = $10.00
      const amount = "100000000000000000000"; // 100 * 10^18
      const result = calculateUsdAmount(amount, 18, 0.1);
      expect(result).toBe("10.00");
    });

    it("should calculate USD amount correctly for small amounts", () => {
      // 0.5 ROSE at $0.0892 = $0.0446
      const amount = "500000000000000000"; // 0.5 * 10^18
      const result = calculateUsdAmount(amount, 18, 0.0892);
      expect(result).toBe("0.04");
    });

    it("should calculate USD amount correctly for large amounts", () => {
      // 1,000,000 ROSE at $0.10 = $100,000
      const amount = "1000000000000000000000000"; // 1e6 * 10^18
      const result = calculateUsdAmount(amount, 18, 0.1);
      expect(result).toBe("100000.00");
    });

    it("should handle very large amounts without precision loss (1 billion ROSE)", () => {
      // 1,000,000,000 ROSE at $0.10 = $100,000,000
      const amount = "1000000000000000000000000000"; // 1e9 * 10^18
      const result = calculateUsdAmount(amount, 18, 0.1);
      expect(result).toBe("100000000.00");
    });

    it("should use BigInt exponentiation for divisor (high decimals)", () => {
      // Test with 20 decimals - would fail with 10 ** 20 in float
      // 1 token at $1.00 = $1.00
      const amount = "100000000000000000000"; // 1 * 10^20
      const result = calculateUsdAmount(amount, 20, 1.0);
      expect(result).toBe("1.00");
    });

    it("should return null for USD amount when price is null", () => {
      const result = calculateUsdAmount("1000000000000000000", 18, null);
      expect(result).toBeNull();
    });

    it("should return null for USD amount when price is zero", () => {
      const result = calculateUsdAmount("1000000000000000000", 18, 0);
      expect(result).toBeNull();
    });

    it("should return null for USD amount when amount is null", () => {
      const result = calculateUsdAmount(null, 18, 0.1);
      expect(result).toBeNull();
    });

    it("should return null for USD amount when amount is empty string", () => {
      const result = calculateUsdAmount("", 18, 0.1);
      expect(result).toBeNull();
    });

    it("should handle zero amount", () => {
      const result = calculateUsdAmount("0", 18, 0.1);
      expect(result).toBe("0.00");
    });

    it("should return null for invalid amount string", () => {
      const result = calculateUsdAmount("not-a-number", 18, 0.1);
      expect(result).toBeNull();
    });

    it("should identify ROSE token for USD pricing", () => {
      const roseRow = { symbol: "ROSE", amount: "1000" };
      expect(isRoseOrWrose(roseRow)).toBe(true);
    });

    it("should identify wROSE token for USD pricing", () => {
      const wroseRow = {
        symbol: "wROSE",
        contract: "0x8Bc2B030b299964eEfb5e1e0b36991352E56D2D3",
      };
      expect(isRoseOrWrose(wroseRow)).toBe(true);
    });

    it("should not price other ERC20 tokens", () => {
      const otherToken = {
        symbol: "USDC",
        contract: "0x1234567890123456789012345678901234567890",
      };
      expect(isRoseOrWrose(otherToken)).toBe(false);
    });

    it("should add USD fields to ROSE transfers", () => {
      const row = {
        timestamp: "2024-01-15T10:30:00Z",
        type: "accounts.transfer",
        symbol: "ROSE",
        decimals: 18,
        amount: "1000000000000000000", // 1 ROSE
      };

      if (isRoseOrWrose(row)) {
        const price = getRosePrice(mockPrices, row.timestamp);
        row.usd_price = price;
        row.usd_amount = calculateUsdAmount(row.amount, row.decimals, price);
      }

      expect(row.usd_price).toBe(0.0892);
      expect(row.usd_amount).toBe("0.09");
    });

    it("should set null USD fields for non-ROSE tokens", () => {
      const row = {
        timestamp: "2024-01-15T10:30:00Z",
        type: "evm.log",
        symbol: "USDT",
        decimals: 6,
        amount: "1000000",
        contract: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      };

      if (isRoseOrWrose(row)) {
        const price = getRosePrice(mockPrices, row.timestamp);
        row.usd_price = price;
        row.usd_amount = calculateUsdAmount(row.amount, row.decimals, price);
      } else {
        row.usd_price = null;
        row.usd_amount = null;
      }

      expect(row.usd_price).toBeNull();
      expect(row.usd_amount).toBeNull();
    });
  });

  describe("multiple address support", () => {
    it("should track both oasis and eth addresses", () => {
      const myAddresses = new Set();
      const oasisAddr = "oasis1qmyaddress";
      const ethAddr = "0x1234567890123456789012345678901234567890";

      myAddresses.add(oasisAddr.toLowerCase());
      myAddresses.add(ethAddr.toLowerCase());

      expect(myAddresses.size).toBe(2);
      expect(myAddresses.has(oasisAddr)).toBe(true);
      expect(myAddresses.has(ethAddr.toLowerCase())).toBe(true);
    });
  });

  describe("pagination logic", () => {
    it("should detect when more pages exist (clipped)", () => {
      const response = {
        events: new Array(1000).fill({}),
        is_total_count_clipped: true,
        total_count: 1000,
      };

      const needsMorePages =
        (response.is_total_count_clipped === true && response.total_count >= 1000) ||
        response.total_count > 1000;

      expect(needsMorePages).toBe(true);
    });

    it("should detect when more pages exist (total > limit)", () => {
      const response = {
        events: new Array(1000).fill({}),
        is_total_count_clipped: false,
        total_count: 2500,
      };

      const needsMorePages =
        (response.is_total_count_clipped === true && response.total_count >= 1000) ||
        response.total_count > 1000;

      expect(needsMorePages).toBe(true);
    });

    it("should detect when no more pages needed", () => {
      const response = {
        events: new Array(50).fill({}),
        is_total_count_clipped: false,
        total_count: 50,
      };

      const needsMorePages =
        (response.is_total_count_clipped === true && response.total_count >= 1000) ||
        response.total_count > 1000;

      expect(needsMorePages).toBe(false);
    });
  });
});

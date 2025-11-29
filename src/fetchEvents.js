import axios from "axios";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SAPPHIRE_FEE_ACCUMULATOR =
  "oasis1qp3r8hgsnphajmfzfuaa8fhjag7e0yt35cjxq0u4";

const ERC20_TRANSFER_SIGNATURE =
  "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const b64ToHex = (b64) => {
  const binaryStr = atob(b64);
  return Array.from(binaryStr)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
};

const consensusEvents = (events, myAddresses) => {
  return events.map((ev) => {
    const row = {
      timestamp: ev.timestamp,
      block_height: ev.block,
      type: ev.type,
      tx_hash: ev.tx_hash,
    };

    switch (ev.type) {
      case "staking.transfer":
        // Most straightforward.
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
        // Remove from balance.
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
        // I don't think I need to handle others.
        // I think on escrow, separate transfer event is emitted.
        return null;
    }
  });
};

const sapphireEvents = (events, transactions, myAddresses) => {
  const results = events
    .map((ev) => {
      const row = {
        timestamp: ev.timestamp,
        block_height: ev.round,
        type: ev.type,
        tx_hash: ev.tx_hash,
      };

      switch (ev.type) {
        case "accounts.transfer":
          // Set common transfer fields.
          row.from = ev.body.from.toLowerCase();
          row.to = ev.body.to.toLowerCase();
          row.to_eth = ev.body.to_eth?.toLowerCase() || "";
          row.amount = ev.body.amount.Amount;
          row.symbol = "ROSE";
          row.decimals = 18;

          // Only include the row if we're involved in the transfer.
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

        case "accounts.mint":
          // Mint happens in two cases:
          // - Deposit event -> the tokens get minted to the recipient
          // - Undelegate done event -> the tokens get minted to the delegator
          //
          // In both cases, we skip the mint event, and include the other event.
          // TODO: could sanity check for this.

          // Sanity check that we are the recipient of the mint.
          if (!myAddresses.has(ev.body.owner.toLowerCase())) {
            throw new Error(`Unexpected mint event: ${JSON.stringify(ev)}`);
          }
          return null;

        case "accounts.burn":
          // Burn happens in two cases:
          // - Withdraw event -> the withdrawn tokens get burned from the sender*
          // - Delegate event -> the delegated tokens get burned from the delegator*
          // * technically not from the sender/delegator, but a temporary account?
          //
          // In both cases, we skip the burn event, and include the other event.
          // TODO: could sanity check for this.

          // Sanity check that we are the sender of the burn.
          if (!myAddresses.has(ev.body.owner.toLowerCase())) {
            throw new Error(`Unexpected burn event: ${JSON.stringify(ev)}`);
          }
          return null;

        case "consensus_accounts.deposit":
          row.comment = "incoming deposit";
          row.to = ev.body.to.toLowerCase();
          row.from = ev.body.from.toLowerCase();
          row.amount = ev.body.amount.Amount;
          row.symbol = "ROSE";
          row.decimals = 18;

          // Sanity check that we are the recipient of the deposit.
          if (!myAddresses.has(row.to)) {
            throw new Error(`Unexpected deposit event: ${JSON.stringify(ev)}`);
          }
          return row;

        case "consensus_accounts.withdraw":
          row.comment = "outgoing withdraw";
          row.from = ev.body.from.toLowerCase();
          row.to = ev.body.to.toLowerCase();
          row.amount = ev.body.amount.Amount;
          row.symbol = "ROSE";
          row.decimals = 18;

          // Sanity check that we are the sender of the withdraw.
          if (!myAddresses.has(row.from)) {
            throw new Error(`Unexpected withdraw event: ${JSON.stringify(ev)}`);
          }
          return row;

        case "consensus_accounts.delegate":
          row.comment = "outgoing delegation";
          row.from = ev.body.from.toLowerCase();
          row.to = ev.body.to.toLowerCase();
          row.amount = ev.body.amount.Amount;
          row.symbol = "ROSE";
          row.decimals = 18;

          // Only include row if we sent the delegation.
          if (!myAddresses.has(row.from)) {
            return null;
          }
          return row;

        case "consensus_accounts.undelegate_start":
          // Skip this event since it doesn't affect the balance.
          return null;

        case "consensus_accounts.undelegate_done":
          row.comment = "incoming undelegation";
          row.from = ev.body.from.toLowerCase();
          row.to = ev.body.to.toLowerCase();
          row.amount = ev.body.amount.Amount;
          row.symbol = "ROSE";
          row.decimals = 18;
          return row;

        case "core.gas_used":
          // If gas payment was made (gas price is > 0), there will always be
          // a corresponding 'accounts.transfer' event. So skip this event.
          return null;

        case "evm.log":
          const evmSignature = b64ToHex(ev.body.topics[0]);

          switch (evmSignature) {
            case ERC20_TRANSFER_SIGNATURE:
              // Find from, to amount.
              for (const log_param of ev.evm_log_params) {
                if (log_param.name === "from") {
                  row.from = log_param.value.toLowerCase();
                }
                if (log_param.name === "to") {
                  row.to = log_param.value.toLowerCase();
                }
                if (log_param.name === "value") {
                  row.amount = log_param.value;
                }
              }
              // SANITY CHECK: Our address should be either, from, to or 'address' in case we are a contract.
              if (
                !myAddresses.has(row.from) &&
                !myAddresses.has(row.to) &&
                !myAddresses.has(row.address)
              ) {
                throw new Error(`Unexpected ERC20 transfer: ${JSON.stringify(ev)}`);
              }

              row.symbol = ev.evm_token.symbol;
              row.decimals = ev.evm_token.decimals;
              row.contract = "0x" + b64ToHex(ev.body.address);

              // Only include events where we are either sender or receiver.
              if (myAddresses.has(row.from)) {
                row.comment = "ERC20 Transfer (outgoing)";
                return row;
              }
              if (myAddresses.has(row.to)) {
                row.comment = "ERC20 Transfer (incoming)";
                return row;
              }
              return null;
            default:
              // Ignore other EVM events.
              return null;
          }
        default:
          // Unexpected event.
          throw new Error(`Unexpected event type: ${JSON.stringify(ev)}`);
      }
    })
    .filter((ev) => ev !== null);

  transactions.forEach((tx) => {
    // For each transaction, which is likely native transfer, check if we have a corresponding event.
    // If not, add it to the results.
    if (
      tx.is_likely_native_token_transfer ||
      (tx.method === "evm.Call" && tx.amount !== "0")
    ) {
      const event = results.find((ev) => ev.tx_hash === tx.hash);
      if (!event || event.type !== "accounts.transfer") {
        if (myAddresses.has(tx.from)) {
          results.push({
            timestamp: tx.timestamp,
            block_height: tx.round,
            type: "accounts.transfer",
            tx_hash: tx.hash,
            from: tx.from,
            to: tx.to,
            amount: tx.amount,
            symbol: "ROSE",
            decimals: 18,
            comment: "outgoing transfer",
          });
        }
        if (myAddresses.has(tx.to)) {
          results.push({
            timestamp: tx.timestamp,
            block_height: tx.round,
            type: "accounts.transfer",
            tx_hash: tx.hash,
            from: tx.from,
            to: tx.to,
            amount: tx.amount,
            symbol: "ROSE",
            decimals: 18,
            comment: "incoming transfer",
          });
        }
      }
    }
  });

  return results;
};

export const fetchEvents = async (
  NEXUS_API,
  address,
  year,
  before,
  after,
  layer,
  setProgress
) => {
  try {
    setProgress("Fetching account details...");
    const accountResponse = await axios.get(
      `${NEXUS_API}/${layer}/accounts/${address}`
    );
    const myAddresses = new Set([address.toLowerCase()]);
    if (accountResponse.data.address) {
      myAddresses.add(accountResponse.data.address.toLowerCase());
    }

    setProgress("Fetching events...");
    let events = [];
    let offset = 0;
    // Also handle pagination if needed.
    while (true) {
      const eventsResponse = await axios.get(`${NEXUS_API}/${layer}/events`, {
        params: {
          limit: 1000,
          after: after,
          before: before,
          rel: address,
          offset: offset,
        },
      });
      events = [...events, ...eventsResponse.data.events];

      // Check if there are more events to fetch.
      if (
        (eventsResponse.data.is_total_count_clipped === true &&
          eventsResponse.data.total_count >= 1000) ||
        eventsResponse.data.total_count > 1000
      ) {
        offset += eventsResponse.data.events.length;
        await sleep(100);
      } else {
        // Break the loop if there are no more events to fetch.
        break;
      }
    }

    // For 2023, we also need to fetch transactions, because we did not emit "Transfer" events at
    // that time for all the cases.
    let transactions = [];
    if (layer === "sapphire" && year === "2023") {
      setProgress("Fetching transactions...");
      const transactionsResponse = await axios.get(
        `${NEXUS_API}/${layer}/transactions`,
        {
          params: {
            limit: 1000,
            after: after,
            before: before,
            rel: address,
          },
        }
      );
      transactions = [
        ...transactions,
        ...transactionsResponse.data.transactions,
      ];
      // Check if there are more transactions to fetch.
      if (
        transactionsResponse.data.is_total_count_clipped === true &&
        transactionsResponse.data.total_count >= 1000
      ) {
        throw new Error("More transactions to fetch. Not implemented.");
      }
    }

    // Filter events based on timestamp since at the time the API does not support filtering by timestamp.
    events = events.filter((ev) => {
      const ts = new Date(ev.timestamp).getTime();
      return ts >= new Date(after).getTime() && ts < new Date(before).getTime();
    });

    // Filter transactions based on timestamp.
    // Same reason as above.
    transactions = transactions.filter((tx) => {
      const ts = new Date(tx.timestamp).getTime();
      return ts >= new Date(after).getTime() && ts < new Date(before).getTime();
    });

    setProgress("Processing events...");
    if (layer === "consensus") {
      return consensusEvents(events, myAddresses)
        .filter((ev) => ev !== null)
        .reverse();
    } else if (layer === "sapphire") {
      return sapphireEvents(events, transactions, myAddresses)
        .filter((ev) => ev !== null)
        .reverse();
    } else {
      throw new Error(`Unknown layer: ${layer}`);
    }
  } catch (error) {
    console.error("Error fetching events:", error.message);
    throw error;
  }
};

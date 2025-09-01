import { useEffect, useState } from "react";
import {
  Address,
  parseAbiItem,
  GetLogsReturnType,
} from "viem";
import { hyperPublicClient } from "../viem/clients";

type OnchainTx = {
  hash: string;
  timestamp: number;
  type: "DEPOSIT" | "WITHDRAW";
  assets: bigint;
  shares: bigint;
  sender?: Address;
  owner?: Address;
  receiver?: Address;
  blockNumber: bigint;
  logIndex: number;
};

const depositEvent = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)"
);

const withdrawEvent = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)"
);

export function useHyperTxHistory(params: {
  vaultAddress: Address;
  userAddress?: Address;
  /**
   * Limit how far back you scan. If you omit this, it scans from block 0, which can be slow.
   * Pass something like 0n or a recent block number on HyperEVM.
   */
  fromBlock?: bigint;
    enabled?: boolean;
}) {
  const { vaultAddress, userAddress, fromBlock = 0n, enabled = false } = params;
  const [data, setData] = useState<OnchainTx[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (!enabled) {
            setData(null);
            setLoading(false);
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);

        const client = hyperPublicClient;

        // Pull both Deposit & Withdraw logs for the vault in 1000-block chunks (RPC limit)
        const head = await client.getBlockNumber();
        const MAX_SPAN = 1000n; // HyperEVM RPC limit per getLogs

        type Log = GetLogsReturnType<
          typeof depositEvent | typeof withdrawEvent
        >[number];

        const collected: Log[] = [];
        let cursor = fromBlock;
        while (cursor <= head) {
          const spanEnd = cursor + (MAX_SPAN - 1n);
          const toBlock = spanEnd > head ? head : spanEnd;
          const batch = await client.getLogs({
            address: vaultAddress,
            events: [depositEvent, withdrawEvent],
            fromBlock: cursor,
            toBlock,
          });
          collected.push(...(batch as Log[]));
          cursor = toBlock + 1n;
        }

        const withTimestamps: OnchainTx[] = await Promise.all(
          collected.map(async (log, i) => {
            const block = await client.getBlock({ blockNumber: log.blockNumber });
            if (log.eventName === "Deposit") {
              const { sender, owner, assets, shares } = log.args as {
                sender: Address;
                owner: Address;
                assets: bigint;
                shares: bigint;
              };
              return {
                hash: log.transactionHash,
                timestamp: Number(block.timestamp),
                type: "DEPOSIT",
                assets,
                shares,
                sender,
                owner,
                blockNumber: log.blockNumber,
                logIndex: Number(log.logIndex ?? i),
              };
            } else {
              const { sender, receiver, owner, assets, shares } = log.args as {
                sender: Address;
                receiver: Address;
                owner: Address;
                assets: bigint;
                shares: bigint;
              };
              return {
                hash: log.transactionHash,
                timestamp: Number(block.timestamp),
                type: "WITHDRAW",
                assets,
                shares,
                sender,
                receiver,
                owner,
                blockNumber: log.blockNumber,
                logIndex: Number(log.logIndex ?? i),
              };
            }
          })
        );

        // If user filter is provided, keep only their txs
        const filtered = userAddress
          ? withTimestamps.filter(
              (e) =>
                e.sender?.toLowerCase() === userAddress.toLowerCase() ||
                e.owner?.toLowerCase() === userAddress.toLowerCase() ||
                e.receiver?.toLowerCase() === userAddress.toLowerCase()
            )
          : withTimestamps;

        // Sort latest first
        filtered.sort((a, b) => b.timestamp - a.timestamp);

        if (!cancelled) setData(filtered);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to fetch logs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [vaultAddress, userAddress, fromBlock, enabled]);

  return { data, loading, error };
}
import { useState, useEffect } from "react";
import type { Address } from "viem";
import { parseAbiItem, GetLogsReturnType, formatUnits } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { VaultUtils } from "@lagoon-protocol/v0-core";

export type TimeRange = "7D" | "30D" | "90D" | "1Y";

export interface SharePriceDataPoint {
  date: string;
  price: number;
  timestamp: number;
}

export interface LagoonSharePriceHistoryData {
  data: SharePriceDataPoint[];
  loading: boolean;
  error: string | null;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
}

// ABI items for settlement events
const settleDepositEvent = parseAbiItem(
  "event SettleDeposit(uint40 indexed epochId, uint40 indexed settledId, uint256 totalAssets, uint256 totalSupply, uint256 assetsDeposited, uint256 sharesMinted)"
);

const settleRedeemEvent = parseAbiItem(
  "event SettleRedeem(uint40 indexed epochId, uint40 indexed settledId, uint256 totalAssets, uint256 totalSupply, uint256 assetsWithdrawed, uint256 sharesBurned)"
);

export function useLagoonSharePriceHistory(
  vaultAddress: Address,
  chainId: number,
  initialRange: TimeRange = "30D"
): LagoonSharePriceHistoryData {
  const [timeRange, setTimeRange] = useState<TimeRange>(initialRange);
  const [data, setData] = useState<SharePriceDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSharePriceHistory() {
      try {
        setLoading(true);
        setError(null);
        
        if (cancelled) return;

        // Calculate time range in milliseconds
        const ranges = {
          "7D": 7 * 24 * 60 * 60 * 1000,
          "30D": 30 * 24 * 60 * 60 * 1000,
          "90D": 90 * 24 * 60 * 60 * 1000,
          "1Y": 365 * 24 * 60 * 60 * 1000,
        };
        const rangeMs = ranges[timeRange];
        
        // Get current block
        const headBlock = await hyperPublicClient.getBlockNumber();
        const headTimestamp = Number((await hyperPublicClient.getBlock({ blockNumber: headBlock })).timestamp) * 1000;
        
        // Calculate approximate starting block
        // HyperEVM avg block time is ~2s, so calculate approximate blocks from timestamp diff
        const targetTimestamp = headTimestamp - rangeMs;
        const approximateBlocksAgo = Math.floor(rangeMs / (2 * 1000)); // 2s per block
        const fromBlock = headBlock - BigInt(Math.min(approximateBlocksAgo, 1_000_000)); // Cap at 1M blocks max
        
        // Fetch settlement events
        const MAX_SPAN = 1000n; // HyperEVM RPC limit per getLogs
        type Log = GetLogsReturnType<typeof settleDepositEvent | typeof settleRedeemEvent>[number];
        
        const collected: Log[] = [];
        let cursor = fromBlock;
        while (cursor <= headBlock) {
          const spanEnd = cursor + (MAX_SPAN - 1n);
          const toBlock = spanEnd > headBlock ? headBlock : spanEnd;
          
          const batch = await hyperPublicClient.getLogs({
            address: vaultAddress,
            events: [settleDepositEvent, settleRedeemEvent],
            fromBlock: cursor,
            toBlock,
          });
          collected.push(...(batch as Log[]));
          cursor = toBlock + 1n;
        }
        
        // Process events to extract share prices
        const pricePoints = await Promise.all(
          collected.map(async (log) => {
            const block = await hyperPublicClient.getBlock({ blockNumber: log.blockNumber });
            const timestamp = Number(block.timestamp) * 1000;
            
            // Filter by time range
            if (timestamp < targetTimestamp) {
              return null;
            }
            
            const { totalAssets, totalSupply } = log.args as {
              totalAssets: bigint;
              totalSupply: bigint;
            };
            
            // Calculate share price: totalAssets / totalSupply
            // Using ONE_SHARE as the base (1e18)
            const oneShare = VaultUtils.ONE_SHARE;
            const priceBigInt = totalSupply > 0n
              ? (totalAssets * oneShare) / totalSupply
              : 0n;
            const price = Number(formatUnits(priceBigInt, 18));
            
            return {
              date: new Date(timestamp).toISOString().split('T')[0],
              price,
              timestamp,
            };
          })
        );
        
        // Filter out nulls and sort by timestamp
        const validPoints = pricePoints.filter((p): p is SharePriceDataPoint => p !== null);
        validPoints.sort((a, b) => a.timestamp - b.timestamp);
        
        if (cancelled) return;
        setData(validPoints);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch share price history");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSharePriceHistory();

    return () => {
      cancelled = true;
    };
  }, [vaultAddress, chainId, timeRange]);

  return {
    data,
    loading,
    error,
    timeRange,
    setTimeRange,
  };
}


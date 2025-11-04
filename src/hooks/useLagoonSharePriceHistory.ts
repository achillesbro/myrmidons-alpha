import { useState, useEffect } from "react";
import type { Address } from "viem";
import { parseAbiItem, GetLogsReturnType, formatUnits } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { VaultUtils } from "@lagoon-protocol/v0-core";
import { getUsdt0Usd } from "../lib/prices";

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
  initialRange: TimeRange = "30D",
  underlyingAddress?: Address
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
        
        // Start from block 0 for new vaults (events should be recent)
        // For HyperEVM, we can scan from genesis since it's a new chain
        const fromBlock = 0n;
        const targetTimestamp = headTimestamp - rangeMs;
        
        // Fetch settlement events
        const MAX_SPAN = 1000n; // HyperEVM RPC limit per getLogs
        type Log = GetLogsReturnType<typeof settleDepositEvent | typeof settleRedeemEvent>[number];
        
        const collected: Log[] = [];
        let cursor = fromBlock;
        try {
          while (cursor <= headBlock) {
            const spanEnd = cursor + (MAX_SPAN - 1n);
            const toBlock = spanEnd > headBlock ? headBlock : spanEnd;
            
            try {
              const batch = await hyperPublicClient.getLogs({
                address: vaultAddress,
                events: [settleDepositEvent, settleRedeemEvent],
                fromBlock: cursor,
                toBlock,
              });
              collected.push(...(batch as Log[]));
            } catch (logError) {
              // If getLogs fails for a range, log but continue
              console.warn(`Failed to fetch logs from block ${cursor} to ${toBlock}:`, logError);
            }
            
            cursor = toBlock + 1n;
          }
        } catch (fetchError) {
          console.warn('Error during event fetching:', fetchError);
          // Continue processing even if some blocks fail
        }
        
        // Get USD price of underlying asset (for conversion)
        let assetPriceUsd: number | null = null;
        if (underlyingAddress) {
          assetPriceUsd = await getUsdt0Usd({ token: underlyingAddress });
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
            // Handle case where totalSupply is 0 (initial state) - price would be 0
            const priceBigInt = totalSupply > 0n
              ? (totalAssets * oneShare) / totalSupply
              : 0n;
            // Format using 18 decimals since ONE_SHARE is 1e18
            const priceInUnderlying = Number(formatUnits(priceBigInt, 18));
            
            // Convert to USD if asset price is available
            const price = assetPriceUsd !== null 
              ? priceInUnderlying * assetPriceUsd 
              : priceInUnderlying;
            
            return {
              date: new Date(timestamp).toISOString().split('T')[0],
              price,
              timestamp,
            };
          })
        );
        
        // Filter out nulls and sort by timestamp
        let validPoints = pricePoints.filter((p): p is SharePriceDataPoint => p !== null);
        validPoints.sort((a, b) => a.timestamp - b.timestamp);
        
        // Always add current share price as a data point (unless we already have a recent point)
        // This ensures the chart always shows current state even if events are missing
        if (underlyingAddress) {
          try {
            const { Vault } = await import("@lagoon-protocol/v0-viem");
            const vault = await Vault.fetch(vaultAddress, hyperPublicClient);
            if (vault && vault.totalSupply > 0n) {
              const oneShare = VaultUtils.ONE_SHARE;
              const currentSharePrice = vault.convertToAssets(oneShare);
              const currentAssetPriceUsd = assetPriceUsd !== null ? assetPriceUsd : await getUsdt0Usd({ token: underlyingAddress });
              const priceInUnderlying = Number(formatUnits(currentSharePrice, 18));
              const price = currentAssetPriceUsd !== null ? priceInUnderlying * currentAssetPriceUsd : priceInUnderlying;
              
              // Check if we already have a recent point (within last hour)
              const oneHourAgo = headTimestamp - (60 * 60 * 1000);
              const hasRecentPoint = validPoints.some(p => p.timestamp >= oneHourAgo);
              
              if (!hasRecentPoint) {
                validPoints.push({
                  date: new Date(headTimestamp).toISOString().split('T')[0],
                  price,
                  timestamp: headTimestamp,
                });
                // Re-sort after adding current point
                validPoints.sort((a, b) => a.timestamp - b.timestamp);
              }
            }
          } catch (err) {
            // Log but don't fail - historical data is more important
            console.warn('Failed to fetch current share price for chart:', err);
          }
        }
        
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
  }, [vaultAddress, chainId, timeRange, underlyingAddress]);

  return {
    data,
    loading,
    error,
    timeRange,
    setTimeRange,
  };
}


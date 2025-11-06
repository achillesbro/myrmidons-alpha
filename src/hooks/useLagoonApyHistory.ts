// src/hooks/useLagoonApyHistory.ts
// Hook to fetch and compute APR history for Lagoon vaults using PeriodSummaries

import { useState, useEffect, useMemo } from "react";
import type { Address } from "viem";
import {
  computeSinglePeriodNetApr,
  type PeriodSummary,
} from "../lib/lagoon-apr-calculator";
import type { VaultConfig } from "../config/vaults.config";

export type TimeRange = "7D" | "30D" | "90D" | "1Y";

export interface ApyDataPoint {
  x: number; // Unix timestamp
  y: number; // APR as decimal (e.g. 0.045 for 4.5%)
}

export interface LagoonApyHistoryData {
  apyData: ApyDataPoint[];
  loading: boolean;
  error: string | null;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
}

const LAGOON_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmbrqvox367cy01y96gi91bis/subgraphs/lagoon-hyperevm-vault/prod/gn";

async function fetchPeriodSummaries(
  vaultAddress: Address,
  startTimestamp: number,
  endTimestamp: number
): Promise<PeriodSummary[]> {
  const query = `
    query GetPeriodSummaries($vault: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!) {
      periodSummaries(
        where: {
          vault: $vault
          blockTimestamp_gte: $startTimestamp
          blockTimestamp_lte: $endTimestamp
        }
        first: 1000
        orderBy: blockTimestamp
        orderDirection: asc
      ) {
        id
        vault
        blockNumber
        blockTimestamp
        duration
        totalAssetsAtStart
        totalSupplyAtStart
        totalAssetsAtEnd
        totalSupplyAtEnd
        netTotalSupplyAtEnd
      }
    }
  `;

  const response = await fetch(LAGOON_SUBGRAPH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        vault: vaultAddress.toLowerCase(),
        startTimestamp: startTimestamp.toString(),
        endTimestamp: endTimestamp.toString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors[0]?.message || "GraphQL error");
  }

  return result.data?.periodSummaries || [];
}

export function useLagoonApyHistory(
  vaultAddress: Address,
  vaultConfig: VaultConfig,
  initialRange: TimeRange = "30D"
): LagoonApyHistoryData {
  const [timeRange, setTimeRange] = useState<TimeRange>(initialRange);
  const [periodSummaries, setPeriodSummaries] = useState<PeriodSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate time range in seconds
  const timeRangeConfig = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const ranges = {
      "7D": 7 * 24 * 60 * 60,
      "30D": 30 * 24 * 60 * 60,
      "90D": 90 * 24 * 60 * 60,
      "1Y": 365 * 24 * 60 * 60,
    };
    return {
      startTimestamp: now - ranges[timeRange],
      endTimestamp: now,
    };
  }, [timeRange]);

  // Fetch period summaries
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const summaries = await fetchPeriodSummaries(
          vaultAddress,
          timeRangeConfig.startTimestamp,
          timeRangeConfig.endTimestamp
        );

        if (cancelled) return;

        setPeriodSummaries(summaries);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch period summaries");
        console.error("Error fetching Lagoon period summaries:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [vaultAddress, timeRangeConfig.startTimestamp, timeRangeConfig.endTimestamp]);

  // Compute APR data points
  const apyData = useMemo<ApyDataPoint[]>(() => {
    if (periodSummaries.length === 0) {
      return [];
    }

    // Get vault decimals from config (default to 18 for Lagoon vaults)
    const vaultDecimals = 18; // Lagoon vaults typically use 18 decimals
    const assetDecimals = vaultConfig.underlyingDecimals;

    const dataPoints: ApyDataPoint[] = [];

    // For each period, compute the single-period Net APR
    // We'll show the APR for each period at both start and end timestamps for continuity
    for (const period of periodSummaries) {
      const periodStartTimestamp = Number(period.blockTimestamp);
      const periodEndTimestamp = periodStartTimestamp + Number(period.duration);

      // Compute Net APR for this specific period
      const apr = computeSinglePeriodNetApr(period, vaultDecimals, assetDecimals);

      // Add point at start of period
      dataPoints.push({
        x: periodStartTimestamp,
        y: apr,
      });

      // Add point at end of period (same APR value for step-like visualization)
      dataPoints.push({
        x: periodEndTimestamp,
        y: apr,
      });
    }

    // Sort by timestamp
    dataPoints.sort((a, b) => a.x - b.x);

    // Remove duplicates (if any periods are adjacent)
    const uniquePoints: ApyDataPoint[] = [];
    for (let i = 0; i < dataPoints.length; i++) {
      if (i === 0 || dataPoints[i].x !== dataPoints[i - 1].x) {
        uniquePoints.push(dataPoints[i]);
      }
    }

    return uniquePoints;
  }, [periodSummaries, vaultConfig.underlyingDecimals]);

  return {
    apyData,
    loading,
    error,
    timeRange,
    setTimeRange,
  };
}


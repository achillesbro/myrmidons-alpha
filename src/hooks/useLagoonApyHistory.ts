// src/hooks/useLagoonApyHistory.ts
// Hook to fetch and compute APR history for Lagoon vaults using PeriodSummaries

import { useState, useEffect, useMemo } from "react";
import { formatUnits, type Address } from "viem";
import { VaultUtils } from "@lagoon-protocol/v0-core";
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

export interface TvlDataPoint {
  x: number;
  y: number;
}

export interface SinceInceptionDataPoint {
  x: number;
  y: number; // percent delta since inception
  sharePrice: number; // underlying per share
}

export interface LagoonApyHistoryData {
  apyData: ApyDataPoint[];
  tvlData: TvlDataPoint[];
  sinceInceptionData: SinceInceptionDataPoint[];
  latestNetApr: number | null;
  latestSinceInception: number | null;
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

export interface LagoonApyHistoryOptions {
  enabled?: boolean;
}

export function useLagoonApyHistory(
  vaultAddress: Address,
  vaultConfig: VaultConfig,
  initialRange: TimeRange = "30D",
  options: LagoonApyHistoryOptions = {}
): LagoonApyHistoryData {
  const enabled = options.enabled ?? true;
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
    if (!enabled) {
      setPeriodSummaries([]);
      setLoading(false);
      setError(null);
      return;
    }

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
  }, [enabled, vaultAddress, timeRangeConfig.startTimestamp, timeRangeConfig.endTimestamp]);

  // Compute derived datasets
  const {
    apyData,
    tvlData,
    sinceInceptionData,
    latestNetApr,
    latestSinceInception,
  } = useMemo(() => {
    if (!enabled || periodSummaries.length === 0) {
      return {
        apyData: [],
        tvlData: [],
        sinceInceptionData: [],
        latestNetApr: null,
        latestSinceInception: null,
      };
    }

    const vaultDecimals = 18;
    const assetDecimals = vaultConfig.underlyingDecimals;
    const decimalsOffset = vaultDecimals - assetDecimals;
    const oneShare = 10n ** BigInt(vaultDecimals);

    const apyPoints: ApyDataPoint[] = [];
    const tvlPoints: TvlDataPoint[] = [];
    const inceptionPoints: SinceInceptionDataPoint[] = [];

    let lastApr: number | null = null;
    let lastSinceInception: number | null = null;

    for (const period of periodSummaries) {
      const startTimestamp = Number(period.blockTimestamp);
      const durationSeconds = Number(period.duration);
      const endTimestamp = startTimestamp + durationSeconds;

      // TVL points (convert total assets to decimal)
      const assetsStart = Number(
        formatUnits(BigInt(period.totalAssetsAtStart), assetDecimals),
      );
      const assetsEnd = Number(
        formatUnits(BigInt(period.totalAssetsAtEnd), assetDecimals),
      );
      tvlPoints.push({ x: startTimestamp, y: assetsStart });
      tvlPoints.push({ x: endTimestamp, y: assetsEnd });

      const supplyStart = BigInt(period.totalSupplyAtStart);
      const netSupplyEnd = BigInt(period.netTotalSupplyAtEnd);
      const canComputeSharePrice =
        supplyStart > 0n && netSupplyEnd > 0n && assetsStart >= 0 && assetsEnd >= 0;

      if (durationSeconds > 0 && canComputeSharePrice) {
        // APR points (skip zero-duration or zero-supply periods)
        const apr = computeSinglePeriodNetApr(
          period,
          vaultDecimals,
          assetDecimals,
        );
        apyPoints.push({ x: startTimestamp, y: apr });
        apyPoints.push({ x: endTimestamp, y: apr });
        lastApr = apr;
      }

      if (canComputeSharePrice) {
        // Since inception (share price evolution)
        const ppsAtStart = VaultUtils.convertToAssets(oneShare, {
          decimalsOffset,
          totalAssets: BigInt(period.totalAssetsAtStart),
          totalSupply: supplyStart,
        });
        const netPpsAtEnd = VaultUtils.convertToAssets(oneShare, {
          decimalsOffset,
          totalAssets: BigInt(period.totalAssetsAtEnd),
          totalSupply: netSupplyEnd,
        });

        const sharePriceStart = Number(formatUnits(ppsAtStart, assetDecimals));
        const sharePriceEnd = Number(formatUnits(netPpsAtEnd, assetDecimals));
        const sinceInceptionStart = (sharePriceStart - 1) * 100;
        const sinceInceptionEnd = (sharePriceEnd - 1) * 100;

        inceptionPoints.push({
          x: startTimestamp,
          y: sinceInceptionStart,
          sharePrice: sharePriceStart,
        });
        inceptionPoints.push({
          x: endTimestamp,
          y: sinceInceptionEnd,
          sharePrice: sharePriceEnd,
        });
        lastSinceInception = sinceInceptionEnd;
      }
    }

    const dedupe = <T extends { x: number }>(points: T[]) => {
      points.sort((a, b) => a.x - b.x);
      const unique: T[] = [];
      for (let i = 0; i < points.length; i++) {
        if (i === 0 || points[i].x !== points[i - 1].x) {
          unique.push(points[i]);
        } else {
          unique[unique.length - 1] = points[i];
        }
      }
      return unique;
    };

    return {
      apyData: dedupe(apyPoints),
      tvlData: dedupe(tvlPoints),
      sinceInceptionData: dedupe(inceptionPoints),
      latestNetApr: lastApr,
      latestSinceInception: lastSinceInception,
    };
  }, [enabled, periodSummaries, vaultConfig.underlyingDecimals]);

  return {
    apyData,
    tvlData,
    sinceInceptionData,
    latestNetApr,
    latestSinceInception,
    loading,
    error,
    timeRange,
    setTimeRange,
  };
}


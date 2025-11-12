// src/lib/lagoon-apr-calculator.ts
// APR calculation utilities for Lagoon vaults based on PeriodSummaries

import { VaultUtils } from "@lagoon-protocol/v0-core";
import { formatUnits } from "viem";

export interface PeriodSummary {
  id: string;
  vault: string;
  blockNumber: string;
  blockTimestamp: string;
  duration: string;
  totalAssetsAtStart: string;
  totalSupplyAtStart: string;
  totalAssetsAtEnd: string;
  totalSupplyAtEnd: string;
  netTotalSupplyAtEnd: string;
}

const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;
const DECIMALS = 18;
const INCREASE_PRECISION = 10n ** BigInt(DECIMALS + 2);

/**
 * Compute the Net APR for a single period
 * Based on Lagoon docs: https://docs.lagoon.finance/developer-hub/integration/apr-computations
 */
export function computeSinglePeriodNetApr(
  summary: PeriodSummary,
  vaultDecimals: number,
  assetDecimals: number
): number {
  const decimalsOffset = vaultDecimals - assetDecimals;
  const oneShare = 10n ** BigInt(vaultDecimals);

  // Price per share at start
  const ppsAtStart = VaultUtils.convertToAssets(oneShare, {
    decimalsOffset,
    totalAssets: BigInt(summary.totalAssetsAtStart),
    totalSupply: BigInt(summary.totalSupplyAtStart),
  });

  // Net price per share at end (after fees)
  const netPPSAtEnd = VaultUtils.convertToAssets(oneShare, {
    decimalsOffset,
    totalAssets: BigInt(summary.totalAssetsAtEnd),
    totalSupply: BigInt(summary.netTotalSupplyAtEnd),
  });

  // Calculate gain
  const gain = netPPSAtEnd - ppsAtStart;
  const duration = BigInt(summary.duration);

  // Handle edge cases
  if (duration === 0n || ppsAtStart === 0n) {
    return 0;
  }

  // Annualize the yield
  // periodYield = gain * SECONDS_PER_YEAR * INCREASE_PRECISION
  // apr = periodYield / (duration * ppsAtStart)
  const periodYield = gain * SECONDS_PER_YEAR * INCREASE_PRECISION;
  const aprBigInt = periodYield / (duration * ppsAtStart);

  // Convert to decimal number
  return Number(formatUnits(aprBigInt, DECIMALS));
}

/**
 * Compute Time-Weighted Rate of Return (TWRR) for multiple periods
 * Based on Lagoon docs: https://docs.lagoon.finance/developer-hub/integration/apr-computations
 */
export function computeTWRR(
  summaries: PeriodSummary[],
  vaultDecimals: number,
  assetDecimals: number
): number {
  if (summaries.length === 0) {
    return 0;
  }

  let totalWeightedApr = 0;
  let totalDuration = 0;

  for (const summary of summaries) {
    const apr = computeSinglePeriodNetApr(summary, vaultDecimals, assetDecimals);
    const duration = Number(summary.duration);
    
    totalWeightedApr += apr * duration;
    totalDuration += duration;
  }

  if (totalDuration === 0) {
    return 0;
  }

  return totalWeightedApr / totalDuration;
}

/**
 * Get price per share reference at a specific timestamp
 * Uses interpolation if the timestamp falls within a period
 * Based on Lagoon docs interpolation logic
 */
export function getPriceReferenceAtTimestamp(
  summaries: PeriodSummary[],
  timestamp: number,
  vaultDecimals: number,
  assetDecimals: number
): { pricePerShare: bigint; timestamp: number } | null {
  if (summaries.length === 0) {
    return null;
  }

  const decimalsOffset = vaultDecimals - assetDecimals;
  const oneShare = 10n ** BigInt(vaultDecimals);

  const computePps = (totalAssets: bigint, totalSupply: bigint) =>
    VaultUtils.convertToAssets(oneShare, {
      decimalsOffset,
      totalAssets,
      totalSupply,
    });

  // Sort summaries by timestamp (ascending)
  const sorted = [...summaries].sort(
    (a, b) => Number(a.blockTimestamp) - Number(b.blockTimestamp)
  );

  // Find the period that contains or is closest to the target timestamp
  let summary = sorted.find(
    (p) => Number(p.blockTimestamp) <= timestamp
  );

  if (!summary) {
    // If no summary before timestamp, use the oldest summary
    summary = sorted[0];
    const pricePerShare = computePps(
      BigInt(summary.totalAssetsAtStart),
      BigInt(summary.totalSupplyAtStart)
    );
    return {
      pricePerShare,
      timestamp: Number(summary.blockTimestamp),
    };
  }

  // Check if timestamp is within this period
  const periodEnd = Number(summary.blockTimestamp) + Number(summary.duration);
  
  if (timestamp > periodEnd) {
    // Timestamp is after this period, use the end price
    const pricePerShare = computePps(
      BigInt(summary.totalAssetsAtEnd),
      BigInt(summary.netTotalSupplyAtEnd)
    );
    return {
      pricePerShare,
      timestamp: periodEnd,
    };
  }

  // Timestamp is within the period - interpolate
  const atStartPps = computePps(
    BigInt(summary.totalAssetsAtStart),
    BigInt(summary.totalSupplyAtStart)
  );

  const atEndPps = computePps(
    BigInt(summary.totalAssetsAtEnd),
    BigInt(summary.netTotalSupplyAtEnd)
  );

  const ppsEvolutionDuringPeriod = atEndPps - atStartPps;
  const timePast = timestamp - Number(summary.blockTimestamp);
  const duration = Number(summary.duration);

  if (duration === 0) {
    return {
      pricePerShare: atStartPps,
      timestamp,
    };
  }

  // Linear interpolation
  const ppsEvolution =
    (ppsEvolutionDuringPeriod * BigInt(timePast)) / BigInt(duration);

  return {
    pricePerShare: atStartPps + ppsEvolution,
    timestamp,
  };
}

/**
 * Compute interpolated APR for a time range
 * Finds the price per share at the start and end of the range, then computes APR
 */
export function computeInterpolatedApr(
  summaries: PeriodSummary[],
  startTimestamp: number,
  endTimestamp: number,
  vaultDecimals: number,
  assetDecimals: number
): number {
  if (summaries.length === 0) {
    return 0;
  }

  const startPriceRef = getPriceReferenceAtTimestamp(
    summaries,
    startTimestamp,
    vaultDecimals,
    assetDecimals
  );
  const endPriceRef = getPriceReferenceAtTimestamp(
    summaries,
    endTimestamp,
    vaultDecimals,
    assetDecimals
  );

  if (!startPriceRef || !endPriceRef) {
    return 0;
  }

  const duration = endTimestamp - startTimestamp;
  if (duration <= 0) {
    return 0;
  }

  const startPps = startPriceRef.pricePerShare;
  const endPps = endPriceRef.pricePerShare;

  if (startPps === 0n) {
    return 0;
  }

  const gain = endPps - startPps;
  const periodYield = gain * SECONDS_PER_YEAR * INCREASE_PRECISION;
  const aprBigInt = periodYield / (BigInt(duration) * startPps);

  return Number(formatUnits(aprBigInt, DECIMALS));
}





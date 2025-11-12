// src/hooks/useAccumulatedRewards.ts
// Hook to fetch and calculate accumulated rewards (points) for a user

import { useState, useEffect } from 'react';
import type { AllocationItem } from '../lib/allocation-grouper';
import {
  fetchUserPoints,
  fetchVaultTotalPoints,
  fetchEcosystemPoints,
  type ProtocolReward,
  type EcosystemPointsEntry,
} from '../lib/points-data';

interface UseAccumulatedRewardsResult {
  rewards: ProtocolReward[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to calculate accumulated rewards for a user
 * Combines internal points with ecosystem points distributed pro-rata
 * 
 * @param walletAddress - User's wallet address (optional, only if connected)
 * @param vaultAddress - Vault address
 * @param allocations - Allocation items from Octav (for protocol logos and names)
 */
export function useAccumulatedRewards(
  walletAddress: string | undefined,
  vaultAddress: string,
  allocations: AllocationItem[]
): UseAccumulatedRewardsResult {
  const [rewards, setRewards] = useState<ProtocolReward[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRewards() {
      if (!walletAddress) {
        // No wallet connected, return empty
        if (!cancelled) {
          setRewards([]);
          setLoading(false);
          setError(null);
        }
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch user's total points and vault total points in parallel
        const [userPoints, vaultTotalPoints, ecosystemPoints] = await Promise.all([
          fetchUserPoints(walletAddress, vaultAddress),
          fetchVaultTotalPoints(vaultAddress),
          fetchEcosystemPoints(),
        ]);

        if (cancelled) return;

        // Create a map of protocol keys to allocation items (for logos and names)
        // Use lowercase keys for case-insensitive matching
        const protocolMap = new Map<string, AllocationItem>();
        allocations.forEach((alloc) => {
          if (alloc.protocolKey) {
            const keyLower = alloc.protocolKey.toLowerCase();
            if (!protocolMap.has(keyLower)) {
              protocolMap.set(keyLower, alloc);
            }
          }
        });

        // Build rewards array from ecosystem points config
        const calculatedRewards: ProtocolReward[] = ecosystemPoints.map((ecosystemEntry) => {
          // Find matching allocation for logo and name (case-insensitive matching)
          const ecosystemKeyLower = ecosystemEntry.protocolKey.toLowerCase();
          const allocation = protocolMap.get(ecosystemKeyLower);
          
          // Use allocation's protocol name if available, otherwise use config name
          const protocolName = allocation?.protocolName || ecosystemEntry.protocolName;
          const protocolLogo = allocation?.protocolLogo || null;

          // Calculate user's share of ecosystem points
          let userEcosystemPoints: number | null = null;
          if (
            ecosystemEntry.points !== null &&
            userPoints !== null &&
            vaultTotalPoints > 0 &&
            userPoints > 0
          ) {
            // Pro-rata calculation: (userPoints / vaultTotalPoints) * ecosystemPoints
            userEcosystemPoints = (userPoints / vaultTotalPoints) * ecosystemEntry.points;
          }

          // Format the value with commas for thousands
          const formattedValue =
            userEcosystemPoints !== null
              ? userEcosystemPoints.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : null;

          return {
            name: protocolName,
            value: formattedValue,
            icon: protocolLogo || undefined,
            tag: ecosystemEntry.tag || undefined,
            protocolKey: ecosystemEntry.protocolKey,
          };
        });

        // Sort rewards: those with values first, then by name
        calculatedRewards.sort((a, b) => {
          if (a.value !== null && b.value !== null) {
            // Both have values, sort by value descending
            const aNum = parseFloat(a.value.replace(/,/g, ''));
            const bNum = parseFloat(b.value.replace(/,/g, ''));
            return bNum - aNum;
          }
          if (a.value !== null) return -1;
          if (b.value !== null) return 1;
          // Both null, sort by name
          return a.name.localeCompare(b.name);
        });

        if (!cancelled) {
          setRewards(calculatedRewards);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch rewards';
        console.error('[useAccumulatedRewards] Error:', errorMessage);
        setError(errorMessage);
        setRewards([]);
        setLoading(false);
      }
    }

    fetchRewards();

    return () => {
      cancelled = true;
    };
  }, [walletAddress, vaultAddress, allocations]);

  return { rewards, loading, error };
}


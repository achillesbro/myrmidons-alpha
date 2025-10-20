import { useMemo } from "react";
import type { Address } from "viem";
import { useGetVaultDataQuery } from "../graphql/__generated__/GetVaultData.query.generated";
import type { AllocationItem } from "../lib/allocation-grouper";
import { groupAllocationsByFamily, type GroupedAllocation, type AllocationGroupingResult } from "../lib/allocation-grouper";

export interface VaultDataAPI {
  // APY metrics
  instantApy: number | null;
  dailyApy: number | null;
  weeklyApy: number | null;
  monthlyApy: number | null;

  // TVL & Share Price
  totalAssets: bigint | null;
  totalAssetsUsd: number | null;
  totalSupply: bigint | null;
  sharePrice: number | null;
  sharePriceUsd: number | null;

  // Asset info
  assetSymbol: string | null;
  assetDecimals: number | null;
  assetPriceUsd: number | null;

  // Allocations
  allocations: AllocationItem[];
  groupedAllocations: GroupedAllocation[] | null;
  groupingResult: AllocationGroupingResult | null;

  // Meta
  loading: boolean;
  error: string | null;
}

export function useVaultDataAPI(vaultAddress: Address, chainId: number): VaultDataAPI {
  const { data, loading, error } = useGetVaultDataQuery({
    variables: { address: vaultAddress, chainId },
    // Poll every 30 seconds to keep data fresh (especially for newly deployed vaults)
    pollInterval: 30000,
    // Still use cache between polls
    fetchPolicy: 'cache-and-network',
  });

  const allocations = useMemo<AllocationItem[]>(() => {
    if (!data?.vaultByAddress?.state?.allocation) return [];

    const allocs = data.vaultByAddress.state.allocation;
    const totalAssets = data.vaultByAddress.state.totalAssets;

    // Deduplicate allocations by market uniqueKey (same as on-chain logic)
    const uniqueAllocs = new Map<string, typeof allocs[0]>();
    allocs.forEach((alloc) => {
      const key = alloc.market.uniqueKey;
      if (!uniqueAllocs.has(key) || BigInt(alloc.supplyAssets) > BigInt(uniqueAllocs.get(key)!.supplyAssets)) {
        uniqueAllocs.set(key, alloc);
      }
    });

    return Array.from(uniqueAllocs.values())
      .map((alloc) => {
        const supplyAssets = BigInt(alloc.supplyAssets);
        const supplyAssetsUsd = alloc.supplyAssetsUsd;
        const loanSymbol = alloc.market.loanAsset.symbol;
        const collateralSymbol = alloc.market.collateralAsset?.symbol || "Idle";
        const collateralLogo = alloc.market.collateralAsset?.logoURI || null;
        const supplyApy = alloc.market.state?.supplyApy ?? null;

        // Calculate percentage
        const pct =
          totalAssets && BigInt(totalAssets) > 0n
            ? Number((supplyAssets * 10000n) / BigInt(totalAssets)) / 100
            : 0;

        // Create label - use loanSymbol / collateralSymbol format
        const label = `${loanSymbol} / ${collateralSymbol}`;

        return {
          id: alloc.market.uniqueKey as `0x${string}`,
          assets: supplyAssets,
          label,
          pct,
          usd: supplyAssetsUsd,
          supplyApy,
          logo: collateralLogo,
        };
      })
      .filter((a) => a.pct >= 0.01) // Filter dust (<0.01%)
      .sort((a, b) => {
        // Sort by USD value if available, otherwise by assets
        if (a.usd != null && b.usd != null) {
          return b.usd - a.usd;
        }
        return b.assets > a.assets ? 1 : -1;
      });
  }, [data]);

  // Group allocations by family
  const groupingResult = useMemo<AllocationGroupingResult | null>(() => {
    const totalAssets = data?.vaultByAddress?.state?.totalAssets;
    if (!allocations.length || !totalAssets) {
      // Return empty result instead of null to ensure groupedAllocations is always an array
      return {
        groupedItems: [],
        ungroupedItems: [],
        totalGroupedAssets: 0n,
        totalUngroupedAssets: 0n,
      };
    }
    
    return groupAllocationsByFamily(allocations, BigInt(totalAssets));
  }, [allocations, data?.vaultByAddress?.state?.totalAssets, vaultAddress]);

  return {
    // APY metrics
    instantApy: data?.vaultByAddress?.state?.netApy ?? null,
    dailyApy: data?.vaultByAddress?.state?.dailyNetApy ?? null,
    weeklyApy: data?.vaultByAddress?.state?.weeklyNetApy ?? null,
    monthlyApy: data?.vaultByAddress?.state?.monthlyNetApy ?? null,

    // TVL & Share Price
    totalAssets: data?.vaultByAddress?.state?.totalAssets
      ? BigInt(data.vaultByAddress.state.totalAssets)
      : null,
    totalAssetsUsd: data?.vaultByAddress?.state?.totalAssetsUsd ?? null,
    totalSupply: data?.vaultByAddress?.state?.totalSupply
      ? BigInt(data.vaultByAddress.state.totalSupply)
      : null,
    sharePrice: data?.vaultByAddress?.state?.sharePrice
      ? Number(data.vaultByAddress.state.sharePrice)
      : null,
    sharePriceUsd: data?.vaultByAddress?.state?.sharePriceUsd ?? null,

    // Asset info
    assetSymbol: data?.vaultByAddress?.asset?.symbol ?? null,
    assetDecimals: data?.vaultByAddress?.asset?.decimals ?? null,
    assetPriceUsd: data?.vaultByAddress?.asset?.priceUsd ?? null,

    // Allocations
    allocations,
    groupedAllocations: groupingResult?.groupedItems ?? [],
    groupingResult,

    // Meta
    loading,
    error: error?.message ?? null,
  };
}


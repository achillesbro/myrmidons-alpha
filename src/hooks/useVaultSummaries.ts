import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { useVaultAllocationsOptimized } from './useVaultAllocationsOptimized';
import { useVaultCurrentApyParallel } from './useVaultCurrentApyParallel';
import { getUsdt0Usd } from '../lib/prices';

export type VaultSummary = {
  id: string;
  tvlUSD?: number;
  apy?: number;        // decimal, e.g., 0.057
  marketsCount?: number;
  updatedAt?: number;
};

// Default vault address - same as used in App.tsx
const DEFAULT_VAULT_ADDRESS = (import.meta.env.VITE_MORPHO_VAULT || "0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42") as Address;

export function useVaultSummaries() {
  // Use the same hooks as vault-api-view.tsx but with longer cache intervals
  const {
    loading: allocationsLoading,
    error: allocationsError,
    items: allocationItems,
  } = useVaultAllocationsOptimized(DEFAULT_VAULT_ADDRESS);

  const {
    apy,
    loading: apyLoading,
    error: apyError,
  } = useVaultCurrentApyParallel(DEFAULT_VAULT_ADDRESS);

  // Use exact same approach as vault-api-view.tsx
  const [onchainData, setOnchainData] = useState<{
    totalAssets: bigint;
    underlyingAddress: `0x${string}`;
    underlyingDecimals: number;
  } | null>(null);
  const [onchainLoading, setOnchainLoading] = useState(true);
  const [usdPrice, setUsdPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState<boolean>(true);

  // Get vault data exactly like vault-api-view.tsx
  useEffect(() => {
    if (!onchainData) {
      (async () => {
        try {
          const { hyperPublicClient } = await import('../viem/clients');
          const vaultAbi = [
            { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
            { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
            { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
          ] as const;
          
          // Batch with multicall for base vault data
          const mc = await hyperPublicClient.multicall({
            contracts: [
              { address: DEFAULT_VAULT_ADDRESS as `0x${string}`, abi: vaultAbi as any, functionName: "totalAssets", args: [] },
              { address: DEFAULT_VAULT_ADDRESS as `0x${string}`, abi: vaultAbi as any, functionName: "asset", args: [] },
            ],
          });
          const totalAssets = mc[0].result as bigint;
          const asset = mc[1].result as `0x${string}`;

          const decimals = (await hyperPublicClient.readContract({
            address: asset,
            abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }],
            functionName: "decimals",
          })) as number;

          setOnchainData({
            totalAssets,
            underlyingAddress: asset,
            underlyingDecimals: Number(decimals),
          });
        } catch (e) {
          console.error('Failed to get vault data:', e);
        } finally {
          setOnchainLoading(false);
        }
      })();
    }
  }, [onchainData]);

  // Get USD price exactly like vault-api-view.tsx
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!onchainData?.underlyingAddress) return;
      try {
        setPriceLoading(true);
        const p = await getUsdt0Usd({ token: onchainData.underlyingAddress });
        if (!cancelled) setUsdPrice(p ?? null);
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [onchainData?.underlyingAddress]);

  // Calculate TVL exactly like vault-api-view.tsx
  const tvlUsd = onchainData && typeof usdPrice === "number" 
    ? Number(formatUnits(onchainData.totalAssets, onchainData.underlyingDecimals)) * usdPrice 
    : undefined;

  const isLoading = onchainLoading || allocationsLoading || apyLoading || priceLoading;
  const error = allocationsError || apyError;
  
  const summaries: Record<string, VaultSummary> = {
    phalanx: {
      id: 'phalanx',
      tvlUSD: tvlUsd,
      apy: apy ?? undefined,
      marketsCount: allocationItems?.length,
      updatedAt: Date.now(),
    },
  };

  return { summaries, error, isLoading };
}

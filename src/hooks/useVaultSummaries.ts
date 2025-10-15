import type { Address } from 'viem';
import { useVaultDataAPI } from './useVaultDataAPI';

export type VaultSummary = {
  id: string;
  tvlUSD?: number;
  apy?: number;        // decimal, e.g., 0.057
  marketsCount?: number;
  updatedAt?: number;
};

// Default vault address - PHALANX vault
const DEFAULT_VAULT_ADDRESS = (import.meta.env.VITE_MORPHO_VAULT || "0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42") as Address;
const CHAIN_ID = 999; // HyperEVM

export function useVaultSummaries() {
  // Use Morpho API for vault data - same as vault-api-view.tsx
  // Hooks must be called unconditionally at the top level
  const apiData = useVaultDataAPI(DEFAULT_VAULT_ADDRESS, CHAIN_ID);

  const summaries: Record<string, VaultSummary> = {
    phalanx: {
      id: 'phalanx',
      tvlUSD: apiData.totalAssetsUsd ?? undefined,
      apy: apiData.instantApy ?? undefined,
      marketsCount: apiData.allocations?.length ?? undefined,
      updatedAt: Date.now(),
    },
  };

  return { 
    summaries, 
    error: apiData.error ?? null, 
    isLoading: apiData.loading 
  };
}

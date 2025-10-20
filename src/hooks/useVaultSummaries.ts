import { useVaultDataAPI } from './useVaultDataAPI';
import { VAULT_CONFIGS } from '../config/vaults.config';

export type VaultSummary = {
  id: string;
  tvlUSD?: number;
  apy?: number;        // decimal, e.g., 0.057
  marketsCount?: number;
  updatedAt?: number;
};

const CHAIN_ID = 999; // HyperEVM

export function useVaultSummaries() {
  // Fetch data for all vaults - hooks must be called unconditionally at the top level
  const usdt0Data = useVaultDataAPI(VAULT_CONFIGS.usdt0.vaultAddress, CHAIN_ID);
  const whypeData = useVaultDataAPI(VAULT_CONFIGS.whype.vaultAddress, CHAIN_ID);

  const summaries: Record<string, VaultSummary> = {
    usdt0: {
      id: 'usdt0',
      tvlUSD: usdt0Data.totalAssetsUsd ?? undefined,
      apy: usdt0Data.instantApy ?? undefined,
      marketsCount: usdt0Data.allocations?.length ?? undefined,
      updatedAt: Date.now(),
    },
    whype: {
      id: 'whype',
      tvlUSD: whypeData.totalAssetsUsd ?? undefined,
      apy: whypeData.instantApy ?? undefined,
      marketsCount: whypeData.allocations?.length ?? undefined,
      updatedAt: Date.now(),
    },
  };

  return { 
    summaries, 
    error: usdt0Data.error || whypeData.error || null, 
    isLoading: usdt0Data.loading || whypeData.loading 
  };
}

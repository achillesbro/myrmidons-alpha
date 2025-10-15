import type { Address } from 'viem';
import { useVaultDataAPI } from './useVaultDataAPI';
import { VAULT_CONFIGS } from '../config/vaults.config';
import { useMemo } from 'react';

export type VaultSummary = {
  id: string;
  tvlUSD?: number;
  apy?: number;        // decimal, e.g., 0.057
  marketsCount?: number;
  updatedAt?: number;
};

// Get all configured vaults (excluding placeholder addresses)
const ACTIVE_VAULTS = Object.values(VAULT_CONFIGS).filter(
  v => v.vaultAddress !== '0x0000000000000000000000000000000000000000'
);

export function useVaultSummaries() {
  // Fetch data for all active vaults
  // Note: This creates multiple hooks calls, one per vault
  // For now we only have PHALANX active, but this scales automatically
  const vaultData = useMemo(() => 
    ACTIVE_VAULTS.map(config => ({
      config,
      // eslint-disable-next-line react-hooks/rules-of-hooks
      data: useVaultDataAPI(config.vaultAddress as Address, config.chainId)
    })), 
    [] // Empty deps - vault list is static
  );

  // Build summaries from vault data
  const summaries: Record<string, VaultSummary> = {};
  let hasError = false;
  let isLoading = false;

  vaultData.forEach(({ config, data }) => {
    summaries[config.id] = {
      id: config.id,
      tvlUSD: data.totalAssetsUsd ?? undefined,
      apy: data.instantApy ?? undefined,
      marketsCount: data.allocations?.length ?? undefined,
      updatedAt: Date.now(),
    };
    
    if (data.loading) isLoading = true;
    if (data.error) hasError = true;
  });

  return { 
    summaries, 
    error: hasError ? 'Failed to load some vault data' : null, 
    isLoading 
  };
}

// src/hooks/useVaultAdapter.ts
// Hook to provide vault adapter based on vault type

import { useMemo } from "react";
import { useWalletClient } from "wagmi";
import { hyperPublicClient } from "../viem/clients";
import { LagoonVaultAdapter } from "../lib/lagoon/adapter";
import type { IVaultAdapter } from "../lib/vault-provider";
import type { VaultConfig } from "../config/vaults.config";

export function useVaultAdapter(config: VaultConfig): IVaultAdapter | null {
  const walletClient = useWalletClient();

  return useMemo(() => {
    if (config.type === "lagoon") {
      return new LagoonVaultAdapter(
        config.vaultAddress,
        config.underlyingAddress,
        config.underlyingSymbol,
        config.underlyingDecimals,
        config.chainId,
        hyperPublicClient,
        walletClient.data || undefined
      );
    }

    // For Morpho vaults, return null - use existing direct contract calls
    return null;
  }, [config, walletClient.data]);
}

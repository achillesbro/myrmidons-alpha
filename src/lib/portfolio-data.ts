import { Address } from "viem";
import { erc20Abi } from "viem";
import { VAULT_CONFIGS, type VaultConfig } from "../config/vaults.config";
import { hyperPublicClient } from "../viem/clients";
import { LagoonVaultAdapter } from "./lagoon/adapter";
import { getUsdt0Usd } from "./prices";
import { formatUnits } from "viem";

export type VaultKind = 'morpho' | 'hypairdrop';

export interface ListedVault {
  id: string;
  kind: VaultKind;
  address: Address;
  symbol: string;
  name: string;
  decimals: number; // underlying asset decimals
  shareDecimals: number; // vault share token decimals (usually 18)
  sharePriceUsd?: number;
  config: VaultConfig;
}

export interface MorphoVaultApy {
  apr7d: number;
  apr30d: number;
}

export interface HypAirdropPoints {
  total: number;
  perProtocol: Array<{
    protocol: string;
    points: number;
    perDay?: number;
  }>;
  updatedAt: string;
}

/**
 * Get all listed vaults (Morpho + HypAirdrop) with share decimals
 */
export async function getListedVaults(): Promise<ListedVault[]> {
  const vaults = Object.values(VAULT_CONFIGS);
  const result: ListedVault[] = [];

  // Fetch share decimals for each vault
  await Promise.all(
    vaults.map(async (config) => {
      try {
        // Read vault share decimals (ERC20 decimals of the vault token)
        const shareDecimals = await hyperPublicClient.readContract({
          address: config.vaultAddress,
          abi: erc20Abi,
          functionName: "decimals",
        });

        result.push({
          id: config.id,
          kind: config.type === 'lagoon' ? 'hypairdrop' : 'morpho',
          address: config.vaultAddress,
          symbol: config.underlyingSymbol,
          name: config.displayName,
          decimals: config.underlyingDecimals,
          shareDecimals: Number(shareDecimals),
          config,
        });
      } catch (error) {
        console.error(`Failed to fetch share decimals for ${config.id}:`, error);
        // Default to 18 if we can't fetch
        result.push({
          id: config.id,
          kind: config.type === 'lagoon' ? 'hypairdrop' : 'morpho',
          address: config.vaultAddress,
          symbol: config.underlyingSymbol,
          name: config.displayName,
          decimals: config.underlyingDecimals,
          shareDecimals: 18, // Default ERC4626 vault decimals
          config,
        });
      }
    })
  );

  return result;
}

/**
 * Get Morpho vault APY data from GraphQL API
 */
export async function getMorphoVaultApy(
  vaultAddress: Address,
  chainId: number
): Promise<MorphoVaultApy> {
  try {
    // Use the GraphQL endpoint to get APY data
    const query = `
      query GetVaultApy($address: String!, $chainId: Int!) {
        vaultByAddress(address: $address, chainId: $chainId) {
          state {
            weeklyNetApy
            monthlyNetApy
          }
        }
      }
    `;

    const response = await fetch('https://blue-api.morpho.org/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { address: vaultAddress, chainId },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    const state = result.data?.vaultByAddress?.state;

    if (state) {
      return {
        apr7d: state.weeklyNetApy ?? 0,
        apr30d: state.monthlyNetApy ?? 0,
      };
    }

    return { apr7d: 0, apr30d: 0 };
  } catch (error) {
    console.error('Failed to fetch Morpho APY:', error);
    return { apr7d: 0, apr30d: 0 };
  }
}

/**
 * Get user shares for multiple vaults in batch using contract calls
 */
export async function getUserSharesBatch(
  userAddress: Address,
  vaults: ListedVault[]
): Promise<Record<string, bigint>> {
  const result: Record<string, bigint> = {};

  // Batch read all balanceOf calls
  const contracts = vaults.map((vault) => ({
    address: vault.address,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [userAddress],
  }));

  try {
    const results = await hyperPublicClient.multicall({
      contracts,
    });

    vaults.forEach((vault, index) => {
      const res = results[index];
      if (res.status === "success" && res.result) {
        result[vault.id] = res.result as bigint;
      } else {
        result[vault.id] = 0n;
      }
    });
  } catch (error) {
    console.error('Failed to fetch user shares:', error);
    // Return zeros on error
    vaults.forEach((vault) => {
      result[vault.id] = 0n;
    });
  }

  return result;
}

/**
 * Get share prices in USD for multiple vaults in batch
 */
export async function getSharePriceUsdBatch(
  vaults: ListedVault[]
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};

  await Promise.all(
    vaults.map(async (vault) => {
      try {
        if (vault.kind === "morpho") {
          // For Morpho vaults, fetch from GraphQL API
          const query = `
            query GetVaultSharePrice($address: String!, $chainId: Int!) {
              vaultByAddress(address: $address, chainId: $chainId) {
                state {
                  sharePriceUsd
                }
              }
            }
          `;

          const response = await fetch('https://blue-api.morpho.org/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              variables: { address: vault.address, chainId: vault.config.chainId },
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const sharePriceUsd = data.data?.vaultByAddress?.state?.sharePriceUsd;
            result[vault.id] = sharePriceUsd ?? 0;
          } else {
            result[vault.id] = 0;
          }
        } else {
          // For Lagoon vaults, use adapter
          const adapter = new LagoonVaultAdapter(
            vault.address,
            vault.config.underlyingAddress,
            vault.config.underlyingSymbol,
            vault.config.underlyingDecimals,
            vault.config.chainId,
            hyperPublicClient
          );

          const state = await adapter.readVaultState();
          const sharePriceRaw = Number(formatUnits(state.sharePrice, vault.decimals));
          const assetPriceUsd = await getUsdt0Usd({ token: vault.config.underlyingAddress });
          
          if (assetPriceUsd !== null) {
            result[vault.id] = sharePriceRaw * assetPriceUsd;
          } else {
            result[vault.id] = 0;
          }
        }
      } catch (error) {
        console.error(`Failed to fetch share price for ${vault.id}:`, error);
        result[vault.id] = 0;
      }
    })
  );

  return result;
}

/**
 * Get HypAirdrop points for a user
 * TODO: Replace with real API call when available
 */
export async function getHypAirdropPoints(_userAddress: Address): Promise<HypAirdropPoints> {
  // Stub: return empty points for now
  // In production, this would call the HypAirdrop points API
  return {
    total: 0,
    perProtocol: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get user cost basis for P&L calculation
 * TODO: Replace with real tracking/API
 */
export async function getUserCostBasis(
  _userAddress: Address,
  _vaultIds: string[]
): Promise<Record<string, number> | null> {
  // Stub: return null (no cost basis available)
  // In production, this would track deposits or fetch from API
  return null;
}


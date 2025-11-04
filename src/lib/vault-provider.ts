// src/lib/vault-provider.ts
// Provider-agnostic vault adapter interface

import type { Address } from "viem";

export type VaultMetadata = {
  name: string;
  symbol: string;
  assetSymbol: string;
  decimals: number;
  chainId: number;
  address: Address;
};

export type VaultState = {
  totalAssets: bigint;
  totalSupply: bigint;
  sharePrice: bigint; // price per share in underlying asset units (scaled)
  depositEpochId?: number; // For async vaults
  redeemEpochId?: number; // For async vaults
  cooldown?: bigint; // For async vaults
  state?: string; // Vault state enum
  isWhitelistActivated?: boolean;
};

export type UserPosition = {
  walletShares: bigint;
  walletAssets: bigint;
  pendingDepositShares?: bigint; // For async vaults - pending deposits (assets)
  pendingDepositAssets?: bigint; // For async vaults - pending deposits (assets) before settlement
  claimableShares?: bigint; // For async vaults - claimable shares after settlement
  pendingRedeemShares?: bigint; // For async vaults
  lastSettledDepositEpochId?: number; // For async vaults
  lastSettledRedeemEpochId?: number; // For async vaults
};

export type DepositResult = {
  hash: `0x${string}`;
  shares?: bigint; // For sync vaults
};

export type RedeemResult = {
  hash: `0x${string}`;
  assets?: bigint; // For sync vaults
};

/**
 * Vault adapter interface - abstracts vault operations
 * Implementations: MorphoVaultAdapter, LagoonVaultAdapter
 */
export interface IVaultAdapter {
  getVaultMetadata(): Promise<VaultMetadata>;
  readVaultState(): Promise<VaultState>;
  readUserPosition(user: Address): Promise<UserPosition>;
  
  // Deposit operations
  enqueueDeposit(amountAssets: bigint, user: Address): Promise<DepositResult>;
  
  // Withdraw/redeem operations  
  enqueueRedeem(amountShares: bigint, user: Address): Promise<RedeemResult>;
  
  // Optional: claim operations for async vaults
  claimShares?(shares: bigint, user: Address): Promise<{ hash: `0x${string}` }>;
  
  // Optional: cancel operations for async vaults
  cancelDeposit?(user: Address): Promise<{ hash: `0x${string}` }>;
  
  // Optional: APY estimation
  estimateApy?(): Promise<number | null>;
}

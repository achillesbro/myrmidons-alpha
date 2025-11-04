// src/lib/lagoon/adapter.ts
// Lagoon async vault adapter implementation

import { Vault } from "@lagoon-protocol/v0-viem";
import { VaultUtils } from "@lagoon-protocol/v0-core";
import type { Address, PublicClient, WalletClient } from "viem";
import { erc20Abi } from "viem";
import type {
  IVaultAdapter,
  VaultMetadata,
  VaultState,
  UserPosition,
  DepositResult,
  RedeemResult,
} from "../vault-provider";

export class LagoonVaultAdapter implements IVaultAdapter {
  private vaultAddress: Address;
  private underlyingSymbol: string;
  private chainId: number;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;

  constructor(
    vaultAddress: Address,
    _underlyingAddress: Address,
    underlyingSymbol: string,
    _underlyingDecimals: number,
    chainId: number,
    publicClient: PublicClient,
    walletClient?: WalletClient
  ) {
    this.vaultAddress = vaultAddress;
    this.underlyingSymbol = underlyingSymbol;
    this.chainId = chainId;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    // Store but don't use yet (may be needed for future features)
    void _underlyingAddress;
    void _underlyingDecimals;
  }

  async getVaultMetadata(): Promise<VaultMetadata> {
    const vault = await Vault.fetch(this.vaultAddress, this.publicClient);
    if (!vault) {
      throw new Error("Vault not found");
    }

    return {
      name: vault.name || "Lagoon Vault",
      symbol: vault.symbol || "LV",
      assetSymbol: this.underlyingSymbol,
      decimals: vault.decimals,
      chainId: this.chainId,
      address: this.vaultAddress,
    };
  }

  async readVaultState(): Promise<VaultState> {
    const vault = await Vault.fetch(this.vaultAddress, this.publicClient);
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Calculate share price: assets per ONE_SHARE
    const oneShare = VaultUtils.ONE_SHARE;
    const sharePrice = vault.convertToAssets(oneShare);

    return {
      totalAssets: vault.totalAssets,
      totalSupply: vault.totalSupply,
      sharePrice,
      depositEpochId: vault.depositEpochId,
      redeemEpochId: vault.redeemEpochId,
      cooldown: vault.cooldown,
      state: vault.state?.toString(),
      isWhitelistActivated: vault.isWhitelistActivated,
    };
  }

  async readUserPosition(user: Address): Promise<UserPosition> {
    const vault = await Vault.fetch(this.vaultAddress, this.publicClient);
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Get user's vault token balance (shares)
    const walletShares = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [user],
    });

    // Convert shares to assets
    const walletAssets = vault.convertToAssets(walletShares);

    // Get claimable shares (shares that can be minted after deposit settlement)
    const claimableShares = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: [
        {
          name: "maxMint",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "controller", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ] as const,
      functionName: "maxMint",
      args: [user],
    });

    // Get pending deposit request amount (assets pending before settlement)
    const pendingDepositAssets = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: [
        {
          name: "pendingDepositRequest",
          type: "function",
          stateMutability: "view",
          inputs: [
            { name: "requestId", type: "uint256" },
            { name: "controller", type: "address" },
          ],
          outputs: [{ name: "assets", type: "uint256" }],
        },
      ] as const,
      functionName: "pendingDepositRequest",
      args: [0n, user], // 0 is wildcard for all requests
    });

    return {
      walletShares,
      walletAssets,
      pendingDepositShares: pendingDepositAssets, // Assets pending before settlement
      pendingDepositAssets: pendingDepositAssets, // Same value for clarity
      claimableShares: claimableShares, // Claimable shares after settlement
      pendingRedeemShares: 0n,
      lastSettledDepositEpochId: vault.lastDepositEpochIdSettled,
      lastSettledRedeemEpochId: vault.lastRedeemEpochIdSettled,
    };
  }

  async enqueueDeposit(amountAssets: bigint, user: Address): Promise<DepositResult> {
    if (!this.walletClient?.account) {
      throw new Error("Wallet not connected");
    }

    // For Lagoon async vaults, we use requestDeposit (ERC-7540)
    // https://docs.lagoon.finance/developer-hub/integration/async-deposit-flow
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: [
        {
          name: "requestDeposit",
          type: "function",
          stateMutability: "payable",
          inputs: [
            { name: "assets", type: "uint256", internalType: "uint256" },
            { name: "controller", type: "address", internalType: "address" },
            { name: "owner", type: "address", internalType: "address" },
          ],
          outputs: [{ name: "requestId", type: "uint256", internalType: "uint256" }],
        },
      ] as const,
      functionName: "requestDeposit",
      args: [amountAssets, user, user],
      account: this.walletClient.account,
      chain: this.walletClient.chain,
    });

    return { hash };
  }

  async enqueueRedeem(amountShares: bigint, user: Address): Promise<RedeemResult> {
    if (!this.walletClient?.account) {
      throw new Error("Wallet not connected");
    }

    // For Lagoon async vaults, we use requestRedeem (ERC-7540)
    // https://docs.lagoon.finance/developer-hub/integration/async-deposit-flow
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: [
        {
          name: "requestRedeem",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "shares", type: "uint256", internalType: "uint256" },
            { name: "controller", type: "address", internalType: "address" },
            { name: "owner", type: "address", internalType: "address" },
          ],
          outputs: [{ name: "requestId", type: "uint256", internalType: "uint256" }],
        },
      ] as const,
      functionName: "requestRedeem",
      args: [amountShares, user, user],
      account: this.walletClient.account,
      chain: this.walletClient.chain,
    });

    return { hash };
  }

  async claimShares(shares: bigint, user: Address): Promise<{ hash: `0x${string}` }> {
    if (!this.walletClient?.account) {
      throw new Error("Wallet not connected");
    }

    // Claim shares after deposit settlement using mint function
    // https://docs.lagoon.finance/developer-hub/integration/async-deposit-flow
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: [
        {
          name: "mint",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "shares", type: "uint256", internalType: "uint256" },
            { name: "receiver", type: "address", internalType: "address" },
          ],
          outputs: [{ name: "", type: "uint256" }],
        },
      ] as const,
      functionName: "mint",
      args: [shares, user],
      account: this.walletClient.account,
      chain: this.walletClient.chain,
    });

    return { hash };
  }

  async cancelDeposit(_user: Address): Promise<{ hash: `0x${string}` }> {
    if (!this.walletClient?.account) {
      throw new Error("Wallet not connected");
    }

    // Cancel pending deposit request
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: [
        {
          name: "cancelRequestDeposit",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [],
          outputs: [],
        },
      ] as const,
      functionName: "cancelRequestDeposit",
      args: [],
      account: this.walletClient.account,
      chain: this.walletClient.chain,
    });

    return { hash };
  }

  async estimateApy(): Promise<number | null> {
    // Optional: Implement APY estimation using historical blocks
    // For now, return null as allocation/APY data isn't available
    return null;
  }
}

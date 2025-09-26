import { formatUnits, erc20Abi } from "viem";
import { parseUnits } from "viem";
import { useWalletClient } from "wagmi";
import { BrowserProvider, Contract } from "ethers";
import {
  Toasts,
  ConfirmDialog,
  fmtToken,
  fmtUsdSimple,
  friendlyError,
  Skeleton,
  type Toast,
  type ToastKind,
} from "./vault-shared";
import { hyperPublicClient } from "../viem/clients";
import vaultAbi from "../abis/vault.json";
import { useVaultCurrentApyOnchain } from "../hooks/useVaultCurrentApyOnchain";
import { useState, useEffect, useRef } from "react";
import { useVaultAllocationsOnchain } from "../hooks/useVaultAllocationsOnchain";
import { LiFiQuoteTest } from "./lifi-quote-test";
import { WithdrawalDialog } from "./withdrawal-dialog";
// Inline AllocationList component for on-chain allocations

// Simple error boundary to isolate rendering errors in the API View
import React from "react";
import { useTranslation } from "react-i18next";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; err?: Error }>{
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, err: error };
  }
  componentDidCatch(_error: Error) {
    // no-op: could log to a service later
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-[#FFFFF5] border border-red-200 rounded-md p-4 text-[#101720]">
          <div className="text-red-600 font-semibold mb-1">Something went wrong.</div>
          <div className="text-sm text-red-700/80">Try refreshing the page. If the problem persists, please report this issue.</div>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

import { getUsdt0Usd } from "../lib/prices"; // keeping current util; tooltips/UX polish below
import { ChainVaultGuard } from "./ChainVaultGuard";

// Allowed vaults per chain (checksum addresses)
const ALLOWED_VAULTS: Record<number, readonly `0x${string}`[]> = {
  999: [
    "0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42", // HyperEVM MYRMIDONS USDT0 PHALANX
  ],
  // 8453: ["0x..."], // Example for Base if needed later
} as const;



export function VaultAPIView({ vaultAddress }: { vaultAddress?: `0x${string}` }) {
  // UX: last refresh timestamp for data shown on this page
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, setTimeAgoTick] = useState<number>(0);
  const { t } = useTranslation();
  useEffect(() => {
    if (lastUpdated == null) return;
    const id = setInterval(() => setTimeAgoTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // If using HyperEVM (chainId 999), fetch vault data on-chain instead of via GraphQL
  const VAULT_ADDRESS = (vaultAddress ?? "0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42") as `0x${string}`;

  // Reset on address change so we refetch everything cleanly
  useEffect(() => {
    setOnchainData(null);
    setOnchainLoading(true);
    setOnchainError(null);
    setUsdPrice(null);
    setPriceLoading(true);
    setFeeWad(null);
    setFeeRecipient(null);
    setFeeError(null);
    setFeeLoading(true);
  }, [VAULT_ADDRESS]);
  const [onchainData, setOnchainData] = useState<{
    totalAssets: bigint;
    totalSupply: bigint;
    name: string;
    symbol: string;
    underlyingAddress: `0x${string}`;
    underlyingDecimals: number;
    shareDecimals: number;
  } | null>(null);
  const [onchainLoading, setOnchainLoading] = useState(true);
  const [onchainError, setOnchainError] = useState<Error | null>(null);

  const [usdPrice, setUsdPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState<boolean>(true);

  // Performance fee state
  const [feeWad, setFeeWad] = useState<bigint | null>(null);
  const [feeRecipient, setFeeRecipient] = useState<`0x${string}` | null>(null);
  const [feeLoading, setFeeLoading] = useState<boolean>(true);
  const [feeError, setFeeError] = useState<Error | null>(null);

  // Wallet & toasts
  const clientW = useWalletClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef<number>(1);
  const pushToast = (kind: ToastKind, text: string, ttl = 5000, href?: string) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((t) => [...t, { id, kind, text, href }]);
    if (ttl > 0) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  };

  // User state (HyperEVM tx path only)
  const [underlyingAddress, setUnderlyingAddress] = useState<`0x${string}` | null>(null);
  const [assetDecimals, setAssetDecimals] = useState<number>(18);
  // Approval confirmation dialog state
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [onchainBalance, setOnchainBalance] = useState<bigint>(0n); // underlying token balance
  const [userShares, setUserShares] = useState<bigint>(0n);
  const [userAssets, setUserAssets] = useState<bigint>(0n);
  const [depAmount, setDepAmount] = useState<string>("");
  const [pending, setPending] = useState<"approve" | "deposit" | null>(null);
  
  // Deposit dialog state
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  
  // Withdrawal dialog state
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  
  // Dialog close handler with position refresh
  const handleDialogClose = async () => {
    setDepositDialogOpen(false);
    
    // Refresh position data
    try {
      if (clientW.data?.account?.address && underlyingAddress) {
        const provider = new BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const vaultR = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
        const tokenR = new Contract(underlyingAddress, erc20Abi as any, signer);
        
        const [bal, shares, totalA, totalS] = await Promise.all([
          tokenR.balanceOf(clientW.data.account.address) as Promise<bigint>,
          vaultR.balanceOf(clientW.data.account.address) as Promise<bigint>,
          vaultR.totalAssets() as Promise<bigint>,
          vaultR.totalSupply() as Promise<bigint>,
        ]);
        const assets = (await vaultR.convertToAssets(shares)) as bigint;
        
        setOnchainBalance(bal);
        setUserShares(shares);
        setUserAssets(assets);
        setOnchainData((prev) => (prev ? { ...prev, totalAssets: totalA, totalSupply: totalS } : prev));
        setAllocRefreshKey((k) => k + 1);
        await refreshVaultTotalsFast();
      }
    } catch (error) {
      // Failed to refresh position data
    }
  };
  
  // Withdrawal dialog close handler with position refresh
  const handleWithdrawalClose = async () => {
    setWithdrawalDialogOpen(false);
    
    // Refresh position data (same as deposit)
    try {
      if (clientW.data?.account?.address && underlyingAddress) {
        const provider = new BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const vaultR = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
        const tokenR = new Contract(underlyingAddress, erc20Abi as any, signer);
        
        const [bal, shares, totalA, totalS] = await Promise.all([
          tokenR.balanceOf(clientW.data.account.address) as Promise<bigint>,
          vaultR.balanceOf(clientW.data.account.address) as Promise<bigint>,
          vaultR.totalAssets() as Promise<bigint>,
          vaultR.totalSupply() as Promise<bigint>,
        ]);
        const assets = (await vaultR.convertToAssets(shares)) as bigint;
        
        setOnchainBalance(bal);
        setUserShares(shares);
        setUserAssets(assets);
        setOnchainData((prev) => (prev ? { ...prev, totalAssets: totalA, totalSupply: totalS } : prev));
        setAllocRefreshKey((k) => k + 1);
        await refreshVaultTotalsFast();
      }
    } catch (error) {
      // Failed to refresh position data
    }
  };
  
  // Handle escape key press
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (depositDialogOpen || withdrawalDialogOpen)) {
        if (depositDialogOpen) {
          handleDialogClose();
        } else if (withdrawalDialogOpen) {
          handleWithdrawalClose();
        }
      }
    };
    
    if (depositDialogOpen || withdrawalDialogOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      return () => document.removeEventListener('keydown', handleEscapeKey);
    }
  }, [depositDialogOpen, withdrawalDialogOpen]);
  // Force re-mount allocations after confirmed txs
  const [allocRefreshKey, setAllocRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setFeeLoading(true);
        setFeeError(null);
        const client = hyperPublicClient;
        const [fee, recip] = await Promise.all([
          client.readContract({
            address: VAULT_ADDRESS as `0x${string}`,
            abi: vaultAbi,
            functionName: "fee",
          }),
          client.readContract({
            address: VAULT_ADDRESS as `0x${string}`,
            abi: vaultAbi,
            functionName: "feeRecipient",
          }),
        ]);
        if (cancelled) return;
        setFeeWad(fee as bigint);
        setFeeRecipient(recip as `0x${string}`);
      } catch (e) {
        if (!cancelled) setFeeError(e as Error);
      } finally {
        if (!cancelled) setFeeLoading(false);
        if (!cancelled) setLastUpdated(Date.now());
      }
    }
    run();
    const id = setInterval(run, 5 * 60_000); // refresh every 5 minutes
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [VAULT_ADDRESS]);

  useEffect(() => {
    if (!onchainData) {
      const client = hyperPublicClient;
      (async () => {
        try {
          // Batch with multicall for base vault data
          const mc = await client.multicall({
            contracts: [
              { address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi as any, functionName: "totalAssets", args: [] },
              { address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi as any, functionName: "totalSupply", args: [] },
              { address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi as any, functionName: "name", args: [] },
              { address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi as any, functionName: "symbol", args: [] },
              { address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi as any, functionName: "asset", args: [] },
              { address: VAULT_ADDRESS as `0x${string}`, abi: erc20Abi as any, functionName: "decimals", args: [] }, // share decimals (vault token)
            ],
          });
          const assets = mc[0].result as bigint;
          const supply = mc[1].result as bigint;
          const name = mc[2].result as string;
          const symbol = mc[3].result as string;
          const asset = mc[4].result as `0x${string}`;
          const shareDecs = mc[5].result as number;

          const decimals = (await client.readContract({
            address: asset,
            abi: erc20Abi,
            functionName: "decimals",
          })) as number;

          setOnchainData({
            totalAssets: assets,
            totalSupply: supply,
            name,
            symbol,
            underlyingAddress: asset,
            underlyingDecimals: Number(decimals),
            shareDecimals: Number(shareDecs),
          });
        } catch (e) {
          setOnchainError(e as Error);
        } finally {
          setOnchainLoading(false);
          setLastUpdated(Date.now());
        }
      })();
    }
  }, [onchainData, VAULT_ADDRESS]);

  useEffect(() => {
    if (onchainData?.underlyingAddress) {
      setUnderlyingAddress(onchainData.underlyingAddress);
      setAssetDecimals(onchainData.underlyingDecimals);
    }
  }, [onchainData?.underlyingAddress, onchainData?.underlyingDecimals]);

  // Fast-refresh TVL totals via wallet provider (avoids laggy public RPC)
  const refreshVaultTotalsFast = async () => {
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vaultR = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      const [totalA, totalS] = await Promise.all([
        vaultR.totalAssets() as Promise<bigint>,
        vaultR.totalSupply() as Promise<bigint>,
      ]);
      setOnchainData((prev) => (prev ? { ...prev, totalAssets: totalA, totalSupply: totalS } : prev));
      setLastUpdated(Date.now());
    } catch {}
  };

  // REMOVED: refreshWalletBalanceFast


  useEffect(() => {
    const user = clientW.data?.account?.address;
    if (!user || !underlyingAddress) return;
    const client = hyperPublicClient;
    (async () => {
      try {
        // Batch allowance, balance, shares with multicall
        const mcu = await client.multicall({
          contracts: [
            { address: underlyingAddress, abi: erc20Abi as any, functionName: "allowance", args: [user, VAULT_ADDRESS] },
            { address: underlyingAddress, abi: erc20Abi as any, functionName: "balanceOf", args: [user] },
            { address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi as any, functionName: "balanceOf", args: [user] },
          ],
        });
        const bal = mcu[1].result as bigint;
        const shares = mcu[2].result as bigint;
        const assets = (await client.readContract({ address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi, functionName: "convertToAssets", args: [shares] })) as bigint;
        setOnchainBalance(bal);
        setUserShares(shares);
        setUserAssets(assets);
      } catch {}
    })();
  }, [clientW.data?.account?.address, underlyingAddress, VAULT_ADDRESS]);

  // Approve exactly the amount entered
  const runApproveExact = async (amountWei: bigint) => {
    try {
      if (!clientW.data) throw new Error("Connect wallet");
      if (!underlyingAddress) throw new Error("Token unknown");
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const token = new Contract(underlyingAddress, erc20Abi as any, signer);
      setPending("approve");
      const tx = await token.approve(VAULT_ADDRESS, amountWei);
      pushToast("info", `Approval tx: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);

      // Prompt deposit immediately (do not wait for approval receipt)
      // Nonce ordering guarantees the deposit will only execute after approval is mined.
      // If it's mined in the same block, deposit proceeds seamlessly; otherwise it waits.
      try {
        runDeposit(amountWei); // fire-and-continue (no await) to surface the second wallet prompt now
      } catch {}

      // Still await approval receipt in the background to refresh UI state
      try {
        await hyperPublicClient.waitForTransactionReceipt({ hash: tx.hash, confirmations: 1, timeout: 15_000 });
        pushToast("success", t("vaultInfo.errors.approvalConfirmed"));
      } catch (err) {
        // Swallow timeout — deposit has already been prompted; nonce ordering will ensure safety
      } finally {
        // Allowance refresh removed - not needed for new deposit flow
        setLastUpdated(Date.now());
        setPending(null);
      }
    } catch (e) {
      setPending(null);
      pushToast("error", friendlyError(e));
    }
  };

  const runDeposit = async (overrideAmountWei?: bigint) => {
    try {
      if (!clientW.data) throw new Error(t("vaultInfo.errors.connectWallet"));
      if (!underlyingAddress) throw new Error(t("vaultInfo.errors.tokenUnknown"));
      const amountWei = overrideAmountWei ?? parseUnits(depAmount, assetDecimals);
      if (amountWei <= 0n) throw new Error(t("vaultInfo.errors.enterAmount"));
      if (amountWei > onchainBalance) throw new Error(t("vaultInfo.errors.insufficientBalance"));
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      setPending("deposit");
      const tx = await vault.deposit(amountWei, clientW.data.account.address);
      pushToast("info", `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);
      // Use wallet provider to wait for confirmation — typically faster than public RPCs
      await provider.waitForTransaction(tx.hash, 1, 20_000).catch(() => null);
      pushToast("success", t("vaultInfo.errors.depositSuccessful"));
      setPending(null);
      // Use wallet RPC for freshest reads immediately after confirmation
      const provider2 = new BrowserProvider((window as any).ethereum);
      const signer2 = await provider2.getSigner();
      const vaultR = new Contract(VAULT_ADDRESS, vaultAbi as any, signer2);
      const tokenR = new Contract(underlyingAddress, erc20Abi as any, signer2);

      const [bal, shares, totalA, totalS] = await Promise.all([
        tokenR.balanceOf(clientW.data.account.address) as Promise<bigint>,
        vaultR.balanceOf(clientW.data.account.address) as Promise<bigint>,
        vaultR.totalAssets() as Promise<bigint>,
        vaultR.totalSupply() as Promise<bigint>,
      ]);
      const assets = (await vaultR.convertToAssets(shares)) as bigint;

      setOnchainBalance(bal);
      setUserShares(shares);
      setUserAssets(assets);

      // Update TVL totals immediately without waiting for public client
      setOnchainData((prev) => (prev ? { ...prev, totalAssets: totalA, totalSupply: totalS } : prev));

      // Re-mount allocations to force on-chain refresh for the table
      setAllocRefreshKey((k) => k + 1);

      // Extra: immediate + delayed TVL refresh via wallet RPC
      await refreshVaultTotalsFast();
      setTimeout(() => { refreshVaultTotalsFast(); }, 2000);

      setDepAmount("");
    } catch (e) {
      setPending(null);
      pushToast("error", friendlyError(e));
    }
  };


  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!onchainData?.underlyingAddress) return;
      try {
        setPriceLoading(true);
        const p = await getUsdt0Usd({ token: onchainData.underlyingAddress });
        if (!cancelled) setUsdPrice(p ?? null);
        if (!cancelled) setLastUpdated(Date.now());
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    }
    run();
    const id = setInterval(run, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [onchainData?.underlyingAddress]);


  // Always call APY hook so it's available for skeleton and metrics
  const { apy, loading: apyLoading, error: apyError } = useVaultCurrentApyOnchain(
    VAULT_ADDRESS as `0x${string}`
  );
  useEffect(() => {
    if (!apyLoading) {
      setLastUpdated(Date.now());
    }
  }, [apyLoading]);

  // HyperEVM on-chain path
  if (onchainLoading) {
    return (
      <div className="space-y-4">
        {/* Top section: Vault header skeleton */}
        <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4 animate-pulse">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-[#E1E1D6] rounded-lg"></div>
            <div className="flex-1">
              <div className="h-5 bg-[#E1E1D6] rounded w-1/2 mb-1"></div>
              <div className="h-3 bg-[#E1E1D6] rounded w-3/4"></div>
            </div>
          </div>
          <div className="h-3 bg-[#E1E1D6] rounded w-full"></div>
        </div>
        
        {/* Middle section: Actions and Current Position skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Actions skeleton - 2/3 width */}
          <div className="lg:col-span-2">
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3 animate-pulse">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="text-center space-y-2">
                  <div className="h-5 bg-[#E1E1D6] rounded w-3/4 mx-auto"></div>
                  <div className="h-4 bg-[#E1E1D6] rounded w-5/6 mx-auto"></div>
                  <div className="h-8 bg-[#E1E1D6] rounded"></div>
                </div>
                <div className="text-center space-y-2">
                  <div className="h-5 bg-[#E1E1D6] rounded w-3/4 mx-auto"></div>
                  <div className="h-4 bg-[#E1E1D6] rounded w-5/6 mx-auto"></div>
                  <div className="h-8 bg-[#E1E1D6] rounded"></div>
                </div>
              </div>
            </div>
          </div>
          {/* Current Position skeleton - 1/3 width */}
          <div className="lg:col-span-1">
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3 animate-pulse">
              <div className="h-5 bg-[#E1E1D6] rounded w-24 mb-3"></div>
              <div className="space-y-3">
                <div className="text-center">
                  <div className="h-4 bg-[#E1E1D6] rounded w-16 mx-auto mb-1"></div>
                  <div className="h-5 bg-[#E1E1D6] rounded w-20 mx-auto"></div>
                </div>
                <div className="text-center">
                  <div className="h-4 bg-[#E1E1D6] rounded w-16 mx-auto mb-1"></div>
                  <div className="h-5 bg-[#E1E1D6] rounded w-20 mx-auto"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom section: metrics, allocations skeleton */}
        <div className="space-y-4">
          
          {/* Metrics skeleton */}
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-[#E1E1D6] rounded w-20 mb-3"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="text-center">
                  <div className="h-4 bg-[#E1E1D6] rounded w-16 mx-auto mb-1"></div>
                  <div className="h-3 bg-[#E1E1D6] rounded w-12 mx-auto"></div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Allocations skeleton */}
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3 animate-pulse">
            <div className="h-4 bg-[#E1E1D6] rounded w-20 mb-3"></div>
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 bg-[#E1E1D6] rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (onchainError) {
    return <p>Error loading on-chain vault: {onchainError.message}</p>;
  }
  if (onchainData) {
    // Compute TVL in USD using underlying decimals and live USD price
    const tvlUnits = Number(formatUnits(onchainData.totalAssets, onchainData.underlyingDecimals));
    const tvlUsd = typeof usdPrice === "number" ? tvlUnits * usdPrice : undefined;

    const userUsd = typeof usdPrice === "number" ? Number(formatUnits(userAssets, onchainData.underlyingDecimals)) * usdPrice : undefined;

    return (
      <ErrorBoundary>
        <div className="space-y-6">

        {/* Vault Info on top, Actions (2/3) & Current Position (1/3) below, then Metrics, Allocations */}
        <div className="space-y-4">
          {/* Top section: Vault Information */}
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <img 
                      src="/Myrmidons-logo-dark-no-bg.png" 
                      alt="Myrmidons Strategies" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 
                      className="text-xs font-bold text-[#00295B] mb-1 break-words"
                      style={{ fontSize: '36px', lineHeight: '1.2' }}
                    >
                      {onchainData.name}
                    </h1>
                    <p className="text-[#101720]/70 text-sm">
                      {t("vaultInfo.vaultHeader.address")} <span className="font-mono break-all">{VAULT_ADDRESS}</span>
                    </p>
                  </div>
                </div>
                <p className="text-[#101720]/80 text-sm leading-relaxed">
                  {t("vaultInfo.vaultHeader.description")}
                </p>
              </div>
            </div>
          </div>
          
          {/* Middle section: Actions (2/3) and Current Position (1/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Actions section - takes 2/3 of the grid */}
            <div className="lg:col-span-2">
              <ChainVaultGuard
                requiredChainId={999}
                requiredChainName="HyperEVM"
                vaultAddress={VAULT_ADDRESS as `0x${string}`}
                allowedVaultsByChain={ALLOWED_VAULTS}
                warnOnly={false}
              >
                {/* Enhanced Actions: Deposit and Withdraw */}
                <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3 h-full flex flex-col">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                    {/* Deposit Button */}
                    <div className="flex flex-col justify-center text-center">
                      <h4 className="text-base font-semibold text-[#00295B] mb-2">
                        {t("vaultInfo.actions.depositTitle")}
                      </h4>
                      <p className="text-sm text-[#101720]/70 mb-3 leading-relaxed">
                        {t("vaultInfo.actions.depositDescription")}
                      </p>
                      <button
                        type="button"
                        onClick={() => setDepositDialogOpen(true)}
                        className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                        style={{ backgroundColor: '#101720', color: '#FFFFF5' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0d1419'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#101720'}
                      >
                        {t("vaultInfo.actions.deposit")}
                      </button>
                    </div>
                    
                    {/* Withdraw Button */}
                    <div className="flex flex-col justify-center text-center">
                      <h4 className="text-base font-semibold text-[#00295B] mb-2">
                        {t("vaultInfo.actions.withdrawTitle")}
                      </h4>
                      <p className="text-sm text-[#101720]/70 mb-3 leading-relaxed">
                        {t("vaultInfo.actions.withdrawDescription")}
                      </p>
                      <button
                        type="button"
                        onClick={() => setWithdrawalDialogOpen(true)}
                        className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                        style={{ backgroundColor: '#101720', color: '#FFFFF5' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0d1419'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#101720'}
                      >
                        {t("vaultInfo.actions.withdraw")}
                      </button>
                    </div>
                  </div>
                </div>
              </ChainVaultGuard>
            </div>
            
            {/* Current Position section - takes 1/3 of the grid */}
            <div className="lg:col-span-1">
              <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3 h-full flex flex-col">
                <h3 className="text-base font-semibold text-[#00295B] mb-2">
                  {t("vaultInfo.position.title")}
                </h3>
                {!clientW.data?.account ? (
                  <div className="text-sm text-[#101720]/70 text-center py-3">
                    {t("vaultInfo.position.connectToView")}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 flex-1">
                    <div className="text-center">
                      <div className="text-sm text-[#101720]/70 mb-1">
                        {t("vaultInfo.position.shares")}
                      </div>
                      <div className="text-base font-semibold text-[#00295B]">{fmtToken(userShares, onchainData.shareDecimals)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-[#101720]/70 mb-1">
                        {t("vaultInfo.position.usdValue")}
                      </div>
                      <div className="text-base font-semibold text-[#00295B]">{priceLoading ? <Skeleton className="h-5 w-20 mx-auto"/> : (userUsd != null ? fmtUsdSimple(userUsd) : "—")}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Bottom section: metrics, allocations */}
          <div className="space-y-4">
            {/* Enhanced Metrics Section */}
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4">
              <div className="mb-3">
                <h2 className="text-lg font-bold text-[#00295B]">
                  {t("vaultInfo.metrics.title")}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-xl font-bold text-[#00295B] mb-1">
                    {priceLoading ? (
                      <div className="h-7 bg-[#E1E1D6] rounded animate-pulse"></div>
                    ) : tvlUsd !== undefined ? (
                      `$${tvlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    ) : (
                      "N/A"
                    )}
                  </div>
                  <p className="text-[#101720]/70 text-sm font-medium">
                    {t("vaultInfo.metrics.tvlUsd")}
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#00295B] mb-1">
                    {(() => {
                      // Compute share price = (assets/shares) * underlying USD, aligning decimals
                      const assetsUnderlying = Number(formatUnits(onchainData.totalAssets, onchainData.underlyingDecimals));
                      const shares = Number(formatUnits(onchainData.totalSupply, onchainData.shareDecimals));
                      const underlyingPriceUSD = typeof usdPrice === "number" && usdPrice > 0 ? usdPrice : 1; // USDT0-safe fallback
                      const sharePriceUSD = shares === 0 ? 0 : (assetsUnderlying / shares) * underlyingPriceUSD;
                      return priceLoading
                        ? <div className="h-7 bg-[#E1E1D6] rounded animate-pulse"></div>
                        : `$${sharePriceUSD.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
                    })()}
                  </div>
                  <p className="text-[#101720]/70 text-sm font-medium">
                    {t("vaultInfo.metrics.sharePrice")}
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#00295B] mb-1">
                    {apyLoading ? (
                      <div className="h-7 bg-[#E1E1D6] rounded animate-pulse"></div>
                    ) : apyError ? (
                      t("vaultInfo.errors.error")
                    ) : apy != null ? (
                      `${(apy * 100).toFixed(2)}%`
                    ) : (
                      "N/A"
                    )}
                  </div>
                  <p className="text-[#101720]/70 text-sm font-medium">
                    {t("vaultInfo.metrics.yield")}
                  </p>
                  {apyLoading && (
                    <p className="text-[#101720]/60 text-sm mt-1">
                      {t("vaultInfo.metrics.yieldHint")}
                    </p>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#00295B] mb-1">
                    {feeLoading ? (
                      <div className="h-7 bg-[#E1E1D6] rounded animate-pulse"></div>
                    ) : feeWad != null ? (
                      `${(Number(formatUnits(feeWad, 18)) * 100).toFixed(2)}%`
                    ) : feeError ? (
                      t("vaultInfo.errors.error")
                    ) : (
                      "N/A"
                    )}
                  </div>
                  <p className="text-[#101720]/70 text-sm font-medium">
                    {t("vaultInfo.metrics.performanceFee")}
                  </p>
                  {feeRecipient && (
                    <p className="text-[#101720]/60 text-sm mt-1">
                      <a
                        href={`https://purrsec.com/address/${feeRecipient}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {`${feeRecipient.slice(0, 6)}…${feeRecipient.slice(-4)}`}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </div>
            {/* Enhanced Allocations */}
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
              <div className="mb-3">
                <h2 className="text-base font-bold text-[#00295B]">
                  {t("vaultInfo.allocations.title")}
                </h2>
                <p className="text-sm text-[#101720]/70 mt-1">
                  {t("vaultInfo.allocations.subtitle")}
                </p>
              </div>
              <OnchainAllocations
                key={allocRefreshKey}
                vaultAddress={VAULT_ADDRESS as `0x${string}`}
                onSettled={(ts) => setLastUpdated(ts)}
              />
            </div>
          </div>
        </div>

        {/* Confirm dialog for approval */}
        <ConfirmDialog
          open={approveConfirmOpen}
          title={t("vaultInfo.actions.approveTitle", { symbol: "USDT0" })}
          body={
            <div className="text-sm">
              {t("vaultInfo.actions.approveBody", {
                defaultValue:
                  "This approval allows the vault to transfer exactly the amount you entered ({{amount}} {{symbol}}) on your behalf to complete the deposit. You will sign a separate transaction to confirm the deposit after approval.",
                amount: depAmount || "0",
                symbol: "USDT0"
              })}
            </div>
          }
          confirmLabel={t("vaultInfo.actions.approve")}
          cancelLabel={t("vaultInfo.actions.cancel")}
          onConfirm={() => {
            setApproveConfirmOpen(false);
            const amountWei = parseUnits(depAmount || "0", onchainData.underlyingDecimals);
            runApproveExact(amountWei);
          }}
          onCancel={() => setApproveConfirmOpen(false)}
          busy={pending === "approve"}
        />

        {/* Deposit Dialog */}
        {depositDialogOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              // Close dialog when clicking outside
              if (e.target === e.currentTarget) {
                handleDialogClose();
              }
            }}
          >
            {/* Blurred background - transparent with blur effect */}
            <div className="absolute inset-0 backdrop-blur-sm"></div>
            
            {/* Dialog container with cropping effect */}
            <div className="relative bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-[#E5E2D6]">
                <div className="flex items-center space-x-3">
                  <h2 className="text-xl font-semibold text-[#00295B]">
                    {t("vaultInfo.actions.depositTitle")}
                  </h2>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleDialogClose}
                    className="text-[#101720]/60 hover:text-[#101720] text-2xl font-bold"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
                <LiFiQuoteTest onClose={handleDialogClose} />
              </div>
            </div>
          </div>
        )}

        {/* Withdrawal Dialog */}
        {withdrawalDialogOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              // Close dialog when clicking outside
              if (e.target === e.currentTarget) {
                handleWithdrawalClose();
              }
            }}
          >
            {/* Blurred background - transparent with blur effect */}
            <div className="absolute inset-0 backdrop-blur-sm"></div>
            
            {/* Dialog container with cropping effect */}
            <div className="relative bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-[#E5E2D6]">
                <div className="flex items-center space-x-3">
                  <h2 className="text-xl font-semibold text-[#00295B]">
                    {t("vaultInfo.actions.withdrawTitle")}
                  </h2>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleWithdrawalClose}
                    className="text-[#101720]/60 hover:text-[#101720] text-2xl font-bold"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
                <WithdrawalDialog 
                  onClose={handleWithdrawalClose}
                  userShares={userShares}
                  shareDecimals={onchainData?.shareDecimals || 18}
                  underlyingDecimals={onchainData?.underlyingDecimals || 6}
                />
              </div>
            </div>
          </div>
        )}

        <Toasts toasts={toasts} />

      </div>
      </ErrorBoundary>
    );
  }

}

type AllocationRow = {
  id: `0x${string}`;
  label: string;
  assets: bigint;
  pct: number; // 0..100
  usd?: number | null;
  supplyApy?: number | null; // decimal (0..1)
  decimals?: number; // token decimals for amount formatting
  logo?: string | null;
};

function AllocationList({
  items,
  totalAssets,
  hiddenDust,
}: {
  items: AllocationRow[];
  totalAssets: bigint;
  hiddenDust?: bigint | null;
  decimals?: number;
}) {
  const { t } = useTranslation();
  const ceilPct = (n: number) => Math.max(0, Math.min(100, Math.ceil(n)));
  const pctOf = (v?: bigint | null) =>
    v != null && totalAssets !== 0n
      ? Math.max(0, Math.min(100, Number((v * 10000n) / totalAssets) / 100)).toFixed(2)
      : null;

  return (
    <div className="space-y-1">
      {/* Enhanced Header - Hidden on mobile, shown on larger screens */}
      <div className="hidden sm:grid grid-cols-12 text-xs font-semibold text-[#00295B] py-2 px-3 bg-[#F8F7F0] rounded-lg border border-[#E5E2D6]">
        <div className="col-span-5">{t("vaultInfo.allocations.columns.market")}</div>
        <div className="col-span-3 text-right">{t("vaultInfo.allocations.columns.share")}</div>
        <div className="col-span-2 text-right">{t("vaultInfo.allocations.columns.usd")}</div>
        <div className="col-span-2 text-right">{t("vaultInfo.allocations.columns.supplyApy")}</div>
      </div>

      {/* Enhanced Rows */}
      <div className="space-y-1">
        {items.map((it, index) => (
          <div key={it.id} className={`grid grid-cols-1 sm:grid-cols-12 items-center py-2 sm:py-3 px-2 sm:px-3 rounded-lg transition-colors ${
            index % 2 === 0 ? 'bg-[#F8F7F0]/50' : 'bg-transparent'
          } hover:bg-[#F8F7F0]`}>
            {/* Mobile Layout */}
            <div className="sm:hidden space-y-1">
              <div className="flex items-center space-x-2">
                {it.logo && (
                  <img
                    src={it.logo}
                    alt={it.label}
                    className="w-5 h-5 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <span className="font-medium text-[#101720] flex-1 text-sm">{it.label}</span>
                <span className="text-sm font-semibold text-[#00295B]">
                  {ceilPct(it.pct)}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#101720]/70">
                  USD: {it.usd != null ? `$${it.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "N/A"}
                </span>
                <span className="text-[#101720]/70">
                  APY: {it.supplyApy != null ? `${(it.supplyApy * 100).toFixed(2)}%` : "N/A"}
                </span>
              </div>
            </div>
            
            {/* Desktop Layout */}
            <div className="hidden sm:contents">
              <div className="col-span-5 flex items-center space-x-2 text-[#101720]">
                {it.logo && (
                  <img
                    src={it.logo}
                    alt={it.label}
                    className="w-5 h-5 rounded-full border border-[#E5E2D6] object-contain flex-shrink-0"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <span className="font-medium truncate text-sm">{it.label}</span>
              </div>
              <div className="col-span-3 text-right">
                <span className="text-sm font-semibold text-[#00295B]">
                  {ceilPct(it.pct)}%
                </span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-xs font-medium text-[#101720]">
                  {it.usd != null
                    ? `$${it.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "N/A"}
                </span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-xs font-medium text-[#101720]">
                  {it.supplyApy != null
                    ? `${(it.supplyApy * 100).toFixed(2)}%`
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Enhanced Hidden dust row */}
        {hiddenDust != null && hiddenDust > 0n && (
          <div className="grid grid-cols-1 sm:grid-cols-12 items-center py-3 sm:py-4 px-3 sm:px-4 bg-[#F8F7F0]/30 rounded-lg border border-[#E5E2D6]">
            <div className="sm:hidden text-center">
              <div className="font-medium text-[#101720] mb-1">
                {t("vaultInfo.allocations.otherDust")}
              </div>
              <div className="text-lg font-semibold text-[#00295B]">
                {pctOf(hiddenDust) ? `${pctOf(hiddenDust)}%` : "—"}
              </div>
            </div>
            <div className="hidden sm:contents">
              <div className="col-span-5 font-medium text-[#101720]">
                {t("vaultInfo.allocations.otherDust")}
              </div>
              <div className="col-span-3 text-right">
                <span className="text-lg font-semibold text-[#00295B]">
                  {pctOf(hiddenDust) ? `${pctOf(hiddenDust)}%` : "—"}
                </span>
              </div>
              <div className="col-span-2 text-right text-[#101720]/60">—</div>
              <div className="col-span-2 text-right text-[#101720]/60">—</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OnchainAllocations({ vaultAddress, onSettled }: { vaultAddress: `0x${string}`; onSettled?: (ts: number) => void }) {
  const { t } = useTranslation();
  const { items, totalAssets, hiddenDust, loading, error } = useVaultAllocationsOnchain(vaultAddress);

  useEffect(() => {
    if (!loading) {
      onSettled?.(Date.now());
    }
  }, [loading, onSettled]);

  if (loading) {
    return (
      <div className="space-y-1">
        {/* Enhanced Skeleton Header - Hidden on mobile */}
        <div className="hidden sm:grid grid-cols-12 text-xs font-semibold text-[#00295B] py-2 px-3 bg-[#F8F7F0] rounded-lg border border-[#E5E2D6]">
          <div className="col-span-5">{t("vaultInfo.allocations.columns.market")}</div>
          <div className="col-span-3 text-right">{t("vaultInfo.allocations.columns.share")}</div>
          <div className="col-span-2 text-right">{t("vaultInfo.allocations.columns.usd")}</div>
          <div className="col-span-2 text-right">{t("vaultInfo.allocations.columns.supplyApy")}</div>
        </div>
        {/* Enhanced Skeleton Rows */}
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`grid grid-cols-1 sm:grid-cols-12 items-center py-2 sm:py-3 px-2 sm:px-3 rounded-lg animate-pulse ${
              i % 2 === 0 ? 'bg-[#F8F7F0]/50' : 'bg-transparent'
            }`}>
              {/* Mobile Skeleton */}
              <div className="sm:hidden space-y-1">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-[#E1E1D6] rounded-full"></div>
                  <div className="h-4 bg-[#E1E1D6] rounded flex-1"></div>
                  <div className="h-4 bg-[#E1E1D6] rounded w-10"></div>
                </div>
                <div className="flex justify-between">
                  <div className="h-3 bg-[#E1E1D6] rounded w-16"></div>
                  <div className="h-3 bg-[#E1E1D6] rounded w-12"></div>
                </div>
              </div>
              {/* Desktop Skeleton */}
              <div className="hidden sm:contents">
                <div className="col-span-5 flex items-center space-x-2">
                  <div className="w-5 h-5 bg-[#E1E1D6] rounded-full"></div>
                  <div className="h-4 bg-[#E1E1D6] rounded w-20"></div>
                </div>
                <div className="col-span-3 text-right">
                  <div className="h-4 bg-[#E1E1D6] rounded w-10 ml-auto"></div>
                </div>
                <div className="col-span-2 text-right">
                  <div className="h-3 bg-[#E1E1D6] rounded w-12 ml-auto"></div>
                </div>
                <div className="col-span-2 text-right">
                  <div className="h-3 bg-[#E1E1D6] rounded w-10 ml-auto"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-500">{t("vaultInfo.allocations.error", { error })}</p>;
  if (!items || totalAssets === null) return <p className="text-sm text-[#101720]/70">{t("vaultInfo.allocations.empty")}</p>;

  return (
    <AllocationList
      items={items}
      totalAssets={totalAssets}
      hiddenDust={hiddenDust ?? null}
    />
  );
}
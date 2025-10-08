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
import { useVaultCurrentApyParallel } from "../hooks/useVaultCurrentApyParallel";
import { useState, useEffect, useRef, useCallback } from "react";
import { useVaultAllocationsOptimized } from "../hooks/useVaultAllocationsOptimized";
import { GroupedAllocationList } from "./grouped-allocation-list";
import { AllocationPieChart } from "./allocation-pie-chart";
import { LiFiQuoteTest } from "./lifi-quote-test";
import { WithdrawalDialog } from "./withdrawal-dialog";
import InnerPageHero from "./InnerPageHero";
import MetricCard from "./MetricCard";
import CopyableAddress from "./CopyableAddress";
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

  // Check for #deposit hash on mount and open dialog
  useEffect(() => {
    if (window.location.hash === '#deposit') {
      setDepositDialogOpen(true);
      // Remove the hash from URL without triggering page reload
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);
  
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
      console.error('Failed to refresh position data:', error);
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
      console.error('Failed to refresh position data:', error);
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
  
  // Stable callback for onSettled to prevent infinite loops
  const handleAllocationsSettled = useCallback((ts: number) => {
    setLastUpdated(ts);
  }, []);
  
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
        console.warn(t("vaultInfo.errors.approvalTimeout"), err);
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
  const { apy, loading: apyLoading, error: apyError } = useVaultCurrentApyParallel(
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
      <div className="space-y-6">
        {/* Hero Section Skeleton */}
        <div className="relative w-full py-10 md:py-12" style={{ background: 'var(--bg, #FFFFF5)' }}>
          <div className="relative max-w-6xl mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="flex-1">
                <div className="h-8 md:h-10 bg-[#E1E1D6] rounded w-3/4 mb-3 animate-pulse"></div>
                <div className="h-5 bg-[#E1E1D6] rounded w-full mb-4 animate-pulse"></div>
                <div className="flex items-center gap-2 flex-wrap">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-6 bg-[#E1E1D6] rounded-full w-20 animate-pulse"></div>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="h-16 bg-[#E1E1D6] rounded w-48 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Middle section: Actions (8/12) and Current Position (4/12) skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Actions skeleton - 8/12 width */}
          <div className="lg:col-span-8">
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5 h-full flex flex-col animate-pulse">
              <div className="h-6 bg-[#E1E1D6] rounded w-16 mb-4"></div>
              <div className="flex gap-3 mb-3">
                <div className="flex-1 h-12 bg-[#E1E1D6] rounded-2xl"></div>
                <div className="flex-1 h-12 bg-[#E1E1D6] rounded-2xl"></div>
              </div>
              <div className="h-3 bg-[#E1E1D6] rounded w-full"></div>
            </div>
          </div>
          {/* Current Position skeleton - 4/12 width */}
          <div className="lg:col-span-4">
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5 h-full flex flex-col animate-pulse">
              <div className="h-6 bg-[#E1E1D6] rounded w-32 mb-4"></div>
              <div className="space-y-3">
                <div>
                  <div className="h-3 bg-[#E1E1D6] rounded w-12 mb-1"></div>
                  <div className="h-5 bg-[#E1E1D6] rounded w-20"></div>
                </div>
                <div>
                  <div className="h-3 bg-[#E1E1D6] rounded w-16 mb-1"></div>
                  <div className="h-5 bg-[#E1E1D6] rounded w-24"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom section: metrics, allocations skeleton */}
        <div className="space-y-4">
          
          {/* Metrics skeleton */}
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5 animate-pulse">
            <div className="h-6 bg-[#E1E1D6] rounded w-24 mb-4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="text-center">
                  <div className="h-4 bg-[#E1E1D6] rounded w-16 mx-auto mb-1"></div>
                  <div className="h-7 bg-[#E1E1D6] rounded w-20 mx-auto mb-1"></div>
                </div>
              ))}
            </div>
            <div className="mt-3 h-3 bg-[#E1E1D6] rounded w-32 mx-auto"></div>
          </div>
          
          {/* Allocations skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Allocations List skeleton - 2/3 width */}
            <div className="lg:col-span-2">
              <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3 h-full animate-pulse">
                <div className="h-5 bg-[#E1E1D6] rounded w-20 mb-3"></div>
                <div className="h-3 bg-[#E1E1D6] rounded w-full mb-4"></div>
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 bg-[#E1E1D6] rounded"></div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Pie Chart skeleton - 1/3 width */}
            <div className="lg:col-span-1">
              <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3 h-96 animate-pulse">
                <div className="flex items-center justify-center h-full">
                  <div className="w-32 h-32 bg-[#E1E1D6] rounded-full"></div>
                </div>
              </div>
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

        {/* Hero Section */}
        <InnerPageHero
          title={onchainData.name}
          subtitle={t("vaultInfo.vaultHeader.description")}
          badges={[
            { label: "Powered by Morpho", href: "https://morpho.org/" },
            { label: "HyperEVM" },
            { label: "ERC-4626" },
            { label: "Non-custodial" },
          ]}
        rightSlot={
          <CopyableAddress
            address={VAULT_ADDRESS}
            explorerUrl={`https://hyperevmscan.io/address/${VAULT_ADDRESS}`}
            label={t("vaultInfo.vaultHeader.address")}
            loading={onchainLoading}
          />
        }
        />

        {/* Vault Info on top, Actions (2/3) & Current Position (1/3) below, then Metrics, Allocations */}
        <div className="space-y-4">
          
          {/* Middle section: Actions (8/12) and Current Position (4/12) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Actions section - takes 8/12 of the grid */}
            <div className="lg:col-span-8">
              <ChainVaultGuard
                requiredChainId={999}
                requiredChainName="HyperEVM"
                vaultAddress={VAULT_ADDRESS as `0x${string}`}
                allowedVaultsByChain={ALLOWED_VAULTS}
                warnOnly={false}
              >
                <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5 h-full flex flex-col">
                  <h3 className="text-lg font-semibold text-[#00295B] mb-4">
                    {t("vaultInfo.actions.title")}
                  </h3>
                  <div className="flex gap-3 mb-3">
                    <button
                      type="button"
                      onClick={() => setDepositDialogOpen(true)}
                      className="flex-1 px-5 py-3 text-sm font-semibold rounded-2xl transition-all duration-200"
                      style={{ background: 'var(--muted-brass, #B08D57)', color: '#fff' }}
                    >
                      {t("vaultInfo.actions.deposit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWithdrawalDialogOpen(true)}
                      className="flex-1 px-5 py-3 text-sm font-semibold rounded-2xl border transition-all duration-200"
                      style={{ borderColor: 'var(--heading, #00295B)', color: 'var(--heading, #00295B)' }}
                    >
                      {t("vaultInfo.actions.withdraw")}
                    </button>
                  </div>
                  <p className="text-xs text-center" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
                    {t("vaultInfo.actions.depositDescription")}
                  </p>
                </div>
              </ChainVaultGuard>
            </div>
            
            {/* Current Position section - takes 4/12 of the grid */}
            <div className="lg:col-span-4">
              <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5 h-full flex flex-col">
                <h3 className="text-lg font-semibold text-[#00295B] mb-4">
                  {t("vaultInfo.position.title")}
                </h3>
                {!clientW.data?.account ? (
                  <div className="text-sm text-[#101720]/70 text-center py-4">
                    {t("vaultInfo.position.connectToView")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
                        {t("vaultInfo.position.shares")}
                      </div>
                      <div className="text-lg font-semibold text-[#00295B]">{fmtToken(userShares, onchainData.shareDecimals)}</div>
                    </div>
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
                        {t("vaultInfo.position.usdValue")}
                      </div>
                      <div className="text-lg font-semibold text-[#00295B]">{priceLoading ? <Skeleton className="h-5 w-20"/> : (userUsd != null ? fmtUsdSimple(userUsd) : "—")}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Bottom section: metrics, allocations */}
          <div className="space-y-4">
            {/* Enhanced Metrics Section */}
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-[#00295B]">
                  {t("vaultInfo.metrics.title")}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  label={t("vaultInfo.metrics.tvlUsd")}
                  value={
                    tvlUsd !== undefined
                      ? `$${tvlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : "N/A"
                  }
                  loading={priceLoading}
                />
                <MetricCard
                  label={t("vaultInfo.metrics.sharePrice")}
                  value={(() => {
                    const assetsUnderlying = Number(formatUnits(onchainData.totalAssets, onchainData.underlyingDecimals));
                    const shares = Number(formatUnits(onchainData.totalSupply, onchainData.shareDecimals));
                    const underlyingPriceUSD = typeof usdPrice === "number" && usdPrice > 0 ? usdPrice : 1;
                    const sharePriceUSD = shares === 0 ? 0 : (assetsUnderlying / shares) * underlyingPriceUSD;
                    return `$${sharePriceUSD.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
                  })()}
                  loading={priceLoading}
                />
                <MetricCard
                  label={t("vaultInfo.metrics.yield")}
                  value={
                    apyError
                      ? t("vaultInfo.errors.error")
                      : apy != null
                      ? `${(apy * 100).toFixed(2)}%`
                      : "N/A"
                  }
                  tooltip="Current net supply APY of underlying allocation; variable."
                  loading={apyLoading}
                />
                <MetricCard
                  label={t("vaultInfo.metrics.performanceFee")}
                  value={
                    feeWad != null
                      ? `${(Number(formatUnits(feeWad, 18)) * 100).toFixed(2)}%`
                      : feeError
                      ? t("vaultInfo.errors.error")
                      : "N/A"
                  }
                  footnote={
                    feeRecipient ? (
                      <a
                        href={`https://purrsec.com/address/${feeRecipient}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {`${feeRecipient.slice(0, 6)}…${feeRecipient.slice(-4)}`}
                      </a>
                    ) : undefined
                  }
                  loading={feeLoading}
                />
              </div>
              {lastUpdated && (
                <div className="mt-3 text-xs text-center" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
                  Last updated · {new Date(lastUpdated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })} UTC
                </div>
              )}
            </div>
            {/* Enhanced Allocations with Pie Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Allocations List - 2/3 width */}
              <div className="lg:col-span-2">
                <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3 h-full">
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
                    onSettled={handleAllocationsSettled}
                  />
                </div>
              </div>
              
              {/* Pie Chart - 1/3 width */}
              <div className="lg:col-span-1">
                <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3 h-96">
                  <AllocationPieChartWrapper
                    key={allocRefreshKey}
                    vaultAddress={VAULT_ADDRESS as `0x${string}`}
                  />
                </div>
              </div>
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

        {/* Mobile Sticky Bottom CTA Bar */}
        <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-[#FFFFF5] border-t border-[#E5E2D6] p-4 z-40 shadow-lg">
          <div className="flex gap-3 max-w-6xl mx-auto">
            <button
              type="button"
              onClick={() => setDepositDialogOpen(true)}
              className="flex-1 px-4 py-3 text-sm font-semibold rounded-2xl transition-all duration-200"
              style={{ background: 'var(--muted-brass, #B08D57)', color: '#fff' }}
            >
              {t("vaultInfo.actions.deposit")}
            </button>
            <button
              type="button"
              onClick={() => setWithdrawalDialogOpen(true)}
              className="flex-1 px-4 py-3 text-sm font-semibold rounded-2xl border transition-all duration-200"
              style={{ borderColor: 'var(--heading, #00295B)', color: 'var(--heading, #00295B)' }}
            >
              {t("vaultInfo.actions.withdraw")}
            </button>
          </div>
        </div>

      </div>
      </ErrorBoundary>
    );
  }

}

// Pie Chart wrapper component
function AllocationPieChartWrapper({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { t } = useTranslation();
  const { 
    groupedItems, 
    totalAssets, 
    loading, 
    error 
  } = useVaultAllocationsOptimized(vaultAddress);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse">
          <div className="w-32 h-32 bg-[#E1E1D6] rounded-full mx-auto mb-4"></div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-[#E1E1D6] rounded-full"></div>
                <div className="h-4 bg-[#E1E1D6] rounded w-20"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return <p className="text-sm text-red-500 text-center py-8">{t("vaultInfo.allocations.error", { error })}</p>;
  }
  
  if (!groupedItems || totalAssets === null) {
    return <p className="text-sm text-[#101720]/70 text-center py-8">{t("vaultInfo.allocations.empty")}</p>;
  }

  return <AllocationPieChart groupedItems={groupedItems} totalAssets={totalAssets} />;
}

// Removed AllocationRow type - now using AllocationItem from allocation-grouper

// Removed AllocationList function - now using GroupedAllocationList

function OnchainAllocations({ vaultAddress, onSettled }: { vaultAddress: `0x${string}`; onSettled?: (ts: number) => void }) {
  const { t } = useTranslation();
  const { 
    groupedItems, 
    groupingResult, 
    totalAssets, 
    loading, 
    error 
  } = useVaultAllocationsOptimized(vaultAddress);

  useEffect(() => {
    if (!loading) {
      onSettled?.(Date.now());
    }
  }, [loading, onSettled]);

  if (loading) {
    return (
      <div className="space-y-1">
        {/* Enhanced Skeleton Header - Hidden on mobile */}
        <div className="hidden sm:grid grid-cols-12 text-xs font-semibold text-[#00295B] py-3 px-4 border-b-2 border-gray-300">
          <div className="col-span-5">{t("vaultInfo.allocations.columns.market")}</div>
          <div className="col-span-3 text-right">{t("vaultInfo.allocations.columns.share")}</div>
          <div className="col-span-2 text-right">{t("vaultInfo.allocations.columns.usd")}</div>
          <div className="col-span-2 text-right">{t("vaultInfo.allocations.columns.supplyApy")}</div>
        </div>
        {/* Enhanced Skeleton Rows */}
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`grid grid-cols-1 sm:grid-cols-12 items-center py-3 sm:py-4 px-3 sm:px-4 animate-pulse border-b border-gray-200`}>
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
  if (!groupedItems || !groupingResult || totalAssets === null) return <p className="text-sm text-[#101720]/70">{t("vaultInfo.allocations.empty")}</p>;

  return (
    <GroupedAllocationList
      groupedItems={groupedItems}
      ungroupedItems={groupingResult.ungroupedItems}
      totalAssets={totalAssets}
    />
  );
}
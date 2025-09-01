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
  NET_FLOW_STORE_KEY,
  type Toast,
  type ToastKind,
} from "./vault-shared";
import { hyperPublicClient } from "../viem/clients";
import vaultAbi from "../abis/Vault.json";
import { useVaultCurrentApyOnchain } from "../hooks/useVaultCurrentApyOnchain";
import { useState, useEffect, useRef } from "react";
import { useVaultAllocationsOnchain } from "../hooks/useVaultAllocationsOnchain";
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
  componentDidCatch(error: Error) {
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

  const renderTimeAgo = () => {
    if (!lastUpdated) return null;
    const seconds = Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000));
    const parts = seconds < 60
      ? `${seconds}s`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m`
        : `${Math.floor(seconds / 3600)}h`;
    return (
      <span className="text-xs text-[#101720]/60">
        {t("common.lastUpdated", { defaultValue: "Last updated {{timeAgo}} ago", timeAgo: parts })}
      </span>
    );
  };
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
  const [confirmKind, setConfirmKind] = useState<"approve" | null>(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [onchainBalance, setOnchainBalance] = useState<bigint>(0n); // underlying token balance
  const [userShares, setUserShares] = useState<bigint>(0n);
  const [userAssets, setUserAssets] = useState<bigint>(0n);
  const [depAmount, setDepAmount] = useState<string>("");
  const [wdAmount, setWdAmount] = useState<string>("");
  const [pending, setPending] = useState<"approve" | "deposit" | "withdraw" | null>(null);
  const [txMode, setTxMode] = useState<"deposit" | "withdraw">("deposit");
  // Force re-mount allocations after confirmed txs
  const [allocRefreshKey, setAllocRefreshKey] = useState(0);
  const TX_MODE_KEY = `TX_MODE_PREF:${VAULT_ADDRESS}`;
  // Load persisted toggle
  useEffect(() => {
    try {
      const v = localStorage.getItem(TX_MODE_KEY);
      if (v === "deposit" || v === "withdraw") setTxMode(v);
    } catch {}
  }, [TX_MODE_KEY]);
  // Persist on change
  useEffect(() => {
    try { localStorage.setItem(TX_MODE_KEY, txMode); } catch {}
  }, [TX_MODE_KEY, txMode]);
  const [netFlowWei, setNetFlowWei] = useState<bigint>(0n);
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

  useEffect(() => {
    const user = clientW.data?.account?.address;
    if (!user) { setNetFlowWei(0n); return; }
    try {
      const k = NET_FLOW_STORE_KEY(999, VAULT_ADDRESS, user);
      const raw = localStorage.getItem(k);
      setNetFlowWei(raw ? BigInt(raw) : 0n);
    } catch { setNetFlowWei(0n); }
  }, [clientW.data?.account?.address, VAULT_ADDRESS]);

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
        const allow = mcu[0].result as bigint;
        const bal = mcu[1].result as bigint;
        const shares = mcu[2].result as bigint;
        const assets = (await client.readContract({ address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi, functionName: "convertToAssets", args: [shares] })) as bigint;
        setAllowance(allow);
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
        pushToast("success", "Approval confirmed");
      } catch (err) {
        // Swallow timeout — deposit has already been prompted; nonce ordering will ensure safety
        console.warn("Approval receipt wait timed out", err);
      } finally {
        // Try to refresh allowance either way (non-blocking semantics)
        try {
          const allow = await hyperPublicClient.readContract({
            address: underlyingAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [clientW.data.account.address, VAULT_ADDRESS],
          }) as bigint;
          setAllowance(allow);
        } catch {}
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
      if (!clientW.data) throw new Error("Connect wallet");
      if (!underlyingAddress) throw new Error("Token unknown");
      const amountWei = overrideAmountWei ?? parseUnits(depAmount, assetDecimals);
      if (amountWei <= 0n) throw new Error("Enter amount");
      if (amountWei > onchainBalance) throw new Error("Insufficient balance");
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      setPending("deposit");
      const tx = await vault.deposit(amountWei, clientW.data.account.address);
      pushToast("info", `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);
      // Use wallet provider to wait for confirmation — typically faster than public RPCs
      await provider.waitForTransaction(tx.hash, 1, 20_000).catch(() => null);
      pushToast("success", "Deposit successful");
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

      // net flow update
      try {
        const k = NET_FLOW_STORE_KEY(999, VAULT_ADDRESS, clientW.data.account.address);
        const current = (() => { try { return BigInt(localStorage.getItem(k) || "0"); } catch { return 0n; } })();
        const next = current + amountWei; setNetFlowWei(next); try { localStorage.setItem(k, next.toString()); } catch {}
      } catch {}
      setDepAmount("");
    } catch (e) {
      setPending(null);
      pushToast("error", friendlyError(e));
    }
  };

  const runWithdraw = async (full = false) => {
    try {
      if (!clientW.data) throw new Error("Connect wallet");
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      setPending("withdraw");
      let tx, withdrawnAssetsWei: bigint = 0n;
      if (full) {
        const shares = await hyperPublicClient.readContract({ address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi, functionName: "balanceOf", args: [clientW.data.account.address] }) as bigint;
        const assetsOut = await hyperPublicClient.readContract({ address: VAULT_ADDRESS as `0x${string}`, abi: vaultAbi, functionName: "previewRedeem", args: [shares] }) as bigint;
        tx = await vault.withdraw(assetsOut, clientW.data.account.address, clientW.data.account.address);
        withdrawnAssetsWei = assetsOut;
      } else {
        const amt = parseUnits(wdAmount, assetDecimals);
        if (amt <= 0n) throw new Error("Enter amount");
        tx = await vault.withdraw(amt, clientW.data.account.address, clientW.data.account.address);
        withdrawnAssetsWei = amt;
      }
      pushToast("info", `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);
      // Use wallet provider to wait for confirmation — typically faster than public RPCs
      await provider.waitForTransaction(tx.hash, 1, 20_000).catch(() => null);
      pushToast("success", "Withdraw successful");
      setPending(null);
      // Use wallet RPC for freshest reads
      const provider2 = new BrowserProvider((window as any).ethereum);
      const signer2 = await provider2.getSigner();
      const vaultR = new Contract(VAULT_ADDRESS, vaultAbi as any, signer2);
      const tokenR = new Contract(underlyingAddress!, erc20Abi as any, signer2);

      const [bal, shares2, totalA2, totalS2] = await Promise.all([
        tokenR.balanceOf(clientW.data.account.address) as Promise<bigint>,
        vaultR.balanceOf(clientW.data.account.address) as Promise<bigint>,
        vaultR.totalAssets() as Promise<bigint>,
        vaultR.totalSupply() as Promise<bigint>,
      ]);
      const assets2 = (await vaultR.convertToAssets(shares2)) as bigint;

      setOnchainBalance(bal);
      setUserShares(shares2);
      setUserAssets(assets2);

      // Update TVL immediately
      setOnchainData((prev) => (prev ? { ...prev, totalAssets: totalA2, totalSupply: totalS2 } : prev));

      // Force allocations refresh
      setAllocRefreshKey((k) => k + 1);

      // Extra: immediate + delayed TVL refresh via wallet RPC
      await refreshVaultTotalsFast();
      setTimeout(() => { refreshVaultTotalsFast(); }, 2000);

      // net flow update
      try {
        const k = NET_FLOW_STORE_KEY(999, VAULT_ADDRESS, clientW.data.account.address);
        const current = (() => { try { return BigInt(localStorage.getItem(k) || "0"); } catch { return 0n; } })();
        const next = current - withdrawnAssetsWei; setNetFlowWei(next); try { localStorage.setItem(k, next.toString()); } catch {}
      } catch {}
      setWdAmount("");
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
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
          {/* Left column skeletons */}
          <div className="lg:col-span-2 space-y-6">
            {/* Info / About skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6 animate-pulse">
                <div className="h-6 bg-[#E1E1D6] rounded w-1/3 mb-3"></div>
                <div className="h-4 bg-[#E1E1D6] rounded w-2/3"></div>
              </div>
              <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6 animate-pulse">
                <div className="h-6 bg-[#E1E1D6] rounded w-1/4 mb-3"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-[#E1E1D6] rounded"></div>
                  <div className="h-4 bg-[#E1E1D6] rounded w-5/6"></div>
                  <div className="h-4 bg-[#E1E1D6] rounded w-4/6"></div>
                </div>
              </div>
            </div>
            {/* Metrics skeleton */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 bg-[#E1E1D6] rounded w-20"></div>
                <div className="h-3 bg-[#E1E1D6] rounded w-28"></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4 animate-pulse">
                    <div className="h-3 bg-[#E1E1D6] rounded w-1/3 mb-2"></div>
                    <div className="h-6 bg-[#E1E1D6] rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            </div>
            {/* Allocations skeleton */}
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6 animate-pulse">
              <div className="h-5 bg-[#E1E1D6] rounded w-24 mb-3"></div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 bg-[#E1E1D6] rounded mb-2"></div>
              ))}
            </div>
          </div>
          {/* Right column skeletons */}
          <div className="space-y-6">
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6 animate-pulse">
              <div className="h-5 bg-[#E1E1D6] rounded w-24 mb-4"></div>
              <div className="h-10 bg-[#E1E1D6] rounded mb-2"></div>
              <div className="h-10 bg-[#E1E1D6] rounded mb-2"></div>
              <div className="h-10 bg-[#E1E1D6] rounded"></div>
            </div>
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6 animate-pulse">
              <div className="h-5 bg-[#E1E1D6] rounded w-32 mb-2"></div>
              <div className="space-y-3">
                <div className="h-4 bg-[#E1E1D6] rounded w-28"></div>
                <div className="h-6 bg-[#E1E1D6] rounded w-36"></div>
                <div className="h-4 bg-[#E1E1D6] rounded w-24"></div>
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
    const investedUnits = Number(formatUnits(netFlowWei, onchainData.underlyingDecimals));
    const investedUsd = typeof usdPrice === "number" ? investedUnits * usdPrice : undefined;
    const pnlUsd = userUsd != null && investedUsd != null ? userUsd - investedUsd : undefined;
    const roiPct = pnlUsd != null && investedUsd ? (pnlUsd / investedUsd) * 100 : undefined;

    return (
      <ErrorBoundary>
        <div className="space-y-6">

        {/* Actions & Current Position (right), Vault Info, Metrics, Allocations (left) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
          {/* Left side: vault info, metrics, allocations */}
          <div className="lg:col-span-2 space-y-6">
            {/* Top: two columns (Info / About) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Vault name & address */}
              <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6">
                <h2 className="text-2xl font-semibold text-[#00295B]">{onchainData.name}</h2>
                <p className="text-[#101720]/70 text-sm mt-1">
                  Vault Address:&nbsp;
                  <span className="font-mono break-all">{VAULT_ADDRESS}</span>
                </p>
              </div>
              {/* Right: About */}
              <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2 text-[#00295B]">
                  {t("vaultInfo.about.title", { defaultValue: "About" })}
                </h3>
                <p className="text-[#101720]/80 text-sm">
                  {t("vaultInfo.about.body", {
                    defaultValue:
                      "MYRMIDONS USDT0 PHALANX allocates liquidity across selected Morpho markets on HyperEVM to capture yield while respecting strict risk limits."
                  })}
                </p>
              </div>
            </div>
            {/* Metrics: TVL / Underlying / Yield / Performance Fee */}
            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-[#00295B]">
                  {t("vaultInfo.metrics.title", { defaultValue: "Metrics" })}
                </div>
                {renderTimeAgo()}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4">
                  <p className="text-[#101720]/70 text-xs">
                    {t("vaultInfo.metrics.tvlUsd", { defaultValue: "TVL (USD)" })}
                  </p>
                  <p className="text-xl font-semibold mt-1 text-[#101720]">
                    {priceLoading ? (
                      "Loading…"
                    ) : tvlUsd !== undefined ? (
                      `$${tvlUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    ) : (
                      "N/A"
                    )}
                  </p>
                </div>
                <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4">
                  <p className="text-[#101720]/70 text-xs">
                    {t("vaultInfo.metrics.sharePrice", { defaultValue: "Share price (USD)" })}
                  </p>
                  <p className="text-xl font-semibold mt-1 text-[#101720]">
                    {(() => {
                      // Compute share price = (assets/shares) * underlying USD, aligning decimals
                      const assetsUnderlying = Number(formatUnits(onchainData.totalAssets, onchainData.underlyingDecimals));
                      const shares = Number(formatUnits(onchainData.totalSupply, onchainData.shareDecimals));
                      const underlyingPriceUSD = typeof usdPrice === "number" && usdPrice > 0 ? usdPrice : 1; // USDT0-safe fallback
                      const sharePriceUSD = shares === 0 ? 0 : (assetsUnderlying / shares) * underlyingPriceUSD;
                      return priceLoading
                        ? "Loading…"
                        : `$${sharePriceUSD.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
                    })()}
                  </p>
                </div>
                <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4">
                  <p className="text-[#101720]/70 text-xs">
                    {t("vaultInfo.metrics.yield", { defaultValue: "Current APY" })}
                  </p>
                  <p className="text-xl font-semibold mt-1 text-[#101720]">
                    {apyLoading ? (
                      "Computing…"
                    ) : apyError ? (
                      "Error"
                    ) : apy != null ? (
                      `${(apy * 100).toFixed(2)}%`
                    ) : (
                      "N/A"
                    )}
                  </p>
                  <p className="text-[#101720]/60 text-xs mt-1">
                    {t("vaultInfo.metrics.yieldHint", { defaultValue: "Blended APY by allocation" })}
                  </p>
                </div>
                <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4">
                  <p className="text-[#101720]/70 text-xs">
                    {t("vaultInfo.metrics.performanceFee", { defaultValue: "Performance fee" })}
                  </p>
                  <p className="text-xl font-semibold mt-1 text-[#101720]">
                    {feeLoading ? (
                      "Loading…"
                    ) : feeWad != null ? (
                      `${(Number(formatUnits(feeWad, 18)) * 100).toFixed(2)}%`
                    ) : feeError ? (
                      "Error"
                    ) : (
                      "N/A"
                    )}
                  </p>
                  <p className="text-[#101720]/60 text-xs mt-1">
                    {t("vaultInfo.metrics.recipient", { defaultValue: "Recipient" })}:
                    {" "}
                    {feeRecipient ? (
                      <a
                        href={`https://purrsec.com/address/${feeRecipient}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {`${feeRecipient.slice(0, 6)}…${feeRecipient.slice(-4)}`}
                      </a>
                    ) : (
                      "N/A"
                    )}
                  </p>
                </div>
              </div>
            </div>
            {/* Allocations */}
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-[#00295B]">
                  {t("vaultInfo.allocations.title", { defaultValue: "Allocations" })}
                </h3>
                <span className="text-xs text-[#101720]/70">
                  {t("vaultInfo.allocations.caption", { defaultValue: "Share • USD • Supply APY" })}
                </span>
              </div>
              <OnchainAllocations
                key={allocRefreshKey}
                vaultAddress={VAULT_ADDRESS as `0x${string}`}
                onSettled={(ts) => setLastUpdated(ts)}
              />
            </div>
          </div>
          {/* Right side: actions above current position */}
          <div className="space-y-6">
            <ChainVaultGuard
              requiredChainId={999}
              requiredChainName="HyperEVM"
              vaultAddress={VAULT_ADDRESS as `0x${string}`}
              allowedVaultsByChain={ALLOWED_VAULTS}
              warnOnly={false}
            >
              {/* Actions: Deposit / Withdraw (toggle) */}
              <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-[#00295B]">
                    {t("vaultInfo.actions.title", { defaultValue: "Actions" })}
                  </h3>
                  <div className="inline-flex rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setTxMode("deposit")}
                      className={`px-2.5 py-1 text-sm focus:outline-none focus:ring-0 ${txMode === "deposit" ? "bg-[#00295B] text-[#FFFFF5]" : "bg-[#FFFFF5] text-[#00295B]"}`}
                      aria-pressed={txMode === "deposit"}
                    >
                      {t("vaultInfo.actions.deposit", { defaultValue: "Deposit" })}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxMode("withdraw")}
                      className={`px-2.5 py-1 text-sm focus:outline-none focus:ring-0 ${txMode === "withdraw" ? "bg-[#00295B] text-[#FFFFF5]" : "bg-[#FFFFF5] text-[#00295B]"}`}
                      aria-pressed={txMode === "withdraw"}
                    >
                      {t("vaultInfo.actions.withdraw", { defaultValue: "Withdraw" })}
                    </button>
                  </div>
                </div>
                {txMode === "deposit" ? (
                  <div className="min-h-[160px]">
                    <input
                      value={depAmount}
                      onChange={(e) => setDepAmount(e.target.value)}
                      placeholder={t("vaultInfo.actions.placeholderAmount", { defaultValue: "0.00" })}
                      className="w-full border rounded py-1.5 px-2 bg-white"
                      inputMode="decimal"
                    />
                    <div className="flex items-center justify-between mt-1 text-xs text-[#101720]/70">
                      <div>
                        {t("vaultInfo.actions.balance", { defaultValue: "Balance" })}: {fmtToken(onchainBalance, onchainData.underlyingDecimals)} USDT0
                      </div>
                      <button
                        type="button"
                        className="px-2 py-0.5 text-xs border rounded"
                        onClick={() => setDepAmount(formatUnits(onchainBalance, onchainData.underlyingDecimals))}
                      >
                        {t("vaultInfo.actions.max", { defaultValue: "Max" })}
                      </button>
                    </div>
                    {depAmount && parseUnits(depAmount || "0", onchainData.underlyingDecimals) > onchainBalance && (
                      <div className="text-xs text-red-600 mt-1">
                        {t("vaultInfo.actions.exceedsBalance", { defaultValue: "Exceeds wallet balance" })}
                      </div>
                    )}
                    {(() => {
                      const amountWei = parseUnits(depAmount || "0", onchainData.underlyingDecimals);
                      const validAmount = depAmount && amountWei > 0n && amountWei <= onchainBalance;
                      const needsApproval = validAmount && allowance < amountWei;
                      const label =
                        pending === "approve"
                          ? t("vaultInfo.actions.approving", { defaultValue: "Approving…" })
                          : pending === "deposit"
                          ? t("vaultInfo.actions.depositing", { defaultValue: "Depositing…" })
                          : needsApproval
                          ? t("vaultInfo.actions.approve", { defaultValue: "Approve" })
                          : t("vaultInfo.actions.deposit", { defaultValue: "Deposit" });
                      const onClick = () => {
                        if (!validAmount) return;
                        if (needsApproval) {
                          setConfirmKind("approve");
                          setApproveConfirmOpen(true);
                        } else {
                          // Direct deposit without confirmation dialog
                          runDeposit();
                        }
                      };
                      return (
                        <button
                          type="button"
                          disabled={pending !== null || !validAmount}
                          className="mt-3 w-full px-3 py-2 text-sm rounded bg-[#00295B] text-[#FFFFF5] disabled:opacity-50"
                          onClick={onClick}
                        >
                          {label}
                        </button>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="min-h-[160px]">
                    <input
                      value={wdAmount}
                      onChange={(e) => setWdAmount(e.target.value)}
                      placeholder={t("vaultInfo.actions.placeholderAmount", { defaultValue: "0.00" })}
                      className="w-full border rounded py-1.5 px-2 bg-white"
                      inputMode="decimal"
                    />
                    <div className="flex items-center justify-between mt-1 text-xs text-[#101720]/70">
                      <div>
                        {t("vaultInfo.actions.maxWithdrawable", { defaultValue: "Max withdrawable" })}: {fmtToken(userAssets, onchainData.underlyingDecimals)} USDT0
                      </div>
                      <button
                        type="button"
                        className="px-2 py-0.5 text-xs border rounded"
                        onClick={() => setWdAmount(formatUnits(userAssets, onchainData.underlyingDecimals))}
                      >
                        {t("vaultInfo.actions.max", { defaultValue: "Max" })}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={pending !== null || !wdAmount || parseUnits(wdAmount || "0", onchainData.underlyingDecimals) <= 0n || parseUnits(wdAmount || "0", onchainData.underlyingDecimals) > userAssets}
                      className="mt-3 w-full px-3 py-2 text-sm rounded bg-[#00295B] text-[#FFFFF5] disabled:opacity-50"
                      onClick={() => runWithdraw(false)}
                    >
                      {pending === "withdraw"
                        ? t("vaultInfo.actions.withdrawing", { defaultValue: "Withdrawing…" })
                        : t("vaultInfo.actions.withdraw", { defaultValue: "Withdraw" })}
                    </button>
                  </div>
                )}
              </div>
            </ChainVaultGuard>
            {/* Current Position */}
            <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4">
              <h3 className="text-base font-semibold text-[#00295B] mb-2">
                {t("vaultInfo.position.title", { defaultValue: "Current position" })}
              </h3>
              {!clientW.data?.account ? (
                <div className="text-sm text-[#101720]/70">
                  {t("vaultInfo.position.connectToView", { defaultValue: "Connect your wallet to view your position." })}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-[#101720]/70 mb-1">
                      {t("vaultInfo.position.shares", { defaultValue: "Vault shares" })}
                    </div>
                    <div className="font-medium text-[#101720]">{fmtToken(userShares, onchainData.shareDecimals)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#101720]/70 mb-1">
                      {t("vaultInfo.position.usdValue", { defaultValue: "USD value" })}
                    </div>
                    <div className="font-medium text-[#101720]">{priceLoading ? <Skeleton className="h-5 w-24"/> : (userUsd != null ? fmtUsdSimple(userUsd) : "—")}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Confirm dialog for approval */}
        <ConfirmDialog
          open={approveConfirmOpen}
          title={t("vaultInfo.actions.approveTitle", { defaultValue: "Approve {{symbol}}", symbol: "USDT0" })}
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
          confirmLabel={t("vaultInfo.actions.approve", { defaultValue: "Approve" })}
          cancelLabel={t("vaultInfo.actions.cancel", { defaultValue: "Cancel" })}
          onConfirm={() => {
            setApproveConfirmOpen(false);
            const amountWei = parseUnits(depAmount || "0", onchainData.underlyingDecimals);
            runApproveExact(amountWei);
          }}
          onCancel={() => setApproveConfirmOpen(false)}
          busy={pending === "approve"}
        />
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
    <div className="space-y-2">
      <div className="grid grid-cols-12 text-xs text-[#101720]/70 pb-2 border-b border-[#E5E2D6]">
        <div className="col-span-5">{t("vaultInfo.allocations.columns.market", { defaultValue: "Market" })}</div>
        <div className="col-span-3 text-right">{t("vaultInfo.allocations.columns.share", { defaultValue: "Share" })}</div>
        <div className="col-span-2 text-right">{t("vaultInfo.allocations.columns.usd", { defaultValue: "USD" })}</div>
        <div className="col-span-2 text-right">{t("vaultInfo.allocations.columns.supplyApy", { defaultValue: "Supply APY" })}</div>
      </div>

      {items.map((it) => (
        <div key={it.id} className="grid grid-cols-12 items-center py-2 border-b border-[#EDE9D7]">
          <div className="col-span-5 flex items-center space-x-2 text-[#101720] truncate">
            {it.logo && (
              <img
                src={it.logo}
                alt={it.label}
                className="w-5 h-5 rounded-full border border-[#E5E2D6] object-contain"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}
            <span className="truncate">{it.label}</span>
          </div>
          <div className="col-span-3 text-right text-[#101720]">
            {ceilPct(it.pct)}%
          </div>
          <div className="col-span-2 text-right text-[#101720]">
            {it.usd != null
              ? `$${it.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : "N/A"}
          </div>
          <div className="col-span-2 text-right text-[#101720]">
            {it.supplyApy != null
              ? `${(it.supplyApy * 100).toFixed(2)}%`
              : "N/A"}
          </div>
        </div>
      ))}

      {/* Hidden dust row (filtered allocations) */}
      {hiddenDust != null && hiddenDust > 0n && (
        <div className="grid grid-cols-12 items-center py-2">
          <div className="col-span-5 font-medium">
            {t("vaultInfo.allocations.otherDust", { defaultValue: "Other (dust)" })}
          </div>
          <div className="col-span-3 text-right text-[#101720]">
            {pctOf(hiddenDust) ? `${pctOf(hiddenDust)}%` : "—"}
          </div>
          <div className="col-span-2 text-right">—</div>
          <div className="col-span-2 text-right">—</div>
        </div>
      )}
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

  if (loading) return <p className="text-sm text-[#101720]/70">{t("vaultInfo.allocations.loading", { defaultValue: "Loading allocations…" })}</p>;
  if (error) return <p className="text-sm text-red-500">{t("vaultInfo.allocations.error", { defaultValue: "Failed to load allocations: {{error}}", error })}</p>;
  if (!items || totalAssets === null) return <p className="text-sm text-[#101720]/70">{t("vaultInfo.allocations.empty", { defaultValue: "No allocations found." })}</p>;

  return (
    <AllocationList
      items={items}
      totalAssets={totalAssets}
      hiddenDust={hiddenDust ?? null}
    />
  );
}
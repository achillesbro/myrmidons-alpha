/**
 * DEPRECATED: The SDK View has been merged into Vault API View (deposit/withdraw + position + PnL).
 * This file is retained temporarily for reference and will be removed in a future cleanup.
 */
import {
  fmtToken,
  fmtUsdSimple,
  fmtDateTime,
  truncHash,
  Skeleton,
  friendlyError,
  APPROVAL_PREF_KEY,
  NET_FLOW_STORE_KEY,
  Toasts,
  ConfirmDialog,
  type Toast,
  type ToastKind,
} from "./vault-shared";
import { useState, useEffect, useRef } from "react";
import { useWalletClient, useAccount } from "wagmi";
import { useGetUserSDKVaultPositions } from "../hooks/useGetUserSDKVaultPosition";
import { Address, formatUnits, parseUnits, type Hex, decodeEventLog, type Abi } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { useHyperTxHistory } from "../hooks/useHyperTxHistory";
//import { depositUsingBundler, withdrawUsingBundler } from "../service/actions";
//import { Vault } from "@morpho-org/blue-sdk";
import { BrowserProvider, Contract } from "ethers";
import vaultAbi from "../abis/vault.json";
import { useTokenBalance } from "../hooks/useTokenBalance";
// Minimal ERC-20 ABI for preview/limits & balances
const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];
import { useGetVaultTransactionsQuery } from "../graphql/__generated__/GetVaultTransactions.query.generated";
import { useGetVaultDisplayQuery } from "../graphql/__generated__/GetVaultDisplay.query.generated";
import { getUsdt0Usd } from "../lib/prices";

const MAX_UINT256 = (2n ** 256n) - 1n;

// Shared tx row type and de-dupe helper (module scope)
export type TxRow = { hash: string; logIndex: number; timestamp: number; type?: string; assets?: bigint | null };
export const mergeDedupe = (rows: TxRow[]): TxRow[] => {
  const byHash: Record<string, TxRow> = {};
  for (const r of rows) {
    const k = r.hash;
    const existing = byHash[k];
    if (!existing) { byHash[k] = r; continue; }
    const existingHasReal = (existing.logIndex ?? 0) > 0;
    const incomingHasReal = (r.logIndex ?? 0) > 0;
    if (incomingHasReal && !existingHasReal) { byHash[k] = r; continue; }
    if (incomingHasReal === existingHasReal) {
      if ((r.timestamp ?? 0) > (existing.timestamp ?? 0)) byHash[k] = r;
    }
  }
  return Object.values(byHash).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
};

export function TransactionHistory({ vaultAddress, assetDecimals, underlyingSym }: { vaultAddress: Address; assetDecimals: number; underlyingSym: string }) {
  const { address: userAddress } = useAccount();
  const client = useWalletClient();
  const chainId = client.data?.chain?.id;

  // const VAULT_DECIMALS = 18; // HyperEVM vault uses 18
  const AMOUNTS_STORE_KEY = (chainId?: number, v?: string, u?: string) =>
    `txAmounts:${chainId ?? 0}:${(v ?? "").toLowerCase()}:${(u ?? "").toLowerCase()}`;
  const HISTORY_STORE_KEY = (chainId?: number, v?: string, u?: string) =>
    `txHistory:${chainId ?? 0}:${(v ?? "").toLowerCase()}:${(u ?? "").toLowerCase()}`;
  const STATUS_STORE_KEY = (chainId?: number, v?: string, u?: string) =>
    `txStatus:${chainId ?? 0}:${(v ?? "").toLowerCase()}:${(u ?? "").toLowerCase()}`;

  // Compute a capped fromBlock for HyperEVM (avoid scanning from genesis)
  const [fromBlock, setFromBlock] = useState<bigint | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function computeFromBlock() {
      if (chainId === 999) {
        try {
          const pc = hyperPublicClient;
          const head = await pc.getBlockNumber();
          const LOOKBACK = 10_000n; // last N blocks only
          const start = head > LOOKBACK ? head - LOOKBACK : 0n;
          if (!cancelled) setFromBlock(start);
        } catch {
          if (!cancelled) setFromBlock(0n);
        }
      } else {
        if (!cancelled) setFromBlock(null);
      }
    }
    computeFromBlock();
    return () => { cancelled = true; };
  }, [chainId]);

  // Local UI state for cached rows and amounts
  type HistRow = TxRow;
  const [cachedRows, setCachedRows] = useState<HistRow[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, "success" | "reverted">>({});

  // Load cached history & amounts & statuses from localStorage on mount and whenever chainId/vault/user changes
  useEffect(() => {
    try {
      const histRaw = localStorage.getItem(HISTORY_STORE_KEY(chainId, vaultAddress, userAddress));
      if (histRaw) setCachedRows(JSON.parse(histRaw));
    } catch {}
    try {
      const amtRaw = localStorage.getItem(AMOUNTS_STORE_KEY(chainId, vaultAddress, userAddress));
      if (amtRaw) setAmounts(JSON.parse(amtRaw));
    } catch {}
    try {
      const stRaw = localStorage.getItem(STATUS_STORE_KEY(chainId, vaultAddress, userAddress));
      if (stRaw) setStatuses(JSON.parse(stRaw));
    } catch {}
  }, [chainId, vaultAddress, userAddress]);

  // ✅ Call BOTH hooks every render (consistent order)
  const { data: subgraphData, loading: subgraphLoading, error: subgraphError } =
    useGetVaultTransactionsQuery({
      pollInterval: 10000,
      fetchPolicy: "network-only",
      skip: chainId === 999, // skip fetching, but hook still called
    });

  const { data: hyperData, loading: hyperLoading, error: hyperError } = useHyperTxHistory({
    vaultAddress,
    userAddress: userAddress as Address | undefined,
    fromBlock: fromBlock ?? 0n,
    enabled: chainId === 999 && fromBlock !== null, // 🔑
  });

  // Merge fresh data, persist to storage, and (on HyperEVM) fetch & decode amounts per tx and cache statuses
  useEffect(() => {
    // prefer on-chain data on HyperEVM
    const fresh = (chainId === 999 ? (hyperData ?? []) : [])
      .map((r: any) => ({
        hash: r.hash as string,
        logIndex: Number(r.logIndex ?? 0),
        timestamp: Number(r.timestamp ?? 0),
        type: String(r.type ?? ""),
      }));

    if (chainId !== 999 && subgraphData?.transactions?.items) {
      const sg = (subgraphData.transactions.items ?? [])
        .filter((t: any) => t?.user?.address?.toLowerCase?.() === userAddress?.toLowerCase?.())
        .map((t: any) => ({
          hash: t.hash as string,
          logIndex: 0,
          timestamp: Number(t.timestamp ?? 0),
          type: String(t.type ?? ""),
        }));
      fresh.push(...sg);
    }

    if (fresh.length === 0) return;

    // merge & de-dupe by hash, preferring non-zero logIndex and latest timestamp
    const merged = mergeDedupe([...cachedRows, ...fresh]);
    const key = (x: HistRow) => `${x.hash}-${x.logIndex}`; // keep for amounts/statuses map keys

    setCachedRows(merged);
    try { localStorage.setItem(HISTORY_STORE_KEY(chainId, vaultAddress, userAddress), JSON.stringify(merged)); } catch {}

    // For HyperEVM, decode assets from logs if not already cached
    if (chainId === 999) {
      // Only decode those not already present in amounts
      const ab = vaultAbi as unknown as Abi;
      (async () => {
        for (const r of merged) {
          const k = key(r);
          if (amounts[k] != null) continue;
          try {
            const rcpt = await hyperPublicClient.getTransactionReceipt({ hash: r.hash as Hex });
            let found: bigint | null = null;
            for (const lg of rcpt.logs) {
              try {
                const ev = decodeEventLog({ abi: ab, data: lg.data, topics: lg.topics as any });
                if (ev.eventName === "Deposit" && (r.type ?? "").toLowerCase().includes("deposit")) {
                  found = (ev.args as any).assets as bigint;
                  break;
                }
                if (ev.eventName === "Withdraw" && (r.type ?? "").toLowerCase().includes("withdraw")) {
                  found = (ev.args as any).assets as bigint;
                  break;
                }
              } catch {}
            }
            if (found != null) {
              const upd = { ...amounts, [k]: found.toString() };
              setAmounts(upd);
              try { localStorage.setItem(AMOUNTS_STORE_KEY(chainId, vaultAddress, userAddress), JSON.stringify(upd)); } catch {}
            }
          } catch {}
        }
      })();
      // For HyperEVM, fetch receipt status (success/reverted) for rows missing it
      (async () => {
        const st: Record<string, "success" | "reverted"> = { ...statuses };
        let changed = false;
        for (const r of merged) {
          const k2 = key(r);
          if (st[k2]) continue;
          try {
            const rcpt = await hyperPublicClient.getTransactionReceipt({ hash: r.hash as Hex });
            if (rcpt.status === "success" || rcpt.status === "reverted") {
              st[k2] = rcpt.status;
              changed = true;
            }
          } catch {}
        }
        if (changed) {
          setStatuses(st);
          try { localStorage.setItem(STATUS_STORE_KEY(chainId, vaultAddress, userAddress), JSON.stringify(st)); } catch {}
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hyperData, subgraphData, chainId, vaultAddress, userAddress]);

  // ----- Render -----
  if (!userAddress) return <p className="text-sm text-[#101720]/70">Connect wallet to see history</p>;

  // Pagination (10 per page), filter out reverted (failed) transactions
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [cachedRows.length]);
  const visibleRows = cachedRows.filter((r) => {
    const k = `${r.hash}-${r.logIndex}`;
    // Hide explicitly failed; show success or unknown (until fetched)
    return statuses[k] !== "reverted";
  });
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const currentSlice = visibleRows.slice(start, start + PAGE_SIZE);

  if (chainId === 999) {
    if (fromBlock === null || hyperLoading) return (
      <div className="space-y-2">
        <div className="grid grid-cols-4 gap-2 text-xs font-medium text-[#101720]/70 px-2">
          <div>Date</div>
          <div>Type</div>
          <div className="text-right">Amount ({underlyingSym})</div>
          <div className="text-right">Tx</div>
        </div>
        <div className="space-y-2 mt-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-2 grid grid-cols-4 gap-2 items-center">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24 justify-self-end" />
              <Skeleton className="h-4 w-32 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    );
    if (hyperError) return <p className="text-sm text-red-500">Error: {hyperError}</p>;
    if (visibleRows.length === 0) return <p className="text-sm text-[#101720]/70">No transactions for your wallet.</p>;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-4 gap-2 text-xs font-medium text-[#101720]/70 px-2">
          <div>Date</div>
          <div>Type</div>
          <div className="text-right">Amount ({underlyingSym})</div>
          <div className="text-right">Tx</div>
        </div>
        <div className="space-y-2 mt-1">
          {currentSlice.map((tx) => {
            const k = `${tx.hash}-${tx.logIndex}`;
            const amt = amounts[k] ? BigInt(amounts[k]) : null;
            const isWithdraw = (tx.type ?? "").toLowerCase().includes("withdraw");
            const typeLabel = isWithdraw ? "Withdrawal" : "Deposit";
            const amountLabel = amt != null ? `${isWithdraw ? "-" : ""}${fmtToken(amt, assetDecimals)}` : "—";
            return (
              <div key={k} className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-2 text-sm grid grid-cols-4 gap-2 items-center">
                <span>{fmtDateTime(tx.timestamp)}</span>
                <span className="capitalize">{typeLabel}</span>
                <span className={`text-right ${isWithdraw ? "text-red-600" : "text-[#101720]"}`}>{amountLabel}</span>
                <span className="text-right">
                  <a
                    href={`https://hyperevmscan.io/tx/${tx.hash}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono cursor-pointer hover:!underline underline-offset-2 decoration-1 hover:opacity-80"
                    title={tx.hash}
                  >
                    {truncHash(tx.hash)}
                  </a>
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            className="px-2 py-1 text-xs rounded border border-[#E5E2D6] disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <div className="text-xs text-[#101720]/70">
            Page {page} of {totalPages}
          </div>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded border border-[#E5E2D6] disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // Non-HyperEVM: subgraph path
  if (subgraphLoading) return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-2 text-sm flex justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
  if (subgraphError) return <p className="text-sm text-red-500">Error: {subgraphError.message}</p>;
  const items = subgraphData?.transactions?.items ?? [];
  const filtered = items.filter((t) => t.user?.address?.toLowerCase?.() === userAddress.toLowerCase());
  if (filtered.length === 0) return <p className="text-sm text-[#101720]/70">No transactions for your wallet.</p>;

  return (
    <div className="space-y-2">
      {filtered.map((t) => (
        <div key={t.hash} className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-2 text-sm flex justify-between">
          <span>{new Date(Number(t.timestamp) * 1000).toLocaleString()}</span>
          <span className="font-mono truncate">{t.hash}</span>
          <span>{t.type}</span>
        </div>
      ))}
    </div>
  );
}

export function VaultSdkView({ vaultAddress }: { vaultAddress: Address }) {
  const [isFullWithdraw, setIsFullWithdraw] = useState(false);
  const [inputs, setInputs] = useState({
    amountToDeposit: "",
    amountToWithdraw: "",
  });

  // Toasts & modal
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  const pushToast = (kind: ToastKind, text: string, ttl = 5000, href?: string) => {
    const id = toastIdRef.current++;
    setToasts((t) => [...t, { id, kind, text, href }]);
    if (ttl > 0) {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
    }
  };

  type ConfirmState =
    | { open: false }
    | { open: true; action: "deposit" | "withdraw"; displayAmount: string };
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false });

  // --- Allowance controls (preference + current allowance) ---
  const [approvePref, setApprovePref] = useState<"exact" | "infinite">("exact");
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [approving, setApproving] = useState(false);
  const [depPreset, setDepPreset] = useState<'custom' | 'max'>('custom');
  const [witPreset, setWitPreset] = useState<'custom' | 'max'>('custom');

  // In-flight flags
  const [submitting, setSubmitting] = useState<"deposit" | "withdraw" | null>(null);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
    if (name === "amountToDeposit") setDepPreset("custom");
    if (name === "amountToWithdraw") {
      setWitPreset("custom");
      setIsFullWithdraw(false);
    }
  };
  const runApprove = async () => {
    if (!client.data?.account) { pushToast("error", "Connect wallet"); return; }
    if (chainId !== 999) { pushToast("error", "Switch to HyperEVM"); return; }

    // Ensure we know the underlying token address
    let assetAddr = underlyingAddress;
    try {
      if (!assetAddr) {
        const provider0 = new BrowserProvider(window.ethereum as any);
        const vc0 = new Contract(vaultAddress, vaultAbi, provider0);
        assetAddr = await vc0.asset();
        setUnderlyingAddress(assetAddr);
      }
    } catch (e) {
      pushToast("error", friendlyError(e));
      return;
    }
    if (!assetAddr) { pushToast("error", "No underlying token"); return; }

    // Amount to approve
    let amountToApprove: bigint;
    if (approvePref === "infinite") {
      amountToApprove = MAX_UINT256;
    } else {
      const dec = underlyingDecimals ?? 18;
      const dep = parseAmount(inputs.amountToDeposit, dec);
      if (!dep || dep <= 0n) { pushToast("error", "Enter a valid amount for exact approval"); return; }
      amountToApprove = dep;
    }

    // Double-guard vaultAddress before approve
    if (!vaultAddress || typeof vaultAddress !== "string" || vaultAddress.length === 0) {
      pushToast("error", "Invalid vault address");
      setApproving(false);
      return;
    }

    try {
      setApproving(true);
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const token = new Contract(assetAddr, erc20Abi, signer);
      const approveAmountStr = amountToApprove.toString();
      const tx = await token.approve(vaultAddress, approveAmountStr);
      pushToast("info", `Approval tx: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);

      try {
        if (signer.provider && typeof (signer.provider as any).waitForTransaction === 'function') {
          await (signer.provider as any).waitForTransaction(tx.hash);
        } else {
          await tx.wait();
        }
      } catch {
        await tx.wait();
      }

      pushToast("success", approvePref === "infinite" ? "Infinite approval confirmed" : "Approval confirmed");
      setAllowance(amountToApprove);
      try { localStorage.setItem(APPROVAL_PREF_KEY(chainId, vaultAddress, assetAddr), approvePref); } catch {}
    } catch (e) {
      pushToast("error", friendlyError(e));
    } finally {
      setApproving(false);
    }
  };


  const client = useWalletClient();
  const { address: userAddress } = useAccount();
  const chainId = client.data?.chain?.id;

  const {
    position,
    isLoading: positionLoading,
    error: positionError,
  } = useGetUserSDKVaultPositions(vaultAddress);

  // On-chain position for HyperEVM (chain 999)
  const [onchainPosition, setOnchainPosition] = useState<{ shares: bigint; assets: bigint } | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  // Live USD price for USDT0 (HyperEVM)
  const [usdPrice, setUsdPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  // Net flow (localStorage tracked)
  const [netFlowWei, setNetFlowWei] = useState<bigint>(0n);
  useEffect(() => {
    const userAddr = client.data?.account?.address;
    if (!userAddr) { setNetFlowWei(0n); return; }
    try {
      const k = NET_FLOW_STORE_KEY(chainId, vaultAddress, userAddr);
      const raw = localStorage.getItem(k);
      setNetFlowWei(raw ? BigInt(raw) : 0n);
    } catch { setNetFlowWei(0n); }
  }, [chainId, vaultAddress, client.data?.account?.address]);
  
  // On-chain token balance for HyperEVM (chain 999)
  const [onchainBalance, setOnchainBalance] = useState<bigint | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState<string | null>(null);

  // --- Preview & Limits state (ERC-4626) ---
  const [underlyingAddress, setUnderlyingAddress] = useState<`0x${string}` | null>(null);
  const [underlyingDecimals, setUnderlyingDecimals] = useState<number | null>(null);

  const [depositPreviewShares, setDepositPreviewShares] = useState<bigint | null>(null);
  const [withdrawPreviewShares, setWithdrawPreviewShares] = useState<bigint | null>(null);
  const [redeemPreviewAssets, setRedeemPreviewAssets] = useState<bigint | null>(null);

  const [maxDepositCap, setMaxDepositCap] = useState<bigint | null>(null);
  const [maxWithdrawCap, setMaxWithdrawCap] = useState<bigint | null>(null);
  const [maxRedeemCap, setMaxRedeemCap] = useState<bigint | null>(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // debounce timer for previews
  const previewTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (chainId === 999 && userAddress) {
      setBalLoading(true);
      const provider = new BrowserProvider(window.ethereum as any);
      const vaultContract = new Contract(vaultAddress, vaultAbi, provider);
      vaultContract
        .asset()
        .then((underlyingAddr: string) => {
          const tokenContract = new Contract(underlyingAddr, erc20Abi, provider);
          return tokenContract.balanceOf(userAddress);
        })
        .then((bal: bigint) => {
          setOnchainBalance(bal);
          setBalLoading(false);
        })
        .catch((e: any) => {
          setBalError(e.message);
          setBalLoading(false);
        });
    }
  }, [chainId, userAddress, vaultAddress]);

  useEffect(() => {
    // Only attempt when wallet is connected (we rely on window.ethereum for BrowserProvider)
    if (!client.data?.account) return;
    if (!vaultAddress) return;
    // Only resolve underlying metadata on the HyperEVM network
    if (chainId !== 999) {
      setUnderlyingAddress(null);
      setUnderlyingDecimals(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const provider = new BrowserProvider(window.ethereum as any);
        const vc = new Contract(vaultAddress, vaultAbi, provider);
        const assetAddr: `0x${string}` = await vc.asset();
        const token = new Contract(assetAddr, erc20Abi, provider);
        const dec: number = await token.decimals();
        if (!cancelled) {
          setUnderlyingAddress(assetAddr);
          setUnderlyingDecimals(Number(dec));
        }
      } catch (e) {
        if (!cancelled) {
          setUnderlyingAddress(null);
          setUnderlyingDecimals(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client.data?.account, vaultAddress, chainId]);

  // Fetch USD price of underlying token for HyperEVM
  useEffect(() => {
    let cancelled = false;
    async function run() {
      // Only fetch on HyperEVM when we know the underlying token
      if (chainId !== 999 || !underlyingAddress) {
        if (!cancelled) setUsdPrice(null);
        return;
      }
      try {
        setPriceLoading(true);
        const p = await getUsdt0Usd({ token: underlyingAddress });
        if (!cancelled) setUsdPrice(p ?? null);
      } catch {
        if (!cancelled) setUsdPrice(null);
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    }
    run();
    const id = setInterval(run, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [chainId, underlyingAddress]);

  // Load saved approval preference when we know the token
  useEffect(() => {
    const k = APPROVAL_PREF_KEY(chainId, vaultAddress, underlyingAddress ?? undefined);
    try {
      const saved = k ? localStorage.getItem(k) : null;
      if (saved === "exact" || saved === "infinite") setApprovePref(saved as "exact" | "infinite");
    } catch {}
  }, [chainId, vaultAddress, underlyingAddress]);

  // Fetch current allowance (HyperEVM path)
  useEffect(() => {
    if (chainId !== 999) { setAllowance(null); return; }
    const userAddr = userAddress;
    if (!userAddr || !underlyingAddress) return;

    let cancel = false;
    (async () => {
      try {
        const provider = new BrowserProvider(window.ethereum as any);
        const token = new Contract(underlyingAddress, erc20Abi, provider);
        const a: bigint = await token.allowance(userAddr, vaultAddress);
        if (!cancel) setAllowance(a);
      } catch {
        if (!cancel) setAllowance(null);
      }
    })();

    return () => { cancel = true; };
  }, [chainId, userAddress, underlyingAddress, vaultAddress]);

    useEffect(() => {
    // Clear any pending timer
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    // Preconditions
    const userAddr = userAddress;
    if (!client.data?.account || !userAddr) return;
    if (!vaultAddress) return;
    // Only run previews on the HyperEVM network (vault chain)
    if (chainId !== 999) {
      // Clear previews/limits and show a gentle hint instead of raw errors
      setDepositPreviewShares(null);
      setWithdrawPreviewShares(null);
      setRedeemPreviewAssets(null);
      setMaxDepositCap(null);
      setMaxWithdrawCap(null);
      setMaxRedeemCap(null);
      setPreviewError(null);
      return;
    }

    // Debounce to avoid spamming RPC
    previewTimerRef.current = window.setTimeout(async () => {
      try {
        setPreviewLoading(true);
        setPreviewError(null);

        const provider = new BrowserProvider(window.ethereum as any);
        const vc = new Contract(vaultAddress, vaultAbi, provider);

        // ---- Limits ----
        setLimitsLoading(true);
        const [maxDep, maxWit, maxRed] = await Promise.all([
          vc.maxDeposit(userAddr),
          vc.maxWithdraw(userAddr),
          vc.maxRedeem(userAddr),
        ]);
        setMaxDepositCap(maxDep);
        setMaxWithdrawCap(maxWit);
        setMaxRedeemCap(maxRed);
        setLimitsLoading(false);

        // ---- Previews ----
        // Reset previews before recalculating
        setDepositPreviewShares(null);
        setWithdrawPreviewShares(null);
        setRedeemPreviewAssets(null);

        // We need decimals to parse typed input amounts
        const dec = underlyingDecimals ?? 18;

        // Deposit preview
        const depStr = (inputs.amountToDeposit || "").trim();
        if (depStr && Number(depStr) > 0) {
          const assets = parseUnits(depStr, dec);
          try {
            const sharesOut: bigint = await vc.previewDeposit(assets);
            setDepositPreviewShares(sharesOut);
          } catch (e: any) {
            // e.g., cap = 0 or paused
            setDepositPreviewShares(null);
          }
        }

        // Withdraw preview
        if (isFullWithdraw) {
          // Full-withdraw uses withdraw(assets) with the max assets we can take out
          const assetsCap = maxWithdrawCap ?? 0n;
          let assetsAvail: bigint | null = null;
          if (chainId === 999 && onchainPosition) assetsAvail = onchainPosition.assets;
          else if (position) assetsAvail = (position.depositedAssets * position.shareToUnderlying) / 10n ** 18n;

          const assetsOut = (assetsAvail != null) ? (assetsCap !== null ? (assetsCap < assetsAvail ? assetsCap : assetsAvail) : assetsAvail) : null;

          setRedeemPreviewAssets(null); // we won't use redeem path for previews now
          setWithdrawPreviewShares(null);
          if (assetsOut && assetsOut > 0n) {
            try {
              const sharesBurn: bigint = await vc.previewWithdraw(assetsOut);
              setWithdrawPreviewShares(sharesBurn);
              // reuse redeemPreviewAssets slot to show assets amount textually in UI
              setRedeemPreviewAssets(assetsOut);
            } catch (e: any) {
              setWithdrawPreviewShares(null);
              setRedeemPreviewAssets(null);
            }
          }
        } else {
          const witStr = (inputs.amountToWithdraw || "").trim();
          if (witStr && Number(witStr) > 0) {
            const assetsToWithdraw = parseUnits(witStr, dec);
            try {
              const sharesBurn: bigint = await vc.previewWithdraw(assetsToWithdraw);
              setWithdrawPreviewShares(sharesBurn);
            } catch (e: any) {
              setWithdrawPreviewShares(null);
            }
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("missing revert data") || msg.includes("call_exception")) {
          setPreviewError("unavailable"); // likely wrong network or transient RPC hiccup
        } else {
          setPreviewError("unavailable");
        }
      } finally {
        setPreviewLoading(false);
      }
    }, 350); // ~350ms debounce

    // Cleanup on deps change
    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [
    client.data?.account,
    userAddress,
    vaultAddress,
    chainId,
    inputs.amountToDeposit,
    inputs.amountToWithdraw,
    isFullWithdraw,
    underlyingDecimals,
    onchainPosition,
    position,
  ]);

  useEffect(() => {
    if (chainId === 999 && userAddress) {
      setPosLoading(true);
      const provider = new BrowserProvider(window.ethereum as any);
      const vaultContract = new Contract(
        vaultAddress,
        vaultAbi,
        provider
      );
      vaultContract
        .balanceOf(userAddress)
        .then((shares: bigint) =>
          vaultContract.convertToAssets(shares).then((assets: bigint) => {
            setOnchainPosition({ shares, assets });
            setPosLoading(false);
          })
        )
        .catch((e: any) => {
          setPosError(e.message);
          setPosLoading(false);
        });
    }
  }, [chainId, userAddress, vaultAddress]);

  // Temporary: reference computed previews/limits to avoid unused warnings
  // (We will render these in the next step.)
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void [
    depositPreviewShares,
    withdrawPreviewShares,
    redeemPreviewAssets,
    maxDepositCap,
    maxWithdrawCap,
    maxRedeemCap,
    previewLoading,
    limitsLoading,
    previewError,
    underlyingAddress,
    underlyingDecimals,
  ];

  const {
    tokenBalance,
    isLoading: tokenBalanceLoading,
    error: tokenBalanceError,
  } = useTokenBalance(
    position?.underlyingAddress || "0x0000000000000000000000000000000000000000"
  );

  // Fetch vault metrics (TVL, APY, price)
  const { data: vaultData } = useGetVaultDisplayQuery({
    skip: !vaultAddress,
    fetchPolicy: "cache-and-network",
  });

  const netApy            = vaultData?.vaultByAddress.state?.netApy ?? 0;
  const priceUsd          = vaultData?.vaultByAddress.asset.priceUsd ?? 0;

  // Compute current underlying amount from position
  const underlyingWei = position
    ? (position.depositedAssets * position.shareToUnderlying) / BigInt(1e18)
    : BigInt(0);
  const underlyingAmount = Number(underlyingWei) / 1e18;

  const currentValueUsd   = underlyingAmount * priceUsd;
  const annualEarningsUsd = currentValueUsd * netApy;
  const monthlyEarningsUsd = annualEarningsUsd / 12;

  // ---------- Preview & Limits helpers ----------
  const assetDecimals = underlyingDecimals ?? 18;
  const underlyingSym = chainId === 999 ? "USDT0" : (position?.underlyingSymbol ?? "Asset");


  const parseAmount = (s: string | undefined, decimals: number): bigint | null => {
    const v = (s ?? "").trim();
    if (!v || isNaN(Number(v))) return null;
    try { return parseUnits(v, decimals); } catch { return null; }
  };

  const depParsed = parseAmount(inputs.amountToDeposit, assetDecimals);
  const witParsed = parseAmount(inputs.amountToWithdraw, assetDecimals);
  const infiniteAllowance = allowance != null && allowance > (MAX_UINT256 / 2n);

  // Wallet balance in wei (chain-aware) and validation for deposit > balance
  const walletBalanceWei: bigint = chainId === 999
    ? (onchainBalance ?? 0n)
    : ((tokenBalance?.balance as bigint | undefined) ?? 0n);
  const depExceedsBalance = depParsed != null && depParsed > walletBalanceWei;

  // Compute user's underlying units and USD value for Current Position card
  const userUnderlyingUnits = onchainPosition ? Number(formatUnits(onchainPosition.assets, assetDecimals)) : 0;
  const userHoldingsUsd: number | undefined = typeof usdPrice === "number" ? userUnderlyingUnits * usdPrice : undefined;

  // PnL lightweight card values
  const investedUnits = Number(formatUnits(netFlowWei, assetDecimals));
  const investedUsd: number | undefined = typeof usdPrice === "number" ? investedUnits * usdPrice : undefined;
  const pnlUnits = onchainPosition ? Number(formatUnits(onchainPosition.assets - netFlowWei, assetDecimals)) : 0;
  const pnlUsd: number | undefined = typeof usdPrice === "number" ? pnlUnits * usdPrice : undefined;
  const roiPct: number | undefined = investedUsd && investedUsd !== 0 ? ((pnlUsd ?? 0) / investedUsd) * 100 : undefined;


  let depositDisabled = false; let depositReason: string | null = null;
  if (!client.data?.account) { depositDisabled = true; depositReason = "Connect wallet"; }
  else if (limitsLoading || previewLoading) { depositDisabled = true; depositReason = "Loading limits/preview…"; }
  else if (!depParsed || depParsed <= 0n) { depositDisabled = true; depositReason = "Enter amount"; }
  else if (depExceedsBalance) { depositDisabled = true; depositReason = "Insufficient balance"; }
  else if (allowance != null && depParsed != null && allowance < depParsed) { depositDisabled = true; depositReason = "Approval required"; }
  else if (maxDepositCap !== null && depParsed > maxDepositCap) { depositDisabled = true; depositReason = `Exceeds max deposit (${formatUnits(maxDepositCap, assetDecimals)} ${underlyingSym})`; }
  else if (depositPreviewShares === null) { depositDisabled = true; depositReason = previewError ? "Preview failed" : "Preview unavailable"; }

  let withdrawDisabled = false; let withdrawReason: string | null = null;
  if (!client.data?.account) { withdrawDisabled = true; withdrawReason = "Connect wallet"; }
  else if (limitsLoading || previewLoading) { withdrawDisabled = true; withdrawReason = "Loading limits/preview…"; }
  else if (isFullWithdraw) {
    // full-withdraw path uses assets (max we can withdraw)
    const assetsCap = maxWithdrawCap ?? 0n;
    let assetsAvail: bigint = 0n;
    if (chainId === 999) assetsAvail = onchainPosition?.assets ?? 0n; else assetsAvail = (position?.depositedAssets ?? 0n) * (position?.shareToUnderlying ?? 0n) / 10n ** 18n;
    const want = assetsCap < assetsAvail ? assetsCap : assetsAvail;
    if (want === 0n) { withdrawDisabled = true; withdrawReason = "Nothing to withdraw"; }
    else if (maxWithdrawCap !== null && want > maxWithdrawCap) { withdrawDisabled = true; withdrawReason = `Exceeds max withdraw (${formatUnits(maxWithdrawCap, assetDecimals)} ${underlyingSym})`; }
    else if (withdrawPreviewShares === null) { withdrawDisabled = true; withdrawReason = previewError ? "Preview failed" : "Preview unavailable"; }
  } else {
    if (!witParsed || witParsed <= 0n) { withdrawDisabled = true; withdrawReason = "Enter amount"; }
    else if (maxWithdrawCap !== null && witParsed > maxWithdrawCap) { withdrawDisabled = true; withdrawReason = `Exceeds max withdraw (${formatUnits(maxWithdrawCap, assetDecimals)} ${underlyingSym})`; }
    else if (withdrawPreviewShares === null) { withdrawDisabled = true; withdrawReason = previewError ? "Preview failed" : "Preview unavailable"; }
  }

  const runDeposit = async () => {
    if (!client.data || !client.data.account) {
      pushToast("error", "Please connect your wallet first");
      return;
    }

    try {
      // Convert input values to BigInt using parseEther.
      const dec = underlyingDecimals ?? 18;
      const amountStr = (inputs.amountToDeposit || "").trim();
      if (!amountStr) {
        pushToast("error", "Enter a valid amount");
        return;
      }
      let depositAmountWei: bigint;
      try {
        depositAmountWei = parseUnits(amountStr, dec);
      } catch {
        pushToast("error", "Enter a valid amount");
        return;
      }
      // 1) Get an ethers.js signer from the user’s wallet
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const userAddr = await signer.getAddress();

      // 2) Instantiate the vault contract with your ABI
      const vaultContract = new Contract(
        vaultAddress,
        vaultAbi,
        signer
      );
      // Toast
      pushToast("info", "Preparing deposit…", 2000);

      // 0) Determine the underlying token address
      let underlyingAddress: string;
      if (chainId === 999) {
        // On HyperEVM, read directly from contract
        underlyingAddress = await vaultContract.asset();
      } else {
        // On supported chains, use the SDK-provided position
        underlyingAddress = position?.underlyingAddress as string;
      }
      if (!underlyingAddress) {
        throw new Error("No underlying token");
      }

      // 0.5) Check vault deposit cap
      const cap: bigint = await vaultContract.maxDeposit(userAddr);
      if (depositAmountWei > cap) {
        pushToast("error", `Vault not open for deposits (current cap: ${cap.toString()})`);
        return;
      }

      // 2) Call the ERC-4626 deposit function
      const tx = await vaultContract.deposit(
        depositAmountWei,
        userAddr, // receiver
        { gasLimit: 250000n }
      );
      pushToast("info", `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);
      try {
        if (chainId === 999) {
          // viem polling on HyperEVM
          await hyperPublicClient.waitForTransactionReceipt({
            hash: tx.hash as Hex,
            pollingInterval: 2000,
            timeout: 120_000,
          });
        } else if (signer.provider) {
          await signer.provider.waitForTransaction(tx.hash);
        } else {
          await tx.wait();
        }
        pushToast("success", "Deposit successful");
        // Update net flow (deposits add underlying)
        try {
          const kFlow = NET_FLOW_STORE_KEY(chainId, vaultAddress, userAddr);
          const current = (() => { try { return BigInt(localStorage.getItem(kFlow) || "0"); } catch { return 0n; } })();
          const next = current + depositAmountWei;
          setNetFlowWei(next);
          try { localStorage.setItem(kFlow, next.toString()); } catch {}
        } catch {}
        // Optimistically refresh on-chain balance & position
        try {
          // refresh balance
          const provider2 = new BrowserProvider(window.ethereum as any);
          const vc2 = new Contract(vaultAddress, vaultAbi, provider2);
          const assetAddr2: `0x${string}` = await vc2.asset();
          const token2 = new Contract(assetAddr2, erc20Abi, provider2);
          const bal2: bigint = await token2.balanceOf(userAddr);
          setOnchainBalance(bal2);
          // refresh position
          const shares: bigint = await vc2.balanceOf(userAddr);
          const assets: bigint = await vc2.convertToAssets(shares);
          setOnchainPosition({ shares, assets });
        } catch {}
      } catch (waitErr) {
        // If waiting fails (e.g., temporary RPC issues), keep the submitted line
      }
    } catch (error: unknown) {
      console.error("Error during deposit action:", error);
      pushToast("error", friendlyError(error));
    }
  };

  const runWithdraw = async () => {
    if (!client.data || !client.data.account) {
      pushToast("error", "Please connect your wallet first");
      return;
    }

    try {
      pushToast("info", "Preparing withdraw…", 2000);
      // 1) Get an ethers.js signer from the user’s wallet
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const userAddr = await signer.getAddress();

      // 2) Instantiate the vault contract with your ABI
      const vaultContract = new Contract(
        vaultAddress,
        vaultAbi,
        signer
      );

      let tx;
      let withdrawnAssetsWei: bigint = 0n;
      if (isFullWithdraw) {
        // Use withdraw(assets) with min(maxWithdraw, available assets)
        let assetsAvail: bigint | null = null;
        if (chainId === 999 && onchainPosition) assetsAvail = onchainPosition.assets;
        else if (position) assetsAvail = (position.depositedAssets * position.shareToUnderlying) / 10n ** 18n;
        const cap = maxWithdrawCap ?? 0n;
        const assetsToWithdraw = (assetsAvail != null) ? (cap < assetsAvail ? cap : assetsAvail) : 0n;
        if (assetsToWithdraw <= 0n) throw new Error("Nothing to withdraw");
        try { setInputs((prev) => ({ ...prev, amountToWithdraw: formatUnits(assetsToWithdraw, assetDecimals) })); } catch {}
        withdrawnAssetsWei = assetsToWithdraw;
        tx = await vaultContract.withdraw(
          assetsToWithdraw,
          userAddr,
          userAddr,
          { gasLimit: 250000n }
        );
      } else {
        const assetsToWithdraw = parseUnits(inputs.amountToWithdraw, assetDecimals);
        withdrawnAssetsWei = assetsToWithdraw;
        tx = await vaultContract.withdraw(
          assetsToWithdraw,
          userAddr,
          userAddr,
          { gasLimit: 250000n }
        );
      }
      pushToast("info", `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);

      try {
        if (chainId === 999) {
          await hyperPublicClient.waitForTransactionReceipt({
            hash: tx.hash as Hex,
            pollingInterval: 2000,
            timeout: 120_000,
          });
        } else if (signer.provider) {
          await signer.provider.waitForTransaction(tx.hash);
        } else {
          await tx.wait();
        }
        pushToast("success", "Withdraw successful");
        // Update net flow (withdrawals subtract underlying)
        try {
          const kFlow = NET_FLOW_STORE_KEY(chainId, vaultAddress, userAddr);
          const current = (() => { try { return BigInt(localStorage.getItem(kFlow) || "0"); } catch { return 0n; } })();
          const next = current - withdrawnAssetsWei;
          setNetFlowWei(next);
          try { localStorage.setItem(kFlow, next.toString()); } catch {}
        } catch {}
        // Refresh position & balance (HyperEVM path)
        try {
          const provider2 = new BrowserProvider(window.ethereum as any);
          const vc2 = new Contract(vaultAddress, vaultAbi, provider2);
          const assetAddr2: `0x${string}` = await vc2.asset();
          const token2 = new Contract(assetAddr2, erc20Abi, provider2);
          const bal2: bigint = await token2.balanceOf(userAddr);
          setOnchainBalance(bal2);
          const shares: bigint = await vc2.balanceOf(userAddr);
          const assets: bigint = await vc2.convertToAssets(shares);
          setOnchainPosition({ shares, assets });
        } catch {}
      } catch (waitErr) {
        // keep submitted message if wait fails
      }
    } catch (error: unknown) {
      console.error("Error during withdraw action:", error);
      pushToast("error", friendlyError(error));
    }
  };

  return (
    <div className="space-y-6 mb-8">
      {/* Remove the grid-cols-3 to allow full width */}
      <div className="grid grid-cols-1 gap-8 mb-8">
        {/* Add a nested grid for the three cards */}
        <div className="grid grid-cols-3 gap-8">
          {/* Current Position Card */}
          <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
            <h2 className="text-xl font-semibold text-[#00295B] mb-6 flex items-center">
              <span className="mr-2"></span> Current Position
            </h2>
            {!client.data?.account ? (
              <div className="text-[#101720]/60 text-sm">
                Please connect your wallet
              </div>
            ) : chainId === 999 ? (
              posLoading ? (
                <div className="space-y-4">
                  <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-3">
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-6 w-48" />
                      <div className="pt-4 border-t border-[#E5E2D6] space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-6 w-40" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : posError ? (
                <div className="text-red-500 text-sm">{posError}</div>
              ) : onchainPosition ? (
                <div className="space-y-4">
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-3">
            <div className="space-y-4">
              <div>
                <div className="text-sm text-[#101720]/70 mb-1">
                  Vault Token Balance
                </div>
                <div className="font-medium text-[#101720]">
                  {fmtToken(onchainPosition.shares, 18)} Vault&nbsp;Shares
                </div>
              </div>
              <div className="pt-4 border-t border-[#E5E2D6]">
                <div className="text-sm text-[#101720]/70 mb-1">
                  USD Value
                </div>
                <div className="font-medium text-[#101720]">
                  {priceLoading ? <Skeleton className="h-6 w-32" /> : (typeof userHoldingsUsd === "number" ? fmtUsdSimple(userHoldingsUsd) : "—")}
                </div>
                {/* --- PnL Section --- */}
                <div className="pt-4 border-t border-[#E5E2D6] mt-2">
                  <div className="text-sm text-[#101720]/70 mb-1">Unrealized PnL</div>
                  <div className={`font-medium ${typeof pnlUsd === "number" && pnlUsd < 0 ? "text-red-600" : "text-[#0A3D2E]"}`}>
                    {priceLoading ? (
                      <Skeleton className="h-6 w-32" />
                    ) : (
                      typeof pnlUsd === "number" ? `${pnlUsd < 0 ? "-" : "+"}$${Math.abs(pnlUsd).toFixed(2)}` : "—"
                    )}
                  </div>
                  <div className="text-xs text-[#101720]/70 mt-1">
                    {typeof roiPct === "number" && isFinite(roiPct) ? `${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(2)}%` : ""}
                  </div>
                </div>
                {/* --- End PnL Section --- */}
              </div>
            </div>
          </div>
                </div>
              ) : (
                <div className="text-[#101720]/60 text-sm">
                  No position data available
                </div>
              )
            ) : positionLoading ? (
              <div className="space-y-4">
                <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-3">
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-6 w-48" />
                    <div className="pt-4 border-t border-[#E5E2D6] space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-6 w-40" />
                    </div>
                  </div>
                </div>
              </div>
            ) : positionError ? (
              <div className="text-red-500 text-sm">{positionError}</div>
            ) : position ? (
              <div className="space-y-4">
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-3">
            <div className="space-y-4">
              <div>
                <div className="text-sm text-[#101720]/70 mb-1">
                  Vault Token Balance
                </div>
                <div className="font-medium text-[#101720]">
                  {fmtToken(position.depositedAssets, 18)} {position.vaultSymbol}
                </div>
              </div>
              <div className="pt-4 border-t border-[#E5E2D6]">
                <div className="text-sm text-[#101720]/70 mb-1">
                  USD Value
                </div>
                <div className="font-medium text-[#101720]">
                  {typeof userHoldingsUsd === "number" ? fmtUsdSimple(userHoldingsUsd) : "—"}
                </div>
                {/* --- PnL Section --- */}
                <div className="pt-4 border-t border-[#E5E2D6] mt-2">
                  <div className="text-sm text-[#101720]/70 mb-1">Unrealized PnL</div>
                  <div className={`font-medium ${typeof pnlUsd === "number" && pnlUsd < 0 ? "text-red-600" : "text-[#0A3D2E]"}`}>
                    {priceLoading ? (
                      <Skeleton className="h-6 w-32" />
                    ) : (
                      typeof pnlUsd === "number" ? `${pnlUsd < 0 ? "-" : "+"}$${Math.abs(pnlUsd).toFixed(2)}` : "—"
                    )}
                  </div>
                  <div className="text-xs text-[#101720]/70 mt-1">
                    {typeof roiPct === "number" && isFinite(roiPct) ? `${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(2)}%` : ""}
                  </div>
                </div>
                {/* --- End PnL Section --- */}
              </div>
              <div className="pt-4 border-t border-[#E5E2D6]">
                <div className="text-sm text-[#101720]/70 mb-1">Projected Earnings</div>
                <div className="font-medium text-[#101720] space-y-1">
                  <div>Monthly: ${monthlyEarningsUsd.toFixed(2)}</div>
                  <div>Annual:  ${annualEarningsUsd.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
              </div>
            ) : (
              <div className="text-[#101720]/60 text-sm">
                No position data available
              </div>
            )}
          </div>

          {/* Deposit Card */}
          <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
            <h2 className="text-xl font-semibold text-[#00295B] mb-6">Deposit</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[#101720]/80">
                  Deposit Amount
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="amountToDeposit"
                    value={inputs.amountToDeposit}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    className="w-full bg-[#FFFFF5] border-[0.5px] border-[#E5E2D6] rounded p-2.5 pr-10 text-sm text-[#101720]"
                  />
                  <button
                    type="button"
                    className={`absolute top-1/2 -translate-y-1/2 right-1 appearance-none !px-1 !py-0 !text-[8px] leading-none h-4 rounded border border-[#E5E2D6] bg-[#FFFFF5] text-[#101720] focus:outline-none focus:ring-0 transition-colors ${depPreset === "max" ? "!bg-[#00295B] !text-[#FFFFF5]" : ""}`}
                    style={{ zIndex: 2 }}
                    onClick={() => {
                      setDepPreset("max");
                      if (chainId === 999 && onchainBalance != null) {
                        setInputs((p) => ({ ...p, amountToDeposit: formatUnits(onchainBalance, assetDecimals) }));
                      } else if (tokenBalance?.balance) {
                        setInputs((p) => ({
                          ...p,
                          amountToDeposit: formatUnits(tokenBalance.balance as bigint, tokenBalance.decimals),
                        }));
                      }
                    }}
                  >
                    Max
                  </button>
                </div>
                <div className="text-xs text-[#101720]/70 mt-1">
                  {!client.data?.account ? (
                    "Connect wallet to see balance"
                  ) : chainId === 999 ? (
                    balLoading ? (
                      <Skeleton className="h-3 w-36" />
                    ) : balError ? (
                      <span className="text-red-400">{balError}</span>
                    ) : onchainBalance !== null ? (
                      <>Balance: {fmtToken(onchainBalance, assetDecimals)} {underlyingSym}</>
                    ) : (
                      "No balance data"
                    )
                  ) : tokenBalanceLoading ? (
                    <Skeleton className="h-3 w-36" />
                  ) : tokenBalanceError ? (
                    <span className="text-red-400">Error loading balance</span>
                  ) : tokenBalance ? (
                    <>Balance: {fmtToken(tokenBalance.balance as bigint, tokenBalance.decimals)} {tokenBalance.symbol}</>
                  ) : (
                    "No balance data"
                  )}
                </div>
                {depExceedsBalance && (
                  <div className="text-xs text-red-600 mt-1">
                    Exceeds wallet balance
                  </div>
                )}
              </div>

              {/* Approval preference (hidden when infinite allowance) */}
              {!infiniteAllowance && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-[#101720]/70">Approval:</span>
                  <button
                    type="button"
                    className={`px-2 py-1 text-xs rounded border border-[#E5E2D6] focus:outline-none focus:ring-0 transition-colors ${approvePref === "exact" ? "!bg-[#00295B] !text-[#FFFFF5]" : "bg-[#FFFFF5] text-[#101720]"}`}
                    aria-pressed={approvePref === "exact"}
                    onClick={() => {
                      setApprovePref("exact");
                      try { localStorage.setItem(APPROVAL_PREF_KEY(chainId, vaultAddress, underlyingAddress ?? undefined), "exact"); } catch {}
                    }}
                  >
                    Exact
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-1 text-xs rounded border border-[#E5E2D6] focus:outline-none focus:ring-0 transition-colors ${approvePref === "infinite" ? "!bg-[#00295B] !text-[#FFFFF5]" : "bg-[#FFFFF5] text-[#101720]"}`}
                    aria-pressed={approvePref === "infinite"}
                    onClick={() => {
                      setApprovePref("infinite");
                      try { localStorage.setItem(APPROVAL_PREF_KEY(chainId, vaultAddress, underlyingAddress ?? undefined), "infinite"); } catch {}
                    }}
                  >
                    Infinite
                  </button>
                </div>
              )}

              {/* Previews & Caps */}
              {/* Approval button (separate from deposit) */}
              {!infiniteAllowance && (
                <button
                  type="button"
                  onClick={runApprove}
                  disabled={
                    approving ||
                    !client.data?.account ||
                    chainId !== 999 ||
                    !underlyingAddress ||
                    (approvePref === "exact" && (!depParsed || depParsed <= 0n)) ||
                    (allowance != null && depParsed != null && allowance >= depParsed)
                  }
                  className={`w-full mb-2 ${approving ? "bg-[#00295B]/60" : "bg-[#00295B] hover:bg-[#001B3E]"} text-[#FFFFF5] py-2.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {allowance != null && depParsed != null && allowance >= depParsed
                    ? "Approved"
                    : approvePref === "infinite"
                    ? (approving ? "Approving Infinite…" : "Approve Infinite")
                    : (approving ? "Approving Exact…" : "Approve Exact")}
                </button>
              )}
              <div className="text-sm text-[#101720]/80 space-y-1">
                {previewLoading ? (
                  <>
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-40" />
                  </>
                ) : depositPreviewShares !== null ? (
                  <div>
                    You will receive <span className="font-medium">{fmtToken(depositPreviewShares, 18)}</span> shares
                  </div>
                ) : previewError ? (
                  <div className="text-[#101720]/60">Preview unavailable. Make sure you are connected to the HyperEVM network and try again.</div>
                ) : null}
                {maxDepositCap !== null && (
                  <div className="text-[#101720]/60">
                    Max deposit: {fmtToken(maxDepositCap, assetDecimals)} {underlyingSym}
                  </div>
                )}
              </div>

              <button
                onClick={() => setConfirm({ open: true, action: "deposit", displayAmount: inputs.amountToDeposit })}
                disabled={depositDisabled || submitting === "deposit"}
                className={`w-full ${submitting === "deposit" ? "!bg-blue-400" : "!bg-blue-500 hover:bg-[#0045CC]"} text-white py-3 rounded-md font-medium mt-3 transition-colors ${depositDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {submitting === "deposit" ? "Depositing…" : "Deposit"}
              </button>
              {depositDisabled && depositReason && (
                <div className="text-xs text-[#101720]/70 mt-2">
                  {
                    // Patch deposit disabled reason for max deposit
                    depositReason.includes("Exceeds max deposit") ?
                      `Exceeds max deposit (${fmtToken(maxDepositCap ?? 0n, assetDecimals)} ${underlyingSym})`
                      : depositReason
                  }
                </div>
              )}

            </div>
          </div>

          {/* Withdraw Card */}
          <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
            <h2 className="text-xl font-semibold text-[#00295B] mb-6">Withdraw</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[#101720]/80">
                  Withdraw Amount
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="amountToWithdraw"
                    value={inputs.amountToWithdraw}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    className="w-full bg-[#FFFFF5] border-[0.5px] border-[#E5E2D6] rounded p-2.5 pr-10 text-sm text-[#101720]"
                  />
                  <button
                    type="button"
                    className={`absolute top-1/2 -translate-y-1/2 right-1 appearance-none !px-1 !py-0 !text-[8px] leading-none h-4 rounded border border-[#E5E2D6] bg-[#FFFFF5] text-[#101720] focus:outline-none focus:ring-0 transition-colors ${witPreset === "max" ? "!bg-[#00295B] !text-[#FFFFF5]" : ""}`}
                    style={{ zIndex: 2 }}
                    onClick={() => {
                      setWitPreset("max");
                      setIsFullWithdraw(true);
                      if (maxWithdrawCap != null) {
                        setInputs((p) => ({ ...p, amountToWithdraw: formatUnits(maxWithdrawCap, assetDecimals) }));
                      } else if (chainId === 999 && onchainPosition) {
                        setInputs((p) => ({ ...p, amountToWithdraw: formatUnits(onchainPosition.assets, assetDecimals) }));
                      } else if (position) {
                        const underlyingWei = (position.depositedAssets * position.shareToUnderlying) / 10n ** 18n;
                        setInputs((p) => ({ ...p, amountToWithdraw: formatUnits(underlyingWei, assetDecimals) }));
                      }
                    }}
                  >
                    Max
                  </button>
                </div>
                <div className="text-xs text-[#101720]/70 mt-1">
                  {isFullWithdraw ? (
                    <>Full withdraw selected</>
                  ) : maxWithdrawCap !== null ? (
                    <>Max withdraw: {fmtToken(maxWithdrawCap ?? 0n, assetDecimals)} {underlyingSym}</>
                  ) : chainId === 999 && onchainPosition ? (
                    <>Max withdraw: {fmtToken(onchainPosition.assets ?? 0n, assetDecimals)} {underlyingSym}</>
                  ) : null}
                </div>
              </div>

              {/* Previews & Caps */}
              <div className="text-sm text-[#101720]/80 space-y-1">
                {previewLoading ? (
                  <>
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-40" />
                  </>
                ) : isFullWithdraw ? (
                  redeemPreviewAssets !== null ? (
                    <div>
                      You will receive <span className="font-medium">{fmtToken(redeemPreviewAssets, assetDecimals)}</span> {underlyingSym}
                    </div>
                  ) : previewError ? (
                    <div className="text-[#101720]/60">Preview unavailable. Make sure you are connected to the HyperEVM network and try again.</div>
                  ) : null
                ) : (
                  withdrawPreviewShares !== null ? (
                    <div>
                      You will burn <span className="font-medium">{fmtToken(withdrawPreviewShares, 18)}</span> shares
                    </div>
                  ) : previewError ? (
                    <div className="text-[#101720]/60">Preview unavailable. Make sure you are connected to the HyperEVM network and try again.</div>
                  ) : null
                )}

                {isFullWithdraw ? (
                  maxRedeemCap !== null && (
                    <div className="text-[#101720]/60">
                      Max redeem: {fmtToken(maxRedeemCap ?? 0n, 18)} shares
                    </div>
                  )
                ) : (
                  maxWithdrawCap !== null && (
                    <div className="text-[#101720]/60">
                      Max withdraw: {fmtToken(maxWithdrawCap ?? 0n, assetDecimals)} {underlyingSym}
                    </div>
                  )
                )}
              </div>

              <button
                onClick={() => setConfirm({ open: true, action: "withdraw", displayAmount: inputs.amountToWithdraw })}
                disabled={withdrawDisabled || submitting === "withdraw"}
                className={`w-full ${submitting === "withdraw" ? "!bg-red-400" : "!bg-red-500 hover:bg-red-600"} text-white py-3 rounded-md font-medium mt-3 transition-colors ${withdrawDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {submitting === "withdraw"
                  ? (isFullWithdraw ? "Withdrawing All…" : "Withdrawing…")
                  : (isFullWithdraw ? "Withdraw All" : "Withdraw")}
              </button>
              {withdrawDisabled && withdrawReason && (
                <div className="text-xs text-[#101720]/70 mt-2">
                  {
                    // Patch withdraw disabled reason for max redeem/withdraw
                    withdrawReason.includes("Exceeds max redeem") ?
                      `Exceeds max redeem (${fmtToken(maxRedeemCap ?? 0n, 18)} shares)`
                    : withdrawReason.includes("Exceeds max withdraw") ?
                      `Exceeds max withdraw (${fmtToken(maxWithdrawCap ?? 0n, assetDecimals)} ${underlyingSym})`
                    : withdrawReason
                  }
                </div>
              )}
            </div>
          </div>
        </div>


      </div>
      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.open ? (confirm.action === "deposit" ? "Confirm Deposit" : "Confirm Withdraw") : ""}
        body={
          confirm.open ? (
            <div className="text-sm">
              {confirm.action === "deposit" ? (
                <>You are about to deposit <span className="font-semibold">{confirm.displayAmount}</span> {underlyingSym} into the vault.</>
              ) : isFullWithdraw ? (
                <>You are about to withdraw <span className="font-semibold">ALL</span> available shares.</>
              ) : (
                <>You are about to withdraw <span className="font-semibold">{confirm.displayAmount}</span> {underlyingSym}.</>
              )}
            </div>
          ) : null
        }
        onCancel={() => setConfirm({ open: false })}
        onConfirm={async () => {
          if (!confirm.open) return;
          try {
            setSubmitting(confirm.action);
            setConfirm({ open: false });
            if (confirm.action === "deposit") {
              await runDeposit();
            } else {
              await runWithdraw();
            }
          } finally {
            setSubmitting(null);
          }
        }}
        confirmLabel={confirm.open && confirm.action === "deposit" ? "Confirm Deposit" : "Confirm Withdraw"}
      />
      <Toasts toasts={toasts} />
    </div>
  );
}
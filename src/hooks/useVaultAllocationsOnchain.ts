import { useEffect, useMemo, useState } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { MARKET_LABELS } from "../constants/hyper";
import { getUsdPrice } from "../lib/prices";

const vaultAbi = [
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdrawQueueLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdrawQueue", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "MORPHO", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "supplyQueueLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "supplyQueue", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bytes32" }] },
] as const;

const morphoAbi = [
  {
    type: "function",
    name: "position",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }],
    outputs: [
      { name: "supplyShares", type: "uint256" },
      { name: "borrowShares", type: "uint128" },
      { name: "collateral", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "market",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "totalSupplyAssets", type: "uint128" },
      { name: "totalSupplyShares", type: "uint128" },
      { name: "totalBorrowAssets", type: "uint128" },
      { name: "totalBorrowShares", type: "uint128" },
      { name: "lastUpdate", type: "uint128" },
      { name: "fee", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "idToMarketParams",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "loanToken", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "oracle", type: "address" },
      { name: "irm", type: "address" },
      { name: "lltv", type: "uint256" },
    ],
  },
] as const;

const irmAbi = [
  {
    type: "function",
    name: "borrowRateView",
    stateMutability: "view",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
        ],
      },
      {
        name: "market",
        type: "tuple",
        components: [
          { name: "totalSupplyAssets", type: "uint128" },
          { name: "totalSupplyShares", type: "uint128" },
          { name: "totalBorrowAssets", type: "uint128" },
          { name: "totalBorrowShares", type: "uint128" },
          { name: "lastUpdate", type: "uint128" },
          { name: "fee", type: "uint128" },
        ],
      },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type AllocationItem = {
  id: `0x${string}`;
  assets: bigint;           // supplied assets in market's loan token units
  label: string;            // MARKET_LABELS[id] or hex id
  pct: number;              // percentage (legacy calc)
  usd?: number | null;      // USD value if available
  supplyApy?: number | null;// decimal, e.g. 0.045 for 4.5%
};

export function useVaultAllocationsOnchain(vaultAddress: Address) {
  const [rows, setRows] = useState<AllocationItem[] | null>(null);
  const [totalAssets, setTotalAssets] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trueIdle, setTrueIdle] = useState<bigint | null>(null);
  const [hiddenDust, setHiddenDust] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        // 1) Read vault-level info
        const [morphoAddr, currentTotal, qLen] = (await Promise.all([
          hyperPublicClient.readContract({ address: vaultAddress, abi: vaultAbi, functionName: "MORPHO" }),
          hyperPublicClient.readContract({ address: vaultAddress, abi: vaultAbi, functionName: "totalAssets" }),
          hyperPublicClient.readContract({ address: vaultAddress, abi: vaultAbi, functionName: "withdrawQueueLength" }),
        ])) as [Address, bigint, bigint];

        // 2) Collect market ids from BOTH queues (union)
        const idsSet = new Set<`0x${string}`>();

        const withdrawLen = Number(qLen);
        for (let i = 0; i < withdrawLen; i++) {
          const id = (await hyperPublicClient.readContract({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "withdrawQueue",
            args: [BigInt(i)],
          })) as `0x${string}`;
          idsSet.add(id);
        }

        const supplyLen = Number(
          (await hyperPublicClient.readContract({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "supplyQueueLength",
          })) as bigint
        );
        for (let i = 0; i < supplyLen; i++) {
          const id = (await hyperPublicClient.readContract({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "supplyQueue",
            args: [BigInt(i)],
          })) as `0x${string}`;
          idsSet.add(id);
        }

        const ids = Array.from(idsSet);

        // 3) Build enriched allocation rows
        type PositionTuple = readonly [bigint, bigint, bigint]; // [supplyShares, borrowShares, collateral]
        type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint]; // [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee]
        type ParamsTuple = readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint]; // [loanToken, collateralToken, oracle, irm, lltv]

        // Small caches to avoid repeated calls
        const tokenDecimals = new Map<`0x${string}`, number>();
        const tokenPrices = new Map<`0x${string}`, number | null>();

        const itemsEnriched: AllocationItem[] = [];

        for (const id of ids) {
          const [position, market, params] = (await Promise.all([
            hyperPublicClient.readContract({ address: morphoAddr, abi: morphoAbi, functionName: "position", args: [id, vaultAddress] }),
            hyperPublicClient.readContract({ address: morphoAddr, abi: morphoAbi, functionName: "market", args: [id] }),
            hyperPublicClient.readContract({ address: morphoAddr, abi: morphoAbi, functionName: "idToMarketParams", args: [id] }),
          ])) as [PositionTuple, MarketTuple, ParamsTuple];

          const supplyShares = position[0];
          const totalSupplyAssets = market[0];
          const totalSupplyShares = market[1];
          const totalBorrowAssets = market[2];
          const feeWad = market[5]; // wad-scaled

          // Compute supplied assets (in loan token units)
          let assets = 0n;
          if (totalSupplyShares !== 0n && supplyShares !== 0n) {
            assets = (supplyShares * totalSupplyAssets) / totalSupplyShares;
          }

          // Skip empty allocations early
          if (assets === 0n) {
            continue;
          }

          // Per-market supply APY
          let supplyApy: number | null = null;
          try {
            const irmAddr = params[3];
            const mktParamsObj = {
              loanToken: params[0],
              collateralToken: params[1],
              oracle: params[2],
              irm: params[3],
              lltv: params[4],
            } as const;

            const mktStateObj = {
              totalSupplyAssets: market[0],
              totalSupplyShares: market[1],
              totalBorrowAssets: market[2],
              totalBorrowShares: market[3],
              lastUpdate: market[4],
              fee: market[5],
            } as const;

            const borrowRatePerSecWad = (await hyperPublicClient.readContract({
              address: irmAddr,
              abi: irmAbi,
              functionName: "borrowRateView",
              args: [mktParamsObj, mktStateObj],
            })) as bigint;

            // utilization u in WAD (1e18)
            const uWad = totalSupplyAssets === 0n ? 0n : (totalBorrowAssets * 1_000_000_000_000_000_000n) / totalSupplyAssets;
            const feePct = Number(feeWad) / 1e18;
            const borrowRatePerSec = Number(borrowRatePerSecWad) / 1e18;
            const u = Number(uWad) / 1e18;
            const supplyRatePerSec = borrowRatePerSec * u * (1 - feePct);
            const SECONDS_PER_YEAR = 31_536_000; // 365d
            supplyApy = Math.exp(supplyRatePerSec * SECONDS_PER_YEAR) - 1;
          } catch {
            supplyApy = null;
          }

          // Token decimals
          const loanToken = params[0];
          let dec = tokenDecimals.get(loanToken);
          if (dec == null) {
            try {
              dec = Number(
                await hyperPublicClient.readContract({ address: loanToken, abi: erc20Abi, functionName: "decimals" })
              );
              tokenDecimals.set(loanToken, dec);
            } catch {
              dec = 18; // fallback
              tokenDecimals.set(loanToken, dec);
            }
          }

          // Token symbol (for display)
          const tokenSymbols: Map<`0x${string}`, string> =
            (globalThis as any).__allocTokenSymbols || new Map();
          (globalThis as any).__allocTokenSymbols = tokenSymbols;

          let sym = tokenSymbols.get(loanToken);
          if (sym == null) {
            try {
              sym = String(
                await hyperPublicClient.readContract({
                  address: loanToken,
                  abi: erc20Abi,
                  functionName: "symbol",
                })
              );
              tokenSymbols.set(loanToken, sym);
            } catch {
              // fallback: short address
              sym = `${loanToken.slice(0, 6)}…${loanToken.slice(-4)}`;
              tokenSymbols.set(loanToken, sym);
            }
          }

          // USD price for loan token
          let p = tokenPrices.get(loanToken);
          if (p === undefined) {
            p = await getUsdPrice({ token: loanToken }); // CoinGecko/Dexscreener fallback under the hood
            tokenPrices.set(loanToken, p ?? null);
          }

          const amount = Number(formatUnits(assets, dec));
          const usd = p != null ? amount * p : null;

          itemsEnriched.push({
            id,
            assets,
            label: MARKET_LABELS[id] ?? id,
            pct: 0, // will set below using legacy calc
            usd,
            supplyApy,
          });
        }

        // Legacy percentage calc based on vault totalAssets (note: cross-asset mix; kept for backward compatibility)
        const t = currentTotal === 0n ? 1n : currentTotal;
        for (const it of itemsEnriched) {
          it.pct = Number((it.assets * 1_000_000n) / t) / 10_000; // 2 dp
        }

        // Attach percentage-of-total to each row using pure on-chain units (no USD dependency)
        const pctOf = (assets: bigint) =>
        currentTotal !== 0n
          ? Number((assets * 10000n) / currentTotal) / 100 // keep two decimals via integer math
          : 0;

        const withPct = itemsEnriched.map((r) => ({ ...r, pct: pctOf(r.assets) }));

        // Dust threshold based on share of total (no USD dependency)
        const DUST_PCT = 0.01; // 0.01%
        const filtered = withPct.filter((r) => r.pct >= DUST_PCT);

        // Sort by USD desc if available, else by assets desc
        filtered.sort((a, b) => {
          if (a.usd != null && b.usd != null) return b.usd - a.usd;
          if (a.usd != null) return -1;
          if (b.usd != null) return 1;
          return b.assets > a.assets ? 1 : b.assets < a.assets ? -1 : 0;
        });

        // ---- Idle & dust accounting (use ALL items, not just filtered) ----
        const sumAllAllocated = withPct.reduce((acc, r) => acc + r.assets, 0n);
        const sumVisible = filtered.reduce((acc, r) => acc + r.assets, 0n);

        // true idle = vault totalAssets - ALL allocated (not filtered)
        const idleComputed = currentTotal > sumAllAllocated ? currentTotal - sumAllAllocated : 0n;
        const hiddenDustComputed = sumAllAllocated > sumVisible ? sumAllAllocated - sumVisible : 0n;

        if (!cancelled) {
          setRows(filtered);
          setTotalAssets(currentTotal);
          setTrueIdle?.(idleComputed);
          setHiddenDust?.(hiddenDustComputed);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load allocations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [vaultAddress]);

  const items: AllocationItem[] | null = useMemo(() => {
    if (!rows || totalAssets === null) return null;
    return rows;
  }, [rows, totalAssets]);

  return { loading, error, totalAssets, items, trueIdle, hiddenDust };
}
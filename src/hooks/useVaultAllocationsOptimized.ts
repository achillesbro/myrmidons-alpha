// src/hooks/useVaultAllocationsOptimized.ts
import { useEffect, useMemo, useState, useCallback } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { MARKET_LABELS } from "../constants/hyper";
import { TOKEN_METADATA } from "../constants/hyper";
import { globalContractReader, type BatchCall } from "../lib/contract-batcher";
import { globalPriceOptimizer } from "../lib/price-optimizer";
import { groupMorphoAllocations, type GroupedAllocation, type AllocationGroupingResult } from "../lib/allocation-grouper";

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
  assets: bigint;
  label: string;
  pct: number;
  usd?: number | null;
  supplyApy?: number | null;
  logo?: string | null;
};

export interface OptimizedAllocationsResult {
  loading: boolean;
  error: string | null;
  totalAssets: bigint | null;
  items: AllocationItem[] | null;
  groupedItems: GroupedAllocation[] | null;
  groupingResult: AllocationGroupingResult | null;
  trueIdle: bigint | null;
  hiddenDust: bigint | null;
  progress: number; // 0-100 progress indicator
}

export function useVaultAllocationsOptimized(vaultAddress: Address): OptimizedAllocationsResult {
  const [rows, setRows] = useState<AllocationItem[] | null>(null);
  const [totalAssets, setTotalAssets] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [trueIdle, setTrueIdle] = useState<bigint | null>(null);
  const [hiddenDust, setHiddenDust] = useState<bigint | null>(null);

  // Progressive loading callback
  const updateProgress = useCallback((step: number, total: number) => {
    setProgress(Math.round((step / total) * 100));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setProgress(0);

      try {
        // Step 1: Get vault-level info (10% progress)
        updateProgress(1, 10);
        const [morphoAddr, currentTotal, qLen] = await Promise.all([
          globalContractReader.readContract(hyperPublicClient, vaultAddress, vaultAbi, "MORPHO"),
          globalContractReader.readContract(hyperPublicClient, vaultAddress, vaultAbi, "totalAssets"),
          globalContractReader.readContract(hyperPublicClient, vaultAddress, vaultAbi, "withdrawQueueLength"),
        ]) as [Address, bigint, bigint];

        if (cancelled) return;

        // Step 2: Collect market IDs (20% progress)
        updateProgress(2, 10);
        const idsSet = new Set<`0x${string}`>();

        // Batch queue reads
        const withdrawLen = Number(qLen);
        const supplyLen = Number(await globalContractReader.readContract(
          hyperPublicClient, 
          vaultAddress, 
          vaultAbi, 
          "supplyQueueLength"
        ) as bigint);

        const queueCalls: BatchCall[] = [];
        
        // Add withdraw queue calls
        for (let i = 0; i < withdrawLen; i++) {
          queueCalls.push({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "withdrawQueue",
            args: [BigInt(i)],
            key: `withdraw-${i}`,
          });
        }

        // Add supply queue calls
        for (let i = 0; i < supplyLen; i++) {
          queueCalls.push({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "supplyQueue",
            args: [BigInt(i)],
            key: `supply-${i}`,
          });
        }

        // Batch execute queue reads
        const queueResults = await globalContractReader.batchReadContracts(hyperPublicClient, queueCalls);
        
        // Process results
        Object.entries(queueResults).forEach(([, id]) => {
          if (id && typeof id === 'string') {
            idsSet.add(id as `0x${string}`);
          }
        });

        const ids = Array.from(idsSet);
        if (cancelled) return;

        // Step 3: Batch fetch market data (40% progress)
        updateProgress(3, 10);
        const marketCalls: BatchCall[] = [];
        
        ids.forEach((id) => {
          marketCalls.push(
            {
              address: morphoAddr,
              abi: morphoAbi,
              functionName: "position",
              args: [id, vaultAddress],
              key: `position-${id}`,
            },
            {
              address: morphoAddr,
              abi: morphoAbi,
              functionName: "market",
              args: [id],
              key: `market-${id}`,
            },
            {
              address: morphoAddr,
              abi: morphoAbi,
              functionName: "idToMarketParams",
              args: [id],
              key: `params-${id}`,
            }
          );
        });

        const marketResults = await globalContractReader.batchReadContracts(hyperPublicClient, marketCalls);
        if (cancelled) return;

        // Step 4: Process market data and calculate APYs (60% progress)
        updateProgress(4, 10);
        const itemsEnriched: AllocationItem[] = [];
        const tokenAddresses = new Set<`0x${string}`>();

        for (const id of ids) {
          const position = marketResults[`position-${id}`] as [bigint, bigint, bigint] | null;
          const market = marketResults[`market-${id}`] as [bigint, bigint, bigint, bigint, bigint, bigint] | null;
          const params = marketResults[`params-${id}`] as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint] | null;

          if (!position || !market || !params) continue;

          const supplyShares = position[0];
          const totalSupplyAssets = market[0];
          const totalSupplyShares = market[1];
          const totalBorrowAssets = market[2];
          const feeWad = market[5];

          // Calculate assets
          let assets = 0n;
          if (totalSupplyShares !== 0n && supplyShares !== 0n) {
            assets = (supplyShares * totalSupplyAssets) / totalSupplyShares;
          }

          if (assets === 0n) continue;

          // Collect token addresses for batch price fetching
          tokenAddresses.add(params[0]);

          // Calculate APY (simplified for now - can be optimized further)
          let supplyApy: number | null = null;
          try {
            const irmAddr = params[3];
            const borrowRatePerSecWad = await globalContractReader.readContract(
              hyperPublicClient,
              irmAddr,
              irmAbi,
              "borrowRateView",
              [
                {
                  loanToken: params[0],
                  collateralToken: params[1],
                  oracle: params[2],
                  irm: params[3],
                  lltv: params[4],
                },
                {
                  totalSupplyAssets: market[0],
                  totalSupplyShares: market[1],
                  totalBorrowAssets: market[2],
                  totalBorrowShares: market[3],
                  lastUpdate: market[4],
                  fee: market[5],
                },
              ]
            ) as bigint;

            const uWad = totalSupplyAssets === 0n ? 0n : (totalBorrowAssets * 1_000_000_000_000_000_000n) / totalSupplyAssets;
            const feePct = Number(feeWad) / 1e18;
            const borrowRatePerSec = Number(borrowRatePerSecWad) / 1e18;
            const u = Number(uWad) / 1e18;
            const supplyRatePerSec = borrowRatePerSec * u * (1 - feePct);
            const SECONDS_PER_YEAR = 31_536_000;
            supplyApy = Math.exp(supplyRatePerSec * SECONDS_PER_YEAR) - 1;
          } catch {
            supplyApy = null;
          }

          itemsEnriched.push({
            id,
            assets,
            label: TOKEN_METADATA[id]?.label ?? MARKET_LABELS[id] ?? `${id.slice(0, 6)}…${id.slice(-4)}`,
            pct: 0, // Will be calculated later
            usd: null, // Will be filled in next step
            supplyApy: supplyApy ?? 0,
            logo: TOKEN_METADATA[id]?.logo ?? null,
          });
        }

        if (cancelled) return;

        // Step 5: Batch fetch token metadata and prices (80% progress)
        updateProgress(5, 10);
        const tokenCalls: BatchCall[] = [];
        const tokenAddressesArray = Array.from(tokenAddresses);

        // Batch fetch decimals and symbols
        tokenAddressesArray.forEach(token => {
          tokenCalls.push(
            {
              address: token,
              abi: erc20Abi,
              functionName: "decimals",
              key: `decimals-${token}`,
            },
            {
              address: token,
              abi: erc20Abi,
              functionName: "symbol",
              key: `symbol-${token}`,
            }
          );
        });

        const tokenResults = await globalContractReader.batchReadContracts(hyperPublicClient, tokenCalls);
        
        // Batch fetch prices
        const priceRequests = tokenAddressesArray.map(token => ({ token }));
        const priceResults = await globalPriceOptimizer.getBatchPrices(priceRequests);

        if (cancelled) return;

        // Step 6: Finalize data (100% progress)
        updateProgress(6, 10);
        
        // Create token metadata maps
        const tokenDecimals = new Map<`0x${string}`, number>();
        const tokenSymbols = new Map<`0x${string}`, string>();
        const tokenPrices = new Map<`0x${string}`, number | null>();

        tokenAddressesArray.forEach(token => {
          const decimals = tokenResults[`decimals-${token}`] as number | null;
          const symbol = tokenResults[`symbol-${token}`] as string | null;
          const priceKey = `${token.toLowerCase()}|`;
          const price = priceResults.get(priceKey);

          tokenDecimals.set(token, decimals ?? 18);
          tokenSymbols.set(token, symbol ?? `${token.slice(0, 6)}…${token.slice(-4)}`);
          tokenPrices.set(token, price ?? null);
        });

        // Update items with USD values
        itemsEnriched.forEach(item => {
          const token = marketResults[`params-${item.id}`]?.[0] as `0x${string}` | undefined;
          if (token) {
            const decimals = tokenDecimals.get(token) ?? 18;
            const price = tokenPrices.get(token);
            const amount = Number(formatUnits(item.assets, decimals));
            item.usd = price != null ? amount * price : null;
          }
        });

        // Calculate percentages
        const t = currentTotal === 0n ? 1n : currentTotal;
        itemsEnriched.forEach(item => {
          item.pct = Number((item.assets * 10000n) / t) / 100;
        });

        // Filter and sort
        const DUST_PCT = 0.01;
        const filtered = itemsEnriched
          .filter(item => item.pct >= DUST_PCT && item.assets !== 0n && item.label !== "Idle")
          .sort((a, b) => {
            if (a.usd != null && b.usd != null) return b.usd - a.usd;
            if (a.usd != null) return -1;
            if (b.usd != null) return 1;
            return b.assets > a.assets ? 1 : b.assets < a.assets ? -1 : 0;
          });

        // Calculate idle and dust
        const sumAllAllocated = itemsEnriched.reduce((acc, item) => acc + item.assets, 0n);
        const sumVisible = filtered.reduce((acc, item) => acc + item.assets, 0n);
        const idleComputed = currentTotal > sumAllAllocated ? currentTotal - sumAllAllocated : 0n;
        const hiddenDustComputed = sumAllAllocated > sumVisible ? sumAllAllocated - sumVisible : 0n;

        if (!cancelled) {
          setRows(filtered);
          setTotalAssets(currentTotal);
          setTrueIdle(idleComputed);
          setHiddenDust(hiddenDustComputed);
          setProgress(100);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load allocations");
          setProgress(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [vaultAddress, updateProgress]);

  const items: AllocationItem[] | null = useMemo(() => {
    if (!rows || totalAssets === null) return null;
    return rows;
  }, [rows, totalAssets]);

  // Group items by family
  const groupingResult: AllocationGroupingResult | null = useMemo(() => {
    if (!items || totalAssets === null) return null;
    return groupMorphoAllocations(items, totalAssets);
  }, [items, totalAssets]);

  const groupedItems: GroupedAllocation[] | null = useMemo(() => {
    return groupingResult?.groupedItems || null;
  }, [groupingResult]);

  return { 
    loading, 
    error, 
    totalAssets, 
    items, 
    groupedItems,
    groupingResult,
    trueIdle, 
    hiddenDust, 
    progress 
  };
}

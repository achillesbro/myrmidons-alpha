import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { MARKET_LABELS } from "../constants/hyper";

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
] as const;

export type AllocationItem = {
  id: `0x${string}`;
  assets: bigint;  // underlying units
  label: string;   // MARKET_LABELS[id] or hex id
  pct: number;     // 0..100
};

export function useVaultAllocationsOnchain(vaultAddress: Address) {
  const [allocs, setAllocs] = useState<Map<`0x${string}`, bigint> | null>(null);
  const [totalAssets, setTotalAssets] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // 3) For each market id, read position & market to compute current supplied assets
        const map = new Map<`0x${string}`, bigint>();
        for (const id of ids) {
          // Viem returns tuples for these calls. Define tuple shapes explicitly.
          type PositionTuple = readonly [bigint, bigint, bigint]; // [supplyShares, borrowShares, collateral]
          type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint]; // [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee]

          const [position, market] = (await Promise.all([
            hyperPublicClient.readContract({
              address: morphoAddr,
              abi: morphoAbi,
              functionName: "position",
              args: [id, vaultAddress],
            }),
            hyperPublicClient.readContract({
              address: morphoAddr,
              abi: morphoAbi,
              functionName: "market",
              args: [id],
            }),
          ])) as [PositionTuple, MarketTuple];

          const supplyShares = position[0];
          const totalSupplyAssets = market[0];
          const totalSupplyShares = market[1];

          if (totalSupplyShares === 0n || supplyShares === 0n) {
            map.set(id, 0n);
          } else {
            const assets = (supplyShares * totalSupplyAssets) / totalSupplyShares;
            map.set(id, assets);
          }
        }

        if (!cancelled) {
          setAllocs(map);
          setTotalAssets(currentTotal);
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
    if (!allocs || totalAssets === null) return null;
    const t = totalAssets === 0n ? 1n : totalAssets;

    const out: AllocationItem[] = [];
    for (const [id, assets] of allocs.entries()) {
      if (assets === 0n) continue; // hide empty allocations
      const pct = Number((assets * 1_000_000n) / t) / 10_000; // 2 dp
      out.push({ id, assets, label: MARKET_LABELS[id] ?? id, pct });
    }
    out.sort((a, b) => (b.assets > a.assets ? 1 : b.assets < a.assets ? -1 : 0));
    return out;
  }, [allocs, totalAssets]);

  return { loading, error, totalAssets, items };
}
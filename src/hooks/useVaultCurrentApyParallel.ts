// src/hooks/useVaultCurrentApyParallel.ts
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { globalContractReader, type BatchCall } from "../lib/contract-batcher";

// Tuple shapes returned by viem for Morpho calls
type MarketParamsTuple = readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint];
type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

// Minimal ABIs we need
const vaultAbi = [
  { type: "function", name: "MORPHO", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "withdrawQueueLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdrawQueue", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "supplyQueueLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "supplyQueue", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bytes32" }] },
] as const;

const morphoAbi = [
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
    name: "position",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }],
    outputs: [
      { name: "supplyShares", type: "uint256" },
      { name: "borrowShares", type: "uint128" },
      { name: "collateral", type: "uint128" },
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
    outputs: [{ name: "ratePerSecondWad", type: "uint256" }],
  },
] as const;

const WAD = 1_000_000_000_000_000_000n; // 1e18
const SECONDS_PER_YEAR = 31_536_000; // 365 * 24 * 3600

export function useVaultCurrentApyParallel(vaultAddress: Address) {
  const [apy, setApy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setProgress(0);

      try {
        // Step 1: Get vault-level info and market IDs (20% progress)
        setProgress(10);
        const [morphoAddr, withdrawLen, supplyLen] = await Promise.all([
          globalContractReader.readContract(hyperPublicClient, vaultAddress, vaultAbi, "MORPHO") as Promise<Address>,
          globalContractReader.readContract(hyperPublicClient, vaultAddress, vaultAbi, "withdrawQueueLength") as Promise<bigint>,
          globalContractReader.readContract(hyperPublicClient, vaultAddress, vaultAbi, "supplyQueueLength") as Promise<bigint>,
        ]);

        if (cancelled) return;

        // Step 2: Collect market IDs from both queues (40% progress)
        setProgress(20);
        const idsSet = new Set<`0x${string}`>();

        // Batch queue reads
        const queueCalls: BatchCall[] = [];
        
        // Add withdraw queue calls
        for (let i = 0; i < Number(withdrawLen); i++) {
          queueCalls.push({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "withdrawQueue",
            args: [BigInt(i)],
            key: `withdraw-${i}`,
          });
        }

        // Add supply queue calls
        for (let i = 0; i < Number(supplyLen); i++) {
          queueCalls.push({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "supplyQueue",
            args: [BigInt(i)],
            key: `supply-${i}`,
          });
        }

        const queueResults = await globalContractReader.batchReadContracts(hyperPublicClient, queueCalls);
        
        // Process results
        Object.entries(queueResults).forEach(([, id]) => {
          if (id && typeof id === 'string') {
            idsSet.add(id as `0x${string}`);
          }
        });

        const marketIds = Array.from(idsSet);
        if (cancelled) return;

        // Step 3: Batch fetch market data and positions (60% progress)
        setProgress(40);
        const marketCalls: BatchCall[] = [];
        
        marketIds.forEach((id) => {
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

        // Step 4: Calculate weights and filter active markets (80% progress)
        setProgress(60);
        const activeMarkets: Array<{
          id: `0x${string}`;
          weight: number;
          params: MarketParamsTuple;
          market: MarketTuple;
        }> = [];

        let totalAssets = 0n;

        for (const id of marketIds) {
          const position = marketResults[`position-${id}`] as [bigint, bigint, bigint] | null;
          const market = marketResults[`market-${id}`] as MarketTuple | null;
          const params = marketResults[`params-${id}`] as MarketParamsTuple | null;

          if (!position || !market || !params) continue;

          const supplyShares = position[0];
          const totalSupplyAssets = market[0];
          const totalSupplyShares = market[1];

          // Calculate assets
          let assets = 0n;
          if (totalSupplyShares !== 0n && supplyShares !== 0n) {
            assets = (supplyShares * totalSupplyAssets) / totalSupplyShares;
          }

          if (assets > 0n) {
            totalAssets += assets;
            activeMarkets.push({
              id,
              weight: 0, // Will be calculated after we know totalAssets
              params,
              market,
            });
          }
        }

        // Calculate weights
        activeMarkets.forEach(market => {
          const position = marketResults[`position-${market.id}`] as [bigint, bigint, bigint];
          const supplyShares = position[0];
          const totalSupplyAssets = market.market[0];
          const totalSupplyShares = market.market[1];
          const assets = (supplyShares * totalSupplyAssets) / totalSupplyShares;
          market.weight = totalAssets > 0n ? Number(assets) / Number(totalAssets) : 0;
        });

        if (cancelled) return;

        // Step 5: Batch fetch IRM rates (90% progress)
        setProgress(80);
        const irmCalls: BatchCall[] = [];
        
        activeMarkets.forEach(({ id, params, market }) => {
          irmCalls.push({
            address: params[3], // IRM address
            abi: irmAbi,
            functionName: "borrowRateView",
            args: [
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
            ],
            key: `irm-${id}`,
          });
        });

        const irmResults = await globalContractReader.batchReadContracts(hyperPublicClient, irmCalls);
        
        if (cancelled) return;

        // Step 6: Calculate blended APY (100% progress)
        setProgress(90);
        let blended = 0;
        
        for (const { id, weight, market } of activeMarkets) {
          if (weight === 0) continue;

          try {
            const ratePerSecWad = irmResults[`irm-${id}`] as bigint | null;
            if (!ratePerSecWad) continue;

            const totalSupplyAssets = market[0];
            const totalBorrowAssets = market[2];
            const fee = market[5];

            const supply = totalSupplyAssets;
            const borrow = totalBorrowAssets;
            const utilWad = supply === 0n ? 0n : (borrow * WAD) / supply;

            const oneMinusFee = WAD - fee;
            const supplyRatePerSecWad = (((ratePerSecWad * utilWad) / WAD) * oneMinusFee) / WAD;
            const rSec = Number(supplyRatePerSecWad) / Number(WAD);
            const apyMarket = Math.expm1(rSec * SECONDS_PER_YEAR);

            blended += weight * apyMarket;
          } catch {
            // If market data fails, treat APY as 0
            blended += 0;
          }
        }

        if (!cancelled) {
          setApy(blended);
          setProgress(100);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to compute APY");
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
  }, [vaultAddress]);

  return { 
    apy, 
    loading, 
    error, 
    progress 
  };
}

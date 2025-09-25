// src/hooks/useVaultCurrentApyOptimized.ts
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { useVaultAllocationsOptimized } from "./useVaultAllocationsOptimized";
import { globalContractReader, type BatchCall } from "../lib/contract-batcher";

// Tuple shapes returned by viem for Morpho calls
type MarketParamsTuple = readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint];
type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

// Minimal ABIs we need
const vaultAbi = [
  { type: "function", name: "MORPHO", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
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

export function useVaultCurrentApyOptimized(vaultAddress: Address) {
  const { 
    items, 
    totalAssets, 
    loading: allocLoading, 
    error: allocError,
    progress: allocProgress 
  } = useVaultAllocationsOptimized(vaultAddress);

  const [apy, setApy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const weights = useMemo(() => {
    if (!items || totalAssets === null || totalAssets === 0n) return null;
    return items.map((it) => ({
      id: it.id,
      w: Number(it.assets) / Number(totalAssets),
    }));
  }, [items, totalAssets]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (allocLoading) {
        setProgress(Math.round(allocProgress * 0.5)); // Allocations are 50% of total progress
        return;
      }
      
      if (allocError) {
        setError(allocError);
        setLoading(false);
        return;
      }
      
      if (!weights || !items || totalAssets === null) {
        setError(null);
        setApy(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setProgress(50); // Start at 50% since allocations are done

      try {
        // Get Morpho address
        const morphoAddr = await globalContractReader.readContract(
          hyperPublicClient,
          vaultAddress,
          vaultAbi,
          "MORPHO"
        ) as Address;

        if (cancelled) return;

        // Batch fetch all market data
        const marketIds = weights.map((w) => w.id);
        const marketCalls: BatchCall[] = [];

        marketIds.forEach((id) => {
          marketCalls.push(
            {
              address: morphoAddr,
              abi: morphoAbi,
              functionName: "idToMarketParams",
              args: [id],
              key: `params-${id}`,
            },
            {
              address: morphoAddr,
              abi: morphoAbi,
              functionName: "market",
              args: [id],
              key: `market-${id}`,
            }
          );
        });

        setProgress(60);
        const marketResults = await globalContractReader.batchReadContracts(hyperPublicClient, marketCalls);
        
        if (cancelled) return;

        // Batch fetch IRM rates
        setProgress(70);
        const irmCalls: BatchCall[] = [];
        
        marketIds.forEach((id) => {
          const params = marketResults[`params-${id}`] as MarketParamsTuple | null;
          const market = marketResults[`market-${id}`] as MarketTuple | null;
          
          if (params && market) {
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
          }
        });

        const irmResults = await globalContractReader.batchReadContracts(hyperPublicClient, irmCalls);
        
        if (cancelled) return;

        // Calculate blended APY
        setProgress(80);
        let blended = 0;
        
        for (let i = 0; i < marketIds.length; i++) {
          const id = marketIds[i];
          const w = weights[i]?.w ?? 0;
          
          if (w === 0) {
            blended += 0;
            continue;
          }

          try {
            const params = marketResults[`params-${id}`] as MarketParamsTuple | null;
            const market = marketResults[`market-${id}`] as MarketTuple | null;
            const ratePerSecWad = irmResults[`irm-${id}`] as bigint | null;

            if (!params || !market || !ratePerSecWad) {
              blended += 0;
              continue;
            }

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

            blended += w * apyMarket;
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
  }, [allocLoading, allocError, weights, items, totalAssets, vaultAddress, allocProgress]);

  return { 
    apy, 
    loading, 
    error, 
    progress: Math.max(progress, Math.round(allocProgress * 0.5)) 
  };
}

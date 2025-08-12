import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { hyperPublicClient } from "../viem/clients";
import { useVaultAllocationsOnchain } from "./useVaultAllocationsOnchain";

// Tuple shapes returned by viem for Morpho calls
type MarketParamsTuple = readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint]; // [loanToken, collateralToken, oracle, irm, lltv]
type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint]; // [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee]

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

// IRM interface: borrowRateView(marketParams, marketState) -> uint256 (per-second WAD)
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

export function useVaultCurrentApyOnchain(vaultAddress: Address) {
  const { items, totalAssets, loading: allocLoading, error: allocError } =
    useVaultAllocationsOnchain(vaultAddress);

  const [apy, setApy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weights = useMemo(() => {
    if (!items || totalAssets === null || totalAssets === 0n) return null;
    return items.map((it) => ({
      id: it.id,
      // weight as fraction in JS number
      w: Number(it.assets) / Number(totalAssets),
    }));
  }, [items, totalAssets]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (allocLoading) return;
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

      try {
        // 1) Morpho core address from the vault
        const morphoAddr = (await hyperPublicClient.readContract({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: "MORPHO",
        })) as Address;

        // 2) For each market id: read market params & state, ask IRM for borrow rate,
        // then derive supply rate and APY
        const marketIds = weights.map((w) => w.id);

        let blended = 0; // JS number in decimal (e.g., 0.045 = 4.5%)
        for (let i = 0; i < marketIds.length; i++) {
          const id = marketIds[i];
          const w = weights[i].w;

          const [params, mkt] = (await Promise.all([
            hyperPublicClient.readContract({
              address: morphoAddr,
              abi: morphoAbi,
              functionName: "idToMarketParams",
              args: [id],
            }),
            hyperPublicClient.readContract({
              address: morphoAddr,
              abi: morphoAbi,
              functionName: "market",
              args: [id],
            }),
          ])) as [MarketParamsTuple, MarketTuple];

          // Unpack tuples (Index-based per viem)
          const loanToken = params[0] as Address;
          const collateralToken = params[1] as Address;
          const oracle = params[2] as Address;
          const irm = params[3] as Address;
          const lltv = params[4];

          const totalSupplyAssets = mkt[0];
          const totalSupplyShares = mkt[1];
          const totalBorrowAssets = mkt[2];
          const totalBorrowShares = mkt[3];
          const lastUpdate = mkt[4];
          const fee = mkt[5];

          // 2a) utilization (WAD)
          const supply = totalSupplyAssets;
          const borrow = totalBorrowAssets;
          const utilWad =
            supply === 0n ? 0n : (borrow * WAD) / supply; // in [0, 1e18]

          // 2b) borrow rate per second (WAD) from IRM
          const ratePerSecWad = (await hyperPublicClient.readContract({
            address: irm,
            abi: irmAbi,
            functionName: "borrowRateView",
            args: [
              {
                loanToken,
                collateralToken,
                oracle,
                irm,
                lltv,
              },
              {
                totalSupplyAssets,
                totalSupplyShares,
                totalBorrowAssets,
                totalBorrowShares,
                lastUpdate,
                fee,
              },
            ],
          })) as bigint;

          // 2c) supplyRatePerSecond = borrowRate * utilization * (1 - fee)
          // all in WAD math
          const oneMinusFee = WAD - fee; // fee is WAD
          const supplyRatePerSecWad =
            (((ratePerSecWad * utilWad) / WAD) * oneMinusFee) / WAD;

          // 2d) Convert per-second rate to APY (continuous comp approximation)
          const rSec = Number(supplyRatePerSecWad) / Number(WAD); // decimal per second
          const apyMarket = Math.expm1(rSec * SECONDS_PER_YEAR); // e^(r*t)-1

          // 2e) Blend by vault weight in this market
          blended += w * apyMarket;
        }

        if (!cancelled) {
          setApy(blended); // decimal, e.g., 0.045
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to compute APY");
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [allocLoading, allocError, weights, items, totalAssets, vaultAddress]);

  return { apy, loading, error };
}
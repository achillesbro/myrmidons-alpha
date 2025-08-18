import { formatUnits, erc20Abi } from "viem";
import { useGetVaultDisplayQuery } from "../graphql/__generated__/GetVaultDisplay.query.generated";
import { useGetVaultApyHistoryQuery } from "../graphql/__generated__/GetVaultApyHistory.query.generated";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { hyperPublicClient } from "../viem/clients";
import vaultAbi from "../abis/Vault.json";
import { useVaultCurrentApyOnchain } from "../hooks/useVaultCurrentApyOnchain";
import { useState, useEffect } from "react";
import { useVaultAllocationsOnchain } from "../hooks/useVaultAllocationsOnchain";
// Inline AllocationList component for on-chain allocations

// Simple error boundary to isolate rendering errors in the API View
import React from "react";

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

import { getWhypeUsd } from "../lib/prices"; // keeping current util; tooltips/UX polish below


export function VaultAPIView() {
  // UX: last refresh timestamp for data shown on this page
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, setTimeAgoTick] = useState<number>(0);
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
    return <span className="text-xs text-[#101720]/60">Last updated {parts} ago</span>;
  };
  // If using HyperEVM (chainId 999), fetch vault data on-chain instead of via GraphQL
  const HYPER_CHAIN_ID = 999;
  const VAULT_ADDRESS = "0xDCd35A430895cc8961ea0F5B42348609114a9d0c";
  const [onchainData, setOnchainData] = useState<{
    totalAssets: bigint;
    totalSupply: bigint;
    name: string;
    symbol: string;
    underlyingAddress: `0x${string}`;
    underlyingDecimals: number;
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
          const [assets, supply, name, symbol, asset] = await Promise.all([
            client.readContract({
              address: VAULT_ADDRESS as `0x${string}`,
              abi: vaultAbi,
              functionName: "totalAssets",
            }) as Promise<bigint>,
            client.readContract({
              address: VAULT_ADDRESS as `0x${string}`,
              abi: vaultAbi,
              functionName: "totalSupply",
            }) as Promise<bigint>,
            client.readContract({
              address: VAULT_ADDRESS as `0x${string}`,
              abi: vaultAbi,
              functionName: "name",
            }) as Promise<string>,
            client.readContract({
              address: VAULT_ADDRESS as `0x${string}`,
              abi: vaultAbi,
              functionName: "symbol",
            }) as Promise<string>,
            client.readContract({
              address: VAULT_ADDRESS as `0x${string}`,
              abi: vaultAbi,
              functionName: "asset",
            }) as Promise<`0x${string}`>,
          ]);

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
          });
        } catch (e) {
          setOnchainError(e as Error);
        } finally {
          setOnchainLoading(false);
          setLastUpdated(Date.now());
        }
      })();
    }
  }, [onchainData]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!onchainData?.underlyingAddress) return;
      try {
        setPriceLoading(true);
        const p = await getWhypeUsd({ token: onchainData.underlyingAddress });
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

  const { data, loading, error } = useGetVaultDisplayQuery({
    variables: {
      //@ts-expect-error vaultAddress is a string
      address: VAULT_ADDRESS,
      //@ts-expect-error chainId is a number
      chainId: HYPER_CHAIN_ID,
    },
    skip: true,
    fetchPolicy: "cache-and-network",
  });

  // Prepare vault and timestamps for historical APY query, before any early returns
  const vault = data?.vaultByAddress;
  const creationTs = vault?.creationTimestamp
    ? Number(vault.creationTimestamp)
    : 0;
  const nowTs = Math.floor(Date.now() / 1000);
  const { data: histData, loading: histLoading } = useGetVaultApyHistoryQuery({
    variables: {
      address: vault?.address ?? "",
      chainId: vault?.chain?.id ?? 0,
      startTimestamp: creationTs,
      endTimestamp: nowTs,
      interval: "DAY" as any,
    },
    skip: !vault,
  });

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
        {/* Top: two columns (Info / About) */}
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
        {/* Metrics: 4 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4 animate-pulse">
            <div className="h-3 bg-[#E1E1D6] rounded w-1/3 mb-2"></div>
            <div className="h-6 bg-[#E1E1D6] rounded w-1/2"></div>
            </div>
          ))}
        </div>
        {/* Allocations skeleton */}
        <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6 animate-pulse">
          <div className="h-5 bg-[#E1E1D6] rounded w-1/5 mb-3"></div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-[#E1E1D6] rounded mb-2"></div>
          ))}
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

    return (
      <ErrorBoundary>
        <div className="space-y-6">
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
            <h3 className="text-lg font-semibold mb-2 text-[#00295B]">About</h3>
            <p className="text-[#101720]/80 text-sm">
              This vault allocates liquidity across selected Morpho markets on HyperEVM to capture supply yield while maintaining liquidity and risk constraints.
            </p>
          </div>
        </div>

        {/* Metrics: TVL / Underlying / Yield / Performance Fee */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-[#00295B]">Metrics</div>
          {renderTimeAgo()}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4">
            <p className="text-[#101720]/70 text-xs">TVL (USD)</p>
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
            <p className="text-[#101720]/70 text-xs">Share Price</p>
            <p className="text-xl font-semibold mt-1 text-[#101720]">
              {(() => {
                // Compute share price as (totalAssets / totalSupply) * underlyingPriceUSD
                const totalAssets = onchainData.totalAssets;
                const totalSupply = onchainData.totalSupply;
                const underlyingPriceUSD = usdPrice ?? 0;
                const sharePriceUSD =
                  totalAssets === 0n || totalSupply === 0n
                    ? 0
                    : (Number(totalAssets) / Number(totalSupply)) * underlyingPriceUSD;
                return priceLoading
                  ? "Loading…"
                  : `$${sharePriceUSD.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
              })()}
            </p>
          </div>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4">
            <p className="text-[#101720]/70 text-xs">Yield</p>
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
            <p className="text-[#101720]/60 text-xs mt-1">Blended APY by allocation</p>
          </div>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4">
            <p className="text-[#101720]/70 text-xs">Performance Fee</p>
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
              Recipient: {feeRecipient ? (
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

        {/* Allocations */}
        <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[#00295B]">Allocations</h3>
            <span className="text-xs text-[#101720]/70">Share • USD • Supply APY</span>
          </div>
          <OnchainAllocations
            vaultAddress={VAULT_ADDRESS as `0x${string}`}
            onSettled={(ts) => setLastUpdated(ts)}
          />
        </div>
      </div>
      </ErrorBoundary>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 mb-8">
        {/* Top Row: Basic Vault Info & Metadata */}
        <div className="grid grid-cols-2 gap-6">
          {/* Vault Info Card */}
          <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-700 rounded w-1/4"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
            </div>
          </div>
          {/* Metadata Card */}
          <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-700 rounded w-1/4"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>

        {/* Second Row: Liquidity & Asset Info */}
        <div className="grid grid-cols-2 gap-6">
          {/* Liquidity Card */}
          <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-700 rounded w-1/4"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
            </div>
          </div>
          {/* Asset Info Card */}
          <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-700 rounded w-1/4"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>

        {/* Chain Info & Allocators */}
        <div className="grid grid-cols-2 gap-6">
          {/* Chain Info Card */}
          <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-700 rounded w-1/4"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
            </div>
          </div>
          {/* Allocators Card */}
          <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-700 rounded w-1/4"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-red-700">
        <p className="text-red-400">
          Error loading vault data: {error.message}
        </p>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="bg-[#1E1E1E] rounded-lg p-6 border-[1.5px] border-gray-700">
        <p className="text-gray-400">No vault found at this address</p>
      </div>
    );
  }

  // Safely extract netApy data points
  const netApyPoints = histData?.vaultByAddress.historicalState.netApy ?? [];

  // Filter out any null values, map to the chart format, and sort by date ascending
  const chartData = netApyPoints
    .filter((point): point is { x: number; y: number } => point.y != null)
    .map((point) => ({
      date: new Date(point.x * 1000),
      apy: point.y * 100, // convert decimal to percentage
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Optional: Convert timestamps to human-readable date
  const creationDate = vault.creationTimestamp
    ? new Date(Number(vault.creationTimestamp) * 1000).toLocaleString()
    : "N/A";

  return (
    <div className="space-y-6 mb-8">
      {/* Top Row: Basic Vault Info & Metadata */}
      <div className="grid grid-cols-2 gap-6">
        {/* Vault Info Card */}
        <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
          <h2 className="text-xl font-semibold mb-6 flex items-center text-[#00295B]">
            <span className="mr-2">📋</span> Vault Info
          </h2>
          <div className="space-y-4">
            <div className="bg-[#121212] border border-gray-700 rounded-md p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[#101720]/70 text-sm">Name</p>
                  <p className="font-medium">{vault.name}</p>
                </div>
                <div>
                  <p className="text-[#101720]/70 text-sm">Symbol</p>
                  <p className="font-medium">{vault.symbol}</p>
                </div>
                <div>
                  <p className="text-[#101720]/70 text-sm">Address</p>
                  <p className="font-medium break-all">{vault.address}</p>
                </div>
                <div>
                  <p className="text-[#101720]/70 text-sm">Whitelisted</p>
                  <p className="font-medium">
                    {vault.whitelisted ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-[#101720]/70 text-sm">Creator</p>
                  <p className="font-medium break-all">
                    {vault.creatorAddress}
                  </p>
                </div>
                <div>
                  <p className="text-[#101720]/70 text-sm">Factory</p>
                  <p className="font-medium break-all">
                    {vault.factory?.address}
                  </p>
                </div>
                <div>
                  <p className="text-[#101720]/70 text-sm">Creation Block</p>
                  <p className="font-medium">{vault.creationBlockNumber}</p>
                </div>
                <div>
                  <p className="text-[#101720]/70 text-sm">Creation Timestamp</p>
                  <p className="font-medium">{creationDate}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Card */}
        <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
          <h2 className="text-xl font-semibold mb-6 flex items-center text-[#00295B]">
            <span className="mr-2">ℹ️</span> Metadata
          </h2>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4 space-y-4">
            <div>
              <p className="text-[#101720]/70 text-sm">Description</p>
              <p className="font-medium">{vault.metadata?.description}</p>
            </div>
            <div>
              <p className="text-[#101720]/70 text-sm">Vault Image</p>
              {vault.metadata?.image ? (
                <img
                  src={vault.metadata.image}
                  alt="Vault"
                  className="max-w-[80px] mt-2 rounded"
                />
              ) : (
                <p className="text-[#101720]/60">No image provided</p>
              )}
            </div>
            {vault.metadata?.curators && vault.metadata.curators.length > 0 && (
              <div>
                <p className="text-[#101720]/70 text-sm mb-2">Curators</p>
                <ul className="space-y-2">
                  {vault.metadata.curators.map((curator, idx) => (
                    <li
                      key={idx}
                    className="flex items-center space-x-2 bg-[#FFFFF5] p-2 rounded"
                    >
                      {curator.image && (
                        <img
                          src={curator.image}
                          alt={curator.name}
                          className="w-6 h-6 rounded-full"
                        />
                      )}
                      <span className="font-medium">{curator.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Second Row: Liquidity & Asset Info */}
      <div className="grid grid-cols-2 gap-6">
        {/* Liquidity Card */}
        <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
          <h2 className="text-xl font-semibold mb-6 flex items-center text-[#00295B]">
            <span className="mr-2">💧</span> Liquidity
          </h2>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4 space-y-4">
            <div>
              <p className="text-[#101720]/70 text-sm">Underlying</p>
              <p className="font-medium break-all">
                {vault.liquidity?.underlying}
              </p>
            </div>
            <div>
              <p className="text-[#101720]/70 text-sm">USD</p>
              <p className="font-medium">
                {vault.liquidity?.usd
                  ? `$${vault.liquidity.usd.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}`
                  : "N/A"}
              </p>
            </div>
          </div>

          {/* ALLOCATIONS */}
          {vault.state?.allocation && vault.state.allocation.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4 text-[#00295B]">Allocations</h3>
              <div className="space-y-4">
                {[...vault.state.allocation]
                  .sort(
                    (a, b) =>
                      (b.supplyAssetsUsd ?? 0) - (a.supplyAssetsUsd ?? 0)
                  )
                  .map((allocation, idx) => {
                    const { supplyAssets, supplyAssetsUsd, market } =
                      allocation;
                    const collateralAsset = market.collateralAsset;
                    const decimals = collateralAsset?.decimals ?? 18;

                    return (
                      <div
                        key={idx}
                        className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4"
                      >
                        {/* Market row */}
                        <div className="flex justify-between mb-2">
                          <div>
                            <p className="text-[#101720]/70 text-sm">Collateral</p>
                            <p className="font-medium">
                              {collateralAsset?.symbol ?? "N/A"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[#101720]/70 text-sm">Market Key</p>
                            <p className="font-medium break-all">
                              {market.uniqueKey}
                            </p>
                          </div>
                        </div>

                        {/* Amount & Value row */}
                        <div className="flex justify-between mt-2">
                          <div>
                            <p className="text-[#101720]/70 text-sm">Amount</p>
                            <p className="font-medium">
                              {formatUnits(BigInt(supplyAssets), decimals)}{" "}
                              {vault.asset.symbol}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[#101720]/70 text-sm">Value (USD)</p>
                            <p className="font-medium">
                              {supplyAssetsUsd
                                ? `$${supplyAssetsUsd.toLocaleString(
                                    undefined,
                                    {
                                      maximumFractionDigits: 2,
                                    }
                                  )}`
                                : "N/A"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-[#101720]/60">No allocations found.</div>
          )}
        </div>

        {/* Asset Info Card */}
        <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
          <h2 className="text-xl font-semibold mb-6 flex items-center text-[#00295B]">
            <span className="mr-2">🪙</span> Asset Details
          </h2>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4 space-y-4">
            <div>
              <p className="text-[#101720]/70 text-sm">Name</p>
              <p className="font-medium">{vault.asset.name}</p>
            </div>
            <div>
              <p className="text-[#101720]/70 text-sm">Symbol</p>
              <p className="font-medium">{vault.asset.symbol}</p>
            </div>
            <div>
              <p className="text-[#101720]/70 text-sm">Address</p>
              <p className="font-medium break-all">{vault.asset.address}</p>
            </div>
            <div>
              <p className="text-[#101720]/70 text-sm">Decimals</p>
              <p className="font-medium">{vault.asset.decimals}</p>
            </div>
            <div>
              <p className="text-[#101720]/70 text-sm">Price (USD)</p>
              <p className="font-medium">
                {vault.asset.priceUsd
                  ? `$${vault.asset.priceUsd.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}`
                  : "N/A"}
              </p>
            </div>
            {vault.asset.tags && vault.asset.tags.length > 0 && (
              <div>
                <p className="text-[#101720]/70 text-sm">Tags</p>
                <div className="flex space-x-2 mt-1">
                  {vault.asset.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="bg-[#00295B] text-[#FFFFF5] px-2 py-1 rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
                <p className="text-[#101720]/70 text-sm">Logo</p>
              {vault.asset.logoURI ? (
                <img
                  src={vault.asset.logoURI}
                  alt={vault.asset.symbol}
                  className="w-8 h-8 mt-2 rounded"
                />
              ) : (
                <p className="text-[#101720]/60">No logo URI provided</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Vault Metrics */}
      <div className="grid grid-cols-2 gap-6">
        {/* TVL */}
        <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
          <h3 className="text-lg font-semibold mb-4 text-[#00295B]">TVL</h3>
          <p className="font-medium">
            {vault.liquidity?.usd
              ? `$${vault.liquidity.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : "N/A"}
          </p>
        </div>
        {/* APY Metrics */}
        <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6] space-y-4">
          <h3 className="text-lg font-semibold text-[#00295B]">APY Metrics</h3>
          <p>Current APY: {vault.state?.netApy ? `${(vault.state.netApy * 100).toFixed(2)}%` : "N/A"}</p>
          <p>7-Day APY: {vault.state?.weeklyNetApy ? `${(vault.state.weeklyNetApy * 100).toFixed(2)}%` : "N/A"}</p>
          <p>30-Day APY: {vault.state?.monthlyNetApy ? `${(vault.state.monthlyNetApy * 100).toFixed(2)}%` : "N/A"}</p>
        </div>
      </div>

      {/* About (hardcoded) */}
      <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
        <h2 className="text-xl font-semibold mb-3 text-[#00295B]">About</h2>
        <p className="text-[#101720]/80 text-sm">
          This vault allocates liquidity across selected Morpho markets to capture supply yield while maintaining liquidity and risk constraints.
        </p>
      </div>

      {/* APY History Chart */}
      <h3 className="text-lg font-semibold mt-8 mb-4 text-[#00295B]">APY History (All-Time)</h3>
      {histLoading ? (
        <p>Loading chart…</p>
      ) : (
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <XAxis 
                dataKey="date" 
                tickFormatter={(d) => (d as Date).toLocaleDateString()} 
              />
              <YAxis unit="%" />
              <Tooltip 
                labelFormatter={(label) => (label as Date).toLocaleDateString()} 
                formatter={(value) => `${(value as number).toFixed(2)}%`} 
              />
              <Line 
                type="monotone" 
                dataKey="apy" 
                stroke="#00295B" 
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chain Info & Allocators */}
      <div className="grid grid-cols-2 gap-6">
        {/* Chain Info Card */}
        <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
          <h2 className="text-xl font-semibold mb-6 flex items-center text-[#00295B]">
            <span className="mr-2">⛓</span> Chain
          </h2>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4 space-y-4">
            <div>
              <p className="text-[#101720]/70 text-sm">Chain ID</p>
              <p className="font-medium">{vault.chain?.id}</p>
            </div>
            <div>
              <p className="text-[#101720]/70 text-sm">Network</p>
              <p className="font-medium">{vault.chain?.network}</p>
            </div>
          </div>
        </div>

        {/* Allocators Card */}
        <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6]">
          <h2 className="text-xl font-semibold mb-6 flex items-center text-[#00295B]">
            <span className="mr-2">👷‍♂️</span> Allocators
          </h2>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-4">
            {vault.allocators && vault.allocators.length > 0 ? (
              <ul className="space-y-2">
                {vault.allocators.map((allocator, idx) => (
                  <li key={idx} className="bg-[#FFFFF5] p-2 rounded break-all">
                    {allocator.address}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[#101720]/60">No allocators found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline AllocationList component for on-chain allocations
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
  decimals = 18,
}: {
  items: AllocationRow[];
  totalAssets: bigint;
  hiddenDust?: bigint | null;
  decimals?: number;
}) {
  const clampPct = (n: number) => Math.max(0, Math.min(100, n));
  const pctOf = (v?: bigint | null) =>
    v != null && totalAssets !== 0n
      ? Math.max(0, Math.min(100, Number((v * 10000n) / totalAssets) / 100)).toFixed(2)
      : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 text-xs text-[#101720]/70 pb-2 border-b border-[#E5E2D6]">
        <div className="col-span-5">Market</div>
        <div className="col-span-3 text-right">Share</div>
        <div className="col-span-2 text-right">USD</div>
        <div className="col-span-2 text-right">Supply APY</div>
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
            {clampPct(it.pct).toFixed(2)}%
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
          <div className="col-span-5 font-medium">Other (dust)</div>
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
  const { items, totalAssets, trueIdle, hiddenDust, loading, error } = useVaultAllocationsOnchain(vaultAddress);

  useEffect(() => {
    if (!loading) {
      onSettled?.(Date.now());
    }
  }, [loading, onSettled]);

  if (loading) return <p className="text-sm text-[#101720]/70">Loading allocations…</p>;
  if (error) return <p className="text-sm text-red-500">Error: {error}</p>;
  if (!items || totalAssets === null) return <p className="text-sm text-[#101720]/70">No allocation data.</p>;

  return (
    <AllocationList
      items={items}
      totalAssets={totalAssets}
      hiddenDust={hiddenDust ?? null}
    />
  );
}


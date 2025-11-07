import { useMemo, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import useSWR from "swr";
import { Address } from "viem";
import { formatUnits } from "viem";
import { Download } from "lucide-react";
import { MetricCard, InfoTooltip } from "../components/metric-card";
import { VaultPositionsTable, type VaultPosition } from "../components/portfolio/VaultPositionsTable";
import { PointsPanel } from "../components/portfolio/PointsPanel";
import { AllocationPanel } from "../components/portfolio/AllocationPanel";
import { EmptyState } from "../components/portfolio/EmptyState";
import { LoadingState } from "../components/portfolio/LoadingState";
import {
  getListedVaults,
  getUserSharesBatch,
  getSharePriceUsdBatch,
  getMorphoVaultApy,
  getHypAirdropPoints,
  getUserCostBasis,
  type ListedVault,
} from "../lib/portfolio-data";
import { calculateWeightedApr, formatUsd, formatPct } from "../lib/portfolio-utils";

// SWR fetcher functions
async function fetchPortfolioData(userAddress: Address) {
  const vaults = await getListedVaults();
  
  // Fetch with actual vaults
  const [shares, prices, costBasis] = await Promise.all([
    getUserSharesBatch(userAddress, vaults),
    getSharePriceUsdBatch(vaults),
    getUserCostBasis(userAddress, vaults.map((v) => v.id)),
  ]);

  return { vaults, shares, prices, costBasis };
}

async function fetchApyData(vaults: ListedVault[]) {
  const apyData: Record<string, { apr7d: number; apr30d: number }> = {};

  await Promise.all(
    vaults.map(async (vault) => {
      if (vault.kind === "morpho") {
        const apy = await getMorphoVaultApy(vault.address, vault.config.chainId);
        apyData[vault.id] = apy;
      } else {
        // For Lagoon vaults, we don't have a simple current APY endpoint
        // Set to 0 for now - could be enhanced to fetch from period summaries
        apyData[vault.id] = { apr7d: 0, apr30d: 0 };
      }
    })
  );

  return apyData;
}

async function fetchPointsData(userAddress: Address) {
  return getHypAirdropPoints(userAddress);
}

export function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [sortColumn, setSortColumn] = useState<string>("value");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Fetch portfolio data
  const { data: portfolioData, error: portfolioError, isLoading: portfolioLoading } = useSWR(
    isConnected && address ? ["portfolio", address] : null,
    () => fetchPortfolioData(address!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 30000, // 30 seconds
    }
  );

  // Fetch APY data for Morpho vaults
  const { data: apyData } = useSWR(
    portfolioData?.vaults ? ["apy", portfolioData.vaults] : null,
    () => fetchApyData(portfolioData!.vaults),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    }
  );

  // Fetch points data
  const { data: pointsData } = useSWR(
    isConnected && address ? ["points", address] : null,
    () => fetchPointsData(address!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    }
  );

  // Compute positions
  const positions = useMemo<VaultPosition[]>(() => {
    if (!portfolioData || !apyData) return [];

    const computed: VaultPosition[] = [];

    for (const vault of portfolioData.vaults) {
      const shares = portfolioData.shares[vault.id] || 0n;
      if (shares === 0n) continue; // Skip empty positions

      const sharePriceUsd = portfolioData.prices[vault.id] || 0;
      // Use share decimals (not underlying decimals) to format shares
      const sharesNum = Number(formatUnits(shares, vault.shareDecimals));
      const valueUsd = sharesNum * sharePriceUsd;

      // Get APY data (only for Morpho vaults)
      const apy = vault.kind === "morpho" ? apyData[vault.id] : undefined;
      const apr7d = apy?.apr7d || 0;

      // Get cost basis
      const costBasis = portfolioData.costBasis?.[vault.id];
      const pnlAbs = costBasis != null ? valueUsd - costBasis : null;
      const pnlPct = costBasis != null && costBasis > 0 ? valueUsd / costBasis - 1 : null;

      computed.push({
        vault,
        shares,
        valueUsd,
        sharePriceUsd,
        apr7d,
        weight: 0, // Will be calculated after total
        pnlAbs,
        pnlPct,
        apyData: apy,
      });
    }

    // Calculate weights
    const totalValue = computed.reduce((sum, p) => sum + p.valueUsd, 0);
    computed.forEach((p) => {
      p.weight = totalValue > 0 ? (p.valueUsd / totalValue) * 100 : 0;
    });

    return computed;
  }, [portfolioData, apyData]);

  // Sort positions
  const filteredPositions = useMemo(() => {
    const filtered = [...positions];

    // Sort
    filtered.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortColumn) {
        case "vault":
          aVal = a.vault.name;
          bVal = b.vault.name;
          break;
        case "balance":
          aVal = Number(formatUnits(a.shares, a.vault.shareDecimals));
          bVal = Number(formatUnits(b.shares, b.vault.shareDecimals));
          break;
        case "value":
        default:
          aVal = a.valueUsd;
          bVal = b.valueUsd;
          break;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const aNum = typeof aVal === "number" ? aVal : 0;
      const bNum = typeof bVal === "number" ? bVal : 0;
      return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
    });

    return filtered;
  }, [positions, sortColumn, sortDirection]);

  // Calculate summary metrics
  const summary = useMemo(() => {
    const totalValue = filteredPositions.reduce((sum, p) => sum + p.valueUsd, 0);
    const values = filteredPositions.map((p) => p.valueUsd);
    const aprs = filteredPositions.map((p) => p.apr7d);
    const weightedApr = calculateWeightedApr(values, aprs);

    const totalPnlAbs = filteredPositions.reduce((sum, p) => {
      return sum + (p.pnlAbs ?? 0);
    }, 0);
    const totalCostBasis = filteredPositions.reduce((sum, p) => {
      const basis = portfolioData?.costBasis?.[p.vault.id];
      return sum + (basis ?? 0);
    }, 0);
    const netPnlPct =
      totalCostBasis > 0 ? totalPnlAbs / totalCostBasis : null;

    const totalPoints = pointsData?.total || 0;

    return {
      totalValue,
      netPnlAbs: totalPnlAbs !== 0 || totalCostBasis > 0 ? totalPnlAbs : null,
      netPnlPct,
      avgApr7d: weightedApr,
      totalPoints,
    };
  }, [filteredPositions, portfolioData, pointsData]);

  // Handle sorting
  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  }, [sortColumn]);

  // CSV Export
  const handleExportCsv = useCallback(() => {
    const rows = [
      [
        "timestampUTC",
        "vault",
        "shares",
        "valueUsd",
        "apr7d",
        "apr30d",
        "pnlAbs",
        "pnlPct",
        "pointsTotal",
        "protocolBreakdownJSON",
      ],
    ];

    const timestamp = new Date().toISOString();
    const protocolBreakdown = pointsData?.perProtocol
      ? JSON.stringify(pointsData.perProtocol)
      : "";

    filteredPositions.forEach((pos) => {
      rows.push([
        timestamp,
        pos.vault.id,
        formatUnits(pos.shares, pos.vault.shareDecimals),
        pos.valueUsd.toFixed(2),
        pos.apr7d.toFixed(4),
        pos.apyData?.apr30d.toFixed(4) || "",
        pos.pnlAbs?.toFixed(2) || "",
        pos.pnlPct?.toFixed(4) || "",
        summary.totalPoints.toString(),
        protocolBreakdown,
      ]);
    });

    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredPositions, pointsData, summary]);


  // Render states
  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <EmptyState />
      </div>
    );
  }

  if (portfolioLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <LoadingState />
      </div>
    );
  }

  if (portfolioError) {
    return (
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <div className="rounded-2xl shadow-sm bg-white border border-red-200 p-6">
          <div className="text-red-600 font-semibold mb-2">Error loading portfolio</div>
          <div className="text-sm text-red-700/80 mb-4">
            {portfolioError instanceof Error ? portfolioError.message : "Unknown error"}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
      <div className="space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-3xl font-heading mb-1" style={{ color: 'var(--heading, #00295B)' }}>
            Your Portfolio
          </h1>
          <p className="text-sm" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
            Positions across Myrmidons vaults on HyperEVM
          </p>
        </div>

        {/* KPI Cards using MetricCard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
            <MetricCard
              num={formatUsd(summary.totalValue)}
              sub={
                <span>
                  Total Value
                </span>
              }
            />
          </div>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
            <MetricCard
              num={summary.netPnlAbs != null ? (
                `${formatUsd(summary.netPnlAbs)} ${summary.netPnlPct != null ? `(${formatPct(summary.netPnlPct)})` : ''}`
              ) : "—"}
              sub={
                <span>
                  Net P&L
                  <InfoTooltip label="Based on your cost basis when available." />
                </span>
              }
              deltaType={summary.netPnlPct != null ? (summary.netPnlPct >= 0 ? "positive" : "negative") : "neutral"}
            />
          </div>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
            <MetricCard
              num={formatPct(summary.avgApr7d)}
              sub={
                <span>
                  Avg APR (7D)
                  <InfoTooltip label="Weighted average APR across all positions." />
                </span>
              }
            />
          </div>
          <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-3">
            <MetricCard
              num={summary.totalPoints.toLocaleString()}
              sub="Points"
            />
          </div>
        </div>

        {/* CSV Export */}
        <div className="flex justify-end">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-black/10 rounded-lg hover:border-black/20 transition-colors"
            style={{ color: 'var(--text, #101720)' }}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Vaults Table - Full Width */}
        <VaultPositionsTable
          positions={filteredPositions}
          onSort={handleSort}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
        />

        {/* Points and Allocation - Below table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pointsData && (
            <div>
              <PointsPanel points={pointsData} />
            </div>
          )}
          <div>
            <AllocationPanel positions={filteredPositions} />
          </div>
        </div>

        {/* View on DeBank link */}
        {address && (
          <div className="text-center pt-4">
            <a
              href={`https://debank.com/profile/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
              style={{ color: 'var(--accent, #00295B)' }}
            >
              View on DeBank
            </a>
          </div>
        )}
      </div>
    </div>
  );
}


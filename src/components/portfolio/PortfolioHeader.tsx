import { TrendingUp, Coins, Percent, Download } from "lucide-react";
import { formatUsd, formatPct } from "../../lib/portfolio-utils";
import { InfoTooltip } from "../metric-card";

interface PortfolioHeaderProps {
  totalValue: number;
  netPnlAbs: number | null;
  netPnlPct: number | null;
  avgApr7d: number;
  totalPoints: number;
  onExportCsv: () => void;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
  lastUpdated?: string;
}

const TIME_RANGES = [
  { value: "24H", label: "24H" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
  { value: "YTD", label: "YTD" },
  { value: "ALL", label: "All" },
];

export function PortfolioHeader({
  totalValue,
  netPnlAbs,
  netPnlPct,
  avgApr7d,
  totalPoints,
  onExportCsv,
  timeRange,
  onTimeRangeChange,
  lastUpdated,
}: PortfolioHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-heading mb-1" style={{ color: 'var(--heading, #00295B)' }}>
          Your Portfolio
        </h1>
        <p className="text-sm" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          Positions across Myrmidons vaults on HyperEVM
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Value */}
        <div className="rounded-2xl shadow-sm bg-white border border-black/5 p-6 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
              Total Value
            </div>
            <Coins className="w-4 h-4" style={{ color: 'var(--text, #101720)', opacity: 0.4 }} />
          </div>
          <div className="text-2xl md:text-3xl font-semibold mb-1" style={{ color: 'var(--heading, #00295B)' }} aria-live="polite">
            {formatUsd(totalValue)}
          </div>
          {lastUpdated && (
            <div className="text-[11px] text-right" style={{ color: 'var(--text, #101720)', opacity: 0.5 }}>
              {lastUpdated}
            </div>
          )}
        </div>

        {/* Net P&L */}
        <div className="rounded-2xl shadow-sm bg-white border border-black/5 p-6 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
              Net P&L
              <InfoTooltip label="Based on your cost basis when available." />
            </div>
            <TrendingUp className="w-4 h-4" style={{ color: 'var(--text, #101720)', opacity: 0.4 }} />
          </div>
          <div className="text-2xl md:text-3xl font-semibold mb-1" style={{ color: 'var(--heading, #00295B)' }} aria-live="polite">
            {netPnlAbs != null ? (
              <>
                {formatUsd(netPnlAbs)}
                <span className={`text-sm ml-2 ${netPnlPct != null && netPnlPct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  ({formatPct(netPnlPct)})
                </span>
              </>
            ) : (
              "—"
            )}
          </div>
          {lastUpdated && (
            <div className="text-[11px] text-right" style={{ color: 'var(--text, #101720)', opacity: 0.5 }}>
              {lastUpdated}
            </div>
          )}
        </div>

        {/* Avg APR */}
        <div className="rounded-2xl shadow-sm bg-white border border-black/5 p-6 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
              Avg APR (7D)
              <InfoTooltip label="Weighted average APR across all positions." />
            </div>
            <Percent className="w-4 h-4" style={{ color: 'var(--text, #101720)', opacity: 0.4 }} />
          </div>
          <div className="text-2xl md:text-3xl font-semibold mb-1" style={{ color: 'var(--heading, #00295B)' }} aria-live="polite">
            {formatPct(avgApr7d)}
          </div>
          {lastUpdated && (
            <div className="text-[11px] text-right" style={{ color: 'var(--text, #101720)', opacity: 0.5 }}>
              {lastUpdated}
            </div>
          )}
        </div>

        {/* Points */}
        <div className="rounded-2xl shadow-sm bg-white border border-black/5 p-6 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
              Points
            </div>
            <Coins className="w-4 h-4" style={{ color: 'var(--text, #101720)', opacity: 0.4 }} />
          </div>
          <div className="text-2xl md:text-3xl font-semibold mb-1" style={{ color: 'var(--heading, #00295B)' }} aria-live="polite">
            {totalPoints.toLocaleString()}
          </div>
          {lastUpdated && (
            <div className="text-[11px] text-right" style={{ color: 'var(--text, #101720)', opacity: 0.5 }}>
              {lastUpdated}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Time Range Pills */}
        <div className="flex gap-2">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => onTimeRangeChange(range.value)}
              aria-pressed={timeRange === range.value}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-lg border transition-colors ${
                timeRange === range.value
                  ? 'bg-[var(--text,#101720)] text-[var(--bg,#FFFFF5)] border-[var(--text,#101720)]'
                  : 'bg-white border-black/10 text-[var(--text,#101720)] hover:border-black/20'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* CSV Export */}
        <button
          onClick={onExportCsv}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-black/10 rounded-lg hover:border-black/20 transition-colors"
          style={{ color: 'var(--text, #101720)' }}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>
    </div>
  );
}


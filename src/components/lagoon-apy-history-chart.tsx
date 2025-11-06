import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { Address } from "viem";
import { useLagoonApyHistory, type TimeRange } from "../hooks/useLagoonApyHistory";
import type { VaultConfig } from "../config/vaults.config";

interface LagoonApyHistoryChartProps {
  vaultAddress: Address;
  vaultConfig: VaultConfig;
}

interface ChartDataPoint {
  date: string;
  apy: number;
  avg7?: number;
  timestamp: number;
}

interface ApyTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function ApyTooltip({ active, payload, label }: ApyTooltipProps) {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;
  const apy = payload[0].value;
  const avg7 = data.avg7;

  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg px-3 py-2 shadow-lg">
      <div className="text-sm font-medium text-[#00295B]">
        {formatShortDate(label || '')} — APY {(apy * 100).toFixed(2)}%
        {avg7 && (
          <span className="text-[#101720]/70 ml-2">
            | 7D avg {(avg7 * 100).toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}

// Helper functions
function formatShortDate(dateStr: string | number): string {
  const date = new Date(typeof dateStr === "string" ? dateStr : dateStr * 1000);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function filterRange(data: ChartDataPoint[], range: TimeRange): ChartDataPoint[] {
  if (!data.length) return [];
  
  const now = Date.now();
  const ranges = {
    "7D": 7 * 24 * 60 * 60 * 1000,
    "30D": 30 * 24 * 60 * 60 * 1000,
    "90D": 90 * 24 * 60 * 60 * 1000,
    "1Y": 365 * 24 * 60 * 60 * 1000,
  };
  
  const cutoff = now - ranges[range];
  return data.filter(point => point.timestamp >= cutoff);
}

function decimate(data: ChartDataPoint[], maxPoints = 300): ChartDataPoint[] {
  if (data.length <= maxPoints) return data;
  
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0);
}

function calculateRollingAverage(data: ChartDataPoint[], window = 7): ChartDataPoint[] {
  return data.map((point, index) => {
    const start = Math.max(0, index - window + 1);
    const windowData = data.slice(start, index + 1);
    const avg = windowData.reduce((sum, p) => sum + p.apy, 0) / windowData.length;
    
    return {
      ...point,
      avg7: avg,
    };
  });
}

function calculateStats(data: ChartDataPoint[], days = 30) {
  if (!data.length) return { avg: 0, min: 0, max: 0 };
  
  const recent = data.slice(-days);
  const values = recent.map(d => d.apy);
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  return { avg, min, max };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function LagoonApyHistoryChart({ vaultAddress, vaultConfig }: LagoonApyHistoryChartProps) {
  const { apyData, loading, error, timeRange, setTimeRange } = useLagoonApyHistory(
    vaultAddress,
    vaultConfig,
    "30D"
  );

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!apyData.length) return [];
    
    return apyData.map((point) => ({
      date: new Date(point.x * 1000).toISOString().split('T')[0],
      apy: point.y,
      timestamp: point.x * 1000,
    }));
  }, [apyData]);

  const sliced = useMemo(() => {
    const filtered = filterRange(chartData, timeRange);
    const withAverages = calculateRollingAverage(filtered);
    return decimate(withAverages);
  }, [chartData, timeRange]);

  const yDomain = useMemo(() => {
    if (!sliced.length) return [0, 1];
    const values = sliced.map(d => d.apy);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [Math.min(-0.02, min - 0.005), max + 0.005]; // -2% floor, +0.5pp headroom
  }, [sliced]);

  const stats = useMemo(() => calculateStats(sliced, 30), [sliced]);

  const lastUpdated = useMemo(() => {
    return new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC'
    });
  }, []);

  if (loading) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">APY History</h3>
          <div className="h-8 w-32 bg-[#E1E1D6] rounded-lg animate-pulse"></div>
        </div>
        <div className="w-full h-[400px] bg-[#E1E1D6] rounded animate-pulse"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">APY History</h3>
        </div>
        <div className="text-sm text-red-500 text-center py-8">
          API error. Retry
        </div>
      </div>
    );
  }

  if (sliced.length === 0) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">APY History</h3>
        </div>
        <div className="text-sm text-[#101720]/70 text-center py-8">
          No APY points for selected range.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
      {/* Header with controls */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-[#00295B]">APY History</h3>
          <button
            onClick={() => {
              // Placeholder for CSV export functionality
              const csvData = sliced.map(d => `${d.date},${(d.apy * 100).toFixed(2)}%`).join('\n');
              const blob = new Blob([`Date,APY\n${csvData}`], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `apy-history-${timeRange.toLowerCase()}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="p-1 text-[#101720]/50 hover:text-[#101720] transition-colors"
            title="Export CSV"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-1.5 text-sm border border-[#E5E2D6] rounded-lg bg-[#FFFFF5] text-[#101720] focus:outline-none focus:ring-2 focus:ring-[#8C7D57] focus:border-transparent"
          >
            <option value="7D">7 Days</option>
            <option value="30D">30 Days</option>
            <option value="90D">90 Days</option>
            <option value="1Y">1 Year</option>
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="mb-3">
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart 
            data={sliced} 
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            aria-label="APR history chart"
          >
            <defs>
              <linearGradient id="apyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B5A376" stopOpacity="0.18"/>
                <stop offset="100%" stopColor="#B5A376" stopOpacity="0.04"/>
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={64}
              tickFormatter={formatShortDate}
              style={{ fontSize: "11px", fill: "rgba(20, 23, 38, 0.55)" }}
            />
            <YAxis
              domain={yDomain}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              style={{ fontSize: "11px", fill: "rgba(20, 23, 38, 0.55)" }}
            />
            <CartesianGrid
              vertical={false}
              stroke="rgba(20, 23, 38, 0.15)"
              strokeDasharray="3 3"
            />
            <ReferenceLine
              y={0}
              stroke="rgba(20, 23, 38, 0.25)"
              strokeDasharray="4 4"
            />
            <Tooltip content={<ApyTooltip />} />
            <Area
              type="monotone"
              dataKey="apy"
              stroke="#8C7D57"
              strokeWidth={2}
              fill="url(#apyFill)"
              dot={false}
              activeDot={{ r: 3, fill: "#8C7D57" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer with stats */}
      <div className="text-xs text-[#101720]/60 text-center font-mono">
        Avg(30d): {formatPercent(stats.avg)} · Range(30d): {formatPercent(stats.min)}–{formatPercent(stats.max)} · Updated {lastUpdated} UTC
      </div>
    </div>
  );
}


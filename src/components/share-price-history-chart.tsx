import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { Address } from "viem";
import { useLagoonSharePriceHistory, type TimeRange } from "../hooks/useLagoonSharePriceHistory";

interface SharePriceHistoryChartProps {
  vaultAddress: Address;
  chainId: number;
  underlyingSymbol?: string;
  underlyingAddress?: Address;
}

interface ChartDataPoint {
  date: string;
  price: number;
  timestamp: number;
}

interface SharePriceTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function SharePriceTooltip({ active, payload, label }: SharePriceTooltipProps) {
  if (!active || !payload || !payload[0]) return null;

  const price = payload[0].value;

  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg px-3 py-2 shadow-lg">
      <div className="text-sm font-medium text-[#00295B]">
        {formatShortDate(label || '')} — ${Number(price).toFixed(4)}
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

function calculateStats(data: ChartDataPoint[]) {
  if (!data.length) return { avg: 0, min: 0, max: 0 };
  
  const values = data.map(d => d.price);
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  return { avg, min, max };
}

export function SharePriceHistoryChart({ vaultAddress, chainId, underlyingSymbol, underlyingAddress }: SharePriceHistoryChartProps) {
  const { data, loading, error, timeRange, setTimeRange } = useLagoonSharePriceHistory(
    vaultAddress, 
    chainId, 
    "30D",
    underlyingAddress
  );

  const chartData = useMemo<ChartDataPoint[]>(() => {
    return data;
  }, [data]);

  const sliced = useMemo(() => {
    const filtered = filterRange(chartData, timeRange);
    return decimate(filtered);
  }, [chartData, timeRange]);

  const yDomain = useMemo(() => {
    if (!sliced.length) return [0, 1];
    const values = sliced.map(d => d.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1;
    return [Math.max(0, min - padding), max + padding];
  }, [sliced]);

  const stats = useMemo(() => calculateStats(sliced), [sliced]);

  if (loading) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">Price per Share</h3>
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
          <h3 className="text-lg font-semibold text-[#00295B]">Price per Share</h3>
        </div>
        <div className="text-sm text-red-500 text-center py-8">
          Failed to load price data. Retry
        </div>
      </div>
    );
  }

  if (sliced.length === 0) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">Price per Share</h3>
        </div>
        <div className="text-sm text-[#101720]/70 text-center py-8">
          No price data available for selected range.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
      {/* Header with controls */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-[#00295B]">Price per Share</h3>
        </div>
        
        {/* Time range selector */}
        <div className="flex gap-1" style={{ background: '#E1E1D6', padding: '4px', borderRadius: '8px' }}>
          {(["7D", "30D", "90D", "1Y"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-xs font-medium transition-all rounded ${
                timeRange === range
                  ? 'bg-[#FFFFF5] shadow-sm'
                  : 'text-[#101720]/60 hover:text-[#101720]'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {stats.avg > 0 && (
        <div className="flex gap-4 mb-4 pb-4 border-b" style={{ borderColor: '#E5E2D6' }}>
          <div className="flex-1">
            <div className="text-xs" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>Avg</div>
            <div className="text-sm font-semibold text-[#00295B]">${stats.avg.toFixed(4)}</div>
          </div>
          <div className="flex-1">
            <div className="text-xs" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>Min</div>
            <div className="text-sm font-semibold text-[#00295B]">${stats.min.toFixed(4)}</div>
          </div>
          <div className="flex-1">
            <div className="text-xs" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>Max</div>
            <div className="text-sm font-semibold text-[#00295B]">${stats.max.toFixed(4)}</div>
          </div>
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={sliced} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--muted-brass, #B08D57)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--muted-brass, #B08D57)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E2D6" vertical={false} />
          <XAxis 
            dataKey="date"
            tick={{ fontSize: 10, fill: 'var(--text, #101720)', opacity: 0.6 }}
            tickFormatter={formatShortDate}
            stroke="#E5E2D6"
          />
          <YAxis 
            domain={yDomain}
            tick={{ fontSize: 10, fill: 'var(--text, #101720)', opacity: 0.6 }}
            tickFormatter={(value) => `$${Number(value).toFixed(2)}`}
            stroke="#E5E2D6"
            width={50}
          />
          <Tooltip content={<SharePriceTooltip />} />
          <Area
            type="monotone"
            dataKey="price"
            stroke="var(--muted-brass, #B08D57)"
            strokeWidth={2}
            fill="url(#priceGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}


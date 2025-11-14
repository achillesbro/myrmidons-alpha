import { useMemo } from "react";
import {
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Line,
  ComposedChart,
} from "recharts";
import {
  type LagoonApyHistoryData,
  type SinceInceptionDataPoint,
  type TimeRange,
  type TvlDataPoint,
} from "../hooks/useLagoonApyHistory";

type LagoonChartHistory = LagoonApyHistoryData & {
  tvlData: TvlDataPoint[];
  sinceInceptionData: SinceInceptionDataPoint[];
};

interface LagoonApyHistoryChartProps {
  history: LagoonChartHistory;
}

interface ChartDataPoint {
  date: string;
  value: number;
  timestamp: number;
  sharePrice?: number;
}

interface CombinedTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string | number;
}

function CombinedTooltip({ active, payload, label }: CombinedTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const sinceEntry = payload.find((p) => p.dataKey === "since");
  const tvlEntry = payload.find((p) => p.dataKey === "tvl");

  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg px-3 py-2 shadow-lg space-y-1">
      <div className="text-sm font-medium text-[#00295B]">
        {formatShortDate(label || "")}
      </div>
      {sinceEntry && sinceEntry.value != null && (
        <div className="text-xs text-[#101720] flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-[#8C7D57]"></span>
          <span>Since inception {formatPercent(sinceEntry.value as number)}</span>
        </div>
      )}
      {sinceEntry?.payload?.sharePrice && (
        <div className="text-xs text-[#101720]/70 ml-4">
          Share price {sinceEntry.payload.sharePrice.toFixed(4)} ×
        </div>
      )}
      {tvlEntry && tvlEntry.value != null && (
        <div className="text-xs text-[#101720] flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-[#00295B]"></span>
          <span>TVL {formatUsd(tvlEntry.value as number)}</span>
        </div>
      )}
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
  const ranges: Record<TimeRange, number> = {
    "7D": 7 * 24 * 60 * 60 * 1000,
    "30D": 30 * 24 * 60 * 60 * 1000,
    "90D": 90 * 24 * 60 * 60 * 1000,
    "1Y": 365 * 24 * 60 * 60 * 1000,
  };

  const cutoff = now - ranges[range];
  return data.filter((point: ChartDataPoint) => point.timestamp >= cutoff);
}

function decimate(data: ChartDataPoint[], maxPoints = 400): ChartDataPoint[] {
  if (data.length <= maxPoints) return data;

  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0);
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function LagoonApyHistoryChart({ history }: LagoonApyHistoryChartProps) {
  const {
    loading,
    error,
    timeRange,
    setTimeRange,
    tvlData,
    sinceInceptionData,
  } = history;

  const tvlChartData = useMemo<ChartDataPoint[]>(() => {
    return tvlData.map((point: TvlDataPoint) => ({
      date: new Date(point.x * 1000).toISOString().split("T")[0],
      value: point.y,
      timestamp: point.x * 1000,
    }));
  }, [tvlData]);

  const sinceChartData = useMemo<ChartDataPoint[]>(() => {
    return sinceInceptionData.map((point: SinceInceptionDataPoint) => ({
      date: new Date(point.x * 1000).toISOString().split("T")[0],
      value: point.y,
      timestamp: point.x * 1000,
      sharePrice: point.sharePrice,
    }));
  }, [sinceInceptionData]);

  const filteredTvl = useMemo(
    () => decimate(filterRange(tvlChartData, timeRange)),
    [tvlChartData, timeRange]
  );

  const filteredSince = useMemo(
    () => decimate(filterRange(sinceChartData, timeRange)),
    [sinceChartData, timeRange]
  );

  const combinedData = useMemo(() => {
    const map = new Map<
      number,
      { date: string; timestamp: number; since?: number | null; tvl?: number | null; sharePrice?: number }
    >();

    filteredSince.forEach((point) => {
      map.set(point.timestamp, {
        date: point.date,
        timestamp: point.timestamp,
        since: point.value,
        sharePrice: point.sharePrice,
      });
    });

    filteredTvl.forEach((point) => {
      const existing = map.get(point.timestamp);
      if (existing) {
        existing.tvl = point.value;
      } else {
        map.set(point.timestamp, {
          date: point.date,
          timestamp: point.timestamp,
          tvl: point.value,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [filteredSince, filteredTvl]);

  if (loading) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">
            Performance
          </h3>
          <div className="h-8 w-32 bg-[#E1E1D6] rounded-lg animate-pulse"></div>
        </div>
        <div className="space-y-3">
          <div className="w-full h-32 bg-[#E1E1D6] rounded animate-pulse"></div>
          <div className="w-full h-[260px] bg-[#E1E1D6] rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">
            Performance
          </h3>
        </div>
        <div className="text-sm text-red-500 text-center py-8">
          API error. Retry
        </div>
      </div>
    );
  }

  const noData = combinedData.length === 0;

  if (noData) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">
            Performance
          </h3>
        </div>
        <div className="text-sm text-[#101720]/70 text-center py-8">
          No data for selected range.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#00295B]">Performance</h3>
          <p className="text-xs text-[#101720]/70">
            Tracking both TVL and cumulative yield
          </p>
        </div>
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

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={combinedData}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            aria-label="TVL and since inception performance"
          >
            <defs>
              <linearGradient id="siFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8C7D57" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#8C7D57" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="rgba(20, 23, 38, 0.1)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={64}
              tickFormatter={formatShortDate}
              style={{ fontSize: "11px", fill: "rgba(20, 23, 38, 0.55)" }}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              style={{ fontSize: "11px", fill: "rgba(20, 23, 38, 0.55)" }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={formatUsd}
              style={{ fontSize: "11px", fill: "rgba(20, 23, 38, 0.55)" }}
            />
            <ReferenceLine
              y={0}
              yAxisId="left"
              stroke="rgba(20, 23, 38, 0.3)"
              strokeDasharray="4 4"
            />
            <Tooltip content={<CombinedTooltip />} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="since"
              name="Since inception"
              stroke="#8C7D57"
              strokeWidth={2}
              fill="url(#siFill)"
              dot={false}
              activeDot={{ r: 3, fill: "#8C7D57" }}
              connectNulls
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="tvl"
              name="TVL"
              stroke="#00295B"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: "#00295B" }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


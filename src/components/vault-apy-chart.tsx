import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { Address } from "viem";
import { useVaultApyChartAPI, type TimeRange } from "../hooks/useVaultApyChartAPI";

interface VaultApyChartProps {
  vaultAddress: Address;
  chainId: number;
}

export function VaultApyChart({ vaultAddress, chainId }: VaultApyChartProps) {
  const { netApyData, loading, error, timeRange, setTimeRange } = useVaultApyChartAPI(
    vaultAddress,
    chainId,
    "30D"
  );

  const chartData = useMemo(() => {
    return netApyData.map((point) => ({
      timestamp: point.x,
      apy: point.y,
    }));
  }, [netApyData]);

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts * 1000);
    if (timeRange === "7D") {
      return date.toLocaleDateString("en-GB", { month: "short", day: "numeric", hour: "2-digit" });
    } else if (timeRange === "30D" || timeRange === "90D") {
      return date.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
    } else {
      return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    }
  };

  const formatApy = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">APY History</h3>
          <div className="flex gap-2">
            {(["7D", "30D", "90D", "1Y"] as TimeRange[]).map((range) => (
              <div key={range} className="h-8 w-12 bg-[#E1E1D6] rounded animate-pulse"></div>
            ))}
          </div>
        </div>
        <div className="w-full h-[300px] bg-[#E1E1D6] rounded animate-pulse"></div>
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
          Failed to load APY history: {error}
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#00295B]">APY History</h3>
        </div>
        <div className="text-sm text-[#101720]/70 text-center py-8">No historical data available</div>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-5">
      {/* Header with time range selector */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
        <h3 className="text-lg font-semibold text-[#00295B]">APY History</h3>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E5E2D6] bg-[#FFFFF5] text-[#101720] hover:border-[#B08D57] focus:border-[#B08D57] focus:outline-none focus:ring-1 focus:ring-[#B08D57] transition-all duration-200 cursor-pointer"
        >
          <option value="7D">Last 7 Days</option>
          <option value="30D">Last 30 Days</option>
          <option value="90D">Last 90 Days</option>
          <option value="1Y">Last Year</option>
        </select>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E2D6" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTimestamp}
            stroke="#101720"
            style={{ fontSize: "12px", fill: "#101720" }}
            tick={{ fill: "#101720" }}
            interval="preserveStartEnd"
            minTickGap={30}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tickFormatter={formatApy}
            stroke="#101720"
            style={{ fontSize: "12px", fill: "#101720" }}
            tick={{ fill: "#101720" }}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFF5",
              border: "1px solid #E5E2D6",
              borderRadius: "8px",
              padding: "8px 12px",
            }}
            labelStyle={{ color: "#00295B", fontWeight: 600, marginBottom: "4px" }}
            itemStyle={{ color: "#101720" }}
            formatter={(value: number) => [formatApy(value), "Net APY"]}
            labelFormatter={(ts: number) =>
              new Date(ts * 1000).toLocaleDateString("en-GB", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            }
          />
          <Line
            type="monotone"
            dataKey="apy"
            stroke="#B08D57"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#B08D57" }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Footer note */}
      <div className="mt-3 text-xs text-center" style={{ color: "var(--text, #101720)", opacity: 0.6 }}>
        Net APY after fees · Data from Morpho API
      </div>
    </div>
  );
}


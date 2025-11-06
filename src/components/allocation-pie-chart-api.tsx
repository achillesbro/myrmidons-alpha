import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { GroupedAllocation, AllocationItem } from "../lib/allocation-grouper";

interface AllocationPieChartAPIProps {
  groupedAllocations: GroupedAllocation[];
  ungroupedAllocations?: AllocationItem[];
  loading?: boolean;
}

const COLORS = [
  "#B08D57", // Muted brass (primary)
  "#00295B", // Deep blue (heading)
  "#8B7355", // Brown tone
  "#5A7C8F", // Slate blue
  "#A67C52", // Warm brown
  "#4A6B7C", // Steel blue
  "#9B7E54", // Tan
  "#3D5A6B", // Dark slate
];

export function AllocationPieChartAPI({ 
  groupedAllocations, 
  ungroupedAllocations = [],
  loading = false 
}: AllocationPieChartAPIProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <div className="animate-pulse">
          <div className="w-32 h-32 bg-[#E1E1D6] rounded-full mx-auto mb-4"></div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-[#E1E1D6] rounded-full"></div>
                <div className="h-4 bg-[#E1E1D6] rounded w-20"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Combine grouped and ungrouped items for the chart
  const chartData: Array<{
    name: string;
    value: number;
    usd: number | null;
    marketCount: number;
  }> = [];

  // Add grouped allocations
  groupedAllocations.forEach((group) => {
    chartData.push({
      name: group.familyLabel,
      value: group.percentage,
      usd: group.totalUsd,
      marketCount: group.marketCount,
    });
  });

  // Add ungrouped allocations as individual items
  ungroupedAllocations.forEach((item) => {
    chartData.push({
      name: item.label,
      value: item.pct,
      usd: item.usd,
      marketCount: 1,
    });
  });

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <p className="text-sm text-[#101720]/70">No allocations to display</p>
      </div>
    );
  }

  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
    if (percent < 0.05) return null; // Don't show labels for slices < 5%

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        style={{ fontSize: "12px", fontWeight: 600 }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFF5",
              border: "1px solid #E5E2D6",
              borderRadius: "8px",
              padding: "8px 12px",
            }}
            formatter={(value: number, name: string, props: any) => [
              props.payload.usd != null
                ? `$${props.payload.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${value.toFixed(2)}%)`
                : `${value.toFixed(2)}%`,
              `${name} (${props.payload.marketCount} market${props.payload.marketCount !== 1 ? 's' : ''})`,
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            wrapperStyle={{
              fontSize: "11px",
              paddingTop: "10px",
            }}
            formatter={(value: string) => {
              // Truncate long labels
              return value.length > 20 ? `${value.slice(0, 20)}...` : value;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}


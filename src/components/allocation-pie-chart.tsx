// src/components/allocation-pie-chart.tsx
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useMemo, memo } from 'react';
import { type GroupedAllocation } from '../lib/allocation-grouper';

interface AllocationPieChartProps {
  groupedItems: GroupedAllocation[];
  totalAssets: bigint;
}

// Color palette for the pie chart segments - specific colors for each family
const FAMILY_COLORS: Record<string, string> = {
  'HYPE': '#062722',
  'BTC': '#f6921a', 
  'Stables': '#00b988',
  'ETH': '#627eeb',
  'thBILL': '#85999d',
};

// Fallback colors for any unexpected families
const FALLBACK_COLORS = [
  '#00295B', // Dark blue
  '#4A90E2', // Light blue
  '#F5A623', // Orange
  '#7ED321', // Green
  '#BD10E0', // Purple
];

const AllocationPieChart = memo(function AllocationPieChart({ groupedItems, totalAssets }: AllocationPieChartProps) {
  // Transform grouped items into chart data with memoization to prevent infinite re-renders
  const chartData = useMemo(() => {
    return groupedItems
      .map((group, index) => ({
        name: group.familyLabel,
        value: Number((group.totalAssets * 10000n) / totalAssets) / 100, // Convert to percentage
        color: FAMILY_COLORS[group.familyLabel] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
        usdValue: group.totalUsd,
        apy: group.weightedApy * 100,
      }))
      .sort((a, b) => b.value - a.value); // Sort by percentage (descending)
  }, [groupedItems, totalAssets]);

  // Custom tooltip component - memoized to prevent re-renders
  const CustomTooltip = useMemo(() => ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="font-semibold text-[#00295B]">{data.name}</p>
          <p className="text-sm text-gray-600">
            Allocation: <span className="font-medium">{data.value.toFixed(2)}%</span>
          </p>
          {data.usdValue && (
            <p className="text-sm text-gray-600">
              USD Value: <span className="font-medium">${data.usdValue.toLocaleString()}</span>
            </p>
          )}
          <p className="text-sm text-gray-600">
            APY: <span className="font-medium">{data.apy.toFixed(2)}%</span>
          </p>
        </div>
      );
    }
    return null;
  }, []);

  // Custom legend component - memoized to prevent re-renders
  const CustomLegend = useMemo(() => ({ payload }: any) => {
    return (
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center space-x-2 text-sm">
            <div 
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-[#101720] font-medium">{entry.value}</span>
            <span className="text-gray-500">
              ({entry.payload.value.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    );
  }, []);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p className="text-sm">No allocation data available</p>
      </div>
    );
  }

  return (
    <div className="h-80 flex flex-col items-center justify-center">
      <div className="w-64 h-64 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              key={`pie-${chartData.length}`}
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={CustomTooltip} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <CustomLegend payload={chartData.map((entry) => ({ value: entry.name, color: entry.color, payload: entry }))} />
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  if (prevProps.totalAssets !== nextProps.totalAssets) return false;
  if (prevProps.groupedItems.length !== nextProps.groupedItems.length) return false;
  
  return prevProps.groupedItems.every((item, index) => {
    const nextItem = nextProps.groupedItems[index];
    return (
      item.familyLabel === nextItem.familyLabel &&
      item.totalAssets === nextItem.totalAssets &&
      item.totalUsd === nextItem.totalUsd &&
      item.weightedApy === nextItem.weightedApy
    );
  });
});

export { AllocationPieChart };

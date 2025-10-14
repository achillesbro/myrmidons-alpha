import { useMemo, useState } from "react";
import type { Address } from "viem";
import { useGetVaultApyChartQuery } from "../graphql/__generated__/GetVaultApyChart.query.generated";
import { TimeseriesInterval } from "@morpho-org/blue-api-sdk";

export type TimeRange = "7D" | "30D" | "90D" | "1Y";

export interface ApyDataPoint {
  x: number; // Unix timestamp
  y: number; // APY as decimal (e.g., 0.045 for 4.5%)
}

export interface VaultApyChartData {
  apyData: ApyDataPoint[];
  netApyData: ApyDataPoint[];
  loading: boolean;
  error: string | null;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
}

function getTimeRangeConfig(range: TimeRange) {
  const now = Math.floor(Date.now() / 1000);
  const ranges = {
    "7D": { days: 7, interval: TimeseriesInterval.Hour },
    "30D": { days: 30, interval: TimeseriesInterval.Day },
    "90D": { days: 90, interval: TimeseriesInterval.Day },
    "1Y": { days: 365, interval: TimeseriesInterval.Week },
  };
  const config = ranges[range];
  return {
    startTimestamp: now - config.days * 86400,
    endTimestamp: now,
    interval: config.interval,
  };
}

export function useVaultApyChartAPI(
  vaultAddress: Address,
  chainId: number,
  initialRange: TimeRange = "30D"
): VaultApyChartData {
  const [timeRange, setTimeRange] = useState<TimeRange>(initialRange);

  const { startTimestamp, endTimestamp, interval } = useMemo(
    () => getTimeRangeConfig(timeRange),
    [timeRange]
  );

  const { data, loading, error } = useGetVaultApyChartQuery({
    variables: {
      address: vaultAddress,
      chainId,
      startTimestamp,
      endTimestamp,
      interval,
    },
    // Only fetch when time range changes
  });

  const apyData = useMemo<ApyDataPoint[]>(() => {
    if (!data?.vaultByAddress?.historicalState?.apy) return [];
    return data.vaultByAddress.historicalState.apy
      .filter((point) => point.y !== null)
      .map((point) => ({
        x: point.x,
        y: point.y as number,
      }));
  }, [data]);

  const netApyData = useMemo<ApyDataPoint[]>(() => {
    if (!data?.vaultByAddress?.historicalState?.netApy) return [];
    return data.vaultByAddress.historicalState.netApy
      .filter((point) => point.y !== null)
      .map((point) => ({
        x: point.x,
        y: point.y as number,
      }))
      .sort((a, b) => a.x - b.x); // Sort by timestamp ascending (earliest first)
  }, [data]);

  return {
    apyData,
    netApyData,
    loading,
    error: error?.message ?? null,
    timeRange,
    setTimeRange,
  };
}


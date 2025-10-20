import { useMemo } from "react";
import type { Address } from "viem";
import { useGetVaultApyChartQuery } from "../graphql/__generated__/GetVaultApyChart.query.generated";
import { TimeseriesInterval } from "@morpho-org/blue-api-sdk";
import type { TimeRange } from "./useVaultApyChartAPI";

// Benchmark vault addresses by underlying token
const BENCHMARK_ADDRESSES: Record<string, Address[]> = {
  // USDT0 benchmarks
  USDT0: [
    "0xe5ADd96840F0B908ddeB3Bd144C0283Ac5ca7cA0", // Hyperithm USDT0 Vault
    "0x3Bcc0a5a66bB5BdCEEf5dd8a659a4eC75F3834d8", // MEV Capital USDT0
    "0x53A333e51E96FE288bC9aDd7cdC4B1EAD2CD2FfA", // Gauntlet USDT0 Vault
    "0x51F64488d03D8B210294dA2BF70D5db0Bc621B0c", // Re7 USDT0
  ],
  // WHYPE benchmarks
  WHYPE: [
    "0x182b318A8F1c7C92a7884e469442a610B0e69ed2", // Re7 WHYPE
    "0x92B518e1cD76dD70D3E20624AEdd7D107F332Cff", // Hyperithm WHYPE
    "0xd19e3d00f8547f7d108abFD4bbb015486437B487", // MEV WHYPE
    "0x264a06Fd7A7C9E0Bfe75163b475E2A3cc1856578", // Gauntlet WHYPE
  ],
};

export interface BenchmarkDataPoint {
  x: number; // Unix timestamp
  y: number; // Average APY as decimal
}

export interface VaultBenchmarkData {
  benchmarkData: BenchmarkDataPoint[];
  loading: boolean;
  error: string | null;
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

export function useVaultBenchmarkAPI(
  chainId: number,
  timeRange: TimeRange,
  underlyingSymbol: string = 'USDT0'
): VaultBenchmarkData {
  const { startTimestamp, endTimestamp, interval } = useMemo(
    () => getTimeRangeConfig(timeRange),
    [timeRange]
  );

  // Get benchmark addresses for the underlying symbol
  const benchmarkAddresses = BENCHMARK_ADDRESSES[underlyingSymbol] || BENCHMARK_ADDRESSES.USDT0;

  // Fetch data from all 4 benchmark vaults
  const vault1 = useGetVaultApyChartQuery({
    variables: {
      address: benchmarkAddresses[0],
      chainId,
      startTimestamp,
      endTimestamp,
      interval,
    },
    skip: false,
  });

  const vault2 = useGetVaultApyChartQuery({
    variables: {
      address: benchmarkAddresses[1],
      chainId,
      startTimestamp,
      endTimestamp,
      interval,
    },
    skip: false,
  });

  const vault3 = useGetVaultApyChartQuery({
    variables: {
      address: benchmarkAddresses[2],
      chainId,
      startTimestamp,
      endTimestamp,
      interval,
    },
    skip: false,
  });

  const vault4 = useGetVaultApyChartQuery({
    variables: {
      address: benchmarkAddresses[3],
      chainId,
      startTimestamp,
      endTimestamp,
      interval,
    },
    skip: false,
  });

  const loading = vault1.loading || vault2.loading || vault3.loading || vault4.loading;
  const error = vault1.error?.message || vault2.error?.message || vault3.error?.message || vault4.error?.message || null;

  const benchmarkData = useMemo<BenchmarkDataPoint[]>(() => {
    if (loading || error) return [];

    // Extract netApy data from all vaults
    const vault1Data = vault1.data?.vaultByAddress?.historicalState?.netApy || [];
    const vault2Data = vault2.data?.vaultByAddress?.historicalState?.netApy || [];
    const vault3Data = vault3.data?.vaultByAddress?.historicalState?.netApy || [];
    const vault4Data = vault4.data?.vaultByAddress?.historicalState?.netApy || [];

    // Create a map to store timestamps and their corresponding APY values
    const timestampMap = new Map<number, number[]>();

    // Process each vault's data
    [vault1Data, vault2Data, vault3Data, vault4Data].forEach(vaultData => {
      vaultData.forEach(point => {
        if (point.y !== null) {
          const timestamp = point.x;
          if (!timestampMap.has(timestamp)) {
            timestampMap.set(timestamp, []);
          }
          timestampMap.get(timestamp)!.push(point.y as number);
        }
      });
    });

    // Calculate average APY for each timestamp
    const result: BenchmarkDataPoint[] = [];
    timestampMap.forEach((apyValues, timestamp) => {
      if (apyValues.length > 0) {
        const averageApy = apyValues.reduce((sum, apy) => sum + apy, 0) / apyValues.length;
        result.push({
          x: timestamp,
          y: averageApy,
        });
      }
    });

    // Sort by timestamp ascending
    return result.sort((a, b) => a.x - b.x);
  }, [vault1.data, vault2.data, vault3.data, vault4.data, loading, error]);

  return {
    benchmarkData,
    loading,
    error,
  };
}


import { useMemo } from "react";
import { useVaultApyChartAPI } from "./useVaultApyChartAPI";
import type { Address } from "viem";

export interface MetricsData {
  // Share price sparkline (30D)
  sharePriceSparkline: Array<{ value: number }>;
  
  // APY sparkline (7D)
  apySparkline: Array<{ value: number }>;
  
  // 30D APY range
  apy30dMin: number | null;
  apy30dMax: number | null;
  
  // 7D average APY
  apy7dAvg: number | null;
  
  // Since inception return
  sinceInceptionReturn: number | null;
  
  // Last updated timestamp
  lastUpdated: string;
}

export function useMetricsData(
  vaultAddress: Address,
  chainId: number,
  sharePriceUsd: number | null
): MetricsData {
  // Fetch 30D APY data for range calculation and share price sparkline
  const { netApyData: apy30dData } = useVaultApyChartAPI(vaultAddress, chainId, "30D");
  
  // Fetch 7D APY data for sparkline and average
  const { netApyData: apy7dData } = useVaultApyChartAPI(vaultAddress, chainId, "7D");
  
  const metrics = useMemo(() => {
    // Share price sparkline (30D) - using APY as proxy since we don't have historical share price
    // In a real implementation, you'd fetch actual share price history
    const sharePriceSparkline = apy30dData.slice(-30).map(() => ({
      value: sharePriceUsd || 1,
    }));
    
    // APY sparkline (7D)
    const apySparkline = apy7dData.map((point) => ({
      value: point.y,
    }));
    
    // 30D APY range
    const apy30dValues = apy30dData.map(d => d.y);
    const apy30dMin = apy30dValues.length > 0 ? Math.min(...apy30dValues) : null;
    const apy30dMax = apy30dValues.length > 0 ? Math.max(...apy30dValues) : null;
    
    // 7D average APY
    const apy7dValues = apy7dData.map(d => d.y);
    const apy7dAvg = apy7dValues.length > 0
      ? apy7dValues.reduce((sum, val) => sum + val, 0) / apy7dValues.length
      : null;
    
    // Since inception return (share price - 1) * 100
    const sinceInceptionReturn = sharePriceUsd !== null
      ? (sharePriceUsd - 1) * 100
      : null;
    
    // Last updated timestamp
    const lastUpdated = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC'
    });
    
    return {
      sharePriceSparkline,
      apySparkline,
      apy30dMin,
      apy30dMax,
      apy7dAvg,
      sinceInceptionReturn,
      lastUpdated,
    };
  }, [apy30dData, apy7dData, sharePriceUsd]);
  
  return metrics;
}



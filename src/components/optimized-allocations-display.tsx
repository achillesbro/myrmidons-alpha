// src/components/optimized-allocations-display.tsx
import React from 'react';
import { useVaultAllocationsOptimized } from '../hooks/useVaultAllocationsOptimized';
import { useVaultCurrentApyOptimized } from '../hooks/useVaultCurrentApyOptimized';
import type { Address } from 'viem';

interface OptimizedAllocationsDisplayProps {
  vaultAddress: Address;
}

export function OptimizedAllocationsDisplay({ vaultAddress }: OptimizedAllocationsDisplayProps) {
  const {
    loading: allocLoading,
    error: allocError,
    totalAssets,
    items,
    trueIdle,
    hiddenDust,
    progress: allocProgress,
  } = useVaultAllocationsOptimized(vaultAddress);

  const {
    apy,
    loading: apyLoading,
    error: apyError,
    progress: apyProgress,
  } = useVaultCurrentApyOptimized(vaultAddress);

  const overallProgress = Math.round((allocProgress + apyProgress) / 2);

  if (allocLoading || apyLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Loading Vault Data</h3>
            <span className="text-sm text-gray-500">{overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-gray-600">
            {allocLoading && <div>Loading allocations... {allocProgress}%</div>}
            {apyLoading && <div>Calculating APY... {apyProgress}%</div>}
          </div>
        </div>
      </div>
    );
  }

  if (allocError || apyError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h3>
        {allocError && <p className="text-red-600">Allocations: {allocError}</p>}
        {apyError && <p className="text-red-600">APY: {apyError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* APY Display */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-2">Current APY</h3>
        <div className="text-2xl font-bold text-green-600">
          {apy !== null ? `${(apy * 100).toFixed(2)}%` : 'N/A'}
        </div>
      </div>

      {/* Total Assets */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-2">Total Assets</h3>
        <div className="text-xl font-semibold">
          {totalAssets !== null ? totalAssets.toString() : 'N/A'}
        </div>
      </div>

      {/* Allocations */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-4">Allocations</h3>
        {items && items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div className="flex items-center space-x-2">
                  {item.logo && (
                    <img src={item.logo} alt={item.label} className="w-6 h-6 rounded-full" />
                  )}
                  <span className="font-medium">{item.label}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">
                    {item.pct.toFixed(2)}% • {item.supplyApy ? `${(item.supplyApy * 100).toFixed(2)}% APY` : 'N/A APY'}
                  </div>
                  {item.usd && (
                    <div className="text-sm font-medium">
                      ${item.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No allocations found</p>
        )}
      </div>

      {/* Idle and Dust */}
      {(trueIdle !== null || hiddenDust !== null) && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-lg font-semibold mb-2">Additional Info</h3>
          <div className="space-y-1 text-sm">
            {trueIdle !== null && (
              <div>True Idle: {trueIdle.toString()}</div>
            )}
            {hiddenDust !== null && (
              <div>Hidden Dust: {hiddenDust.toString()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

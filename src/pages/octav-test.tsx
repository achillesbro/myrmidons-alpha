// src/pages/octav-test.tsx
// Test page for debugging Octav API integration

import { useState } from 'react';
import { useOctavAllocations } from '../hooks/useOctavAllocations';

export function OctavTestPage() {
  const [vaultId, setVaultId] = useState('hypairdrop');
  const { allocations, loading, error } = useOctavAllocations(vaultId);

  const handleRefresh = () => {
    // Force re-fetch by changing key (hacky but works)
    setVaultId(vaultId);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#FFFFF5] p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-[#00295B] mb-6">Octav API Test Page</h1>
        
        <div className="bg-white border border-[#E5E2D6] rounded-lg p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-[#00295B] mb-2">
              Vault ID:
            </label>
            <input
              type="text"
              value={vaultId}
              onChange={(e) => setVaultId(e.target.value)}
              className="px-4 py-2 border border-[#E5E2D6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00295B]"
              placeholder="e.g., hypairdrop"
            />
          </div>
          
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-[#00295B] text-white rounded-lg hover:bg-[#001d42] transition-colors"
          >
            Refresh
          </button>
        </div>

        <div className="bg-white border border-[#E5E2D6] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-[#00295B] mb-4">Status</h2>
          <div className="space-y-2">
            <div>
              <span className="font-medium">Loading:</span>{' '}
              <span className={loading ? 'text-yellow-600' : 'text-green-600'}>
                {loading ? 'Yes' : 'No'}
              </span>
            </div>
            <div>
              <span className="font-medium">Error:</span>{' '}
              <span className={error ? 'text-red-600' : 'text-green-600'}>
                {error || 'None'}
              </span>
            </div>
            <div>
              <span className="font-medium">Allocations Count:</span>{' '}
              <span className="text-[#00295B]">{allocations.length}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-red-800 mb-2">Error Details</h3>
            <pre className="text-sm text-red-700 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        <div className="bg-white border border-[#E5E2D6] rounded-lg p-6">
          <h2 className="text-xl font-semibold text-[#00295B] mb-4">
            Allocations ({allocations.length})
          </h2>
          
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading allocations...</div>
          ) : allocations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No allocations found. Check console for details.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E2D6]">
                    <th className="text-left p-2 font-semibold text-[#00295B]">Label</th>
                    <th className="text-right p-2 font-semibold text-[#00295B]">Assets</th>
                    <th className="text-right p-2 font-semibold text-[#00295B]">USD Value</th>
                    <th className="text-right p-2 font-semibold text-[#00295B]">Percentage</th>
                    <th className="text-left p-2 font-semibold text-[#00295B]">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((alloc, index) => (
                    <tr key={index} className="border-b border-[#E5E2D6] hover:bg-gray-50">
                      <td className="p-2">{alloc.label}</td>
                      <td className="p-2 text-right font-mono text-sm">
                        {alloc.assets.toString()}
                      </td>
                      <td className="p-2 text-right">
                        {alloc.usd != null ? `$${alloc.usd.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="p-2 text-right">{alloc.pct.toFixed(2)}%</td>
                      <td className="p-2 font-mono text-xs text-gray-600">{alloc.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-gray-50 border border-[#E5E2D6] rounded-lg p-6 mt-6">
          <h2 className="text-xl font-semibold text-[#00295B] mb-4">Raw Data (JSON)</h2>
          <pre className="text-xs overflow-auto max-h-96 bg-white p-4 rounded border">
            {JSON.stringify({ allocations, loading, error }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}


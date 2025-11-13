import { useState, useEffect } from "react";
import type { AllocationItem } from "../lib/allocation-grouper";

export interface OctavAllocationsData {
  allocations: AllocationItem[];
  loading: boolean;
  error: string | null;
  timestamp: number | null;
}

/**
 * Hook to fetch cached Octav allocations from the API route
 * @param vaultId - The vault ID (e.g., 'hypairdrop')
 */
export function useOctavAllocations(vaultId: string): OctavAllocationsData {
  const [allocations, setAllocations] = useState<AllocationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAllocations() {
      try {
        setLoading(true);
        setError(null);

        console.log(`[useOctavAllocations] Fetching allocations for vault: ${vaultId}`);

        // Fetch from cached API endpoint (using query parameter)
        // Add cache-busting timestamp to ensure fresh data
        const response = await fetch(`/api/allocations?vaultId=${encodeURIComponent(vaultId)}&_t=${Date.now()}`, {
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store', // Prevent browser caching
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `API error: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        
        if (cancelled) return;

        console.log(
          `[useOctavAllocations] Received ${data.allocations?.length || 0} allocations for vault ${vaultId}`,
          data.cached ? `(cached, age: ${data.cacheAge ? (data.cacheAge / 1000 / 60).toFixed(1) : 'unknown'} min)` : '(not cached)'
        );

        // The API route returns allocations with assets as strings (BigInt serialized)
        // Convert back to BigInt for frontend use
        const allocations = Array.isArray(data.allocations) 
          ? data.allocations.map((alloc: any) => ({
              ...alloc,
              assets: typeof alloc.assets === 'string' ? BigInt(alloc.assets) : alloc.assets,
            }))
          : [];
        setAllocations(allocations);
        setTimestamp(data.timestamp || null);
        
        if (data.error && !data.cached) {
          // Set error but still show empty allocations
          setError(data.error);
        }
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch allocations";
        console.error(`[useOctavAllocations] Error fetching allocations for ${vaultId}:`, errorMessage);
        setError(errorMessage);
        setAllocations([]); // Set empty array on error
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (vaultId) {
      fetchAllocations();
    } else {
      setLoading(false);
      setError('Vault ID not provided');
    }

    return () => {
      cancelled = true;
    };
  }, [vaultId]);

  return {
    allocations,
    loading,
    error,
    timestamp,
  };
}

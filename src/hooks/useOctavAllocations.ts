import { useState, useEffect } from "react";
import type { Address } from "viem";
import type { AllocationItem } from "../lib/allocation-grouper";

export interface OctavAllocationsData {
  allocations: AllocationItem[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

export function useOctavAllocations(vaultAddress: Address): OctavAllocationsData {
  const [allocations, setAllocations] = useState<AllocationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAllocations() {
      try {
        setLoading(true);
        setError(null);

        // Fetch from cached API endpoint instead of direct Octav API
        const response = await fetch(
          `/api/allocations/${vaultAddress}`,
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as {
          allocations: AllocationItem[];
          lastUpdated: number;
          cached: boolean;
        };
        
        if (cancelled) return;

        // The API already returns parsed AllocationItem[] format
        setAllocations(data.allocations || []);
        setLastUpdated(data.lastUpdated || null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch allocations");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAllocations();

    return () => {
      cancelled = true;
    };
  }, [vaultAddress]);

  return {
    allocations,
    loading,
    error,
    lastUpdated,
  };
}


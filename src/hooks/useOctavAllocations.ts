import { useState, useEffect } from "react";
import type { Address } from "viem";
import type { AllocationItem } from "../lib/allocation-grouper";

export interface OctavAllocationsData {
  allocations: AllocationItem[];
  loading: boolean;
  error: string | null;
}

export function useOctavAllocations(vaultAddress: Address): OctavAllocationsData {
  const [allocations, setAllocations] = useState<AllocationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAllocations() {
      try {
        setLoading(true);
        setError(null);

        // Get API key from environment
        const apiKey = import.meta.env.VITE_OCTAV_API_KEY;
        if (!apiKey) {
          throw new Error("Octav API key not configured");
        }

        // Fetch portfolio data from Octav
        const response = await fetch(
          `https://api.octav.fi/v1/portfolio?addresses=${vaultAddress}&includeImages=true`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Octav API error: ${response.status} ${response.statusText}`);
        }

        await response.json();
        
        if (cancelled) return;

        // Parse Octav response and convert to AllocationItem format
        // TODO: Map Octav portfolio data to allocation items
        // For now, return empty array
        setAllocations([]);
      } catch (err) {
        if (cancelled) return;
        // Ignore errors for now since user mentioned API will throw errors without credits
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
  };
}


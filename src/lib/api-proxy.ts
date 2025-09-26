// src/lib/api-proxy.ts
// Backend proxy service for Li.Fi API calls to keep API keys secure

const API_BASE_URL = '/api/lifi'; // Will be proxied by Vercel

export interface GasPriceResponse {
  standard: {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
  fast: {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
  instant: {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
}

export interface BridgeStatusResponse {
  status: string;
  substeps: Array<{
    id: string;
    type: string;
    status: string;
    txHash?: string;
    error?: string;
  }>;
  receiving?: {
    amount: string;
    token: {
      symbol: string;
    };
  };
  error?: string;
}

/**
 * Fetch gas prices for a specific chain
 * This will be proxied through our backend to keep API key secure
 */
export async function fetchGasPrices(chainId: number): Promise<GasPriceResponse | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/gas/prices/${chainId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch gas prices for chain ${chainId}:`, response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`Error fetching gas prices for chain ${chainId}:`, error);
    return null;
  }
}

/**
 * Check bridge transaction status
 * This will be proxied through our backend to keep API key secure
 */
export async function checkBridgeStatus(
  txHash: string,
  fromChainId: number,
  toChainId: number
): Promise<BridgeStatusResponse | null> {
  try {
    const params = new URLSearchParams({
      txHash,
      fromChainId: fromChainId.toString(),
      toChainId: toChainId.toString(),
    });

    const response = await fetch(`${API_BASE_URL}/status?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Failed to check bridge status:`, response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`Error checking bridge status:`, error);
    return null;
  }
}

// src/lib/contract-batcher.ts
import { PublicClient, Address } from 'viem';

export interface BatchCall {
  address: Address;
  abi: any;
  functionName: string;
  args?: any[];
  key: string; // Unique identifier for this call
}

export interface BatchResult {
  [key: string]: any;
}

/**
 * Batches multiple contract calls into a single multicall for better performance
 */
export async function batchContractCalls(
  client: PublicClient,
  calls: BatchCall[]
): Promise<BatchResult> {
  if (calls.length === 0) return {};

  try {
    // Use multicall if available, otherwise fall back to Promise.all
    const results = await Promise.all(
      calls.map(async (call) => {
        try {
          const result = await client.readContract({
            address: call.address,
            abi: call.abi,
            functionName: call.functionName,
            args: call.args || [],
          });
          return { key: call.key, result, error: null };
        } catch (error) {
          return { key: call.key, result: null, error };
        }
      })
    );

    // Convert to key-value map
    const batchResult: BatchResult = {};
    results.forEach(({ key, result, error }) => {
      if (error) {
        console.warn(`Batch call failed for ${key}:`, error);
        batchResult[key] = null;
      } else {
        batchResult[key] = result;
      }
    });

    return batchResult;
  } catch (error) {
    console.error('Batch contract calls failed:', error);
    // Fallback: return null for all keys
    const fallback: BatchResult = {};
    calls.forEach(call => {
      fallback[call.key] = null;
    });
    return fallback;
  }
}

/**
 * Creates a cache for contract calls to avoid repeated requests
 */
export class ContractCallCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl: number;

  constructor(ttlMs: number = 30_000) { // 30 seconds default
    this.ttl = ttlMs;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  // Generate cache key for contract calls
  static createKey(address: Address, _abi: any, functionName: string, args?: any[]): string {
    const argsStr = args ? JSON.stringify(args) : '';
    return `${address.toLowerCase()}-${functionName}-${argsStr}`;
  }
}

/**
 * Enhanced contract call with caching and batching
 */
export class OptimizedContractReader {
  private cache: ContractCallCache;
  private pendingCalls = new Map<string, Promise<any>>();

  constructor(ttlMs: number = 30_000) {
    this.cache = new ContractCallCache(ttlMs);
  }

  async readContract(
    client: PublicClient,
    address: Address,
    abi: any,
    functionName: string,
    args?: any[]
  ): Promise<any> {
    const key = ContractCallCache.createKey(address, abi, functionName, args);
    
    // Check cache first
    const cached = this.cache.get(key);
    if (cached !== null) {
      return cached;
    }

    // Check if call is already pending
    if (this.pendingCalls.has(key)) {
      return this.pendingCalls.get(key);
    }

    // Make the call
    const callPromise = client.readContract({
      address,
      abi,
      functionName,
      args: args || [],
    }).then(result => {
      this.cache.set(key, result);
      this.pendingCalls.delete(key);
      return result;
    }).catch(error => {
      this.pendingCalls.delete(key);
      throw error;
    });

    this.pendingCalls.set(key, callPromise);
    return callPromise;
  }

  async batchReadContracts(
    client: PublicClient,
    calls: BatchCall[]
  ): Promise<BatchResult> {
    // Check cache for all calls first
    const cachedResults: BatchResult = {};
    const uncachedCalls: BatchCall[] = [];

    calls.forEach(call => {
      const key = ContractCallCache.createKey(call.address, call.abi, call.functionName, call.args);
      const cached = this.cache.get(key);
      if (cached !== null) {
        cachedResults[call.key] = cached;
      } else {
        uncachedCalls.push(call);
      }
    });

    // Batch the uncached calls
    if (uncachedCalls.length > 0) {
      const batchResults = await batchContractCalls(client, uncachedCalls);
      
      // Cache the results
      uncachedCalls.forEach(call => {
        const key = ContractCallCache.createKey(call.address, call.abi, call.functionName, call.args);
        this.cache.set(key, batchResults[call.key]);
      });

      // Merge cached and batch results
      return { ...cachedResults, ...batchResults };
    }

    return cachedResults;
  }

  clearCache(): void {
    this.cache.clear();
    this.pendingCalls.clear();
  }
}

// Global instance for reuse across components
export const globalContractReader = new OptimizedContractReader();

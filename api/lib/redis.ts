// api/lib/redis.ts
// Redis connection utilities for caching Octav portfolio data

import { Redis } from '@upstash/redis';

// Initialize Redis client using environment variables
// Redis.fromEnv() automatically looks for:
// - UPSTASH_REDIS_REST_URL or KV_REST_API_URL
// - UPSTASH_REDIS_REST_TOKEN or KV_REST_API_TOKEN
let redisClient: Redis | null = null;
let redisInitError: Error | null = null;

function createRedisClient(): Redis {
  // Log available env vars for debugging (without exposing secrets)
  const hasKVRestUrl = !!process.env.KV_REST_API_URL;
  const hasKVRestToken = !!process.env.KV_REST_API_TOKEN;
  const hasUpstashRestUrl = !!process.env.UPSTASH_REDIS_REST_URL;
  const hasUpstashRestToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
  
  console.log('[Redis] Checking environment variables:', {
    hasKVRestUrl,
    hasKVRestToken,
    hasUpstashRestUrl,
    hasUpstashRestToken,
  });

  try {
    // Use fromEnv() which automatically reads from environment variables
    // It looks for KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN
    const client = Redis.fromEnv();
    console.log('[Redis] Successfully initialized client using Redis.fromEnv()');
    return client;
  } catch (error: any) {
    const errorMsg = `Redis configuration missing. Available env vars: KV_REST_API_URL=${hasKVRestUrl}, KV_REST_API_TOKEN=${hasKVRestToken}, UPSTASH_REDIS_REST_URL=${hasUpstashRestUrl}, UPSTASH_REDIS_REST_TOKEN=${hasUpstashRestToken}. Please set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel environment variables. Error: ${error?.message || String(error)}`;
    console.error('[Redis]', errorMsg);
    throw new Error(errorMsg);
  }
}

export function getRedisClient(): Redis {
  if (redisInitError) {
    throw redisInitError;
  }
  if (!redisClient) {
    try {
      redisClient = createRedisClient();
    } catch (error: any) {
      redisInitError = error;
      throw error;
    }
  }
  return redisClient;
}

// Cache key format
export function getCacheKey(vaultId: string, curatorAddress: string): string {
  return `octav:allocations:${vaultId}:${curatorAddress.toLowerCase()}`;
}

// Cache entry structure
export interface CachedAllocationData {
  allocations: any[]; // AllocationItem[] after transformation
  timestamp: number;
}

// Get cached data
export async function getCachedAllocations(
  vaultId: string,
  curatorAddress: string
): Promise<CachedAllocationData | null> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey(vaultId, curatorAddress);
    console.log(`[Redis] Fetching cache with key: ${key}`);
    const cached = await redis.get<CachedAllocationData>(key);
    
    if (cached) {
      const cacheAge = Date.now() - cached.timestamp;
      console.log(`[Redis] Cache hit for vault ${vaultId} (curator: ${curatorAddress}), key: ${key}, age: ${(cacheAge / 1000 / 60).toFixed(1)} minutes, timestamp: ${cached.timestamp} (${new Date(cached.timestamp).toISOString()})`);
      
      // Deserialize BigInt values from strings
      const deserializedAllocations = deserializeAllocations(cached.allocations);
      
      return {
        ...cached,
        allocations: deserializedAllocations,
      };
    }
    
    console.log(`[Redis] Cache miss for vault ${vaultId} (curator: ${curatorAddress}), key: ${key}`);
    return null;
  } catch (error) {
    console.error('[Redis] Error fetching from cache:', error);
    return null;
  }
}

// Helper to serialize BigInt values to strings for JSON storage
function serializeAllocations(allocations: any[]): any[] {
  return allocations.map((alloc) => ({
    ...alloc,
    assets: typeof alloc.assets === 'bigint' ? alloc.assets.toString() : alloc.assets,
  }));
}

// Helper to deserialize string values back to BigInt
function deserializeAllocations(allocations: any[]): any[] {
  return allocations.map((alloc) => ({
    ...alloc,
    assets: typeof alloc.assets === 'string' ? BigInt(alloc.assets) : alloc.assets,
  }));
}

// Set cached data with TTL (default: 1 year = 31,536,000 seconds)
// Using long TTL so stale data is still available rather than showing nothing
export async function setCachedAllocations(
  vaultId: string,
  curatorAddress: string,
  allocations: any[],
  ttlSeconds: number = 31_536_000 // 1 year (effectively permanent, but still has TTL)
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey(vaultId, curatorAddress);
    
    // Serialize BigInt values to strings for JSON storage
    const serializedAllocations = serializeAllocations(allocations);
    
    const timestamp = Date.now();
    const data: CachedAllocationData = {
      allocations: serializedAllocations,
      timestamp,
    };
    
    // setex overwrites existing key - this ensures fresh data replaces old cache
    console.log(`[Redis] Setting cache with key: ${key}`);
    await redis.setex(key, ttlSeconds, data);
    console.log(
      `[Redis] ✅ Cached allocations for vault ${vaultId} (curator: ${curatorAddress}), key: ${key}, TTL: ${ttlSeconds}s, timestamp: ${timestamp} (${new Date(timestamp).toISOString()})`
    );
  } catch (error) {
    console.error('[Redis] Error setting cache:', error);
    throw error;
  }
}


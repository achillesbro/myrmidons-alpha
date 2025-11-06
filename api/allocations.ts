// api/allocations.ts
// Vercel serverless function to serve cached Octav portfolio allocations
// Note: For local development, use `vercel dev` to run serverless functions
// Or the API routes will be served as static files by Vite

import { getCachedAllocations } from './lib/redis.js';

// Vault ID to curator address mapping
const VAULT_CURATOR_MAP: Record<string, `0x${string}`> = {
  hypairdrop: '0x8Ec77176F71F5ff53B71b01FC492F46Ea4e55A77',
  // Add more vaults here as needed
};

// Node.js runtime handler
// Using standard Node.js request/response format
// Vercel will automatically use Node.js runtime for serverless functions
export default async function handler(
  request: any,
  response: any
) {
  // Wrap everything in try-catch to catch any errors including module loading issues
  try {
    // Set CORS headers if needed
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET');
    
    // Only allow GET requests
    if (request.method !== 'GET') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

  // Extract vaultId from query parameter
  // URL format: /api/allocations?vaultId=hypairdrop
  const vaultId = typeof request.query.vaultId === 'string'
    ? request.query.vaultId
    : Array.isArray(request.query.vaultId)
      ? request.query.vaultId[0]
      : null;

  console.log(`[API] GET /api/allocations?vaultId=${vaultId || 'unknown'}`);

  // Validate vault ID
  if (!vaultId || typeof vaultId !== 'string') {
    console.error('[API] Invalid vault ID:', vaultId);
    return response.status(400).json({ error: 'Invalid vault ID. Use ?vaultId=hypairdrop' });
  }

  // Get curator address for this vault
  const curatorAddress = VAULT_CURATOR_MAP[vaultId.toLowerCase()];
  if (!curatorAddress) {
    console.error(`[API] No curator address configured for vault: ${vaultId}`);
    return response.status(404).json({ error: `Vault ${vaultId} not configured` });
  }

  console.log(`[API] Fetching cached allocations for vault ${vaultId} (curator: ${curatorAddress})`);

  try {
    // Log environment check (without exposing secrets)
    console.log('[API] Environment check:', {
      hasRedisUrl: !!(process.env.REDIS_URL || process.env.KV_URL),
      hasRestUrl: !!process.env.KV_REST_API_URL,
      hasRestToken: !!process.env.KV_REST_API_TOKEN,
      nodeEnv: process.env.NODE_ENV,
    });

    // Try to get cached data from Redis
    // If Redis fails, we'll return an empty result with an error message
    let cached;
    try {
      cached = await getCachedAllocations(vaultId, curatorAddress);
    } catch (redisError: any) {
      console.error('[API] Redis connection failed:', redisError?.message || redisError);
      // Return error response but don't crash
      return response.status(500).json({
        error: 'Redis connection failed',
        errorDetails: redisError?.message || 'Failed to connect to Redis cache',
        allocations: [],
        cached: false,
      });
    }

    if (!cached) {
      console.warn(`[API] No cached data found for vault ${vaultId}`);
      return response.json({
        allocations: [],
        cached: false,
        timestamp: null,
        error: 'No cached data available. Please wait for the next scheduled update.',
      });
    }

    // Check cache age
    const cacheAge = Date.now() - cached.timestamp;
    const cacheAgeHours = cacheAge / (1000 * 60 * 60);
    const isStale = cacheAgeHours > 24;

    console.log(
      `[API] Returning cached data (age: ${cacheAgeHours.toFixed(2)} hours, stale: ${isStale})`
    );

    // Serialize BigInt values to strings for JSON response
    // (Redis deserializes them back to BigInt, but JSON.stringify can't handle BigInt)
    const serializedAllocations = cached.allocations.map((alloc: any) => ({
      ...alloc,
      assets: typeof alloc.assets === 'bigint' ? alloc.assets.toString() : alloc.assets,
    }));

    return response.json({
      allocations: serializedAllocations,
      cached: true,
      timestamp: cached.timestamp,
      cacheAge: cacheAge,
      stale: isStale,
    });
  } catch (error: any) {
    console.error(`[API] Error fetching cached allocations:`, error);
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack;
    
    // Include detailed error in response for debugging
    return response.status(500).json({
      error: 'Failed to fetch cached allocations',
      errorDetails: errorMessage,
      allocations: [],
      cached: false,
      ...(process.env.NODE_ENV === 'development' && errorStack ? { stack: errorStack } : {}),
    });
  }
  } catch (topLevelError: any) {
    // Catch any errors that happen during module loading or handler setup
    console.error('[API] Top-level error in handler:', topLevelError);
    return response.status(500).json({
      error: 'Internal server error',
      errorDetails: topLevelError?.message || String(topLevelError),
      allocations: [],
      cached: false,
    });
  }
}

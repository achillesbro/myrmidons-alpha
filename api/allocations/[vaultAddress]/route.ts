import { Redis } from '@upstash/redis';
import type { AllocationItem } from '../../../src/lib/allocation-grouper';

export const runtime = 'edge';

// Initialize Upstash Redis client
// Supports both UPSTASH_REDIS_* and KV_REST_API_* naming conventions
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

// Mapping from vault address to curator address (for Octav API calls)
// Only HypAirdrop uses a curator address different from vault address
const VAULT_TO_CURATOR_MAP: Record<string, string> = {
  '0x66894de1ca1e08aaffbe70809512d57d725e30fd': '0x8Ec77176F71F5ff53B71b01FC492F46Ea4e55A77', // HypAirdrop
};

interface CachedAllocationsResponse {
  allocations: AllocationItem[];
  lastUpdated: number;
  cached: boolean;
}

export async function GET(request: Request) {
  try {
    // Extract vault address from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const vaultAddress = pathParts[pathParts.length - 1].toLowerCase();
    
    if (!vaultAddress || vaultAddress === '[vaultAddress]') {
      return Response.json(
        { error: 'Invalid vault address' },
        { status: 400 }
      );
    }
    
    // Determine curator address for cache lookup
    // Cron job stores data using curator address as key (0x8Ec77176F71F5ff53B71b01FC492F46Ea4e55A77)
    // Accept either vault address (will be mapped) or curator address (used directly)
    let curatorAddress: string;
    if (vaultAddress === '0x8ec77176f71f5ff53b71b01fc492f46ea4e55a77') {
      // Direct curator address provided
      curatorAddress = vaultAddress;
    } else {
      // Map vault address to curator address
      curatorAddress = VAULT_TO_CURATOR_MAP[vaultAddress]?.toLowerCase() || vaultAddress;
    }
    
    const cacheKey = `octav:allocations:${curatorAddress}`;
    const metaKey = `octav:allocations:${curatorAddress}:meta`;

    // Try to get cached data
    const cachedData = await redis.get<AllocationItem[]>(cacheKey);
    const meta = await redis.get<{ lastUpdated: number }>(metaKey);

    if (cachedData && meta) {
      return Response.json({
        allocations: cachedData,
        lastUpdated: meta.lastUpdated,
        cached: true,
      } as CachedAllocationsResponse);
    }

    // If no cache exists, return empty array
    // Never trigger Octav API from client route
    return Response.json({
      allocations: [],
      lastUpdated: 0,
      cached: false,
    } as CachedAllocationsResponse);
  } catch (error) {
    console.error('Error fetching cached allocations:', error);
    return Response.json(
      {
        allocations: [],
        lastUpdated: 0,
        cached: false,
        error: 'Failed to fetch cached allocations',
      },
      { status: 500 }
    );
  }
}


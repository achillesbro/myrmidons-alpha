// api/cron/update-allocations-manual.ts
// Manual trigger endpoint for testing - call this to update the cache immediately
// DELETE THIS FILE BEFORE PRODUCTION or protect with authentication

import { fetchOctavPortfolio } from '../lib/octav.js';
import { setCachedAllocations } from '../lib/redis.js';
import { transformOctavPortfolioToAllocations } from '../lib/transform.js';

// Vault ID to curator address mapping
const VAULT_CURATOR_MAP: Record<string, `0x${string}`> = {
  hypairdrop: '0x8Ec77176F71F5ff53B71b01FC492F46Ea4e55A77',
  // Add more vaults here as needed
};

export default async function handler(request: any, response: any) {
  // Only allow GET requests for manual trigger
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: Add a simple secret check for local dev
  // In production, you should remove this endpoint or add proper auth
  const secret = request.query?.secret;
  const expectedSecret = process.env.MANUAL_UPDATE_SECRET || 'dev-secret-local-only';
  
  if (secret !== expectedSecret) {
    return response.status(401).json({ 
      error: 'Unauthorized',
      hint: 'Add ?secret=dev-secret-local-only to the URL for local testing'
    });
  }

  console.log('[Manual Update] Starting manual Octav allocations update...');
  console.log('[Manual Update] Environment check:', {
    hasOctavKey: !!process.env.OCTAV_API_KEY || !!process.env.VITE_OCTAV_API_KEY,
    hasRedisUrl: !!(process.env.REDIS_URL || process.env.KV_URL),
    hasRestUrl: !!process.env.KV_REST_API_URL,
    hasRestToken: !!process.env.KV_REST_API_TOKEN,
  });

  const results: { vaultId: string; status: string; error?: string; count?: number }[] = [];

  for (const vaultId in VAULT_CURATOR_MAP) {
    const curatorAddress = VAULT_CURATOR_MAP[vaultId];
    console.log(`[Manual Update] Processing vault: ${vaultId} (curator: ${curatorAddress})`);

    try {
      const octavData = await fetchOctavPortfolio(curatorAddress as `0x${string}`);
      if (!octavData || octavData.length === 0) {
        throw new Error('Failed to fetch data from Octav API or empty response.');
      }

      // Log raw portfolio data for debugging
      console.log(`[Manual Update] Raw portfolio data:`, JSON.stringify(octavData[0], null, 2).substring(0, 1000));

      const allocations = transformOctavPortfolioToAllocations(octavData);
      await setCachedAllocations(vaultId, curatorAddress as `0x${string}`, allocations);
      results.push({ vaultId, status: 'success', count: allocations.length });
      console.log(`[Manual Update] Successfully updated allocations for ${vaultId}. Count: ${allocations.length}`);
    } catch (error: any) {
      console.error(`[Manual Update] Failed to update allocations for ${vaultId}:`, error);
      results.push({ vaultId, status: 'failed', error: error.message || String(error) });
    }
  }

  console.log('[Manual Update] Octav allocations update finished.');
  return response.status(200).json({ 
    message: 'Manual update complete', 
    results,
    timestamp: Date.now()
  });
}

// api/cron/update-allocations.ts
// Vercel serverless function for daily cron job to update Octav allocations cache

import { fetchOctavPortfolio } from '../lib/octav.js';
import { setCachedAllocations } from '../lib/redis.js';
import { transformOctavPortfolioToAllocations } from '../lib/transform.js';

// Vault ID to curator address mapping for cron jobs
const VAULT_CURATOR_MAP: Record<string, `0x${string}`> = {
  hypairdrop: '0x8Ec77176F71F5ff53B71b01FC492F46Ea4e55A77',
  // Add more vaults here as needed
};

export default async function handler(request: any, response: any) {
  // Wrap in try-catch for error handling
  try {
    // Set CORS headers if needed
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET');
    
    // Only allow GET requests (Vercel cron jobs typically trigger GET)
    if (request.method !== 'GET') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    // Protect this endpoint with Vercel cron secret
    // Vercel automatically adds x-vercel-cron header for cron jobs in production
    // In preview/dev, this header won't exist, so we allow manual triggers
    const cronSecret = request.headers?.['x-vercel-cron'] || request.headers?.get?.('x-vercel-cron');
    const expectedSecret = process.env.CRON_SECRET;
    const isVercelCron = !!cronSecret; // True if triggered by Vercel (production only)
    const isManualTrigger = !isVercelCron; // True if manually triggered (preview/dev)
    
    // Log for debugging (but don't expose the actual secret)
    console.log('[Cron] Request received:', {
      method: request.method,
      isVercelCron,
      isManualTrigger,
      hasExpectedSecret: !!expectedSecret,
      timestamp: new Date().toISOString(),
    });
    
    // Only require CRON_SECRET if it's set AND it's a manual trigger (not from Vercel)
    // This allows manual testing in preview/dev while protecting in production
    if (expectedSecret && isManualTrigger) {
      // Allow manual trigger with secret query param for testing
      const providedSecret = typeof request.query?.secret === 'string'
        ? request.query.secret
        : Array.isArray(request.query?.secret)
          ? request.query.secret[0]
          : null;
      if (providedSecret !== expectedSecret) {
        console.warn('[Cron] Unauthorized manual access attempt. Use ?secret=YOUR_SECRET for manual triggers.');
        return response.status(401).json({ 
          error: 'Unauthorized',
          hint: 'For manual triggers, use ?secret=YOUR_CRON_SECRET'
        });
      }
    }

    const startTime = Date.now();
    console.log('[Cron] ========================================');
    console.log('[Cron] Starting daily Octav allocations update...');
    console.log('[Cron] Triggered at:', new Date().toISOString());
    console.log('[Cron] Environment check:', {
      hasOctavKey: !!(process.env.OCTAV_API_KEY || process.env.VITE_OCTAV_API_KEY),
      hasRedisUrl: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
      hasRedisToken: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
    });

    const results: { vaultId: string; status: string; error?: string; count?: number; timestamp?: number }[] = [];

    for (const vaultId in VAULT_CURATOR_MAP) {
      const curatorAddress = VAULT_CURATOR_MAP[vaultId];
      console.log(`[Cron] Processing vault: ${vaultId} (curator: ${curatorAddress})`);

      try {
        console.log(`[Cron] Step 1: Fetching Octav portfolio for ${curatorAddress}...`);
        const octavData = await fetchOctavPortfolio(curatorAddress as `0x${string}`);
        if (!octavData || octavData.length === 0) {
          throw new Error('Failed to fetch data from Octav API or empty response.');
        }
        console.log(`[Cron] Step 1: Success - fetched ${octavData.length} portfolio(s)`);

        console.log(`[Cron] Step 2: Transforming to allocations...`);
        const allocations = transformOctavPortfolioToAllocations(octavData);
        console.log(`[Cron] Step 2: Success - transformed to ${allocations.length} allocations`);

        console.log(`[Cron] Step 3: Updating Redis cache...`);
        const beforeCache = Date.now();
        await setCachedAllocations(vaultId, curatorAddress as `0x${string}`, allocations);
        const afterCache = Date.now();
        console.log(`[Cron] Step 3: Success - cache updated in ${afterCache - beforeCache}ms`);
        
        // Verify the cache was updated by reading it back
        console.log(`[Cron] Step 4: Verifying cache update...`);
        const { getCachedAllocations } = await import('../lib/redis.js');
        const verifyCache = await getCachedAllocations(vaultId, curatorAddress as `0x${string}`);
        if (verifyCache) {
          const cacheAge = Date.now() - verifyCache.timestamp;
          console.log(`[Cron] Step 4: Verified - cache timestamp: ${verifyCache.timestamp} (${new Date(verifyCache.timestamp).toISOString()}), age: ${(cacheAge / 1000).toFixed(1)}s`);
        } else {
          console.warn(`[Cron] Step 4: WARNING - Could not verify cache update!`);
        }

        results.push({ 
          vaultId, 
          status: 'success',
          count: allocations.length,
          timestamp: Date.now()
        });
        console.log(`[Cron] ✅ Successfully updated allocations for ${vaultId}. Count: ${allocations.length}`);
      } catch (error: any) {
        console.error(`[Cron] ❌ Failed to update allocations for ${vaultId}:`, error);
        console.error(`[Cron] Error stack:`, error.stack);
        results.push({ 
          vaultId, 
          status: 'failed', 
          error: error.message || String(error),
          timestamp: Date.now()
        });
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log('[Cron] ========================================');
    console.log(`[Cron] Octav allocations update finished in ${duration}ms`);
    console.log('[Cron] Results:', JSON.stringify(results, null, 2));
    
    return response.status(200).json({ 
      message: 'Octav allocations update complete', 
      results,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Cron] Top-level error:', error);
    return response.status(500).json({
      error: 'Internal server error',
      errorDetails: error?.message || String(error),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}


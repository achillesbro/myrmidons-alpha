// src/lib/price-optimizer.ts
import { getUsdPrice } from './prices';

export interface PriceCacheEntry {
  price: number | null;
  timestamp: number;
  pending?: Promise<number | null>;
}

export class PriceOptimizer {
  private cache = new Map<string, PriceCacheEntry>();
  private pendingRequests = new Map<string, Promise<number | null>>();
  private ttl: number;

  constructor(ttlMs: number = 30_000) { // 30 seconds default
    this.ttl = ttlMs;
  }

  /**
   * Get price with intelligent caching and parallel request deduplication
   */
  async getPrice(token: `0x${string}`, coingeckoId?: string): Promise<number | null> {
    const key = `${token.toLowerCase()}|${coingeckoId || ''}`;
    const now = Date.now();

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && now - cached.timestamp < this.ttl) {
      return cached.price;
    }

    // Check if request is already pending
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!;
    }

    // Make new request
    const requestPromise = this.fetchPrice(token, coingeckoId);
    this.pendingRequests.set(key, requestPromise);

    try {
      const price = await requestPromise;
      this.cache.set(key, { price, timestamp: now });
      return price;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Batch fetch multiple prices in parallel
   */
  async getBatchPrices(
    requests: Array<{ token: `0x${string}`; coingeckoId?: string }>
  ): Promise<Map<string, number | null>> {
    const results = new Map<string, number | null>();
    
    // Group requests by cache status
    const cachedResults: Array<{ key: string; price: number | null }> = [];
    const uncachedRequests: Array<{ key: string; token: `0x${string}`; coingeckoId?: string }> = [];

    requests.forEach(({ token, coingeckoId }) => {
      const key = `${token.toLowerCase()}|${coingeckoId || ''}`;
      const cached = this.cache.get(key);
      
      if (cached && Date.now() - cached.timestamp < this.ttl) {
        cachedResults.push({ key, price: cached.price });
      } else {
        uncachedRequests.push({ key, token, coingeckoId });
      }
    });

    // Add cached results
    cachedResults.forEach(({ key, price }) => {
      results.set(key, price);
    });

    // Fetch uncached prices in parallel
    if (uncachedRequests.length > 0) {
      const promises = uncachedRequests.map(async ({ key, token, coingeckoId }) => {
        const price = await this.getPrice(token, coingeckoId);
        return { key, price };
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ key, price }) => {
        results.set(key, price);
      });
    }

    return results;
  }

  private async fetchPrice(token: `0x${string}`, coingeckoId?: string): Promise<number | null> {
    try {
      return await getUsdPrice({ token, coingeckoId });
    } catch (error) {
      return null;
    }
  }

  /**
   * Preload prices for common tokens
   */
  async preloadCommonPrices(tokens: Array<{ token: `0x${string}`; coingeckoId?: string }>): Promise<void> {
    const uncachedTokens = tokens.filter(({ token, coingeckoId }) => {
      const key = `${token.toLowerCase()}|${coingeckoId || ''}`;
      const cached = this.cache.get(key);
      return !cached || Date.now() - cached.timestamp >= this.ttl;
    });

    if (uncachedTokens.length > 0) {
      await this.getBatchPrices(uncachedTokens);
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Could implement hit rate tracking if needed
    };
  }
}

// Global instance for reuse across components
export const globalPriceOptimizer = new PriceOptimizer();

/**
 * Enhanced price fetching with better error handling and fallbacks
 */
export async function getOptimizedPrice(
  token: `0x${string}`,
  coingeckoId?: string,
  fallbackPrice?: number
): Promise<number | null> {
  try {
    const price = await globalPriceOptimizer.getPrice(token, coingeckoId);
    return price ?? fallbackPrice ?? null;
  } catch (error) {
    return fallbackPrice ?? null;
  }
}

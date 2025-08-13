// src/lib/prices.ts
// Simple client-side price fetcher with short in-memory cache.
// Tries CoinGecko first (by id), then Dexscreener by token address.

type CacheEntry = { t: number; v: number | null };
const cache: Record<string, CacheEntry> = {};
export const PRICE_TTL_MS = 30_000; // 30s cache

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchCoingecko(id: string): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
  const j = await fetchJson(url);
  const v = j?.[id]?.usd;
  return typeof v === "number" ? v : null;
}

// Dexscreener token endpoint returns multiple pairs; pick the one with highest USD liquidity.
async function fetchDexscreenerByToken(token: `0x${string}`): Promise<number | null> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${token}`;
  const j = await fetchJson(url);
  const pairs: any[] = Array.isArray(j?.pairs) ? j.pairs : [];
  if (pairs.length === 0) return null;
  pairs.sort((a, b) => (Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0)));
  const p = Number(pairs[0]?.priceUsd);
  return Number.isFinite(p) ? p : null;
}

export async function getUsdPrice(params: { token?: `0x${string}`; coingeckoId?: string }): Promise<number | null> {
  const key = `${params.coingeckoId ?? "_"}|${(params.token ?? "_").toLowerCase()}`;
  const now = Date.now();
  const hit = cache[key];
  if (hit && now - hit.t < PRICE_TTL_MS) return hit.v;

  let price: number | null = null;
  // 1) CoinGecko first if id provided
  if (params.coingeckoId) {
    price = await fetchCoingecko(params.coingeckoId);
  }
  // 2) Dexscreener fallback by token address
  if (price == null && params.token) {
    price = await fetchDexscreenerByToken(params.token);
  }

  cache[key] = { t: now, v: price };
  return price;
}

/**
 * Convenience helper for WHYPE (CoinGecko id: "wrapped-hype").
 * Optionally pass the HyperEVM token address so Dexscreener can be used as a fallback.
 */
export async function getWhypeUsd(opts?: { token?: `0x${string}` }): Promise<number | null> {
  return getUsdPrice({ coingeckoId: "wrapped-hype", token: opts?.token });
}

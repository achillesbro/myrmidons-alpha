import type { Address } from "viem";
import type { TokenCurrency } from "./balances";

const API_BASE = import.meta.env.VITE_RELAY_API_URL ?? "https://api.relay.link";

// Wrapped native addresses used to price 'native' tokens.
export const WRAPPED_NATIVE_BY_CHAIN: Partial<Record<number, Address>> = {
  1: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",        // WETH
  10: "0x4200000000000000000000000000000000000006",       // Optimism WETH
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",    // Arbitrum WETH
  8453: "0x4200000000000000000000000000000000000006",     // Base WETH
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",      // WMATIC
  56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",       // WBNB
  43114: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",    // WAVAX
  999: "0x5555555555555555555555555555555555555555", // WHYPE
};

export type PriceMap = Record<string, number>; // key = `${chainId}:${addrLower}`

function keyOf(chainId: number, address: string) {
  return `${chainId}:${address.toLowerCase()}`;
}

async function fetchTokenPriceUSD(address: Address, chainId: number): Promise<number | null> {
  const url = new URL(`${API_BASE}/currencies/token/price`);
  url.searchParams.set("address", address);
  url.searchParams.set("chainId", String(chainId));
  try {
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) return null;
    const data = await res.json();
    const p = Number((data as any)?.price);
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

/** Resolve USD prices for a set of tokens using Relay's price API. */
export async function getUsdPrices(tokens: TokenCurrency[], opts?: { concurrency?: number }): Promise<PriceMap> {
  const concurrency = Math.max(1, Math.min(16, opts?.concurrency ?? 8));
  const queue: { chainId: number; addr: string }[] = [];

  for (const tk of tokens) {
    if (tk.address === "native") {
      const wrapped = WRAPPED_NATIVE_BY_CHAIN[tk.chainId];
      if (wrapped) queue.push({ chainId: tk.chainId, addr: wrapped });
    } else {
      queue.push({ chainId: tk.chainId, addr: tk.address });
    }
  }

  const out: PriceMap = {};
  let i = 0;
  async function worker() {
    while (i < queue.length) {
      const idx = i++;
      const { chainId, addr } = queue[idx];
      const price = await fetchTokenPriceUSD(addr as Address, chainId);
      if (price != null) out[keyOf(chainId, addr)] = price;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
  return out;
}

/** Lookup helper for a single token entry. */
export function priceForToken(prices: PriceMap, tk: TokenCurrency): number | null {
  if (tk.address === "native") {
    const wrapped = WRAPPED_NATIVE_BY_CHAIN[tk.chainId];
    if (!wrapped) return null;
    return prices[keyOf(tk.chainId, wrapped)] ?? null;
  }
  return prices[keyOf(tk.chainId, tk.address)] ?? null;
}
// src/viem/clients.ts
import { createPublicClient, http, fallback } from "viem";
import { hyperEVM } from "../chains/hyperEVM";

// Collect RPC URLs from env (only keep non-empty)
const ENV_HYPER_RPC_URLS = [
  import.meta.env.VITE_HYPER_RPC_1,
  import.meta.env.VITE_HYPER_RPC_2,
  import.meta.env.VITE_HYPER_RPC_3,
].filter(Boolean) as string[];

// Sensible defaults (you can override via .env). Only HTTPS endpoints for security.
const DEFAULT_HYPER_RPC_URLS: string[] = [
  "https://rpc.hyperliquid.xyz/evm",
  // Removed HTTP endpoint for security - use only HTTPS
];

// Merge env + defaults and de-duplicate while preserving order
const seen = new Set<string>();
const HYPER_RPC_URLS = [...ENV_HYPER_RPC_URLS, ...DEFAULT_HYPER_RPC_URLS].filter((u) => {
  if (!u) return false;
  if (seen.has(u)) return false;
  seen.add(u);
  return true;
});

// Build per-URL http transports with batching + retries
const hyperHttpTransports = HYPER_RPC_URLS.map((url) =>
  http(url, {
    batch: { wait: 25 }, // small window to coalesce calls
    retryCount: 4,
    retryDelay: 300,
    timeout: 30_000,
  }),
);

// Choose a transport strategy:
// - If you have >1 URL, use fallback() to try the first, then the next on failure.
// - If only one URL provided, just use it.
const hyperTransport =
  hyperHttpTransports.length > 1
    ? fallback(hyperHttpTransports, {
        // Prefer the first URL; only fail over when it errors/timeouts.
        rank: true,
        retryCount: 2,   // extra layer of retries across transports
        retryDelay: 250,
      })
    : hyperHttpTransports[0];

// NOTE: Some public RPCs are not archive nodes. If you query old blocks (e.g., for history),
// a node may return "Block at number ... could not be found". The fallback list increases
// the chance that at least one node can serve the request.

export const hyperPublicClient = createPublicClient({
  chain: hyperEVM,
  transport: hyperTransport,
});
// src/viem/clients.ts
import { createPublicClient, http, fallback } from "viem";
import { hyperEVM } from "../chains/hyperEVM";

// Collect RPC URLs from env (only keep non-empty)
const ENV_HYPER_RPC_URLS = [
  import.meta.env.VITE_HYPER_RPC_1,
  import.meta.env.VITE_HYPER_RPC_2,
  import.meta.env.VITE_HYPER_RPC_3,
].filter(Boolean) as string[];

// Sensible defaults (you can override via .env). Note:
// - Only the most reliable free RPC endpoints to avoid rate limits
// - Reduced list to prevent overwhelming public RPCs
const DEFAULT_HYPER_RPC_URLS: string[] = [
  "https://rpc.hyperliquid.xyz/evm", // Primary - most reliable
  "https://rpc.hyperlend.finance",   // Secondary - good reliability
];

// Merge env + defaults and de-duplicate while preserving order
const seen = new Set<string>();
const HYPER_RPC_URLS = [...ENV_HYPER_RPC_URLS, ...DEFAULT_HYPER_RPC_URLS].filter((u) => {
  if (!u) return false;
  if (seen.has(u)) return false;
  seen.add(u);
  return true;
});

// Build per-URL http transports with conservative settings to avoid rate limits
const hyperHttpTransports = HYPER_RPC_URLS.map((url) =>
  http(url, {
    batch: { wait: 100 }, // Longer wait to reduce request frequency
    retryCount: 3, // Reduced retry count to be less aggressive
    retryDelay: 2000, // 2 second delay between retries
    timeout: 30_000, // 30 second timeout
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
        retryCount: 2,   // Reduced fallback retries
        retryDelay: 1000, // 1 second delay between fallback attempts
      })
    : hyperHttpTransports[0];

// NOTE: Some public RPCs are not archive nodes. If you query old blocks (e.g., for history),
// a node may return "Block at number ... could not be found". The fallback list increases
// the chance that at least one node can serve the request.

export const hyperPublicClient = createPublicClient({
  chain: hyperEVM,
  transport: hyperTransport,
});
// src/viem/clients.ts
import { createPublicClient, http, fallback } from "viem";
import { hyperEVM } from "../chains/hyperEVM";

// Collect RPC URLs from env (only keep non-empty)
const HYPER_RPC_URLS = [
  import.meta.env.VITE_HYPER_RPC_1,
  import.meta.env.VITE_HYPER_RPC_2,
  import.meta.env.VITE_HYPER_RPC_3,
  import.meta.env.VITE_HYPER_RPC_4,
].filter(Boolean) as string[];

// Build per-URL http transports with batching + retries
const hyperHttpTransports = HYPER_RPC_URLS.map((url) =>
  http(url, {
    // Batch JSON-RPC calls that occur close together into one request.
    // This alone reduces request count & rate-limit pressure.
    batch: { wait: 20 }, // ms window to group calls
    retryCount: 3,
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

export const hyperPublicClient = createPublicClient({
  chain: hyperEVM,
  transport: hyperTransport,
});
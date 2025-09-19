import { createClient, configureDynamicChains, type RelayClient } from '@relayprotocol/relay-sdk';

let _client: RelayClient | null = null;

export function getRelayClient(): RelayClient {
  if (_client) return _client;

  // Point to Relay’s public API; allow override via env if needed.
  const baseApiUrl = import.meta.env.VITE_RELAY_API_URL ?? 'https://api.relay.link';

  _client = createClient({
    baseApiUrl,
    // This 'source' shows up in Relay’s telemetry; set it to your app/brand.
    source: 'myrmidons.app/vault',
    // Optional: pre-seed with known chains; we’ll still call configureDynamicChains below.
    chains: [], // keep empty; we’ll fetch live support at runtime
  });

  // Pull the live list of supported chains/tokens at startup (kept in-memory by the SDK).
  // Call-and-forget; errors are safe to ignore (SDK will still work with empty seed).
  configureDynamicChains().catch(() => { /* no-op */ });

  return _client;
}
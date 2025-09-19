export type RelayCurrency = {
  chainId: number;
  address: string | "native";
  symbol: string;
  decimals: number;
  name?: string;
  logoURI?: string | null;
};

const API_BASE = import.meta.env.VITE_RELAY_API_URL ?? "https://api.relay.link";

// Env-driven forced tokens (useful for HyperEVM 999: USDT0, HYPE, WHYPE)
function forcedTokensFor(chainId: number) {
  const out: { chainId: number; address: string; symbol: string; name?: string; decimals?: number; logoURI?: string | null }[] = [];
  const envs = [
    { keyAddr: `VITE_USDT0_${chainId}`, keySym: `VITE_USDT0_${chainId}_SYMBOL`, defSym: "USDT0" },
    { keyAddr: `VITE_HYPE_${chainId}`,  keySym: `VITE_HYPE_${chainId}_SYMBOL`,  defSym: "HYPE"  },
    { keyAddr: `VITE_WHYPE_${chainId}`, keySym: `VITE_WHYPE_${chainId}_SYMBOL`, defSym: "WHYPE" },
  ] as const;
  for (const e of envs) {
    const addr = (import.meta.env as any)[e.keyAddr] as string | undefined;
    if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
      const sym = ((import.meta.env as any)[e.keySym] as string | undefined) ?? e.defSym;
      out.push({ chainId, address: addr, symbol: sym, name: sym, decimals: 18, logoURI: null });
    }
  }
  return out;
}

function extractLogo(x: any): string | null {
  return (
    x?.metadata?.logoURI ??
    x?.logoURI ??
    x?.image ??
    x?.logo_url ??
    x?.logoUrl ??
    null
  ) ?? null;
}

async function fetchOnce(payload: any): Promise<any[]> {
  const res = await fetch(`${API_BASE}/currencies/v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Relay currencies fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  // v2: array response; some deployments may wrap under 'items'
  const arr = Array.isArray(data) ? data : (Array.isArray((data as any)?.items) ? (data as any).items : []);
  return arr;
}

/**
 * Fetch currencies for a chain from Relay's /currencies/v2 with two passes:
 *  A) verified default list (stable, curated, good logos)
 *  B) discovery with external search (broader coverage)
 * Merge & dedupe by (chainId,addressLower), preferring verified entries.
 * Force-include env tokens last so they always appear.
 */
export async function getRelayCurrencies(chainId: number): Promise<RelayCurrency[]> {
  const passA = await fetchOnce({
    defaultList: true,
    chainIds: [chainId],
    verified: true,
    limit: 100,
    includeAllChains: false,
    useExternalSearch: false,
    depositAddressOnly: false,
  }).catch(() => []);

  const passB = await fetchOnce({
    defaultList: true,
    chainIds: [chainId],
    verified: false,
    limit: 100,
    includeAllChains: false,
    useExternalSearch: true,
    depositAddressOnly: false,
  }).catch(() => []);

  const forced = forcedTokensFor(chainId);

  const keyOf = (x: any) => `${Number(x?.chainId ?? chainId)}:${String(x?.address ?? "").toLowerCase()}`;
  const merged = new Map<string, any>();

  // Discovery baseline
  for (const x of passB) merged.set(keyOf(x), x);
  // Verified overwrites discovery
  for (const x of passA) merged.set(keyOf(x), x);
  // Env-forced overwrites both
  for (const x of forced) merged.set(`${x.chainId}:${x.address.toLowerCase()}`, x);

  const flat = Array.from(merged.values());

  return flat
    .map((x) => {
      const isNative =
        x?.metadata?.isNative === true ||
        String(x?.address ?? "").toLowerCase() === "native" ||
        x?.address === undefined; // some APIs omit address for native
      return {
        chainId: Number(x?.chainId ?? chainId),
        address: isNative ? "native" : (x?.address ?? ""),
        symbol: String(x?.symbol ?? x?.name ?? "?"),
        decimals: Number(x?.decimals ?? 18),
        name: x?.name ?? undefined,
        logoURI: extractLogo(x),
      } as RelayCurrency;
    })
    .filter((c) => c.address === "native" || /^0x[0-9a-fA-F]{40}$/.test(String(c.address)));
}
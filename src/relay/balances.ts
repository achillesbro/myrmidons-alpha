// src/relay/balances.ts
import {
  createPublicClient,
  http,
  formatUnits,
  erc20Abi,
  type Address,
  type PublicClient,
} from "viem";
import { PUBLIC_RPC_BY_CHAIN } from "./rpcs";

export type TokenCurrency = {
  chainId: number;
  address: Address | "native";
  symbol: string;
  decimals: number;
  name?: string;
  logoURI?: string | null;
};

export type TokenBalance = TokenCurrency & {
  raw: bigint;
  human: string; // formatted
};

// Multicall3 addresses on common chains; fallback to single calls if missing or failing.
const MULTICALL3_BY_CHAIN: Record<number, Address> = {
  1: "0xca11bde05977b3631167028862be2a173976ca11",
  10: "0xca11bde05977b3631167028862be2a173976ca11",
  56: "0xca11bde05977b3631167028862be2a173976ca11",
  137: "0xca11bde05977b3631167028862be2a173976ca11",
  42161: "0xca11bde05977b3631167028862be2a173976ca11",
  8453: "0xca11bde05977b3631167028862be2a173976ca11",
  43114: "0xca11bde05977b3631167028862be2a173976ca11",
  999: "0xca11bde05977b3631167028862be2a173976ca11", // if not deployed, we’ll catch & fallback
};

function makeClient(chainId: number): PublicClient | null {
  const url = PUBLIC_RPC_BY_CHAIN[chainId];
  if (!url) return null;
  return createPublicClient({ transport: http(url) });
}

// In-memory cache with short TTL to accelerate re-opens
type CacheKey = `${number}:${Address}:${string}`; // chainId:user:tokenAddrOrNative
const cache = new Map<CacheKey, { at: number; raw: bigint }>();
const CACHE_TTL_MS = 30_000;

function getCached(chainId: number, user: Address, tokenAddr: Address | "native"): bigint | null {
  const key: CacheKey = `${chainId}:${user}:${tokenAddr === "native" ? "native" : tokenAddr}`;
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.raw;
}
function setCached(chainId: number, user: Address, tokenAddr: Address | "native", raw: bigint) {
  const key: CacheKey = `${chainId}:${user}:${tokenAddr === "native" ? "native" : tokenAddr}`;
  cache.set(key, { at: Date.now(), raw });
}

export async function fetchBalancesFor(
  user: Address,
  tokens: TokenCurrency[],
): Promise<TokenBalance[]> {
  // Group tokens by chain, and split out native vs ERC20 per chain
  const byChain: Record<number, { native: TokenCurrency[]; erc20: TokenCurrency[] }> = {};
  for (const tk of tokens) {
    const bucket = (byChain[tk.chainId] ??= { native: [], erc20: [] });
    if (tk.address === "native") bucket.native.push(tk);
    else bucket.erc20.push(tk);
  }

  // Process each chain in parallel
  const resultsPerChain = await Promise.all(
    Object.entries(byChain).map(async ([cidStr, group]) => {
      const chainId = Number(cidStr);
      const client = makeClient(chainId);
      if (!client) return [] as TokenBalance[];

      const out: TokenBalance[] = [];

      // 1) Native balances — single call per chain (dedupe duplicates)
      if (group.native.length > 0) {
        const cached = getCached(chainId, user, "native");
        let rawNative: bigint;
        if (cached != null) {
          rawNative = cached;
        } else {
          try {
            rawNative = await client.getBalance({ address: user });
            setCached(chainId, user, "native", rawNative);
          } catch {
            rawNative = 0n;
          }
        }
        for (const tk of group.native) {
          out.push({ ...tk, raw: rawNative, human: formatUnits(rawNative, tk.decimals) });
        }
      }

      // 2) ERC20 balances — try multicall3, else sequential
      if (group.erc20.length > 0) {
        const mcAddr = MULTICALL3_BY_CHAIN[chainId];
        const needs = group.erc20.filter((tk) => getCached(chainId, user, tk.address as Address) == null);
        const already = group.erc20.filter((tk) => getCached(chainId, user, tk.address as Address) != null);

        // Push cached first
        for (const tk of already) {
          const raw = getCached(chainId, user, tk.address as Address) ?? 0n;
          out.push({ ...tk, raw, human: formatUnits(raw, tk.decimals) });
        }

        if (needs.length > 0) {
          let usedMulticall = false;
          if (mcAddr) {
            try {
              const contracts = needs.map((tk) => ({
                address: tk.address as Address,
                abi: erc20Abi,
                functionName: "balanceOf" as const,
                args: [user] as const,
              }));
              const mcRes = await client.multicall({ contracts });
              for (let i = 0; i < needs.length; i++) {
                const tk = needs[i];
                const r = mcRes[i];
                const ok = r.status === "success" && typeof r.result === "bigint";
                const raw = ok ? (r.result as bigint) : 0n;
                setCached(chainId, user, tk.address as Address, raw);
                out.push({ ...tk, raw, human: formatUnits(raw, tk.decimals) });
              }
              usedMulticall = true;
            } catch {
              // fall through to sequential
            }
          }
          if (!usedMulticall) {
            const CHUNK = 32;
            for (let i = 0; i < needs.length; i += CHUNK) {
              const slice = needs.slice(i, i + CHUNK);
              const reads = await Promise.all(
                slice.map(async (tk) => {
                  try {
                    const raw = (await client.readContract({
                      address: tk.address as Address,
                      abi: erc20Abi,
                      functionName: "balanceOf",
                      args: [user],
                    })) as bigint;
                    return { tk, raw };
                  } catch {
                    return { tk, raw: 0n };
                  }
                })
              );
              for (const { tk, raw } of reads) {
                setCached(chainId, user, tk.address as Address, raw);
                out.push({ ...tk, raw, human: formatUnits(raw, tk.decimals) });
              }
            }
          }
        }
      }

      return out;
    })
  );

  return resultsPerChain.flat();
}
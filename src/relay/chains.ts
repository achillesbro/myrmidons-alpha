// src/relay/chains.ts
export const CHAIN_META: Record<number, { name: string; nativeSymbol: string; nativeLogoURI?: string }> = {
  1:    { name: "Ethereum",  nativeSymbol: "ETH"  },
  10:   { name: "Optimism",  nativeSymbol: "ETH"  },
  56:   { name: "BNB Chain", nativeSymbol: "BNB"  },
  137:  { name: "Polygon",   nativeSymbol: "MATIC"},
  42161:{ name: "Arbitrum",  nativeSymbol: "ETH"  },
  8453: { name: "Base",      nativeSymbol: "ETH"  },
  43114:{ name: "Avalanche", nativeSymbol: "AVAX" },
  999:  { name: "HyperEVM",  nativeSymbol: "HYPE" },
};

export function chainName(id: number): string {
  return CHAIN_META[id]?.name ?? `chain ${id}`;
}

export function nativeSymbolFor(id: number): string {
  return CHAIN_META[id]?.nativeSymbol ?? "ETH";
}

// Fallback inline SVG logo for native tokens when Relay doesn't provide one.
// Produces a simple circle badge with the native symbol's first letter.
function svgDataUriFor(symbol: string): string {
  const letter = (symbol || "?").slice(0, 1).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#EDE9D7'/><stop offset='100%' stop-color='#D6D3C6'/></linearGradient></defs>
    <circle cx='32' cy='32' r='30' fill='url(#g)' stroke='#CFCBB9' stroke-width='2'/>
    <text x='32' y='39' font-family='Arial, Helvetica, sans-serif' font-size='28' text-anchor='middle' fill='#00295B'>${letter}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function nativeLogoFor(id: number): string {
  const meta = CHAIN_META[id];
  if (meta?.nativeLogoURI) return meta.nativeLogoURI;
  return svgDataUriFor(nativeSymbolFor(id));
}
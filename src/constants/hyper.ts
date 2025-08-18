// src/constants/hyper.ts
export const HYPER_RPC = "https://rpc.hyperliquid.xyz/evm";
export const HYPER_CHAIN_ID = 999;

// Set to your vault's deployment block for faster scans (0n = from genesis)
export const VAULT_CREATION_BLOCK = 0n as const;

// Optional: label market Ids (bytes32) -> human-readable names
export const MARKET_LABELS: Record<`0x${string}`, string> = {
  // "0x...": "wstETH / WETH",
  "0x5031ac4543f8232df889e5eb24389f8cf9520366f21dc62240017cb3bc6ecc59": "kHYPE",
  "0xbc15a1782163f4be46c23ac61f5da50fed96ad40293f86a5ce0501ce4a246b32": "wstHYPE",
  "0x9e28003bb5c29c1df3552e99b04d656fadf1aedaf81256637dcc51d91cf6c639": "USDT0",
  "0x1df0d0ebcdc52069692452cb9a3e5cf6c017b237378141eaf08a05ce17205ed6": "PT-kHYPE-13NOV2025",
  "0x48e3352186d92b50b0c8d4b4adce2f3471ef716ee259acb43fa3da1afe0159fe": "WHYPE"
};

export const TOKEN_METADATA: Record<`0x${string}`, { label: string; logo: string }> = {
  "0x1df0d0ebcdc52069692452cb9a3e5cf6c017b237378141eaf08a05ce17205ed6": {
    label: "PT-kHYPE-13NOV2025",
    logo: "/assets/kHYPE-TokenIcon.png"
  },
  "0x48e3352186d92b50b0c8d4b4adce2f3471ef716ee259acb43fa3da1afe0159fe": {
    label: "WHYPE",
    logo: "/assets/WHYPE-TokenIcon.jpg"
  },
  "0xbc15a1782163f4be46c23ac61f5da50fed96ad40293f86a5ce0501ce4a246b32": {
    label: "wstHYPE",
    logo: "/assets/wstHYPE-TokenIcon.svg"
  },
  "0x9e28003bb5c29c1df3552e99b04d656fadf1aedaf81256637dcc51d91cf6c639": {
    label: "USDT0",
    logo: "/assets/USDT0-TokenIcon.png"
  }
};
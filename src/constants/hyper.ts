// src/constants/hyper.ts
export const HYPER_RPC = "https://rpc.hyperliquid.xyz/evm";
export const HYPER_CHAIN_ID = 999;

// Set to your vault's deployment block for faster scans (0n = from genesis)
export const VAULT_CREATION_BLOCK = 0n as const;

// Optional: label market Ids (bytes32) -> human-readable names
export const MARKET_LABELS: Record<`0x${string}`, string> = {
  // "0x...": "wstETH / WETH",
  "0xc5526286d537c890fdd879d17d80c4a22dc7196c1e1fff0dd6c853692a759c62": "kHYPE",
  "0xa24d04c3aff60d49b3475f0084334546cbf66182e788b6bf173e6f9990b2c816": "BTC",
  "0xa62327642e110efd38ba2d153867a8625c8dc40832e1d211ba4f4151c3de9050": "ETH",
  "0x888679b2af61343a4c7c0da0639fc5ca5fc5727e246371c4425e4d634c09e1f6": "PT-kHYPE-13NOV2025",
  "0x8eb8cfe3b1ac8f653608ae09fb099263fa2fe25d4a59305c309937292c2aeee9": "hbUSDT",
  "0x0ecf5be1fadf4bec3f79ce196f02a327b507b34d230c0f033f4970b1b510119c": "PT-hbUSDT-18DEC2025",
  "0x1c6b87ae1b97071ef444eedcba9f5a92cfe974edbbcaa1946644fc7ab0e283af": "USDT0"
};

export const TOKEN_METADATA: Record<`0x${string}`, { label: string; logo: string }> = {
  "0xc5526286d537c890fdd879d17d80c4a22dc7196c1e1fff0dd6c853692a759c62": {
    label: "kHYPE",
    logo: "/assets/kHYPE-TokenIcon.png"
  },
  "0xa24d04c3aff60d49b3475f0084334546cbf66182e788b6bf173e6f9990b2c816": {
    label: "BTC",
    logo: "/assets/BTC-TokenIcon.svg"
  },
  "0xa62327642e110efd38ba2d153867a8625c8dc40832e1d211ba4f4151c3de9050": {
    label: "ETH",
    logo: "/assets/ETH-TokenIcon.svg"
  },
  "0x1c6b87ae1b97071ef444eedcba9f5a92cfe974edbbcaa1946644fc7ab0e283af": {
    label: "USDT0",
    logo: "/assets/USDT0-TokenIcon.png"
  },
  "0x888679b2af61343a4c7c0da0639fc5ca5fc5727e246371c4425e4d634c09e1f6": {
    label: "PT-kHYPE-13NOV2025",
    logo: "/assets/kHYPE-TokenIcon.png"
  },
  "0x8eb8cfe3b1ac8f653608ae09fb099263fa2fe25d4a59305c309937292c2aeee9": {
    label: "hbUSDT",
    logo: "/assets/hbusdt-TokenIcon.svg"
  },
  "0x0ecf5be1fadf4bec3f79ce196f02a327b507b34d230c0f033f4970b1b510119c": {
    label: "PT-hbUSDT-18DEC2025",
    logo: "/assets/hbusdt-TokenIcon.svg"
  }
};
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
  "0x1c6b87ae1b97071ef444eedcba9f5a92cfe974edbbcaa1946644fc7ab0e283af": "USDT0",
  "0x11e9e354e996b7603231041307cada35d4024539917175267b512dae3a355bce": "dnHYPE",
  "0x707dddc200e95dc984feb185abf1321cabec8486dca5a9a96fb5202184106e54": "BTC",
  "0xace279b5c6eff0a1ce7287249369fa6f4d3d32225e1629b04ef308e0eb568fb0": "WHYPE",
  "0x78f6b57d825ef01a5dc496ad1f426a6375c685047d07a30cd07ac5107ffc7976": "kHYPE"
};

// Group multiple market ids (addresses) under the same asset metadata
type TokenMeta = { label: string; logo: string };

export const TOKEN_GROUPS = [
  {
    label: "WHYPE",
    logo: "/assets/WHYPE-TokenIcon.jpg",
    ids: [
      "0xace279b5c6eff0a1ce7287249369fa6f4d3d32225e1629b04ef308e0eb568fb0"
    ] as const,
  },
  {
    label: "kHYPE",
    logo: "/assets/kHYPE-TokenIcon.png",
    ids: [
      "0xc5526286d537c890fdd879d17d80c4a22dc7196c1e1fff0dd6c853692a759c62",
      "0x78f6b57d825ef01a5dc496ad1f426a6375c685047d07a30cd07ac5107ffc7976"
    ] as const,
  },
  {
    label: "BTC",
    logo: "/assets/BTC-TokenIcon.svg",
    ids: [
      "0xa24d04c3aff60d49b3475f0084334546cbf66182e788b6bf173e6f9990b2c816",
      "0x707dddc200e95dc984feb185abf1321cabec8486dca5a9a96fb5202184106e54"
    ] as const,
  },
  {
    label: "ETH",
    logo: "/assets/ETH-TokenIcon.svg",
    ids: [
      "0xa62327642e110efd38ba2d153867a8625c8dc40832e1d211ba4f4151c3de9050",
    ] as const,
  },
  {
    label: "USDT0",
    logo: "/assets/USDT0-TokenIcon.png",
    ids: [
      "0x1c6b87ae1b97071ef444eedcba9f5a92cfe974edbbcaa1946644fc7ab0e283af",
      // If you have other USDT0 market ids (different LLTV/oracle), add them here
    ] as const,
  },
  {
    label: "PT-kHYPE-13NOV2025",
    logo: "/assets/kHYPE-TokenIcon.png",
    ids: [
      "0x888679b2af61343a4c7c0da0639fc5ca5fc5727e246371c4425e4d634c09e1f6",
    ] as const,
  },
  {
    label: "hbUSDT",
    logo: "/assets/hbusdt-TokenIcon.svg",
    ids: [
      "0x8eb8cfe3b1ac8f653608ae09fb099263fa2fe25d4a59305c309937292c2aeee9",
    ] as const,
  },
  {
    label: "PT-hbUSDT-18DEC2025",
    logo: "/assets/hbusdt-TokenIcon.svg",
    ids: [
      "0x0ecf5be1fadf4bec3f79ce196f02a327b507b34d230c0f033f4970b1b510119c",
    ] as const,
  },
  {
    label: "dnHYPE",
    logo: "/assets/dnHYPE-TokenIcon.svg",
    ids: [
      "0x11e9e354e996b7603231041307cada35d4024539917175267b512dae3a355bce"
    ] as const,
  },
] as const;

// Expand groups to a per-id metadata lookup used by the UI
export const TOKEN_METADATA: Record<`0x${string}`, TokenMeta> = Object.fromEntries(
  TOKEN_GROUPS.flatMap((g) => g.ids.map((id) => [id, { label: g.label, logo: g.logo }]))
) as Record<`0x${string}`, TokenMeta>;
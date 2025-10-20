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
  "0x78f6b57d825ef01a5dc496ad1f426a6375c685047d07a30cd07ac5107ffc7976": "kHYPE",
  "0xfbe436e9aa361487f0c3e4ff94c88aea72887a4482c6b8bcfec60a8584cdb05e": "thBILL",
  "0x64e7db7f042812d4335947a7cdf6af1093d29478aff5f1ccd93cc67f8aadfddc": "kHYPE",
  "0x1df0d0ebcdc52069692452cb9a3e5cf6c017b237378141eaf08a05ce17205ed6": "PT-kHYPE-13NOV2025",
  "0xe9a9bb9ed3cc53f4ee9da4eea0370c2c566873d5de807e16559a99907c9ae227": "wstHYPE",
  "0x19e47d37453628ebf0fd18766ce6fee1b08ea46752a5da83ca0bfecb270d07e8": "hbHYPE",
  "0x0a2e456ebd22ed68ae1d5c6b2de70bc514337ac588a7a4b0e28f546662144036": "beHYPE"
};

// Group multiple market ids (addresses) under the same asset metadata
type TokenMeta = { label: string; logo: string };

export const TOKEN_GROUPS = [
  {
    label: "thBILL",
    logo: "/assets/thBILL-TokenIcon.png",
    ids: [
      "0xfbe436e9aa361487f0c3e4ff94c88aea72887a4482c6b8bcfec60a8584cdb05e"
    ] as const,
  },
  {
    label: "WHYPE",
    logo: "/assets/WHYPE-TokenIcon.jpg",
    ids: [
      "0xace279b5c6eff0a1ce7287249369fa6f4d3d32225e1629b04ef308e0eb568fb0",
      "0xd5a9fba2309a0b85972a96f2cc45f9784e786d712944d8fc0b31a6d9cb4f21d3"
    ] as const,
  },
  {
    label: "kHYPE",
    logo: "/assets/kHYPE-TokenIcon.png",
    ids: [
      "0xc5526286d537c890fdd879d17d80c4a22dc7196c1e1fff0dd6c853692a759c62",
      "0x78f6b57d825ef01a5dc496ad1f426a6375c685047d07a30cd07ac5107ffc7976",
      "0xd2e8f6fd195556222d7a0314d4fb93fdf84ae920faaebba6dbcf584ac865e1f5",
      "0x64e7db7f042812d4335947a7cdf6af1093d29478aff5f1ccd93cc67f8aadfddc"
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
      "0x1df0d0ebcdc52069692452cb9a3e5cf6c017b237378141eaf08a05ce17205ed6"
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
    logo: "public/dnHYPE-TokenIcon.svg",
    ids: [
      "0x11e9e354e996b7603231041307cada35d4024539917175267b512dae3a355bce"
    ] as const,
  },
  {
    label: "wstHYPE",
    logo: "/assets/wstHYPE-TokenIcon.svg",
    ids: [
      "0xe9a9bb9ed3cc53f4ee9da4eea0370c2c566873d5de807e16559a99907c9ae227"
    ] as const,
  },
  {
    label: "hbHYPE",
    logo: "/assets/kHYPE-TokenIcon.png",
    ids: [
      "0x19e47d37453628ebf0fd18766ce6fee1b08ea46752a5da83ca0bfecb270d07e8"
    ] as const,
  },
  {
    label: "beHYPE",
    logo: "/assets/kHYPE-TokenIcon.png",
    ids: [
      "0x0a2e456ebd22ed68ae1d5c6b2de70bc514337ac588a7a4b0e28f546662144036"
    ] as const,
  },
] as const;

// Expand groups to a per-id metadata lookup used by the UI
export const TOKEN_METADATA: Record<`0x${string}`, TokenMeta> = Object.fromEntries(
  TOKEN_GROUPS.flatMap((g) => g.ids.map((id) => [id, { label: g.label, logo: g.logo }]))
) as Record<`0x${string}`, TokenMeta>;
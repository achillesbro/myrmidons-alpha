// ========================================
// Multi-Vault Configuration Registry
// ========================================
// This file centralizes all vault configurations for the application.
// To add a new vault:
// 1. Add vault config to VAULT_CONFIGS object
// 2. Add translation keys in i18n files (en.json, fr.json)
// 3. Add underlying token address to constants/hyper.ts TOKEN_GROUPS if needed
// 4. That's it! The rest is handled automatically.

export type VaultLinkset = {
  details: string;   // e.g. "/?tab=vaultinfo&vault=phalanx"
  deposit: string;   // e.g. "/?tab=vaultinfo&vault=phalanx#deposit"
  explorer?: string; // optional blockchain explorer URL
};

export type VaultCardModel = {
  id: string;
  name: string;
  chainId: string;
  objectiveKey: string; // Translation key for objective
  tagsKey: string; // Translation key for tags array
  links: VaultLinkset;
};

// Full vault configuration including contract addresses and metadata
export type VaultConfig = {
  // Identity
  id: string;                    // Unique identifier (e.g., 'phalanx', 'whype')
  name: string;                  // Display name (e.g., 'PHALANX')
  displayName: string;           // Full display name (e.g., 'USDT0 PHALANX')
  
  // Contract addresses (checksummed)
  vaultAddress: `0x${string}`;   // ERC-4626 vault contract
  underlyingAddress: `0x${string}`; // Underlying asset token contract
  
  // Asset metadata
  underlyingSymbol: string;      // Symbol of underlying asset (e.g., 'USDT0', 'WHYPE')
  underlyingDecimals: number;    // Decimals of underlying asset
  
  // Chain
  chainId: number;               // Chain ID (999 for HyperEVM)
  chainName: string;             // Human-readable chain name
  
  // UI/Translations
  objectiveKey: string;          // i18n key for vault objective
  tagsKey: string;               // i18n key for vault tags
  
  // Links
  links: VaultLinkset;
};

// ========================================
// Vault Configurations
// ========================================
export const VAULT_CONFIGS: Record<string, VaultConfig> = {
  // USDT0 Vault on HyperEVM (Morpho)
  phalanx: {
    id: 'phalanx',
    name: 'PHALANX',
    displayName: 'USDT0 PHALANX',
    vaultAddress: '0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42',
    underlyingAddress: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
    underlyingSymbol: 'USDT0',
    underlyingDecimals: 6,
    chainId: 999,
    chainName: 'HyperEVM',
    objectiveKey: 'landing.vaults.phalanx.objective',
    tagsKey: 'landing.vaults.phalanx.tags',
    links: {
      details: '/?tab=vaultinfo&vault=phalanx',
      deposit: '/?tab=vaultinfo&vault=phalanx#deposit',
      explorer: '',
    },
  },
  
  // WHYPE Vault on HyperEVM (Morpho) - EXAMPLE CONFIGURATION
  // TODO: Update addresses when WHYPE vault is deployed
  whype: {
    id: 'whype',
    name: 'WHYPE VAULT',
    displayName: 'WHYPE VAULT',
    vaultAddress: '0x0000000000000000000000000000000000000000', // TODO: Add deployed vault address
    underlyingAddress: '0xace279b5c6eff0a1ce7287249369fa6f4d3d32225e1629b04ef308e0eb568fb0', // WHYPE token (from hyper.ts)
    underlyingSymbol: 'WHYPE',
    underlyingDecimals: 18, // TODO: Verify WHYPE decimals
    chainId: 999,
    chainName: 'HyperEVM',
    objectiveKey: 'landing.vaults.whype.objective',
    tagsKey: 'landing.vaults.whype.tags',
    links: {
      details: '/?tab=vaultinfo&vault=whype',
      deposit: '/?tab=vaultinfo&vault=whype#deposit',
      explorer: '',
    },
  },
  
  // TO ADD MORE VAULTS:
  // Simply copy the structure above and fill in the details.
  // The application will automatically:
  // - Add vault to landing page grid
  // - Enable deposits/withdrawals
  // - Configure LiFi bridging
  // - Set up all hooks and data fetching
} as const;

// Helper to get all vault addresses for a specific chain
export function getVaultAddressesByChain(chainId: number): `0x${string}`[] {
  return Object.values(VAULT_CONFIGS)
    .filter(v => v.chainId === chainId)
    .map(v => v.vaultAddress);
}

// Helper to get vault config by address
export function getVaultConfigByAddress(address: `0x${string}`): VaultConfig | undefined {
  return Object.values(VAULT_CONFIGS).find(
    v => v.vaultAddress.toLowerCase() === address.toLowerCase()
  );
}

// Helper to get vault config by ID
export function getVaultConfigById(id: string): VaultConfig | undefined {
  return VAULT_CONFIGS[id];
}

// Default vault (used when no vault is specified)
export const DEFAULT_VAULT_ID = 'phalanx';
export const DEFAULT_VAULT_CONFIG = VAULT_CONFIGS[DEFAULT_VAULT_ID];

// ========================================
// Legacy Export (for VaultCard component)
// ========================================
// Convert full configs to card models for landing page
export const vaults: VaultCardModel[] = Object.values(VAULT_CONFIGS).map(config => ({
  id: config.id,
  name: config.name,
  chainId: config.chainName,
  objectiveKey: config.objectiveKey,
  tagsKey: config.tagsKey,
  links: config.links,
}));

export type VaultLinkset = {
  details: string;   // e.g. "/?tab=vaultinfo"
  deposit: string;   // e.g. "/?tab=vaultinfo#deposit"
  explorer?: string; // optional
};

export type VaultCardModel = {
  id: string;
  name: string;
  chainId: string;
  objectiveKey: string; // Translation key for objective
  tagsKey: string; // Translation key for tags array
  links: VaultLinkset;
};

export const vaults: VaultCardModel[] = [
  {
    id: 'phalanx',
    name: 'PHALANX',
    chainId: 'HyperEVM',
    objectiveKey: 'landing.vaults.phalanx.objective',
    tagsKey: 'landing.vaults.phalanx.tags',
    links: {
      details: '/?tab=vaultinfo',
      deposit: '/?tab=vaultinfo#deposit',
      explorer: '', // fill if you want
    },
  },
  // future vaults can be appended without redesign
];

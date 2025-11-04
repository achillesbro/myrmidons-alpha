// src/lib/allocation-grouper.ts
import { TOKEN_GROUPS } from '../constants/hyper';

// Define mega-families for higher-level grouping
const MEGA_FAMILIES = {
  'HYPE': {
    label: 'HYPE',
    logo: '/assets/kHYPE-TokenIcon.png', // Use kHYPE as the main logo
    families: ['kHYPE', 'WHYPE', 'PT-kHYPE-13NOV2025', 'dnHYPE', 'wstHYPE', 'hbHYPE', 'beHYPE'],
    description: 'Native token of Hyperliquid and the gas on HyperEVM; core settlement asset for apps built on HyperEVM.',
    descriptionKey: 'family.hype.description'
  },
  'Stables': {
    label: 'Stables',
    logo: '/assets/USDT0-TokenIcon.png',
    families: ['USDT0', 'hbUSDT', 'PT-hbUSDT-18DEC2025'],
    description: 'USD-pegged assets (e.g., USDT0 on HyperEVM) used as quote/collateral and routing liquidity; low price volatility but carry issuer/peg/bridge risks.',
    descriptionKey: 'family.stables.description'
  },
  'BTC': {
    label: 'BTC',
    logo: '/assets/BTC-TokenIcon.svg',
    families: ['BTC'],
    description: 'Flagship crypto asset with the deepest global liquidity; primary macro benchmark for crypto market risk.',
    descriptionKey: 'family.btc.description'
  },
  'ETH': {
    label: 'ETH',
    logo: '/assets/ETH-TokenIcon.svg',
    families: ['ETH'],
    description: 'Ethereum\'s base asset used for gas/collateral; large-cap L1 beta with deep spot and derivatives markets.',
    descriptionKey: 'family.eth.description'
  },
  'thBILL': {
    label: 'thBILL',
    logo: '/assets/thBILL-TokenIcon.png',
    families: ['thBILL'],
    description: 'Tokenized short-duration U.S. Treasury bill exposure (Theo); low-volatility, yield-bearing "cash-plus" instrument.',
    descriptionKey: 'family.thbill.description'
  }
} as const;

export interface AllocationItem {
  id: `0x${string}`;
  assets: bigint;
  label: string;
  pct: number;
  usd?: number | null;
  supplyApy?: number | null;
  logo?: string | null;
  protocol?: string; // Protocol name (e.g., "Hyperlend", "Felix Protocol")
  protocolKey?: string; // Protocol key from Octav (e.g., "hyperlend", "felix")
}

export interface GroupedAllocation {
  familyLabel: string;
  familyLogo: string;
  description: string;
  descriptionKey: string;
  totalAssets: bigint;
  totalUsd: number | null;
  weightedApy: number;
  marketCount: number;
  markets: AllocationItem[];
  percentage: number;
  isExpanded?: boolean;
  megaFamily?: string; // The mega-family this belongs to
  subFamilies?: string[]; // Sub-families within this mega-family
}

export interface AllocationGroupingResult {
  groupedItems: GroupedAllocation[];
  ungroupedItems: AllocationItem[];
  totalGroupedAssets: bigint;
  totalUngroupedAssets: bigint;
}

export interface ProtocolGroupedAllocation {
  protocolName: string;
  protocolKey: string;
  protocolLogo: string | null;
  totalAssets: bigint;
  totalUsd: number | null;
  weightedApy: number;
  marketCount: number;
  markets: AllocationItem[];
  percentage: number;
  isExpanded?: boolean;
}

export interface ProtocolAllocationGroupingResult {
  groupedItems: ProtocolGroupedAllocation[];
  ungroupedItems: AllocationItem[];
  totalGroupedAssets: bigint;
  totalUngroupedAssets: bigint;
}

/**
 * Groups allocation items by token family using TOKEN_GROUPS configuration
 * Now supports mega-families for higher-level grouping
 */
export function groupAllocationsByFamily(
  items: AllocationItem[],
  totalAssets: bigint
): AllocationGroupingResult {
  const familyMap = new Map<string, AllocationItem[]>();
  const ungroupedItems: AllocationItem[] = [];
  
  // Group items by family
  items.forEach(item => {
    const family = findFamilyForMarket(item.id, item.label);
    if (family) {
      if (!familyMap.has(family.label)) {
        familyMap.set(family.label, []);
      }
      familyMap.get(family.label)!.push(item);
    } else {
      // Market not in any family, keep as ungrouped
      ungroupedItems.push(item);
    }
  });

  // Group families into mega-families
  const megaFamilyMap = new Map<string, Map<string, AllocationItem[]>>();
  
  familyMap.forEach((markets, familyLabel) => {
    const megaFamily = findMegaFamilyForFamily(familyLabel);
    if (megaFamily) {
      if (!megaFamilyMap.has(megaFamily)) {
        megaFamilyMap.set(megaFamily, new Map());
      }
      megaFamilyMap.get(megaFamily)!.set(familyLabel, markets);
    } else {
      // Family not in any mega-family, create a single-family mega-family
      if (!megaFamilyMap.has(familyLabel)) {
        megaFamilyMap.set(familyLabel, new Map());
      }
      megaFamilyMap.get(familyLabel)!.set(familyLabel, markets);
    }
  });

  // Convert mega-families to GroupedAllocation objects
  const groupedItems: GroupedAllocation[] = Array.from(megaFamilyMap.entries()).map(([megaFamilyLabel, subFamilies]) => {
    const megaFamily = MEGA_FAMILIES[megaFamilyLabel as keyof typeof MEGA_FAMILIES];
    const allMarkets: AllocationItem[] = [];
    const subFamilyLabels: string[] = [];

    // Collect all markets from sub-families
    subFamilies.forEach((markets, subFamilyLabel) => {
      allMarkets.push(...markets);
      subFamilyLabels.push(subFamilyLabel);
    });

    // Calculate aggregated metrics
    const totalFamilyAssets = allMarkets.reduce((sum, market) => sum + market.assets, 0n);
    const totalFamilyUsd = allMarkets.reduce((sum, market) => sum + (market.usd || 0), 0);
    const percentage = totalAssets > 0n ? Number((totalFamilyAssets * 10000n) / totalAssets) / 100 : 0;

    // Calculate weighted average APY
    const weightedApy = calculateWeightedApy(allMarkets, totalFamilyAssets);

    return {
      familyLabel: megaFamilyLabel,
      familyLogo: megaFamily?.logo || '/assets/kHYPE-TokenIcon.png',
      description: megaFamily?.description || 'Token family allocation',
      descriptionKey: megaFamily?.descriptionKey || 'family.default.description',
      totalAssets: totalFamilyAssets,
      totalUsd: totalFamilyUsd > 0 ? totalFamilyUsd : null,
      weightedApy,
      marketCount: allMarkets.length,
      markets: allMarkets.sort((a, b) => {
        // Sort markets within family by USD value, then by assets
        if (a.usd != null && b.usd != null) return b.usd - a.usd;
        if (a.usd != null) return -1;
        if (b.usd != null) return 1;
        return b.assets > a.assets ? 1 : b.assets < a.assets ? -1 : 0;
      }),
      percentage,
      isExpanded: false,
      megaFamily: megaFamilyLabel,
      subFamilies: subFamilyLabels,
    };
  });

  // Sort grouped items by total USD value, then by total assets
  groupedItems.sort((a, b) => {
    if (a.totalUsd != null && b.totalUsd != null) return b.totalUsd - a.totalUsd;
    if (a.totalUsd != null) return -1;
    if (b.totalUsd != null) return 1;
    return b.totalAssets > a.totalAssets ? 1 : b.totalAssets < a.totalAssets ? -1 : 0;
  });

  // Calculate totals
  const totalGroupedAssets = groupedItems.reduce((sum, group) => sum + group.totalAssets, 0n);
  const totalUngroupedAssets = ungroupedItems.reduce((sum, item) => sum + item.assets, 0n);

  return {
    groupedItems,
    ungroupedItems,
    totalGroupedAssets,
    totalUngroupedAssets,
  };
}

/**
 * Find the family that contains the given market ID
 */
function findFamilyForMarket(marketId: `0x${string}`, itemLabel?: string): { label: string; logo: string } | null {
  // Special case: If this is an idle allocation (contains "Idle"), 
  // determine the family based on the loan token
  if (itemLabel?.includes("Idle")) {
    const loanToken = itemLabel.split(" / ")[0]; // Extract loan token from "TOKEN / Idle"
    return findFamilyByTokenSymbol(loanToken);
  }
  
  for (const family of TOKEN_GROUPS) {
    if ((family.ids as readonly string[]).includes(marketId)) {
      return { label: family.label, logo: family.logo };
    }
  }
  return null;
}

/**
 * Find family by token symbol (for idle allocations)
 */
function findFamilyByTokenSymbol(tokenSymbol: string): { label: string; logo: string } | null {
  // Map common token symbols to their families
  const symbolToFamily: Record<string, { label: string; logo: string }> = {
    // HYPE ecosystem
    'WHYPE': { label: 'WHYPE', logo: '/assets/WHYPE-TokenIcon.jpg' },
    'kHYPE': { label: 'kHYPE', logo: '/assets/kHYPE-TokenIcon.png' },
    'wstHYPE': { label: 'wstHYPE', logo: '/assets/wstHYPE-TokenIcon.svg' },
    'hbHYPE': { label: 'hbHYPE', logo: '/assets/kHYPE-TokenIcon.png' },
    'beHYPE': { label: 'beHYPE', logo: '/assets/kHYPE-TokenIcon.png' },
    'dnHYPE': { label: 'dnHYPE', logo: 'public/dnHYPE-TokenIcon.svg' },
    'PT-kHYPE-13NOV2025': { label: 'PT-kHYPE-13NOV2025', logo: '/assets/kHYPE-TokenIcon.png' },
    // Other tokens
    'USDT0': { label: 'USDT0', logo: '/assets/USDT0-TokenIcon.png' },
    'BTC': { label: 'BTC', logo: '/assets/BTC-TokenIcon.svg' },
    'ETH': { label: 'ETH', logo: '/assets/ETH-TokenIcon.svg' },
    'thBILL': { label: 'thBILL', logo: '/assets/thBILL-TokenIcon.png' },
  };
  
  return symbolToFamily[tokenSymbol] || null;
}

/**
 * Find the mega-family that contains the given family label
 */
function findMegaFamilyForFamily(familyLabel: string): string | null {
  for (const [megaFamilyLabel, megaFamily] of Object.entries(MEGA_FAMILIES)) {
    if ((megaFamily.families as readonly string[]).includes(familyLabel)) {
      return megaFamilyLabel;
    }
  }
  return null;
}

/**
 * Calculate weighted average APY for a group of markets
 * Formula: Σ(apy_i * weight_i) / Σ(weight_i)
 * Where weight_i = assets_i / total_family_assets
 */
function calculateWeightedApy(markets: AllocationItem[], totalFamilyAssets: bigint): number {
  if (totalFamilyAssets === 0n || markets.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  markets.forEach(market => {
    if (market.supplyApy != null && market.supplyApy > 0) {
      const weight = Number(market.assets) / Number(totalFamilyAssets);
      weightedSum += market.supplyApy * weight;
      totalWeight += weight;
    }
  });

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Toggle expansion state for a grouped allocation
 */
export function toggleGroupExpansion(
  groupedItems: GroupedAllocation[],
  familyLabel: string
): GroupedAllocation[] {
  return groupedItems.map(group => 
    group.familyLabel === familyLabel 
      ? { ...group, isExpanded: !group.isExpanded }
      : group
  );
}

/**
 * Expand all groups
 */
export function expandAllGroups(groupedItems: GroupedAllocation[]): GroupedAllocation[] {
  return groupedItems.map(group => ({ ...group, isExpanded: true }));
}

/**
 * Collapse all groups
 */
export function collapseAllGroups(groupedItems: GroupedAllocation[]): GroupedAllocation[] {
  return groupedItems.map(group => ({ ...group, isExpanded: false }));
}

/**
 * Groups allocation items by protocol (for HypAirdrop vault)
 * Uses protocol information from AllocationItem to group by protocol name
 */
export function groupAllocationsByProtocol(
  items: AllocationItem[],
  totalAssets: bigint
): ProtocolAllocationGroupingResult {
  const protocolMap = new Map<string, {
    protocolName: string;
    protocolKey: string;
    protocolLogo: string | null;
    markets: AllocationItem[];
  }>();
  const ungroupedItems: AllocationItem[] = [];
  
  // Group items by protocol
  items.forEach(item => {
    if (item.protocol && item.protocolKey) {
      const key = item.protocolKey.toLowerCase();
      if (!protocolMap.has(key)) {
        protocolMap.set(key, {
          protocolName: item.protocol,
          protocolKey: item.protocolKey,
          protocolLogo: null, // Will be set from first item if available
          markets: [],
        });
      }
      const protocolGroup = protocolMap.get(key)!;
      protocolGroup.markets.push(item);
      // Use logo from first item if available (protocol logos not in AllocationItem yet)
    } else {
      // Item without protocol info, keep as ungrouped
      ungroupedItems.push(item);
    }
  });

  // Convert protocol map to ProtocolGroupedAllocation objects
  const groupedItems: ProtocolGroupedAllocation[] = Array.from(protocolMap.values()).map((protocolData) => {
    const { protocolName, protocolKey, markets } = protocolData;

    // Calculate aggregated metrics
    const totalProtocolAssets = markets.reduce((sum, market) => sum + market.assets, 0n);
    const totalProtocolUsd = markets.reduce((sum, market) => sum + (market.usd || 0), 0);
    const percentage = totalAssets > 0n ? Number((totalProtocolAssets * 10000n) / totalAssets) / 100 : 0;

    // Calculate weighted average APY
    const weightedApy = calculateWeightedApy(markets, totalProtocolAssets);

    // Try to get protocol logo from first market's logo (if protocol-specific logo exists)
    // For now, use null - can be enhanced later with protocol logo mapping
    const protocolLogo = null;

    return {
      protocolName,
      protocolKey,
      protocolLogo,
      totalAssets: totalProtocolAssets,
      totalUsd: totalProtocolUsd > 0 ? totalProtocolUsd : null,
      weightedApy,
      marketCount: markets.length,
      markets: markets.sort((a, b) => {
        // Sort markets within protocol by USD value, then by assets
        if (a.usd != null && b.usd != null) return b.usd - a.usd;
        if (a.usd != null) return -1;
        if (b.usd != null) return 1;
        return b.assets > a.assets ? 1 : b.assets < a.assets ? -1 : 0;
      }),
      percentage,
      isExpanded: false,
    };
  });

  // Sort grouped items by total USD value, then by total assets
  groupedItems.sort((a, b) => {
    if (a.totalUsd != null && b.totalUsd != null) return b.totalUsd - a.totalUsd;
    if (a.totalUsd != null) return -1;
    if (b.totalUsd != null) return 1;
    return b.totalAssets > a.totalAssets ? 1 : b.totalAssets < a.totalAssets ? -1 : 0;
  });

  // Calculate totals
  const totalGroupedAssets = groupedItems.reduce((sum, group) => sum + group.totalAssets, 0n);
  const totalUngroupedAssets = ungroupedItems.reduce((sum, item) => sum + item.assets, 0n);

  return {
    groupedItems,
    ungroupedItems,
    totalGroupedAssets,
    totalUngroupedAssets,
  };
}

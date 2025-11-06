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
  assets: bigint; // For compatibility with existing code (calculated from balance)
  label: string;
  pct: number;
  usd?: number | null;
  supplyApy?: number | null;
  logo?: string | null;
  // Octav-specific fields (optional, for HypAirdrop vaults)
  balanceString?: string; // Original readable balance from Octav (e.g., "1083.17083")
  originalSymbol?: string; // Original symbol from Octav (e.g., "usd₮0", not uppercased)
  protocolKey?: string; // Protocol key from Octav (e.g., "wallet", "hyperbeat")
  protocolName?: string; // Protocol display name (e.g., "Wallet", "Hyperbeat")
  protocolLogo?: string | null; // Protocol logo URL
  chainKey?: string; // Chain key (e.g., "hyperevm")
  positionType?: string; // Position type (e.g., "WALLET", "YIELD")
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

/**
 * Group allocations for Lagoon vaults (like HypAirdrop) by protocol (wallet, hyperbeat, etc.)
 * Creates a "Liquidity" group for idle tokens (wallet protocol)
 * 
 * @param items - Allocation items from Octav API
 * @returns Grouped allocations with protocol-based grouping
 */
export function groupLagoonAllocations(
  items: AllocationItem[]
): AllocationGroupingResult {
  // Separate idle tokens (wallet protocol) from protocol tokens
  const liquidityItems: AllocationItem[] = [];
  const protocolItems: AllocationItem[] = [];
  
  console.log(`[GroupAllocationsByProtocol] Processing ${items.length} items`);
  
  items.forEach((item) => {
    // Check if it's from wallet protocol (idle tokens)
    // Also include items without protocolKey or with 'unknown' protocolKey as liquidity
    const isWallet = item.protocolKey === 'wallet' || 
                     item.positionType === 'WALLET' || 
                     !item.protocolKey || 
                     item.protocolKey === 'unknown';
    
    if (isWallet) {
      liquidityItems.push(item);
      console.log(`[GroupAllocationsByProtocol] Item ${item.label} (protocolKey: ${item.protocolKey}, positionType: ${item.positionType}) -> Liquidity`);
    } else {
      protocolItems.push(item);
      console.log(`[GroupAllocationsByProtocol] Item ${item.label} (protocolKey: ${item.protocolKey}, protocolName: ${item.protocolName}) -> Protocol`);
    }
  });
  
  console.log(`[GroupAllocationsByProtocol] Liquidity items: ${liquidityItems.length}, Protocol items: ${protocolItems.length}`);

  // Group protocol items by protocol
  const protocolMap = new Map<string, AllocationItem[]>();
  
  protocolItems.forEach((item) => {
    // Should not reach here if protocolKey is missing, but double-check
    const protocolKey = item.protocolKey;
    if (!protocolKey || protocolKey === 'unknown') {
      // Fallback: add to liquidity if somehow missing
      liquidityItems.push(item);
      return;
    }
    if (!protocolMap.has(protocolKey)) {
      protocolMap.set(protocolKey, []);
    }
    protocolMap.get(protocolKey)!.push(item);
  });

  // Calculate total USD for percentage calculations
  const totalPortfolioUsd = items.reduce((sum, item) => sum + (item.usd || 0), 0);

  // Create grouped items
  const groupedItems: GroupedAllocation[] = [];

  // Add Liquidity group if there are idle items (always create this group for wallet tokens)
  if (liquidityItems.length > 0) {
    const totalLiquidityUsd = liquidityItems.reduce((sum, item) => sum + (item.usd || 0), 0);
    const totalLiquidityAssets = liquidityItems.reduce((sum, item) => sum + item.assets, 0n);
    const liquidityPercentage = totalPortfolioUsd > 0 ? (totalLiquidityUsd / totalPortfolioUsd) * 100 : 0;

    console.log(`[GroupAllocationsByProtocol] Creating Liquidity group with ${liquidityItems.length} items, total USD: $${totalLiquidityUsd}`);

    groupedItems.push({
      familyLabel: 'Liquidity',
      familyLogo: '', // No logo for liquidity group (empty string)
      description: '', // No description
      descriptionKey: '',
      totalAssets: totalLiquidityAssets,
      totalUsd: totalLiquidityUsd > 0 ? totalLiquidityUsd : null,
      weightedApy: 0, // No APY for idle tokens
      marketCount: liquidityItems.length,
      markets: liquidityItems,
      percentage: liquidityPercentage,
      isExpanded: false,
    });
  } else {
    console.warn(`[GroupAllocationsByProtocol] No liquidity items found, but expected wallet tokens`);
  }

  // Add protocol groups (only if protocolMap has items after filtering)
  protocolMap.forEach((protocolAssets, protocolKey) => {
    // Skip if protocolKey is missing or 'unknown' (should have been caught earlier, but double-check)
    if (!protocolKey || protocolKey === 'unknown') {
      console.warn(`[GroupAllocationsByProtocol] Skipping invalid protocol key: ${protocolKey}`);
      return;
    }
    
    const firstItem = protocolAssets[0];
    const protocolName = firstItem.protocolName || protocolKey;
    const protocolLogo = firstItem.protocolLogo || null;
    
    const totalProtocolUsd = protocolAssets.reduce((sum, item) => sum + (item.usd || 0), 0);
    const totalProtocolAssets = protocolAssets.reduce((sum, item) => sum + item.assets, 0n);
    const protocolPercentage = totalPortfolioUsd > 0 ? (totalProtocolUsd / totalPortfolioUsd) * 100 : 0;

    groupedItems.push({
      familyLabel: protocolName,
      familyLogo: protocolLogo || '/assets/default-protocol.png', // Use protocol logo or default
      description: '', // No description
      descriptionKey: '',
      totalAssets: totalProtocolAssets,
      totalUsd: totalProtocolUsd > 0 ? totalProtocolUsd : null,
      weightedApy: 0, // Octav doesn't provide APY
      marketCount: protocolAssets.length,
      markets: protocolAssets,
      percentage: protocolPercentage,
      isExpanded: false,
    });
  });

  // Sort by USD value (descending)
  groupedItems.sort((a, b) => {
    if (a.totalUsd != null && b.totalUsd != null) return b.totalUsd - a.totalUsd;
    if (a.totalUsd != null) return -1;
    if (b.totalUsd != null) return 1;
    return b.totalAssets > a.totalAssets ? 1 : -1;
  });

  // Calculate totals
  const totalGroupedAssets = groupedItems.reduce((sum, group) => sum + group.totalAssets, 0n);
  const totalUngroupedAssets = 0n; // All items are grouped by protocol

  return {
    groupedItems,
    ungroupedItems: [], // All items are grouped
    totalGroupedAssets,
    totalUngroupedAssets,
  };
}

/**
 * Groups allocations for Morpho vaults by token families (HYPE, Stables, BTC, etc.)
 * Uses TOKEN_GROUPS configuration and supports mega-families for higher-level grouping
 * 
 * @param items - Allocation items from Morpho GraphQL API
 * @param totalAssets - Total assets in the vault (for percentage calculations)
 * @returns Grouped allocations with family-based grouping
 */
export function groupMorphoAllocations(
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
    
    // Calculate percentage based on USD value (not raw asset balance) for accurate representation
    // Sum all USD values from all items (grouped + ungrouped) to get total portfolio value
    const totalPortfolioUsd = items.reduce((sum, item) => sum + (item.usd || 0), 0);
    const percentage = totalPortfolioUsd > 0 ? (totalFamilyUsd / totalPortfolioUsd) * 100 : 0;

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

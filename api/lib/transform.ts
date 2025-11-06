// api/lib/transform.ts
// Transform Octav API response to AllocationItem format
// Preserves Octav's original data format and extracts protocol metadata

import type { AllocationItem } from '../../src/lib/allocation-grouper.js';
import type { OctavPortfolioResponse, OctavAsset } from './octav.js';

/**
 * Asset with protocol context extracted from Octav response
 */
interface AssetWithContext extends OctavAsset {
  protocolKey: string;
  protocolName: string;
  protocolLogo: string | null;
  chainKey: string;
  positionType: string;
}

/**
 * Extract all assets from Octav portfolio response with protocol context
 * Navigates through: assetByProtocols -> chains -> protocolPositions -> assets
 * Preserves protocol metadata (key, name, logo) for each asset
 */
export function extractAssetsFromOctavPortfolio(
  portfolio: OctavPortfolioResponse
): AssetWithContext[] {
  const allAssets: AssetWithContext[] = [];

  console.log(`[Transform] Extracting assets from portfolio for ${portfolio.address}`);
  console.log(`[Transform] Protocol keys:`, portfolio.assetByProtocols ? Object.keys(portfolio.assetByProtocols) : 'none');

  // Iterate through all protocols
  for (const protocolKey in portfolio.assetByProtocols) {
    const protocol = portfolio.assetByProtocols[protocolKey];
    const protocolName = protocol.name || protocolKey;
    const protocolLogo = protocol.imgSmall || protocol.imgLarge || null;
    
    console.log(`[Transform] Processing protocol: ${protocolKey} (${protocolName})`);
    
    // Iterate through all chains in the protocol
    for (const chainKey in protocol.chains) {
      const chain = protocol.chains[chainKey];
      console.log(`[Transform] Processing chain: ${chainKey} (${chain.name})`);
      
      // Iterate through all protocol positions (e.g., WALLET, YIELD, etc.)
      for (const positionKey in chain.protocolPositions) {
        const position = chain.protocolPositions[positionKey];
        console.log(`[Transform] Processing position: ${positionKey}, assets: ${position.assets?.length || 0}`);
        
        // Extract assets from this position with protocol context
        if (position.assets && Array.isArray(position.assets)) {
          console.log(`[Transform] Found ${position.assets.length} assets in position ${positionKey}`);
          position.assets.forEach((asset) => {
            allAssets.push({
              ...asset,
              protocolKey,
              protocolName,
              protocolLogo,
              chainKey,
              positionType: positionKey,
            });
          });
        }
        
        // Also check nested protocolPositions (e.g., farming pools, lending positions)
        if (position.protocolPositions && Array.isArray(position.protocolPositions)) {
          for (const nestedPosition of position.protocolPositions) {
            // Extract from nested assets
            if (nestedPosition.assets && Array.isArray(nestedPosition.assets)) {
              nestedPosition.assets.forEach((asset) => {
                allAssets.push({
                  ...asset,
                  protocolKey,
                  protocolName,
                  protocolLogo,
                  chainKey,
                  positionType: positionKey,
                });
              });
            }
            
            // Check supply assets (for lending protocols)
            if (nestedPosition.supplyAssets && Array.isArray(nestedPosition.supplyAssets)) {
              nestedPosition.supplyAssets.forEach((asset) => {
                allAssets.push({
                  ...asset,
                  protocolKey,
                  protocolName,
                  protocolLogo,
                  chainKey,
                  positionType: positionKey,
                });
              });
            }
            
            // Check reward assets
            if (nestedPosition.rewardAssets && Array.isArray(nestedPosition.rewardAssets)) {
              nestedPosition.rewardAssets.forEach((asset) => {
                allAssets.push({
                  ...asset,
                  protocolKey,
                  protocolName,
                  protocolLogo,
                  chainKey,
                  positionType: positionKey,
                });
              });
            }
          }
        }
      }
    }
  }

  console.log(`[Transform] Extracted ${allAssets.length} total assets from portfolio`);
  return allAssets;
}

/**
 * Transform Octav assets (with protocol context) to AllocationItem format
 * Preserves Octav's original data format and only converts to BigInt when necessary
 */
export function transformOctavAssetsToAllocations(
  assets: AssetWithContext[]
): AllocationItem[] {
  // Calculate total value for percentage calculation (using Octav's pre-calculated values)
  let totalValue = 0;
  const assetValues: Map<string, number> = new Map();

  // First pass: calculate total value using Octav's USD values
  assets.forEach((asset) => {
    const value = parseFloat(asset.value || '0');
    if (value > 0) {
      totalValue += value;
      // Use chainContract as unique identifier (includes chain:address)
      assetValues.set(asset.chainContract.toLowerCase(), value);
    }
  });

  // Second pass: create AllocationItem objects
  const allocations: AllocationItem[] = [];
  const seenContracts = new Set<string>();

  assets.forEach((asset) => {
    // Skip if we've already processed this contract (deduplicate by chainContract)
    const contractKey = asset.chainContract.toLowerCase();
    if (seenContracts.has(contractKey)) {
      return;
    }
    seenContracts.add(contractKey);

    try {
      // Use Octav's pre-calculated USD value (already formatted as number string)
      const valueUsd = parseFloat(asset.value || '0');
      
      // No dust filtering - show all allocations including small ones like Hyperbeat

      // Calculate percentage using Octav's USD values
      const pct = totalValue > 0 ? (valueUsd / totalValue) * 100 : 0;

      // Extract contract address from chainContract (format: "chain:address")
      const contractAddress = asset.contract || contractKey.split(':').pop() || contractKey;
      
      // Preserve Octav's original symbol format (don't uppercase)
      const originalSymbol = asset.symbol || asset.name || 'UNKNOWN';
      // Use original symbol for label (keep Octav's formatting)
      const label = originalSymbol;

      // Use Octav's imgSmall or imgLarge directly (preferred order)
      // Log for debugging if logo is missing
      const logo = asset.imgSmall || asset.imgLarge || null;
      if (!logo) {
        console.log(`[Transform] Missing logo for ${label} (${contractAddress}):`, {
          hasImgSmall: !!asset.imgSmall,
          hasImgLarge: !!asset.imgLarge,
          assetKeys: Object.keys(asset).filter(k => k.toLowerCase().includes('img') || k.toLowerCase().includes('logo')),
          sampleAsset: JSON.stringify(asset).substring(0, 200),
        });
      }

      // Preserve Octav's original balance string (human-readable format)
      const balanceString = asset.balance || '0';
      
      // Convert balance to BigInt only for compatibility with existing code
      // Octav provides balance as readable string (e.g., "1083.17083"), we need BigInt for calculations
      // But we preserve the original string for display
      const decimals = parseInt(asset.decimal || '18', 10);
      const [integerPart, decimalPart = ''] = balanceString.split('.');
      const paddedDecimal = (decimalPart || '').padEnd(decimals, '0').substring(0, decimals);
      const assetsBigInt = BigInt(integerPart + paddedDecimal);

      allocations.push({
        id: contractAddress.toLowerCase() as `0x${string}`,
        assets: assetsBigInt, // For compatibility with existing code
        label,
        pct,
        usd: valueUsd > 0 ? valueUsd : null,
        supplyApy: null, // Octav doesn't provide APY in portfolio endpoint
        logo,
        // Octav-specific fields - preserve original data
        balanceString, // Original readable balance from Octav
        originalSymbol, // Original symbol (not uppercased)
        protocolKey: asset.protocolKey,
        protocolName: asset.protocolName,
        protocolLogo: asset.protocolLogo,
        chainKey: asset.chainKey,
        positionType: asset.positionType,
      });
    } catch (error) {
      console.warn(`[Transform] Failed to transform asset ${asset.chainContract}:`, error, asset);
    }
  });

  // Sort by USD value (descending) - using Octav's pre-calculated values
  allocations.sort((a, b) => {
    if (a.usd != null && b.usd != null) return b.usd - a.usd;
    if (a.usd != null) return -1;
    if (b.usd != null) return 1;
    return b.assets > a.assets ? 1 : -1;
  });

  console.log(
    `[Transform] Transformed ${assets.length} assets into ${allocations.length} allocations (total value: $${totalValue.toFixed(2)})`
  );

  return allocations;
}

/**
 * Transform full Octav portfolio response to AllocationItem array
 * Preserves all Octav metadata and original data formats
 */
export function transformOctavPortfolioToAllocations(
  portfolios: OctavPortfolioResponse[]
): AllocationItem[] {
  if (portfolios.length === 0) {
    console.warn('[Transform] No portfolios provided');
    return [];
  }

  // Combine assets from all portfolios (usually just one) with protocol context
  const allAssets: AssetWithContext[] = [];
  portfolios.forEach((portfolio) => {
    const assets = extractAssetsFromOctavPortfolio(portfolio);
    allAssets.push(...assets);
  });

  return transformOctavAssetsToAllocations(allAssets);
}


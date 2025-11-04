import { Redis } from '@upstash/redis';
import type { AllocationItem } from '../../../src/lib/allocation-grouper';

export const runtime = 'edge';

// Initialize Upstash Redis client
// Supports both UPSTASH_REDIS_* and KV_REST_API_* naming conventions
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

// HypAirdrop curator address
const HYP_AIRDROP_VAULT = '0x8Ec77176F71F5ff53B71b01FC492F46Ea4e55A77';

interface OctavAsset {
  balance: string;
  chainContract: string;
  chainKey: string;
  contract: string;
  decimal: string;
  name: string;
  openPnl?: string;
  price: string;
  symbol: string;
  totalCostBasis?: string;
  value: string;
}

interface OctavProtocolPosition {
  assets: OctavAsset[];
  borrowAssets?: OctavAsset[];
  dexAssets?: OctavAsset[];
  healthRate?: string;
  name: string;
  rewardAssets?: OctavAsset[];
  supplyAssets?: OctavAsset[];
  totalCostBasis?: string;
  totalClosedPnl?: string;
  totalOpenPnl?: string;
  unlockAt?: string;
  vaultAddress?: string;
  poolAddress?: string;
  value: string;
}

interface OctavPositionType {
  assets: OctavAsset[];
  name: string;
  protocolPositions: OctavProtocolPosition[];
  totalCostBasis?: string;
  totalOpenPnl?: string;
  totalValue: string;
  unlockAt?: string;
}

interface OctavChain {
  name: string;
  key: string;
  value: string;
  totalCostBasis?: string;
  totalClosedPnl?: string;
  totalOpenPnl?: string;
  protocolPositions?: {
    [positionType: string]: OctavPositionType;
  };
}

interface OctavProtocol {
  name: string;
  key: string;
  value: string;
  totalCostBasis?: string;
  totalClosedPnl?: string;
  totalOpenPnl?: string;
  chains?: {
    [chainKey: string]: OctavChain;
  };
}

interface OctavPortfolioResponse {
  address: string;
  assetByProtocols?: {
    [protocolKey: string]: OctavProtocol;
  };
}

/**
 * Parse Octav API response and convert to AllocationItem format
 * Structure: assetByProtocols -> chains -> protocolPositions -> protocolPositions[] -> assets
 */
function parseOctavResponse(data: OctavPortfolioResponse[]): AllocationItem[] {
  const allocations: AllocationItem[] = [];

  // Find the vault in the response
  const vaultData = data.find((item) => 
    item.address.toLowerCase() === HYP_AIRDROP_VAULT.toLowerCase()
  );

  if (!vaultData || !vaultData.assetByProtocols) {
    return allocations;
  }

  // Calculate total USD value for percentage calculation
  let totalUsdValue = 0;

  // Iterate through protocols
  Object.entries(vaultData.assetByProtocols).forEach(([protocolKey, protocolData]) => {
    // Skip "wallet" protocol as it's not a DeFi protocol
    if (protocolKey === 'wallet') return;
    
    if (!protocolData.chains) return;

    // Iterate through chains (usually just one for HyperEVM)
    Object.values(protocolData.chains).forEach((chain) => {
      if (!chain.protocolPositions) return;

      // Iterate through protocol position types (e.g., "FARMING", "LENDING", etc.)
      Object.values(chain.protocolPositions).forEach((positionType) => {
        // Check if this position type has nested protocolPositions array
        if (positionType.protocolPositions && Array.isArray(positionType.protocolPositions)) {
          // Iterate through individual protocol positions
          positionType.protocolPositions.forEach((position) => {
            // Extract assets from different arrays
            const allAssets = [
              ...(position.assets || []),
              ...(position.supplyAssets || []),
              ...(position.rewardAssets || []),
            ];

            allAssets.forEach((asset) => {
              try {
                const balance = parseFloat(asset.balance || '0');
                const decimals = parseInt(asset.decimal || '18', 10);
                const assets = BigInt(Math.floor(balance * Math.pow(10, decimals)));
                const usdValue = parseFloat(asset.value || '0');
                totalUsdValue += usdValue;

                allocations.push({
                  id: asset.contract.toLowerCase() as `0x${string}`,
                  assets,
                  label: asset.symbol.toUpperCase(),
                  pct: 0, // Will be calculated after total is known
                  usd: usdValue > 0 ? usdValue : null,
                  supplyApy: null, // APY not available in Octav response
                  logo: null, // Logo would need to be fetched separately
                  protocol: protocolData.name,
                  protocolKey: protocolKey,
                });
              } catch (err) {
                console.warn('Failed to parse asset:', asset, err);
              }
            });
          });
        } else {
          // Direct assets at position type level
          const allAssets = [
            ...(positionType.assets || []),
          ];

          allAssets.forEach((asset) => {
            try {
              const balance = parseFloat(asset.balance || '0');
              const decimals = parseInt(asset.decimal || '18', 10);
              const assets = BigInt(Math.floor(balance * Math.pow(10, decimals)));
              const usdValue = parseFloat(asset.value || '0');
              totalUsdValue += usdValue;

              allocations.push({
                id: asset.contract.toLowerCase() as `0x${string}`,
                assets,
                label: asset.symbol.toUpperCase(),
                pct: 0, // Will be calculated after total is known
                usd: usdValue > 0 ? usdValue : null,
                supplyApy: null, // APY not available in Octav response
                logo: null, // Logo would need to be fetched separately
                protocol: protocolData.name,
                protocolKey: protocolKey,
              });
            } catch (err) {
              console.warn('Failed to parse asset:', asset, err);
            }
          });
        }
      });
    });
  });

  // Calculate percentages
  if (totalUsdValue > 0) {
    allocations.forEach((alloc) => {
      if (alloc.usd != null) {
        alloc.pct = (alloc.usd / totalUsdValue) * 100;
      }
    });
  }

  // Filter out dust (<0.01%) and sort by USD value
  return allocations
    .filter((a) => a.pct >= 0.01)
    .sort((a, b) => {
      if (a.usd != null && b.usd != null) return b.usd - a.usd;
      if (a.usd != null) return -1;
      if (b.usd != null) return 1;
      return b.assets > a.assets ? 1 : -1;
    });
}

export async function GET(request: Request) {
  // Verify this is a cron request from Vercel
  // Vercel Cron sends requests with a specific header
  const cronSecret = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;
  
  // Allow requests without auth in development, but require it in production
  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const apiKey = process.env.OCTAV_API_KEY;
    if (!apiKey) {
      console.error('OCTAV_API_KEY not configured');
      return Response.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Fetch from Octav API
    const response = await fetch(
      `https://api.octav.fi/v1/portfolio?addresses=${HYP_AIRDROP_VAULT}&includeImages=true`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`Octav API error: ${response.status} ${response.statusText}`);
      return Response.json(
        { error: `Octav API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json() as OctavPortfolioResponse[];
    
    // Parse and transform to AllocationItem format
    const allocations = parseOctavResponse(data);
    
    // Store in Redis
    const cacheKey = `octav:allocations:${HYP_AIRDROP_VAULT.toLowerCase()}`;
    const metaKey = `octav:allocations:${HYP_AIRDROP_VAULT.toLowerCase()}:meta`;
    const lastUpdated = Date.now();

    // Set with expiration (2 days = 86400 * 2 seconds)
    await redis.set(cacheKey, allocations, { ex: 86400 * 2 });
    await redis.set(metaKey, { lastUpdated }, { ex: 86400 * 2 });

    return Response.json({
      success: true,
      allocationsCount: allocations.length,
      lastUpdated,
    });
  } catch (error) {
    console.error('Error updating allocations:', error);
    return Response.json(
      { error: 'Failed to update allocations', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


// api/lib/octav.ts
// Octav API client for fetching portfolio data

const OCTAV_API_BASE = 'https://api.octav.fi/v1';

export interface OctavPortfolioResponse {
  address: string;
  cashBalance: string;
  closedPnl: string;
  dailyIncome: string;
  dailyExpense: string;
  fees: string;
  feesFiat: string;
  lastUpdated: string;
  openPnl: string;
  networth: string;
  totalCostBasis: string;
  assetByProtocols: {
    [protocolKey: string]: {
      name: string;
      key: string;
      value: string;
      totalCostBasis: string;
      totalClosedPnl: string;
      totalOpenPnl: string;
      imgSmall?: string; // Protocol logo (small)
      imgLarge?: string; // Protocol logo (large)
      chains: {
        [chainKey: string]: {
          name: string;
          key: string;
          value: string;
          totalCostBasis: string;
          totalClosedPnl: string;
          totalOpenPnl: string;
          protocolPositions: {
            [positionKey: string]: {
              assets: OctavAsset[];
              name: string;
              protocolPositions: any[];
              totalOpenPnl: string;
              totalCostBasis: string;
              totalValue: string;
              unlockAt: string;
            };
          };
        };
      };
    };
  };
  chains: {
    [chainKey: string]: {
      name: string;
      key: string;
      chainId: string;
      value: string;
      valuePercentile: string;
      totalCostBasis: string;
      totalClosedPnl: string;
      totalOpenPnl: string;
    };
  };
}

export interface OctavAsset {
  balance: string; // Human-readable balance (e.g., "1083.17083")
  chainContract: string; // Format: "chain:address" (e.g., "hyperevm:0x...")
  chainKey: string; // Chain identifier (e.g., "hyperevm")
  contract: string; // Contract address (e.g., "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb")
  decimal: string; // Token decimals as string (e.g., "6", "18")
  name: string; // Token name (e.g., "usd₮0")
  openPnl: string; // Open PnL (usually "N/A")
  price: string; // Token price in USD (e.g., "0.99942")
  symbol: string; // Token symbol (e.g., "usd₮0", "hype")
  totalCostBasis: string; // Cost basis (usually "N/A")
  value: string; // USD value as string (e.g., "1082.5425909186")
  // Logo fields - use imgSmall or imgLarge directly
  imgSmall?: string; // Small logo URL (preferred)
  imgLarge?: string; // Large logo URL (fallback)
  // Legacy logo fields (for compatibility)
  logo?: string;
  logoURI?: string;
  image?: string;
  img?: string;
}

/**
 * Fetch portfolio data from Octav API
 * @param curatorAddress The address to fetch portfolio for
 * @param includeImages Whether to include image URLs
 * @returns Portfolio response array (usually single item)
 */
export async function fetchOctavPortfolio(
  curatorAddress: string,
  includeImages: boolean = true
): Promise<OctavPortfolioResponse[]> {
  const apiKey = process.env.OCTAV_API_KEY || process.env.VITE_OCTAV_API_KEY;
  
  if (!apiKey) {
    throw new Error('Octav API key not configured. Set OCTAV_API_KEY environment variable.');
  }

  const url = `${OCTAV_API_BASE}/portfolio?addresses=${curatorAddress}&includeImages=${includeImages}`;
  
  console.log(`[Octav] Fetching portfolio for address: ${curatorAddress}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Octav] API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Octav API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Octav returns an array of portfolio objects
    if (!Array.isArray(data)) {
      console.warn('[Octav] Expected array response, got:', typeof data);
      return [];
    }

    console.log(`[Octav] Successfully fetched portfolio data (${data.length} address(es))`);
    
    // Find the portfolio for the requested address
    const portfolio = data.find((p: OctavPortfolioResponse) => 
      p.address.toLowerCase() === curatorAddress.toLowerCase()
    );

    if (!portfolio) {
      console.warn(`[Octav] No portfolio found for address ${curatorAddress}`);
      return [];
    }

    // Log portfolio structure for debugging
    console.log(`[Octav] Portfolio structure:`, {
      hasAssetByProtocols: !!portfolio.assetByProtocols,
      protocolCount: portfolio.assetByProtocols ? Object.keys(portfolio.assetByProtocols).length : 0,
      hasChains: !!portfolio.chains,
      chainCount: portfolio.chains ? Object.keys(portfolio.chains).length : 0,
      cashBalance: portfolio.cashBalance,
      networth: portfolio.networth,
      protocolKeys: portfolio.assetByProtocols ? Object.keys(portfolio.assetByProtocols) : [],
    });

    return [portfolio];
  } catch (error) {
    console.error('[Octav] Error fetching portfolio:', error);
    throw error;
  }
}


import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { CHAIN_IDS } from '../lib/lifi-config';
import { getTokens, getTokenBalances, getToken, ChainType } from '@lifi/sdk';
import { formatUnits } from 'viem';

// Utility function to format USD values with comma separators for display only
const formatUSD = (value: string | number): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '0.00';
  return numValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

interface TokenBalance {
  chainId: number;
  chainName: string;
  tokenSymbol: string;
  tokenAddress: string;
  balance: string;
  balanceFormatted: string;
  decimals: number;
  logoURI?: string;
  priceUSD?: string;
  balanceUSD?: string;
}

interface BalanceFetcherProps {
  onTokenSelect: (tokenInfo: TokenBalance) => void;
  onAmountEnter: (amount: string) => void;
  onExecute: () => void;
  selectedToken: TokenBalance | null;
  amount: string;
  isExecuting: boolean;
  underlyingBalance?: TokenBalance | null;
  underlyingLoading?: boolean;
  underlyingSymbol?: string;
  currentStep: number;
  onStepChange: (step: number) => void;
}

const CHAIN_INFO = {
  [CHAIN_IDS.ETHEREUM]: { name: 'Ethereum', nativeSymbol: 'ETH' },
  [CHAIN_IDS.ARBITRUM]: { name: 'Arbitrum', nativeSymbol: 'ETH' },
  [CHAIN_IDS.BASE]: { name: 'Base', nativeSymbol: 'ETH' },
  [CHAIN_IDS.OPTIMISM]: { name: 'Optimism', nativeSymbol: 'ETH' },
  [CHAIN_IDS.BSC]: { name: 'BSC', nativeSymbol: 'BNB' },
  [CHAIN_IDS.HYPEREVM]: { name: 'HyperEVM', nativeSymbol: 'USDT0' },
} as const;

export const LiFiBalanceFetcher = ({ 
  onTokenSelect, 
  onAmountEnter, 
  onExecute, 
  selectedToken, 
  amount, 
  isExecuting,
  underlyingBalance,
  underlyingLoading,
  underlyingSymbol = 'USDT0',
  currentStep,
  onStepChange
}: BalanceFetcherProps) => {
  const { address } = useAccount();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gasFees, setGasFees] = useState<{
    standard: number;
    fast: number;
    fastest: number;
    lastUpdated: number;
  } | null>(null);

  // Fetch all balances using Li.Fi's getTokenBalances function
  const fetchAllBalancesWithLifi = async () => {
    if (!address) return [];

    try {
      // Get all available tokens from Li.Fi
      const tokensResponse = await getTokens({
        chainTypes: [ChainType.EVM],
      });

      // Filter tokens for our supported chains and specific tokens we want to check
      const supportedChainIds = [
        CHAIN_IDS.ETHEREUM,
        CHAIN_IDS.ARBITRUM,
        CHAIN_IDS.BASE,
        CHAIN_IDS.OPTIMISM,
        CHAIN_IDS.BSC,
        CHAIN_IDS.HYPEREVM,
      ];

      const tokensToCheck: any[] = [];

      // Add ALL tokens from each supported chain (not just hardcoded ones)
      for (const chainId of supportedChainIds) {
        const chainTokens = tokensResponse.tokens[chainId];
        if (!chainTokens) continue;

        // Add ALL tokens from this chain (native + ERC-20)
        tokensToCheck.push(...chainTokens);
      }

      // Get balances for ALL tokens
      const tokenBalances = await getTokenBalances(address, tokensToCheck);

      // Convert to our format and fetch additional token metadata
      const balances: TokenBalance[] = [];
      
      for (const balance of tokenBalances) {
        if (balance && balance.amount && parseFloat(balance.amount.toString()) > 0) {
          // Skip tokens with very small balances (less than 0.000001) to avoid dust
          const balanceFormatted = formatUnits(BigInt(balance.amount.toString()), balance.decimals);
          if (parseFloat(balanceFormatted) < 0.000001) continue;
          try {
            // Fetch additional token metadata
            const tokenDetails = await getToken(balance.chainId, balance.address);
            const chainInfo = CHAIN_INFO[balance.chainId as keyof typeof CHAIN_INFO];
            const amountStr = balance.amount?.toString() || '0';
            
            // Calculate USD value
            const priceUSD = tokenDetails.priceUSD ? parseFloat(tokenDetails.priceUSD) : 0;
            const balanceUSD = (parseFloat(balanceFormatted) * priceUSD).toFixed(2);
            
            balances.push({
              chainId: balance.chainId,
              chainName: chainInfo.name,
              tokenSymbol: balance.symbol,
              tokenAddress: balance.address,
              balance: amountStr,
              balanceFormatted,
              decimals: balance.decimals,
              logoURI: tokenDetails.logoURI,
              priceUSD: tokenDetails.priceUSD,
              balanceUSD,
            });
          } catch (error) {
            console.error(`Error fetching token details for ${balance.symbol}:`, error);
            // Fallback without metadata
            const chainInfo = CHAIN_INFO[balance.chainId as keyof typeof CHAIN_INFO];
            const amountStr = balance.amount?.toString() || '0';
            balances.push({
              chainId: balance.chainId,
              chainName: chainInfo.name,
              tokenSymbol: balance.symbol,
              tokenAddress: balance.address,
              balance: amountStr,
              balanceFormatted,
              decimals: balance.decimals,
            });
          }
        }
      }

      return balances;
    } catch (error) {
      console.error('Error fetching balances with Li.Fi:', error);
      return [];
    }
  };

  // Fetch all balances across all chains using Li.Fi
  const fetchAllBalances = async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const allBalances = await fetchAllBalancesWithLifi();
      setBalances(allBalances);
    } catch (error) {
      console.error('Error fetching balances:', error);
      setError('Failed to fetch balances. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (address) {
      fetchAllBalances();
    }
  }, [address]);

  // Fetch gas prices when reaching step 3
  useEffect(() => {
    if (currentStep === 3 && selectedToken) {
      fetchGasPrices(selectedToken.chainId);
    }
  }, [currentStep, selectedToken]);

  const handleTokenClick = (balance: TokenBalance) => {
    onTokenSelect(balance);
    onStepChange(2); // Move to step 2 when token is selected
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAmountEnter(e.target.value);
  };

  // Sort balances: USD₮0 first, then by USD amount descending
  const sortedBalances = balances.sort((a, b) => {
    // USD₮0 always first
    if (a.tokenSymbol === 'USD₮0') return -1;
    if (b.tokenSymbol === 'USD₮0') return 1;
    
    // Then sort by USD amount descending
    const aUSD = parseFloat(a.balanceUSD || '0');
    const bUSD = parseFloat(b.balanceUSD || '0');
    return bUSD - aUSD;
  });

  // Filter balances for bridge flow: exclude USD₮0 from HyperEVM and vault shares to avoid duplication
  const bridgeFlowBalances = sortedBalances.filter(balance => {
    // Exclude USD₮0 from HyperEVM in bridge flow since it's shown in direct deposit section
    if (balance.tokenSymbol === 'USD₮0' && balance.chainId === CHAIN_IDS.HYPEREVM) return false;
    
    // Exclude vault shares token (MYR_USDT0_PX) from bridge flow
    if (balance.tokenSymbol === 'MYR_USDT0_PX') return false;
    
    return true;
  });

  // Fetch gas prices for the selected token's chain
  const fetchGasPrices = async (chainId: number) => {
    try {
      const response = await fetch(`https://li.quest/v1/gas/prices/${chainId}`, {
        headers: {
          'x-lifi-api-key': import.meta.env?.VITE_LIFI_API_KEY || ''
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setGasFees(data);
      } else {
        console.warn('Failed to fetch gas prices:', response.status);
      }
    } catch (error) {
      console.warn('Error fetching gas prices:', error);
    }
  };


  if (!address) {
    return (
      <div className="p-6 bg-gray-100 rounded-lg">
        <p className="text-gray-600">Please connect your wallet to view balances.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Token Selection */}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* USDT0 Direct Deposit Section - Only show in step 1 */}
      {underlyingBalance && currentStep === 1 && (
        <div
          onClick={() => handleTokenClick(underlyingBalance)}
          className={`p-3 border rounded cursor-pointer transition-colors ${
            selectedToken?.chainId === underlyingBalance.chainId && 
            selectedToken?.tokenSymbol === underlyingBalance.tokenSymbol
              ? 'border-green-500 bg-green-100'
              : 'border-green-300 hover:border-green-400 bg-green-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {underlyingBalance.logoURI && (
                <img
                  src={underlyingBalance.logoURI}
                  alt={underlyingBalance.tokenSymbol}
                  className="w-5 h-5 rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div>
                <div className="font-semibold text-sm text-green-800">{underlyingBalance.tokenSymbol}</div>
                <div className="text-xs text-green-600">Direct Deposit</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-green-800">
                {parseFloat(underlyingBalance.balanceFormatted).toFixed(4)}
              </div>
              <div className="text-xs text-green-600">
                ${formatUSD(underlyingBalance.balanceUSD || '0')}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Underlying balance Loading State - Only show in step 1 */}
      {underlyingLoading && currentStep === 1 && (
        <div className="p-4 border border-gray-300 bg-gray-50 rounded-lg">
          <div className="text-center text-gray-600">Loading {underlyingSymbol} balance...</div>
        </div>
      )}


      {/* Balances List - Only show in step 1 */}
      {currentStep === 1 && (
        <>
          {loading ? (
            <div className="space-y-1">
              {/* Skeleton for USDT0 */}
              <div className="p-2 border border-gray-200 bg-gray-50 rounded animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 bg-gray-300 rounded-full"></div>
                    <div>
                      <div className="h-4 w-12 bg-gray-300 rounded mb-1"></div>
                      <div className="h-3 w-16 bg-gray-300 rounded"></div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="h-4 w-16 bg-gray-300 rounded mb-1"></div>
                    <div className="h-3 w-12 bg-gray-300 rounded"></div>
                  </div>
                </div>
              </div>
              
              {/* Skeleton for other tokens */}
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-2 border border-gray-200 bg-white rounded animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 bg-gray-300 rounded-full"></div>
                      <div>
                        <div className="h-4 w-12 bg-gray-300 rounded mb-1"></div>
                        <div className="h-3 w-16 bg-gray-300 rounded"></div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="h-4 w-16 bg-gray-300 rounded mb-1"></div>
                      <div className="h-3 w-12 bg-gray-300 rounded"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : bridgeFlowBalances.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No token balances found. Make sure you have tokens on the supported chains.
            </div>
          ) : (
            <div className="space-y-1">
              {bridgeFlowBalances.map((balance, index) => (
                <div
                  key={`${balance.chainId}-${balance.tokenSymbol}-${index}`}
                  onClick={() => handleTokenClick(balance)}
                  className={`p-2 border rounded cursor-pointer transition-colors ${
                    selectedToken?.chainId === balance.chainId && 
                    selectedToken?.tokenSymbol === balance.tokenSymbol
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {balance.logoURI && (
                        <img
                          src={balance.logoURI}
                          alt={balance.tokenSymbol}
                          className="w-5 h-5 rounded-full"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div>
                        <div className="font-semibold text-sm">{balance.tokenSymbol}</div>
                        <div className="text-xs text-gray-600">{balance.chainName}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold">
                        {parseFloat(balance.balanceFormatted).toFixed(4)}
                      </div>
                      <div className="text-xs text-gray-600">
                        {balance.balanceUSD ? `$${formatUSD(balance.balanceUSD)}` : balance.tokenSymbol}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Selected Token and Amount Input - Only show in step 2 */}
      {selectedToken && currentStep === 2 && (
        <div className="p-6 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Selected Token</h3>
            <button
              onClick={() => onStepChange(1)}
              className="text-sm text-gray-600 hover:text-gray-800 flex items-center space-x-1"
            >
              <span>←</span>
              <span>Back to Token Selection</span>
            </button>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {selectedToken.logoURI && (
                <img
                  src={selectedToken.logoURI}
                  alt={selectedToken.tokenSymbol}
                  className="w-10 h-10 rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div>
                <div className="font-semibold text-lg">{selectedToken.tokenSymbol}</div>
                <div className="text-sm text-gray-600">{selectedToken.chainName}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg">
                {parseFloat(selectedToken.balanceFormatted).toFixed(6)} {selectedToken.tokenSymbol}
              </div>
              <div className="text-sm text-gray-600">
                {selectedToken.balanceUSD ? `$${formatUSD(selectedToken.balanceUSD)}` : 'USD value unavailable'}
              </div>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter Amount (USD)
            </label>
            <input
              type="number"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              step="0.01"
              min="0"
              max={selectedToken.balanceUSD ? parseFloat(selectedToken.balanceUSD) : parseFloat(selectedToken.balanceFormatted)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              Available: ${formatUSD(selectedToken.balanceUSD || '0')} USD
              {selectedToken.priceUSD && (
                <span className="ml-2">
                  ({parseFloat(selectedToken.balanceFormatted).toFixed(6)} {selectedToken.tokenSymbol})
                </span>
              )}
            </div>
          </div>

          {/* Quick Select Buttons */}
          {(selectedToken.balanceUSD || (selectedToken.tokenSymbol === 'USDT0' && selectedToken.balanceFormatted)) && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Quick Select:</div>
              <div className="flex space-x-2">
                {[25, 50, 75, 100].map((percentage) => (
                  <button
                    key={percentage}
                    onClick={() => {
                      // For USDT0, use balanceFormatted directly since it's 1:1 with USD
                      // For other tokens, use balanceUSD
                      const maxAmount = selectedToken.tokenSymbol === 'USDT0' 
                        ? parseFloat(selectedToken.balanceFormatted)
                        : parseFloat(selectedToken.balanceUSD || '0');
                      const amountUSD = (maxAmount * percentage / 100).toFixed(2);
                      handleAmountChange({ target: { value: amountUSD } } as any);
                    }}
                    className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {percentage === 100 ? 'Max' : `${percentage}%`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              if (currentStep === 2) {
                onStepChange(3); // Move to step 3 for confirmation
              } else {
                onExecute(); // Execute the transaction
              }
            }}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > (selectedToken.balanceUSD ? parseFloat(selectedToken.balanceUSD) : parseFloat(selectedToken.balanceFormatted)) || isExecuting}
            className="w-full py-3 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExecuting ? 'Executing...' : currentStep === 2 ? 'Continue to Confirmation' : 'Execute Transaction'}
          </button>
        </div>
      )}

      {/* Confirmation Step - Step 3 */}
      {selectedToken && currentStep === 3 && (
        <div className="p-6 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-800">Confirm Transaction</h3>
            <button
              onClick={() => onStepChange(2)}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
            >
              <span>←</span>
              <span>Back to Amount</span>
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-gray-800 mb-3">Transaction Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">From:</span>
                  <span className="font-medium">{selectedToken.tokenSymbol} on {selectedToken.chainName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">To:</span>
                  <span className="font-medium">USDT0 on HyperEVM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-medium">${formatUSD(amount)} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Method:</span>
                  <span className="font-medium">
                    {selectedToken.tokenSymbol === 'USDT0' && selectedToken.chainId === 999 
                      ? 'Direct Deposit' 
                      : 'Bridge & Swap via Li.Fi'
                    }
                  </span>
                </div>
                {gasFees && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Gas Fee (Fast):</span>
                    <span className="font-medium">
                      {gasFees.fast} Gwei
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <button
              onClick={onExecute}
              disabled={isExecuting}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExecuting ? 'Executing Transaction...' : 'Confirm & Execute'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

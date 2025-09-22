import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { CHAIN_IDS, TOKEN_ADDRESSES } from '../lib/lifi-config';
import { getTokens, getTokenBalances, getToken, ChainType } from '@lifi/sdk';
import { formatUnits } from 'viem';

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
  usdt0Balance?: TokenBalance | null;
  usdt0Loading?: boolean;
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
  usdt0Balance,
  usdt0Loading,
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
  const [usdt0Logo, setUsdt0Logo] = useState<string | null>(null);

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
      ];

      const tokensToCheck: any[] = [];

      // Add native tokens and specific ERC-20 tokens for each chain
      for (const chainId of supportedChainIds) {
        const chainTokens = tokensResponse.tokens[chainId];
        if (!chainTokens) continue;

        // Add native token (ETH, BNB, etc.)
        const nativeToken = chainTokens.find(token => 
          token.address === '0x0000000000000000000000000000000000000000'
        );
        if (nativeToken) {
          tokensToCheck.push(nativeToken);
        }

        // Add specific ERC-20 tokens we want to track
        const chainTokenAddresses = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
        if (chainTokenAddresses) {
          for (const [, address] of Object.entries(chainTokenAddresses)) {
            if (address !== '0x0000000000000000000000000000000000000000') {
              const token = chainTokens.find(t => 
                t.address.toLowerCase() === address.toLowerCase()
              );
              if (token) {
                tokensToCheck.push(token);
              }
            }
          }
        }
      }

      // Get balances for all tokens
      const tokenBalances = await getTokenBalances(address, tokensToCheck);

      // Convert to our format and fetch additional token metadata
      const balances: TokenBalance[] = [];
      
      for (const balance of tokenBalances) {
        if (balance && balance.amount && parseFloat(balance.amount.toString()) > 0) {
          try {
            // Fetch additional token metadata
            const tokenDetails = await getToken(balance.chainId, balance.address);
            const chainInfo = CHAIN_INFO[balance.chainId as keyof typeof CHAIN_INFO];
            const amountStr = balance.amount?.toString() || '0';
            const balanceFormatted = formatUnits(BigInt(amountStr), balance.decimals);
            
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
              balanceFormatted: formatUnits(BigInt(amountStr), balance.decimals),
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
      fetchUsdt0Logo();
    }
  }, [currentStep, selectedToken]);

  // Fetch USDT0 logo from Li.Fi
  const fetchUsdt0Logo = async () => {
    try {
      const response = await fetch('https://li.quest/v1/tokens?chainIds=999', {
        headers: {
          'x-lifi-api-key': 'f6f27ae1-842e-479b-93df-96965d72bffd.ce2dfa79-b4f9-40f9-8420-ca0a3b07b489'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const usdt0Token = data.tokens.find((token: any) => 
          token.symbol === 'USDT0' && token.chainId === 999
        );
        if (usdt0Token && usdt0Token.logoURI) {
          setUsdt0Logo(usdt0Token.logoURI);
        }
      }
    } catch (error) {
      console.warn('Error fetching USDT0 logo:', error);
    }
  };

  // Convert Gwei to USD
  const convertGweiToUSD = (gwei: number, gasLimit: number = 21000): string => {
    // Convert Gwei to ETH (1 ETH = 10^9 Gwei)
    const ethAmount = gwei / 1e9;
    // Estimate gas cost in ETH (using standard gas limit for simple transfers)
    const gasCostETH = ethAmount * gasLimit;
    // Use a reasonable ETH price (around $2000-3000)
    const ethPrice = 2500; // Conservative ETH price
    const gasCostUSD = gasCostETH * ethPrice;
    
    if (gasCostUSD < 0.01) {
      return '< $0.01';
    } else if (gasCostUSD < 1) {
      return `$${gasCostUSD.toFixed(3)}`;
    } else {
      return `$${gasCostUSD.toFixed(2)}`;
    }
  };

  const handleTokenClick = (balance: TokenBalance) => {
    onTokenSelect(balance);
    onStepChange(2); // Move to step 2 when token is selected
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAmountEnter(e.target.value);
  };

  // Fetch gas prices for the selected token's chain
  const fetchGasPrices = async (chainId: number) => {
    try {
      const response = await fetch(`https://li.quest/v1/gas/prices/${chainId}`, {
        headers: {
          'x-lifi-api-key': 'f6f27ae1-842e-479b-93df-96965d72bffd.ce2dfa79-b4f9-40f9-8420-ca0a3b07b489'
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
    <div className="space-y-6">

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* USDT0 Direct Deposit Section - Only show in step 1 */}
      {usdt0Balance && currentStep === 1 && (
        <div className="p-3 border-l-4 border-green-500 bg-green-50 rounded-r-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              {usdt0Balance.logoURI && (
                <img
                  src={usdt0Balance.logoURI}
                  alt={usdt0Balance.tokenSymbol}
                  className="w-6 h-6 rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div>
                <div className="font-semibold text-base text-green-800">{usdt0Balance.tokenSymbol}</div>
                <div className="text-xs text-green-600">Direct Deposit</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-green-800">
                {parseFloat(usdt0Balance.balanceFormatted).toFixed(4)}
              </div>
              <div className="text-xs text-green-600">
                {usdt0Balance.balanceUSD}
              </div>
            </div>
          </div>
          <div
            onClick={() => handleTokenClick(usdt0Balance)}
            className={`p-2 border rounded cursor-pointer transition-colors ${
              selectedToken?.chainId === usdt0Balance.chainId && 
              selectedToken?.tokenSymbol === usdt0Balance.tokenSymbol
                ? 'border-green-500 bg-green-100'
                : 'border-green-300 hover:border-green-400'
            }`}
          >
            <div className="text-center text-green-700 text-sm font-medium">
              Click to select for direct deposit
            </div>
          </div>
        </div>
      )}

      {/* Bridge Tokens Section - Only show in step 1 */}
      {currentStep === 1 && (
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-semibold text-[#00295B]">SELECT TOKEN TO BRIDGE</h4>
          <button
            onClick={fetchAllBalances}
            disabled={loading}
            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh Balances
          </button>
        </div>
      )}

      {/* USDT0 Loading State - Only show in step 1 */}
      {usdt0Loading && currentStep === 1 && (
        <div className="p-4 border border-gray-300 bg-gray-50 rounded-lg">
          <div className="text-center text-gray-600">Loading USDT0 balance...</div>
        </div>
      )}

      {/* Separator - Only show in step 1 */}
      {usdt0Balance && balances.length > 0 && currentStep === 1 && (
        <div className="flex items-center my-3">
          <div className="flex-1 border-t border-gray-300"></div>
          <div className="px-3 text-xs text-gray-500 bg-white">Bridge & Swap Tokens</div>
          <div className="flex-1 border-t border-gray-300"></div>
        </div>
      )}

      {/* Balances List - Only show in step 1 */}
      {currentStep === 1 && (
        <>
          {loading ? (
            <div className="text-center py-8 text-gray-600">
              Loading token balances...
            </div>
          ) : balances.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No token balances found. Make sure you have tokens on the supported chains.
            </div>
          ) : (
            <div className="space-y-2">
              {balances
                .sort((a, b) => {
                  const aUSD = parseFloat(a.balanceUSD || '0');
                  const bUSD = parseFloat(b.balanceUSD || '0');
                  return bUSD - aUSD; // Descending order by USD value
                })
                .map((balance, index) => (
                <div
                  key={`${balance.chainId}-${balance.tokenSymbol}-${index}`}
                  onClick={() => handleTokenClick(balance)}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
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
                          className="w-6 h-6 rounded-full"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div>
                        <div className="font-semibold text-base">{balance.tokenSymbol}</div>
                        <div className="text-xs text-gray-600">{balance.chainName}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold">
                        {parseFloat(balance.balanceFormatted).toFixed(4)}
                      </div>
                      <div className="text-xs text-gray-600">
                        {balance.balanceUSD ? `$${balance.balanceUSD}` : balance.tokenSymbol}
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
        <div className="p-4">
          {/* Back button */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => onStepChange(1)}
              className="text-gray-600 hover:text-gray-800 flex items-center space-x-2"
            >
              <span className="text-xl">←</span>
              <span>Back</span>
            </button>
          </div>

          {/* Main Amount Input - This is the large display that acts as input */}
          <div className="text-center mb-4">
            <input
              type="number"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              step="0.01"
              min="0"
              max={selectedToken.balanceUSD ? parseFloat(selectedToken.balanceUSD) : parseFloat(selectedToken.balanceFormatted)}
              className="w-full text-center text-5xl font-bold text-black bg-transparent border-none outline-none placeholder-gray-300"
            />
            <div className="text-lg text-gray-600 mt-2">
              ↑↓ {selectedToken.priceUSD ? (parseFloat(amount || '0') / parseFloat(selectedToken.priceUSD)).toFixed(6) : '0.000000'} {selectedToken.tokenSymbol}
            </div>
          </div>

          {/* Quick Select Buttons */}
          {(selectedToken.balanceUSD || (selectedToken.tokenSymbol === 'USDT0' && selectedToken.balanceFormatted)) && (
            <div className="mb-4">
              <div className="flex justify-center space-x-2">
                {[25, 50, 75, 100].map((percentage) => (
                  <button
                    key={percentage}
                    onClick={() => {
                      const maxAmount = selectedToken.tokenSymbol === 'USDT0' 
                        ? parseFloat(selectedToken.balanceFormatted)
                        : parseFloat(selectedToken.balanceUSD || '0');
                      const amountUSD = (maxAmount * percentage / 100).toFixed(2);
                      handleAmountChange({ target: { value: amountUSD } } as any);
                    }}
                    className="px-4 py-2 text-sm font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {percentage === 100 ? 'Max' : `${percentage}%`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transaction Flow Indicator */}
          <div className="flex items-center justify-center space-x-4 mb-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center">
                <span className="text-white font-bold text-xs">1</span>
              </div>
              <span>You send {selectedToken.tokenSymbol}</span>
            </div>
            <div className="text-gray-400">→</div>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <span className="text-white font-bold text-xs">$</span>
              </div>
              <span>You receive USDT0</span>
            </div>
          </div>

          {/* Continue Button */}
          <button
            onClick={() => onStepChange(3)}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > (selectedToken.balanceUSD ? parseFloat(selectedToken.balanceUSD) : parseFloat(selectedToken.balanceFormatted)) || isExecuting}
            className="w-full py-3 px-4 text-lg font-semibold bg-[#00295B] text-white rounded-lg hover:bg-[#001a3d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            CONTINUE
          </button>
        </div>
      )}

      {/* Confirmation Step - Step 3 */}
      {selectedToken && currentStep === 3 && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-800">Confirm Transaction</h3>
            <button
              onClick={() => onStepChange(2)}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
            >
              <span>←</span>
              <span>Back</span>
            </button>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-blue-200 mb-4">
            {/* Transaction Flow with Logos */}
            <div className="flex items-center justify-center space-x-3 mb-4">
              {/* From Token */}
              <div className="flex flex-col items-center">
                <div className="flex items-center space-x-2 mb-1">
                  {selectedToken.logoURI && (
                    <img
                      src={selectedToken.logoURI}
                      alt={selectedToken.tokenSymbol}
                      className="w-6 h-6 rounded-full"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <span className="font-semibold text-base">{selectedToken.tokenSymbol}</span>
                </div>
                <div className="text-xs text-gray-600">{selectedToken.chainName}</div>
              </div>

              {/* Arrow */}
              <div className="text-xl text-gray-400">→</div>

              {/* To Token */}
              <div className="flex flex-col items-center">
                <div className="flex items-center space-x-2 mb-1">
                  {usdt0Logo ? (
                    <img
                      src={usdt0Logo}
                      alt="USDT0"
                      className="w-6 h-6 rounded-full"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                      <span className="text-white font-bold text-xs">$</span>
                    </div>
                  )}
                  <span className="font-semibold text-base">USDT0</span>
                </div>
                <div className="text-xs text-gray-600">HyperEVM</div>
              </div>
            </div>

            {/* Transaction Details */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span className="text-gray-600">Amount:</span>
                <span className="font-semibold text-base">${amount} USD</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span className="text-gray-600">Method:</span>
                <span className="font-medium text-sm">
                  {selectedToken.tokenSymbol === 'USDT0' && selectedToken.chainId === 999 
                    ? 'Direct Deposit' 
                    : 'Bridge & Swap via Li.Fi'
                  }
                </span>
              </div>
              {gasFees && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-gray-600">Gas Fee:</span>
                  <span className="font-medium text-sm">
                    {convertGweiToUSD(gasFees.fast)}
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
      )}
    </div>
  );
};

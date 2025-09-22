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
  usdt0Loading
}: BalanceFetcherProps) => {
  const { address } = useAccount();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleTokenClick = (balance: TokenBalance) => {
    onTokenSelect(balance);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAmountEnter(e.target.value);
  };

  const handleExecute = () => {
    if (selectedToken && amount && parseFloat(amount) > 0) {
      onExecute();
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
      {/* Select Token Section */}
      <div>
        <h3 className="text-lg font-semibold text-[#00295B] mb-2">SELECT TOKEN</h3>
        <p className="text-sm text-[#101720]/70 mb-4">Choose the token you want to deposit</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* USDT0 Direct Deposit Section */}
      {usdt0Balance && (
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

      {/* Bridge Tokens Section */}
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

      {/* USDT0 Loading State */}
      {usdt0Loading && (
        <div className="p-4 border border-gray-300 bg-gray-50 rounded-lg">
          <div className="text-center text-gray-600">Loading USDT0 balance...</div>
        </div>
      )}

      {/* Separator */}
      {usdt0Balance && balances.length > 0 && (
        <div className="flex items-center my-3">
          <div className="flex-1 border-t border-gray-300"></div>
          <div className="px-3 text-xs text-gray-500 bg-white">Bridge & Swap Tokens</div>
          <div className="flex-1 border-t border-gray-300"></div>
        </div>
      )}

      {/* Balances List */}
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
          {balances.map((balance, index) => (
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

      {/* No Balances Message - Legacy */}
      {!loading && balances.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No token balances found. Make sure you have tokens on the supported chains.
        </div>
      )}

      {/* Selected Token and Amount Input */}
      {selectedToken && (
        <div className="p-6 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Selected Token</h3>
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
                {selectedToken.balanceUSD ? `$${selectedToken.balanceUSD}` : 'USD value unavailable'}
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
              Available: ${selectedToken.balanceUSD || '0.00'} USD
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
            onClick={handleExecute}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > (selectedToken.balanceUSD ? parseFloat(selectedToken.balanceUSD) : parseFloat(selectedToken.balanceFormatted)) || isExecuting}
            className="w-full py-3 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExecuting ? 'Executing...' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
};

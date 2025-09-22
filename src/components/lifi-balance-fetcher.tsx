import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { CHAIN_IDS, TOKEN_ADDRESSES } from '../lib/lifi-config';
import { formatUnits } from 'viem';

interface TokenBalance {
  chainId: number;
  chainName: string;
  tokenSymbol: string;
  tokenAddress: string;
  balance: string;
  balanceFormatted: string;
  decimals: number;
}

interface BalanceFetcherProps {
  onTokenSelect: (tokenInfo: TokenBalance) => void;
  onAmountEnter: (amount: string) => void;
  onExecute: () => void;
  selectedToken: TokenBalance | null;
  amount: string;
  isExecuting: boolean;
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
  isExecuting 
}: BalanceFetcherProps) => {
  const { address } = useAccount();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch native token balance for a specific chain
  const fetchNativeBalance = async (chainId: number) => {
    try {
      const publicClient = usePublicClient({ chainId });
      if (!publicClient || !address) return null;

      const balance = await publicClient.getBalance({ address: address as `0x${string}` });
      const chainInfo = CHAIN_INFO[chainId as keyof typeof CHAIN_INFO];
      const tokenSymbol = chainInfo.nativeSymbol;
      
      return {
        chainId,
        chainName: chainInfo.name,
        tokenSymbol,
        tokenAddress: '0x0000000000000000000000000000000000000000',
        balance: balance.toString(),
        balanceFormatted: formatUnits(balance, 18),
        decimals: 18,
      };
    } catch (error) {
      console.error(`Error fetching native balance for chain ${chainId}:`, error);
      return null;
    }
  };

  // Fetch ERC-20 token balance for a specific chain
  const fetchTokenBalance = async (chainId: number, tokenSymbol: string, tokenAddress: string, decimals: number) => {
    try {
      const publicClient = usePublicClient({ chainId });
      if (!publicClient || !address || tokenAddress === '0x0000000000000000000000000000000000000000') return null;

      const balance = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: 'balance', type: 'uint256' }],
          },
        ],
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });

      const chainInfo = CHAIN_INFO[chainId as keyof typeof CHAIN_INFO];
      
      return {
        chainId,
        chainName: chainInfo.name,
        tokenSymbol,
        tokenAddress,
        balance: balance.toString(),
        balanceFormatted: formatUnits(balance as bigint, decimals),
        decimals,
      };
    } catch (error) {
      console.error(`Error fetching token balance for ${tokenSymbol} on chain ${chainId}:`, error);
      return null;
    }
  };

  // Fetch all balances across all chains
  const fetchAllBalances = async () => {
    if (!address) return;

    setLoading(true);
    setError(null);
    const allBalances: TokenBalance[] = [];

    try {
      // Fetch native token balances
      for (const chainId of Object.values(CHAIN_IDS)) {
        if (chainId === CHAIN_IDS.HYPEREVM) continue; // Skip HyperEVM as it's the target
        
        const nativeBalance = await fetchNativeBalance(chainId);
        if (nativeBalance && parseFloat(nativeBalance.balanceFormatted) > 0) {
          allBalances.push(nativeBalance);
        }
      }

      // Fetch ERC-20 token balances
      for (const [chainId, tokens] of Object.entries(TOKEN_ADDRESSES)) {
        if (chainId === CHAIN_IDS.HYPEREVM.toString()) continue; // Skip HyperEVM as it's the target
        
        for (const [tokenSymbol, tokenAddress] of Object.entries(tokens)) {
          if (tokenAddress === '0x0000000000000000000000000000000000000000') continue; // Skip native tokens
          
          const decimals = tokenSymbol === 'USDC' || tokenSymbol === 'USDT' ? 6 : 18;
          const tokenBalance = await fetchTokenBalance(
            parseInt(chainId), 
            tokenSymbol, 
            tokenAddress, 
            decimals
          );
          
          if (tokenBalance && parseFloat(tokenBalance.balanceFormatted) > 0) {
            allBalances.push(tokenBalance);
          }
        }
      }

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
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Select Token to Bridge</h2>
        <button
          onClick={fetchAllBalances}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Balances'}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Balances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {balances.map((balance, index) => (
          <div
            key={`${balance.chainId}-${balance.tokenSymbol}-${index}`}
            onClick={() => handleTokenClick(balance)}
            className={`p-4 border rounded-lg cursor-pointer transition-colors ${
              selectedToken?.chainId === balance.chainId && 
              selectedToken?.tokenSymbol === balance.tokenSymbol
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-semibold">{balance.tokenSymbol}</div>
                <div className="text-sm text-gray-600">{balance.chainName}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm">
                  {parseFloat(balance.balanceFormatted).toFixed(6)}
                </div>
                <div className="text-xs text-gray-500">
                  {balance.tokenSymbol}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* No Balances Message */}
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
            <div>
              <div className="font-semibold">{selectedToken.tokenSymbol}</div>
              <div className="text-sm text-gray-600">{selectedToken.chainName}</div>
            </div>
            <div className="text-right">
              <div className="font-mono">
                {parseFloat(selectedToken.balanceFormatted).toFixed(6)} {selectedToken.tokenSymbol}
              </div>
              <div className="text-xs text-gray-500">Available</div>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter Amount ({selectedToken.tokenSymbol})
            </label>
            <input
              type="number"
              value={amount}
              onChange={handleAmountChange}
              placeholder={`0.00`}
              step="0.000001"
              min="0"
              max={selectedToken.balanceFormatted}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              Max: {parseFloat(selectedToken.balanceFormatted).toFixed(6)} {selectedToken.tokenSymbol}
            </div>
          </div>

          <button
            onClick={handleExecute}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > parseFloat(selectedToken.balanceFormatted) || isExecuting}
            className="w-full py-3 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExecuting ? 'Executing...' : 'Execute Bridge to HyperEVM'}
          </button>
        </div>
      )}
    </div>
  );
};

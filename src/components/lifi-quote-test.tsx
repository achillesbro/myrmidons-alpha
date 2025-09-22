import { useState } from 'react';
import { getRoutes, executeRoute } from '@lifi/sdk';
import { CHAIN_IDS, TOKEN_ADDRESSES } from '../lib/lifi-config';
import { useWalletClient, useConfig } from 'wagmi';
import { switchChain, getWalletClient } from '@wagmi/core';
import { formatUnits } from 'viem';
import { useLifiConfig } from '../hooks/useLifiConfig';
import { LiFiBalanceFetcher } from './lifi-balance-fetcher';

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  chainId: number;
  token: string;
  amount: string;
}

export function LiFiQuoteTest() {
  const [executions, setExecutions] = useState<ExecutionResult[]>([]);
  const [executing, setExecuting] = useState(false);
  
  // New state for balance fetcher
  const [selectedTokenInfo, setSelectedTokenInfo] = useState<{
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
  } | null>(null);
  const [amount, setAmount] = useState<string>('');
  
  const clientW = useWalletClient();
  const wagmiConfig = useConfig();
  const userAddress = clientW.data?.account?.address || '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0';
  
  // Initialize Li.Fi SDK configuration
  const { isConfigured } = useLifiConfig();

  const getChainName = (chainId: number) => {
    const chainNames: { [key: number]: string } = {
      [CHAIN_IDS.ETHEREUM]: 'Ethereum',
      [CHAIN_IDS.ARBITRUM]: 'Arbitrum',
      [CHAIN_IDS.BASE]: 'Base',
      [CHAIN_IDS.OPTIMISM]: 'Optimism',
      [CHAIN_IDS.BSC]: 'BSC',
      [CHAIN_IDS.HYPEREVM]: 'HyperEVM',
    };
    return chainNames[chainId] || `Chain ${chainId}`;
  };

  // Handler functions for balance fetcher
  const handleTokenSelect = (tokenInfo: any) => {
    setSelectedTokenInfo(tokenInfo);
  };

  const handleAmountEnter = (enteredAmount: string) => {
    setAmount(enteredAmount);
  };

  const handleExecute = async () => {
    if (!selectedTokenInfo || !amount) return;
    
    setExecuting(true);
    try {
      // Convert USD amount to native token amount
      let fromAmount: string;
      if (selectedTokenInfo.priceUSD) {
        // Convert USD to native token amount
        const usdAmount = parseFloat(amount);
        const tokenPrice = parseFloat(selectedTokenInfo.priceUSD);
        const nativeAmount = usdAmount / tokenPrice;
        // Round to ensure we get a whole number for the smallest token units
        fromAmount = Math.round(nativeAmount * Math.pow(10, selectedTokenInfo.decimals)).toString();
        
      console.log('USD to Native conversion:', {
        usdAmount,
        tokenPrice,
        nativeAmount,
        decimals: selectedTokenInfo.decimals,
        fromAmount
      });

      // Warn about very small amounts for ETH
      if (selectedTokenInfo.tokenSymbol === 'ETH' && parseFloat(amount) < 50) {
        console.warn('⚠️ Very small ETH amount detected. ETH bridges often have higher minimum amounts. Consider trying with at least $50-100 USD.');
      }
      } else {
        // Fallback: treat amount as native token amount
        fromAmount = Math.round(parseFloat(amount) * Math.pow(10, selectedTokenInfo.decimals)).toString();
        console.log('Native amount conversion:', {
          amount,
          decimals: selectedTokenInfo.decimals,
          fromAmount
        });
      }

      // Validate that fromAmount is a valid positive integer
      if (!fromAmount || fromAmount === '0' || fromAmount === 'NaN' || !/^\d+$/.test(fromAmount)) {
        throw new Error('Invalid amount: must be a positive number');
      }

      // Get token addresses
      const fromToken = selectedTokenInfo.tokenAddress;
      const toToken = TOKEN_ADDRESSES[CHAIN_IDS.HYPEREVM].USDT0;
      
      // Ensure ETH is properly formatted as zero address
      const normalizedFromToken = fromToken === '0x0000000000000000000000000000000000000000' 
        ? '0x0000000000000000000000000000000000000000' 
        : fromToken;
      
      console.log('Token addresses:', {
        fromToken: normalizedFromToken,
        toToken: toToken,
        isNativeToken: normalizedFromToken === '0x0000000000000000000000000000000000000000'
      });

      const routesRequest = {
        fromChainId: selectedTokenInfo.chainId,
        toChainId: CHAIN_IDS.HYPEREVM,
        fromTokenAddress: normalizedFromToken,
        toTokenAddress: toToken,
        fromAmount,
        fromAddress: userAddress,
      };

      console.log('Routes request:', routesRequest);
      const result = await getRoutes(routesRequest);
      
      if (!result.routes || result.routes.length === 0) {
        throw new Error('No routes available for this transfer');
      }

      console.log('Available routes:', result.routes.length);
      result.routes.forEach((route, index) => {
        console.log(`Route ${index}:`, {
          id: route.id,
          fromToken: route.fromToken,
          toToken: route.toToken,
          steps: route.steps?.length || 0,
          gasCostUSD: route.gasCostUSD
        });
      });

      const route = result.routes[0];
      console.log('Selected route details:', {
        id: route.id,
        fromToken: route.fromToken,
        toToken: route.toToken,
        steps: route.steps?.map(step => ({
          type: step.type,
          tool: step.toolDetails?.key,
          fromToken: step.action?.fromToken,
          toToken: step.action?.toToken,
          fromChainId: step.action?.fromChainId,
          toChainId: step.action?.toChainId,
          fromAmount: step.action?.fromAmount,
          toAmount: (step.action as any)?.toAmount,
          minAmount: (step.action as any)?.minAmount,
          maxAmount: (step.action as any)?.maxAmount
        }))
      });

      // Check for minimum amount requirements
      if (route.steps && route.steps.length > 0) {
        const firstStep = route.steps[0];
        const action = firstStep.action as any;
        if (action?.minAmount) {
          const minAmount = BigInt(action.minAmount);
          const fromAmountBigInt = BigInt(fromAmount);
          console.log('Minimum amount check:', {
            required: minAmount.toString(),
            provided: fromAmountBigInt.toString(),
            meetsMinimum: fromAmountBigInt >= minAmount
          });
          
          if (fromAmountBigInt < minAmount) {
            throw new Error(`Amount too small. Minimum required: ${formatUnits(minAmount, selectedTokenInfo.decimals)} ${selectedTokenInfo.tokenSymbol}`);
          }
        }
      }

      // Execute the route
      console.log('Starting route execution...');
      const executedRoute = await executeRoute(route, {
        updateRouteHook: (updatedRoute) => {
          console.log('Route update:', {
            steps: updatedRoute.steps?.map(step => ({
              type: step.type,
              tool: step.toolDetails?.key,
              txHash: step.execution?.process?.[0]?.txHash
            }))
          });
        },
        acceptExchangeRateUpdateHook: async () => {
          console.log('Exchange rate update requested, accepting...');
          return true; // Accept rate updates automatically
        },
        switchChainHook: async (chainId) => {
          console.log('Switching to chain:', chainId);
          try {
            const chain = await switchChain(wagmiConfig, { chainId });
            console.log('Successfully switched to chain:', chain.id);
            return getWalletClient(wagmiConfig, { chainId: chain.id });
          } catch (error) {
            console.error('Failed to switch chain:', error);
            throw error;
          }
        },
      });

      // Extract transaction hash from the executed route
      let txHash = 'Unknown';
      if (executedRoute.steps && executedRoute.steps.length > 0) {
        const lastStep = executedRoute.steps[executedRoute.steps.length - 1];
        if (lastStep.execution?.process && lastStep.execution.process.length > 0) {
          const lastProcess = lastStep.execution.process[lastStep.execution.process.length - 1];
          txHash = lastProcess.txHash || 'Unknown';
        }
      }
      
      setExecutions(prev => [...prev, {
        success: true,
        txHash: txHash,
        chainId: selectedTokenInfo.chainId,
        token: selectedTokenInfo.tokenSymbol,
        amount: amount,
      }]);

      // Reset form
      setSelectedTokenInfo(null);
      setAmount('');
      
    } catch (error: any) {
      console.error('Execution failed:', error);
      setExecutions(prev => [...prev, {
        success: false,
        error: error.message || 'Unknown error',
        chainId: selectedTokenInfo.chainId,
        token: selectedTokenInfo.tokenSymbol,
        amount: amount,
      }]);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Li.Fi Bridge to HyperEVM</h2>
      <p className="text-gray-600 mb-6">
        Bridge any token from supported chains to USDT0 on HyperEVM (Chain ID: {CHAIN_IDS.HYPEREVM})
      </p>
      
      {!isConfigured && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-800">
            <strong>Initializing Li.Fi SDK:</strong> Loading chain configurations... This may take a moment.
          </p>
        </div>
      )}

      {!clientW.data && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-yellow-800">
            <strong>Wallet Required:</strong> Please connect your wallet to view balances and execute transactions.
          </p>
        </div>
      )}

      {/* Balance Fetcher Component */}
      <LiFiBalanceFetcher
        onTokenSelect={handleTokenSelect}
        onAmountEnter={handleAmountEnter}
        onExecute={handleExecute}
        selectedToken={selectedTokenInfo}
        amount={amount}
        isExecuting={executing}
      />

      {/* Execution Results */}
      {executions.length > 0 && (
        <div className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold">Execution Results:</h3>
          <div className="grid gap-4">
            {executions.map((execution, index) => (
              <div
                key={index}
                className={`p-4 rounded border ${
                  execution.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-medium">
                      {execution.token} on {getChainName(execution.chainId)} → USDT0 on HyperEVM
                    </span>
                    <span className="text-gray-500 ml-2">({execution.amount} {execution.token})</span>
                  </div>
                  <span className={`px-2 py-1 rounded text-sm ${
                    execution.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {execution.success ? 'Success' : 'Failed'}
                  </span>
                </div>
                
                {execution.success ? (
                  <div className="text-sm text-gray-600">
                    <div>Transaction Hash: {execution.txHash}</div>
                  </div>
                ) : (
                  <div className="text-sm text-red-600">
                    Error: {execution.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

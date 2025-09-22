import { useState } from 'react';
import { getQuote, getRoutes, executeRoute } from '@lifi/sdk';
import { CHAIN_IDS, TOKEN_ADDRESSES, TEST_AMOUNTS_USD } from '../lib/lifi-config';
import { useWalletClient, useConfig } from 'wagmi';
import { switchChain, getWalletClient } from '@wagmi/core';
import { useLifiConfig } from '../hooks/useLifiConfig';

interface QuoteResult {
  success: boolean;
  data?: any;
  error?: string;
  chainId: number;
  token: string;
  amount: string;
}

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  chainId: number;
  token: string;
  amount: string;
}

export function LiFiQuoteTest() {
  const [quotes, setQuotes] = useState<QuoteResult[]>([]);
  const [executions, setExecutions] = useState<ExecutionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>('100');
  const [selectedChain, setSelectedChain] = useState<number>(CHAIN_IDS.ARBITRUM);
  const [selectedToken, setSelectedToken] = useState<string>('USDC');
  const clientW = useWalletClient();
  const wagmiConfig = useConfig();
  const userAddress = clientW.data?.account?.address || '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0';
  
  // Initialize Li.Fi SDK configuration
  const { isConfigured } = useLifiConfig();

  const testChains = [
    { id: CHAIN_IDS.ETHEREUM, name: 'Ethereum' },
    { id: CHAIN_IDS.ARBITRUM, name: 'Arbitrum' },
    { id: CHAIN_IDS.BASE, name: 'Base' },
  ];

  const testTokens = ['USDC', 'USDT', 'ETH'];
  const testAmount = parseFloat(customAmount) || TEST_AMOUNTS_USD.MEDIUM;

  const getChainName = (chainId: number) => {
    const chain = testChains.find(c => c.id === chainId);
    return chain ? chain.name : `Chain ${chainId}`;
  };

  const runQuoteTests = async () => {
    setLoading(true);
    setQuotes([]);
    
    const results: QuoteResult[] = [];

    for (const chain of testChains) {
      for (const token of testTokens) {
        try {
          console.log(`Testing ${token} on ${chain.name} (${chain.id})`);
          
          const chainTokens = TOKEN_ADDRESSES[chain.id as keyof typeof TOKEN_ADDRESSES];
          const fromToken = chainTokens[token as keyof typeof chainTokens];
          const toToken = TOKEN_ADDRESSES[CHAIN_IDS.HYPEREVM].USDT0;
          
          // Convert USD amount to token units (assuming 6 decimals for USDC/USDT, 18 for ETH)
          const decimals = token === 'ETH' ? 18 : 6;
          const fromAmount = (testAmount * Math.pow(10, decimals)).toString();

          // Test with getQuote
          const quoteRequest = {
            fromChain: chain.id,
            toChain: CHAIN_IDS.HYPEREVM,
            fromToken,
            toToken,
            fromAmount,
            fromAddress: userAddress,
          };

          console.log('Quote request:', quoteRequest);

          const quote = await getQuote(quoteRequest);
          
          results.push({
            success: true,
            data: quote,
            chainId: chain.id,
            token,
            amount: testAmount.toString(),
          });

          console.log(`✅ Quote successful for ${token} on ${chain.name}:`, quote);

        } catch (error) {
          console.error(`❌ Quote failed for ${token} on ${chain.name}:`, error);
          
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            chainId: chain.id,
            token,
            amount: testAmount.toString(),
          });
        }
      }
    }

    setQuotes(results);
    setLoading(false);
  };

  const runRouteTests = async () => {
    setLoading(true);
    setQuotes([]);
    
    const results: QuoteResult[] = [];

    for (const chain of testChains) {
      for (const token of testTokens) {
        try {
          console.log(`Testing route for ${token} on ${chain.name} (${chain.id})`);
          
          const chainTokens = TOKEN_ADDRESSES[chain.id as keyof typeof TOKEN_ADDRESSES];
          const fromToken = chainTokens[token as keyof typeof chainTokens];
          const toToken = TOKEN_ADDRESSES[CHAIN_IDS.HYPEREVM].USDT0;
          
          // Convert USD amount to token units
          const decimals = token === 'ETH' ? 18 : 6;
          const fromAmount = (testAmount * Math.pow(10, decimals)).toString();

          // Test with getRoutes
          const routesRequest = {
            fromChainId: chain.id,
            toChainId: CHAIN_IDS.HYPEREVM,
            fromTokenAddress: fromToken,
            toTokenAddress: toToken,
            fromAmount,
            fromAddress: userAddress,
          };

          console.log('Routes request:', routesRequest);

          const routes = await getRoutes(routesRequest);
          
          results.push({
            success: true,
            data: routes,
            chainId: chain.id,
            token,
            amount: testAmount.toString(),
          });

          console.log(`✅ Routes successful for ${token} on ${chain.name}:`, routes);

        } catch (error) {
          console.error(`❌ Routes failed for ${token} on ${chain.name}:`, error);
          
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            chainId: chain.id,
            token,
            amount: testAmount.toString(),
          });
        }
      }
    }

    setQuotes(results);
    setLoading(false);
  };

  const executeSelectedRoute = async () => {
    if (!clientW.data) {
      alert('Please connect your wallet first to execute transactions');
      return;
    }

    if (!isConfigured) {
      alert('Li.Fi SDK is still initializing. Please wait a moment and try again.');
      return;
    }

    setExecuting(true);
    try {
      console.log('Executing route for:', selectedToken, 'on', getChainName(selectedChain), 'amount:', testAmount);
      
      // Get token addresses
      const chainTokens = TOKEN_ADDRESSES[selectedChain as keyof typeof TOKEN_ADDRESSES];
      const fromToken = chainTokens[selectedToken as keyof typeof chainTokens];
      const toToken = TOKEN_ADDRESSES[CHAIN_IDS.HYPEREVM].USDT0;
      
      // Convert USD amount to token units
      const decimals = selectedToken === 'ETH' ? 18 : 6;
      const fromAmount = (testAmount * Math.pow(10, decimals)).toString();

      // Get routes
      const routesRequest = {
        fromChainId: selectedChain,
        toChainId: CHAIN_IDS.HYPEREVM,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        fromAmount,
        fromAddress: userAddress,
      };

      console.log('Routes request:', routesRequest);
      const result = await getRoutes(routesRequest);
      
      if (!result.routes || result.routes.length === 0) {
        throw new Error('No routes available for this transfer');
      }

      const route = result.routes[0];
      console.log('Selected route:', route);

      // Execute the route
      const executedRoute = await executeRoute(route, {
        updateRouteHook: (updatedRoute) => {
          console.log('Route update:', updatedRoute);
        },
        acceptExchangeRateUpdateHook: async () => {
          return true; // Accept rate updates automatically
        },
        switchChainHook: async (chainId) => {
          console.log('Switching to chain:', chainId);
          try {
            const chain = await switchChain(wagmiConfig, { chainId });
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
        chainId: selectedChain,
        token: selectedToken,
        amount: testAmount.toString(),
      }]);

      console.log('✅ Execution successful:', executedRoute);
      alert(`Transaction successful! Hash: ${txHash}`);

    } catch (error) {
      console.error('❌ Execution failed:', error);
      
      setExecutions(prev => [...prev, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        chainId: selectedChain,
        token: selectedToken,
        amount: testAmount.toString(),
      }]);

      alert(`Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExecuting(false);
    }
  };

  const formatQuoteData = (data: any) => {
    if (!data) return 'No data';
    
    try {
      if (data.estimate) {
        // Quote response format
        return {
          toAmount: data.estimate.toAmount,
          gasCosts: data.estimate.gasCosts,
          feeCosts: data.estimate.feeCosts,
          executionTime: data.estimate.executionTime,
        };
      } else if (data.routes) {
        // Routes response format
        const bestRoute = data.routes[0];
        return {
          routeCount: data.routes.length,
          bestRoute: bestRoute ? {
            toAmount: bestRoute.estimate?.toAmount,
            gasCosts: bestRoute.estimate?.gasCosts,
            feeCosts: bestRoute.estimate?.feeCosts,
            executionTime: bestRoute.estimate?.executionTime,
            steps: bestRoute.steps?.length || 0,
            tags: bestRoute.tags || [],
          } : null,
          allRoutes: data.routes.map((route: any, index: number) => ({
            index,
            toAmount: route.estimate?.toAmount,
            gasCosts: route.estimate?.gasCosts?.reduce((sum: number, cost: any) => sum + parseFloat(cost.amountUSD || 0), 0),
            feeCosts: route.estimate?.feeCosts?.reduce((sum: number, cost: any) => sum + parseFloat(cost.amountUSD || 0), 0),
            steps: route.steps?.length || 0,
            tags: route.tags || [],
          })),
        };
      }
      return 'Unknown data format';
    } catch (error) {
      return 'Error parsing data';
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Li.Fi Quote Testing</h2>
      <p className="text-gray-600 mb-6">
        Testing quote fetching from Arbitrum, Base, and Ethereum to USDT0 on HyperEVM (Chain ID: {CHAIN_IDS.HYPEREVM})
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
            <strong>Wallet Required:</strong> Please connect your wallet to execute transactions. You can still test quote fetching without a wallet.
          </p>
        </div>
      )}
      
      <div className="mb-6 space-y-4">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium">
            Amount (USD):
            <input
              type="number"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="ml-2 px-2 py-1 border rounded w-24"
              min="1"
              step="0.01"
            />
          </label>
          
          <label className="text-sm font-medium">
            Chain:
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(Number(e.target.value))}
              className="ml-2 px-2 py-1 border rounded"
            >
              {testChains.map(chain => (
                <option key={chain.id} value={chain.id}>{chain.name}</option>
              ))}
            </select>
          </label>
          
          <label className="text-sm font-medium">
            Token:
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className="ml-2 px-2 py-1 border rounded"
            >
              {testTokens.map(token => (
                <option key={token} value={token}>{token}</option>
              ))}
            </select>
          </label>
        </div>
        
        <div className="flex space-x-4">
          <button
            onClick={runQuoteTests}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {loading ? 'Testing...' : `Test Quotes ($${testAmount} each)`}
          </button>
          
          <button
            onClick={runRouteTests}
            disabled={loading}
            className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
          >
            {loading ? 'Testing...' : `Test Routes ($${testAmount} each)`}
          </button>
          
          <button
            onClick={executeSelectedRoute}
            disabled={executing || !clientW.data || !isConfigured}
            className="px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
          >
            {executing ? 'Executing...' : !isConfigured ? 'Initializing SDK...' : `Execute Route ($${testAmount})`}
          </button>
        </div>
      </div>

      {quotes.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Results:</h3>
          <div className="grid gap-4">
            {quotes.map((quote, index) => (
              <div
                key={index}
                className={`p-4 rounded border ${
                  quote.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-medium">
                        {quote.token} on {getChainName(quote.chainId)} → USDT0 on HyperEVM
                      </span>
                      <span className="text-gray-500 ml-2">(${quote.amount})</span>
                    </div>
                  <span className={`px-2 py-1 rounded text-sm ${
                    quote.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {quote.success ? 'Success' : 'Failed'}
                  </span>
                </div>
                
                {quote.success ? (
                  <div className="text-sm">
                    <pre className="bg-gray-100 p-2 rounded overflow-auto">
                      {JSON.stringify(formatQuoteData(quote.data), null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="text-sm text-red-600">
                    Error: {quote.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {executions.length > 0 && (
        <div className="space-y-4 mt-8">
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
                    <span className="text-gray-500 ml-2">(${execution.amount})</span>
                  </div>
                  <span className={`px-2 py-1 rounded text-sm ${
                    execution.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {execution.success ? 'Executed' : 'Failed'}
                  </span>
                </div>
                
                {execution.success ? (
                  <div className="text-sm">
                    <p><strong>Transaction Hash:</strong> {execution.txHash}</p>
                    <p className="text-gray-600 mt-1">
                      <a 
                        href={`https://hyperevmscan.io/tx/${execution.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View on HyperEVM Explorer
                      </a>
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-red-600">
                    <strong>Error:</strong> {execution.error}
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

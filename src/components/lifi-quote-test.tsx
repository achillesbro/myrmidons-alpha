import { useState, useRef } from 'react';
import { getRoutes, executeRoute } from '@lifi/sdk';
import { CHAIN_IDS, TOKEN_ADDRESSES } from '../lib/lifi-config';
import { useWalletClient, useConfig } from 'wagmi';
import { switchChain, getWalletClient } from '@wagmi/core';
import { formatUnits, parseUnits } from 'viem';
import { BrowserProvider, Contract } from 'ethers';
import { useLifiConfig } from '../hooks/useLifiConfig';
import { LiFiBalanceFetcher } from './lifi-balance-fetcher';
import { Toasts, type Toast, type ToastKind } from './vault-shared';
import vaultAbi from '../abis/vault.json';
import { erc20Abi } from 'viem';

// Vault address for direct deposits
const VAULT_ADDRESS = '0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42' as `0x${string}`;

// Helper functions for chain names and explorer URLs
const getChainName = (chainId: number): string => {
  const chainNames: Record<number, string> = {
    1: 'Ethereum',
    42161: 'Arbitrum',
    8453: 'Base',
    10: 'Optimism',
    56: 'BSC',
    999: 'HyperEVM',
  };
  return chainNames[chainId] || `Chain ${chainId}`;
};

const getExplorerUrl = (chainId: number, txHash: string): string => {
  const explorerUrls: Record<number, string> = {
    1: 'https://etherscan.io',
    42161: 'https://arbiscan.io',
    8453: 'https://basescan.org',
    10: 'https://optimistic.etherscan.io',
    56: 'https://bscscan.com',
    999: 'https://hyperevmscan.io',
  };
  const baseUrl = explorerUrls[chainId] || 'https://etherscan.io';
  return `${baseUrl}/tx/${txHash}`;
};

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
  
  // Toast management
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef<number>(1);
  
  // Transaction flow state
  const [txFlow, setTxFlow] = useState<{
    isActive: boolean;
    steps: Array<{
      id: string;
      title: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      txHash?: string;
      explorerUrl?: string;
    }>;
  }>({
    isActive: false,
    steps: []
  });
  
  const clientW = useWalletClient();
  const wagmiConfig = useConfig();
  const userAddress = clientW.data?.account?.address || '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0';
  
  // Initialize Li.Fi SDK configuration
  const { isConfigured } = useLifiConfig();

  // Toast helper functions
  const pushToast = (kind: ToastKind, text: string, ttl = 5000, href?: string) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((t) => [...t, { id, kind, text, href }]);
    if (ttl > 0) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  };

  const clearToasts = () => {
    setToasts([]);
  };

  // Transaction flow helpers
  const startTxFlow = (steps: Array<{ id: string; title: string }>) => {
    setTxFlow({
      isActive: true,
      steps: steps.map(step => ({ ...step, status: 'pending' as const }))
    });
  };

  const updateTxStep = (stepId: string, status: 'processing' | 'completed' | 'failed', txHash?: string) => {
    setTxFlow(prev => ({
      ...prev,
      steps: prev.steps.map(step => 
        step.id === stepId 
          ? { 
              ...step, 
              status, 
              txHash,
              explorerUrl: txHash ? getExplorerUrl(selectedTokenInfo?.chainId || 0, txHash) : undefined
            }
          : step
      )
    }));
  };

  const completeTxFlow = () => {
    setTxFlow(prev => ({ ...prev, isActive: false }));
  };

  // Direct deposit function for USDT0 on HyperEVM
  const runDirectDeposit = async (amountWei: bigint) => {
    try {
      if (!clientW.data) throw new Error("Connect wallet");
      
      // Start transaction flow
      startTxFlow([
        { id: 'approve', title: 'Approve USDT0 spending' },
        { id: 'deposit', title: 'Deposit to vault' }
      ]);
      
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      
      // Check if approval is needed
      const token = new Contract(selectedTokenInfo?.tokenAddress || '', erc20Abi as any, signer);
      const allowance = await token.allowance(clientW.data.account.address, VAULT_ADDRESS);
      
      if (allowance < amountWei) {
        updateTxStep('approve', 'processing');
        const approveTx = await token.approve(VAULT_ADDRESS, amountWei);
        updateTxStep('approve', 'completed', approveTx.hash);
        
        // Wait for approval confirmation
        await provider.waitForTransaction(approveTx.hash, 1, 20_000).catch(() => null);
      } else {
        updateTxStep('approve', 'completed');
      }
      
      // Execute deposit
      updateTxStep('deposit', 'processing');
      const tx = await vault.deposit(amountWei, clientW.data.account.address);
      updateTxStep('deposit', 'completed', tx.hash);
      
      // Wait for confirmation
      await provider.waitForTransaction(tx.hash, 1, 20_000).catch(() => null);
      
      // Complete flow
      completeTxFlow();
      
      // Reset form
      setSelectedTokenInfo(null);
      setAmount('');
      
    } catch (e: any) {
      updateTxStep('deposit', 'failed');
      completeTxFlow();
    }
  };

  // Route monitoring functions based on Li.Fi documentation
  const getStepStatus = (step: any): string => {
    if (!step.execution?.process || step.execution.process.length === 0) {
      return 'Pending';
    }
    
    const latestProcess = step.execution.process[step.execution.process.length - 1];
    return latestProcess.status || 'Processing';
  };

  const getStepDescription = (step: any, stepIndex: number): string => {
    const tool = step.toolDetails?.key || 'Unknown';
    const fromToken = step.action?.fromToken?.symbol || 'Unknown';
    const toToken = step.action?.toToken?.symbol || 'Unknown';
    const fromChain = getChainName(step.action?.fromChainId || 0);
    const toChain = getChainName(step.action?.toChainId || 0);
    
    if (tool.includes('bridge') || tool.includes('glacis') || tool.includes('relay')) {
      return `Bridge ${fromToken} from ${fromChain} to ${toChain}`;
    } else if (tool.includes('swap') || tool.includes('uniswap') || tool.includes('1inch')) {
      return `Swap ${fromToken} to ${toToken} on ${fromChain}`;
    } else {
      return `Step ${stepIndex + 1}: ${tool}`;
    }
  };

  const monitorRouteExecution = (route: any) => {
    console.log('Monitoring route execution:', route);
    
    route.steps.forEach((step: any, stepIndex: number) => {
      const stepDescription = getStepDescription(step, stepIndex);
      const stepStatus = getStepStatus(step);
      
      console.log(`Step ${stepIndex + 1}: ${stepDescription} - Status: ${stepStatus}`);
      
      // Update transaction flow instead of toasts
      if (stepStatus === 'PROCESSING') {
        if (stepDescription.includes('Bridge')) {
          updateTxStep('bridge', 'processing');
        } else if (stepDescription.includes('Swap')) {
          updateTxStep('swap', 'processing');
        }
      } else if (stepStatus === 'DONE') {
        if (stepDescription.includes('Bridge')) {
          updateTxStep('bridge', 'completed');
        } else if (stepDescription.includes('Swap')) {
          updateTxStep('swap', 'completed');
        }
      } else if (stepStatus === 'FAILED') {
        if (stepDescription.includes('Bridge')) {
          updateTxStep('bridge', 'failed');
        } else if (stepDescription.includes('Swap')) {
          updateTxStep('swap', 'failed');
        }
      }
      
      // Collect transaction hashes for completed steps
      if (step.execution?.process) {
        const seenHashes = new Set<string>();
        step.execution.process.forEach((process: any) => {
          if (process.txHash && process.status === 'DONE' && !seenHashes.has(process.txHash)) {
            seenHashes.add(process.txHash);
            // Update the appropriate step with transaction hash
            if (stepDescription.includes('Bridge')) {
              updateTxStep('bridge', 'completed', process.txHash);
            } else if (stepDescription.includes('Swap')) {
              updateTxStep('swap', 'completed', process.txHash);
            }
          }
        });
      }
    });
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
    clearToasts(); // Clear any existing toasts
    
    // Check if it's USDT0 on HyperEVM - use direct deposit
    console.log('Selected token info:', selectedTokenInfo);
    const isUSDT0OnHyperEVM = selectedTokenInfo.tokenSymbol === 'USDT0' && selectedTokenInfo.chainId === CHAIN_IDS.HYPEREVM;
    console.log('Is USDT0 on HyperEVM?', isUSDT0OnHyperEVM);
    
    if (isUSDT0OnHyperEVM) {
      try {
        // Convert USD amount to native token amount
        let fromAmount: string;
        if (selectedTokenInfo.priceUSD) {
          const usdAmount = parseFloat(amount);
          const tokenPrice = parseFloat(selectedTokenInfo.priceUSD);
          const nativeAmount = usdAmount / tokenPrice;
          fromAmount = Math.round(nativeAmount * Math.pow(10, selectedTokenInfo.decimals)).toString();
        } else {
          fromAmount = parseUnits(amount, selectedTokenInfo.decimals).toString();
        }
        
        pushToast('info', 'Processing direct deposit...', 3000);
        await runDirectDeposit(BigInt(fromAmount));
        return;
      } catch (error: any) {
        pushToast('error', `Direct deposit failed: ${error.message || 'Unknown error'}`, 8000);
        return;
      } finally {
        setExecuting(false);
      }
    }
    
    // Otherwise, use Li.Fi for bridging/swapping
    startTxFlow([
      { id: 'bridge', title: `Bridge ${selectedTokenInfo.tokenSymbol} from ${getChainName(selectedTokenInfo.chainId)}` },
      { id: 'swap', title: 'Swap to USDT0 on HyperEVM' }
    ]);
    
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
        const relayers = route.steps?.map(step => step.toolDetails?.key).filter(Boolean) || [];
        console.log(`Route ${index}:`, {
          id: route.id,
          fromToken: route.fromToken,
          toToken: route.toToken,
          steps: route.steps?.length || 0,
          gasCostUSD: route.gasCostUSD,
          relayers: relayers
        });
      });

      // Find the best route (prefer non-Glacis for ETH on Arbitrum)
      let selectedRoute = result.routes[0];
      
      if (selectedTokenInfo.tokenSymbol === 'ETH' && selectedTokenInfo.chainId === CHAIN_IDS.ARBITRUM) {
        // For ETH on Arbitrum, prefer non-Glacis routes
        const nonGlacisRoute = result.routes.find(route => 
          !route.steps?.some(step => step.toolDetails?.key?.toLowerCase().includes('glacis'))
        );
        if (nonGlacisRoute) {
          selectedRoute = nonGlacisRoute;
          console.log('🚀 Selected non-Glacis route for ETH on Arbitrum:', selectedRoute.id);
        } else {
          console.log('⚠️ No non-Glacis route found, using first available route');
        }
      }

      console.log('Selected route details:', {
        id: selectedRoute.id,
        fromToken: selectedRoute.fromToken,
        toToken: selectedRoute.toToken,
        steps: selectedRoute.steps?.map(step => ({
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
      if (selectedRoute.steps && selectedRoute.steps.length > 0) {
        const firstStep = selectedRoute.steps[0];
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
      
      // Track transaction hashes for wallet monitoring
      const txHashes: string[] = [];
      let finalTxHash = 'Unknown';
      
      const executedRoute = await executeRoute(selectedRoute, {
        updateRouteHook: (updatedRoute) => {
          console.log('Route update:', {
            steps: updatedRoute.steps?.map(step => ({
              type: step.type,
              tool: step.toolDetails?.key,
              txHash: step.execution?.process?.[0]?.txHash
            }))
          });
          
          // Monitor route execution with toasts
          monitorRouteExecution(updatedRoute);
          
          // Collect all transaction hashes
          updatedRoute.steps?.forEach(step => {
            if (step.execution?.process) {
              step.execution.process.forEach(process => {
                if (process.txHash && !txHashes.includes(process.txHash)) {
                  txHashes.push(process.txHash);
                  finalTxHash = process.txHash; // Keep the latest one
                }
              });
            }
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

      // Extract final transaction hash from the executed route
      if (executedRoute.steps && executedRoute.steps.length > 0) {
        const lastStep = executedRoute.steps[executedRoute.steps.length - 1];
        if (lastStep.execution?.process && lastStep.execution.process.length > 0) {
          const lastProcess = lastStep.execution.process[lastStep.execution.process.length - 1];
          finalTxHash = lastProcess.txHash || finalTxHash;
        }
      }

      // Complete transaction flow
      completeTxFlow();
      
      // Add to executions list
      setExecutions(prev => [...prev, {
        success: true,
        txHash: finalTxHash,
        chainId: selectedTokenInfo.chainId,
        token: selectedTokenInfo.tokenSymbol,
        amount: amount,
      }]);

      // Monitor transaction using wallet provider for faster confirmation
      if (finalTxHash !== 'Unknown') {
        try {
          const provider = new BrowserProvider((window as any).ethereum);
          // Wait for confirmation using wallet provider (faster than public RPC)
          await provider.waitForTransaction(finalTxHash, 1, 20_000).catch(() => null);
          console.log('Transaction confirmed via wallet provider');
        } catch (error) {
          console.warn('Wallet transaction monitoring failed:', error);
        }
      }

      // Reset form
      setSelectedTokenInfo(null);
      setAmount('');
      
    } catch (error: any) {
      console.error('Execution failed:', error);
      completeTxFlow();
      
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
                    <div>
                      Transaction Hash: {execution.txHash && execution.txHash !== 'Unknown' ? (
                        <a
                          href={getExplorerUrl(execution.chainId, execution.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline font-mono"
                        >
                          {execution.txHash}
                        </a>
                      ) : (
                        <span className="text-gray-500">Unknown</span>
                      )}
                    </div>
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

        {/* Transaction Flow */}
        {txFlow.isActive && (
          <div className="mt-6 bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-[#00295B]">Transaction Progress</h3>
            <div className="space-y-3">
              {txFlow.steps.map((step) => (
                <div key={step.id} className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {step.status === 'pending' && (
                      <div className="w-6 h-6 rounded-full border-2 border-gray-300"></div>
                    )}
                    {step.status === 'processing' && (
                      <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                    )}
                    {step.status === 'completed' && (
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {step.status === 'failed' && (
                      <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      step.status === 'completed' ? 'text-green-700' :
                      step.status === 'failed' ? 'text-red-700' :
                      step.status === 'processing' ? 'text-blue-700' :
                      'text-gray-600'
                    }`}>
                      {step.title}
                    </p>
                    {step.txHash && (
                      <a
                        href={step.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View on Explorer: {step.txHash.slice(0, 8)}...
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toast notifications */}
        <Toasts toasts={toasts} />
      </div>
    );
  }

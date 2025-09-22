import { useState, useRef, useEffect } from 'react';
import { getRoutes, executeRoute, getToken, getTokenBalances } from '@lifi/sdk';
import { CHAIN_IDS, TOKEN_ADDRESSES } from '../lib/lifi-config';
import { useWalletClient, useConfig } from 'wagmi';
import { switchChain, getWalletClient } from '@wagmi/core';
import { formatUnits, parseUnits } from 'viem';
import { BrowserProvider, Contract } from 'ethers';
import { useLifiConfig } from '../hooks/useLifiConfig';
import { LiFiBalanceFetcher } from './lifi-balance-fetcher';
import { Toasts, type Toast, type ToastKind } from './vault-shared';
import { erc20Abi } from 'viem';
import vaultAbi from '../abis/vault.json';

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
  
  // USDT0 balance for direct deposits (fetched separately)
  const [usdt0Balance, setUsdt0Balance] = useState<{
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
  const [usdt0Loading, setUsdt0Loading] = useState(false);
  
  // Toast management
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef<number>(1);
  
  const clientW = useWalletClient();
  const wagmiConfig = useConfig();
  const userAddress = clientW.data?.account?.address || '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0';
  
  // Initialize Li.Fi SDK configuration
  const { isConfigured } = useLifiConfig();

  // Fetch USDT0 balance when wallet connects
  useEffect(() => {
    if (clientW.data?.account?.address) {
      fetchUSDT0Balance();
    }
  }, [clientW.data?.account?.address]);

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
      
      // Show toast for each step
      if (stepStatus === 'DONE') {
        pushToast('success', `${stepDescription} completed`, 3000);
      } else if (stepStatus === 'FAILED') {
        pushToast('error', `${stepDescription} failed`, 5000);
      } else if (stepStatus === 'PENDING') {
        pushToast('info', `${stepDescription} pending...`, 2000);
      } else if (stepStatus === 'PROCESSING') {
        pushToast('info', `${stepDescription} processing...`, 2000);
      }
      
      // Show transaction hashes for completed steps
      if (step.execution?.process) {
        step.execution.process.forEach((process: any) => {
          if (process.txHash && process.status === 'DONE') {
            const explorerUrl = getExplorerUrl(step.action?.fromChainId || 0, process.txHash);
            pushToast('info', `Transaction: ${process.txHash.slice(0, 8)}...`, 5000, explorerUrl);
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

  // Fetch USDT0 balance using Li.Fi APIs
  const fetchUSDT0Balance = async () => {
    if (!clientW.data?.account?.address) return;
    
    setUsdt0Loading(true);
    try {
      console.log('Fetching USDT0 balance for address:', clientW.data.account.address);
      
      // Get USDT0 token info from Li.Fi
      const tokenInfo = await getToken(CHAIN_IDS.HYPEREVM, TOKEN_ADDRESSES[CHAIN_IDS.HYPEREVM].USDT0);
      
      // Get token balances using Li.Fi (correct API usage)
      const balances = await getTokenBalances(clientW.data.account.address, [tokenInfo]);
      
      if (balances && balances.length > 0) {
        const balance = balances[0];
        const amountStr = balance.amount?.toString() || '0';
        const balanceFormatted = formatUnits(BigInt(amountStr), balance.decimals || 6);
        const balanceUSD = tokenInfo.priceUSD ? 
          (parseFloat(balanceFormatted) * parseFloat(tokenInfo.priceUSD)).toFixed(2) : 
          balanceFormatted;
        
        console.log('USDT0 balance fetched:', {
          balance: amountStr,
          balanceFormatted,
          balanceUSD,
          priceUSD: tokenInfo.priceUSD
        });
        
        // Only set balance if it's greater than 0
        if (parseFloat(balanceFormatted) > 0) {
          setUsdt0Balance({
            chainId: CHAIN_IDS.HYPEREVM,
            chainName: 'HyperEVM',
            tokenSymbol: 'USDT0',
            tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.HYPEREVM].USDT0,
            balance: amountStr,
            balanceFormatted,
            decimals: balance.decimals || 6,
            logoURI: tokenInfo.logoURI,
            priceUSD: tokenInfo.priceUSD,
            balanceUSD: `$${balanceUSD}`
          });
        } else {
          setUsdt0Balance(null);
        }
      } else {
        setUsdt0Balance(null);
      }
    } catch (error) {
      console.error('Error fetching USDT0 balance:', error);
      setUsdt0Balance(null);
    } finally {
      setUsdt0Loading(false);
    }
  };

  // Direct deposit function using vault-api-view.tsx logic
  const handleDirectDeposit = async (enteredAmount: string) => {
    if (!usdt0Balance || !enteredAmount || parseFloat(enteredAmount) <= 0) return;
    
    try {
      setExecuting(true);
      pushToast('info', 'Starting direct deposit...', 3000);
      
      // Force switch to HyperEVM chain for USDT0 deposit
      try {
        await switchChain(wagmiConfig, { chainId: CHAIN_IDS.HYPEREVM });
        pushToast('info', 'Switched to HyperEVM', 2000);
      } catch (error: any) {
        console.error('Chain switch failed:', error);
        pushToast('error', 'Failed to switch to HyperEVM. Please switch manually.', 5000);
        setExecuting(false);
        return;
      }
      
      // Convert USD amount to USDT0 amount (assuming 1:1 for USDT0)
      const usdt0Amount = parseUnits(enteredAmount, usdt0Balance.decimals);
      
      // Use the vault's runDeposit function logic
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      
      // Check if approval is needed (with error handling for non-standard tokens)
      let needsApproval = false;
      try {
        const token = new Contract(usdt0Balance.tokenAddress, erc20Abi as any, signer);
        const allowance = await token.allowance(clientW.data?.account?.address, VAULT_ADDRESS);
        needsApproval = allowance < usdt0Amount;
      } catch (error: any) {
        console.log('Allowance check failed, assuming no approval needed:', error.message);
        // If allowance check fails, assume the token doesn't require approval
        // This could be a native token or a token without standard ERC-20 allowance
        needsApproval = false;
      }
      
      if (needsApproval) {
        try {
          pushToast('info', 'Approving USDT0 spending...', 3000);
          const token = new Contract(usdt0Balance.tokenAddress, erc20Abi as any, signer);
          const approveTx = await token.approve(VAULT_ADDRESS, usdt0Amount);
          pushToast('info', `Approval tx: ${approveTx.hash}`, 7000, `https://hyperevmscan.io/tx/${approveTx.hash}`);
          await provider.waitForTransaction(approveTx.hash, 1, 20_000).catch(() => null);
          pushToast('success', 'Approval confirmed', 3000);
        } catch (error: any) {
          console.log('Approval failed, proceeding without approval:', error.message);
          pushToast('info', 'Skipping approval (token may not require it)', 3000);
        }
      }
      
      // Execute deposit
      pushToast('info', 'Depositing to vault...', 3000);
      const tx = await vault.deposit(usdt0Amount, clientW.data?.account?.address);
      pushToast('info', `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);
      
      await provider.waitForTransaction(tx.hash, 1, 20_000).catch(() => null);
      pushToast('success', 'Deposit successful', 5000);
      
      // Refresh USDT0 balance
      await fetchUSDT0Balance();
      setAmount('');
      
    } catch (error: any) {
      pushToast('error', `Deposit failed: ${error.message || 'Unknown error'}`, 8000);
    } finally {
      setExecuting(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedTokenInfo || !amount) return;
    
    // Check if selected token is USDT0 on HyperEVM - use direct deposit
    if (selectedTokenInfo.tokenSymbol === 'USDT0' && selectedTokenInfo.chainId === CHAIN_IDS.HYPEREVM) {
      await handleDirectDeposit(amount);
      return;
    }
    
    setExecuting(true);
    clearToasts(); // Clear any existing toasts
    pushToast('info', 'Starting bridge execution...', 3000);
    
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

      // Show success toast
      pushToast('success', 'Bridge execution completed successfully!', 5000);
      
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
          pushToast('success', 'Transaction confirmed on-chain', 3000);
        } catch (error) {
          console.warn('Wallet transaction monitoring failed:', error);
        }
      }

      // Reset form
      setSelectedTokenInfo(null);
      setAmount('');
      
    } catch (error: any) {
      console.error('Execution failed:', error);
      pushToast('error', `Bridge execution failed: ${error.message || 'Unknown error'}`, 8000);
      
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
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center space-x-4 mb-6">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-[#00295B] text-white flex items-center justify-center text-sm font-semibold">1</div>
          <span className="text-sm font-medium text-[#00295B]">Select Token</span>
        </div>
        <div className="w-8 h-0.5 bg-gray-300"></div>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-semibold">2</div>
          <span className="text-sm font-medium text-gray-600">Enter Amount</span>
        </div>
        <div className="w-8 h-0.5 bg-gray-300"></div>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-semibold">3</div>
          <span className="text-sm font-medium text-gray-600">Confirm</span>
        </div>
      </div>
      
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
         usdt0Balance={usdt0Balance}
         usdt0Loading={usdt0Loading}
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

      {/* Toast notifications */}
      <Toasts toasts={toasts} />
    </div>
  );
}

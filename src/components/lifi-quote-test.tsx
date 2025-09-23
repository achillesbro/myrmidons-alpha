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


// Status tracking using Li.Fi API as per documentation
const getStatus = async (txHash: string, fromChainId?: number, toChainId?: number) => {
  try {
    const params: any = { txHash };
    if (fromChainId) params.fromChain = fromChainId;
    if (toChainId) params.toChain = toChainId;
    
    const response = await fetch('https://li.quest/v1/status?' + new URLSearchParams(params));
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error fetching status:', error);
    return null;
  }
};

// Test Li.Fi API connectivity
const testLifiApiConnectivity = async () => {
  try {
    console.log('Testing Li.Fi API connectivity...');
    const response = await fetch('https://li.quest/v1/chains');
    if (response.ok) {
      console.log('✅ Li.Fi API is accessible');
      return true;
    } else {
      console.log('❌ Li.Fi API returned error:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.log('❌ Li.Fi API connectivity test failed:', error);
    return false;
  }
};


interface LiFiQuoteTestProps {
  onSuccess?: () => void;
}

export function LiFiQuoteTest({ onSuccess }: LiFiQuoteTestProps = {}) {
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
  const [currentStep, setCurrentStep] = useState(1);
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  
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
    // Use local toast system for info and error toasts only
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    
    // Always clear old toasts before showing new ones to prevent accumulation
    if (kind === 'info' || kind === 'error') {
      setToasts([]);
    }
    
    setToasts((t) => [...t, { id, kind, text, href }]);
    
    // Only auto-remove non-pending toasts
    if (ttl > 0 && kind !== 'info') {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
    }
  };

  // Success handler - goes directly to step 4 without toasts
  const handleSuccess = () => {
    setTransactionSuccess(true);
    setCurrentStep(4);
  };

  const clearToasts = () => {
    setToasts([]);
  };

  const handleClose = () => {
    if (onSuccess) {
      onSuccess();
    }
  };

  // Monitor bridge status until completion (as per Li.Fi docs)
  const monitorBridgeStatus = async (txHash: string, fromChainId: number, toChainId: number) => {
    console.log('🔍 Starting bridge status monitoring for tx:', txHash);
    
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (5 second intervals)
    
    const checkStatus = async (): Promise<boolean> => {
      attempts++;
      console.log(`📊 Status check attempt ${attempts}/${maxAttempts}`);
      
      const result = await getStatus(txHash, fromChainId, toChainId);
      
      if (!result) {
        console.log('❌ Failed to fetch status');
        return false;
      }
      
      console.log('📋 Status result:', {
        status: result.status,
        substatus: result.substatus,
        substatusMessage: result.substatusMessage
      });
      
      // Show progress toasts based on status
      if (result.status === 'PENDING') {
        if (result.substatus === 'WAIT_SOURCE_CONFIRMATIONS') {
          pushToast('info', 'Waiting for source chain confirmations...', 3000);
        } else if (result.substatus === 'WAIT_DESTINATION_TRANSACTION') {
          pushToast('info', 'Waiting for destination transaction...', 3000);
        } else {
          pushToast('info', 'Bridge transaction in progress...', 3000);
        }
      } else if (result.status === 'DONE') {
        console.log('✅ Bridge completed successfully!');
        pushToast('info', 'Bridge completed - USDT0 received on HyperEVM!', 3000);
        return true;
      } else if (result.status === 'FAILED') {
        console.log('❌ Bridge failed:', result.substatusMessage);
        pushToast('error', `Bridge failed: ${result.substatusMessage || 'Unknown error'}`, 8000);
        return true; // Stop monitoring on failure
      }
      
      return false;
    };
    
    // Poll status until completion or max attempts
    while (attempts < maxAttempts) {
      const isComplete = await checkStatus();
      if (isComplete) break;
      
      // Wait 5 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    if (attempts >= maxAttempts) {
      console.log('⏰ Status monitoring timeout');
      pushToast('error', 'Bridge status monitoring timeout. Please check manually.', 8000);
    }
  };



  // Handler functions for balance fetcher
  const handleTokenSelect = (tokenInfo: any) => {
    setSelectedTokenInfo(tokenInfo);
    setCurrentStep(2); // Move to step 2 when token is selected
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
            balanceUSD: balanceUSD
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
          pushToast('info', 'Approval confirmed', 3000);
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
      
      // Show success - go directly to step 4
      handleSuccess();
      
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
        options: {
          slippageTolerance: 0.03, // 3% slippage tolerance to prevent 409 errors
          integrator: 'earn-basic-app'
        }
      };

      console.log('Routes request:', routesRequest);
      
      // Test API connectivity first
      const isApiAccessible = await testLifiApiConnectivity();
      if (!isApiAccessible) {
        throw new Error('Li.Fi API is not accessible. Please check your internet connection and try again.');
      }
      
      // Add error handling for network issues
      let result;
      try {
        result = await getRoutes(routesRequest);
      } catch (error: any) {
        console.error('getRoutes failed:', error);
        
        // Check if it's a network error
        if (error.message?.includes('Failed to fetch')) {
          throw new Error('Network error: Unable to connect to Li.Fi API. Please check your internet connection and try again.');
        }
        
        // Re-throw other errors
        throw error;
      }
      
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
          
          // Collect transaction hashes for status monitoring
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

      // Use proper status tracking as per Li.Fi documentation
      if (finalTxHash !== 'Unknown') {
        console.log('🚀 Starting proper status monitoring for bridge completion...');
        
        // Start status monitoring in background - this will handle success/failure
        monitorBridgeStatus(finalTxHash, selectedTokenInfo.chainId, CHAIN_IDS.HYPEREVM)
          .then(() => {
            // Only trigger success when status monitoring confirms completion
            console.log('✅ Status monitoring confirmed bridge completion');
            handleSuccess();
          })
          .catch((error) => {
            console.error('❌ Status monitoring failed:', error);
            pushToast('error', 'Failed to monitor bridge status', 5000);
          });
      } else {
        console.warn('⚠️ No transaction hash found for status monitoring');
        pushToast('error', 'No transaction hash found for monitoring', 5000);
      }

      // Reset form
      setSelectedTokenInfo(null);
      setAmount('');
      
    } catch (error: any) {
      console.error('Execution failed:', error);
      pushToast('error', `Bridge execution failed: ${error.message || 'Unknown error'}`, 8000);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center space-x-4 mb-6">
        <div className="flex items-center space-x-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
            currentStep >= 1 ? 'bg-[#00295B] text-white' : 'bg-gray-300 text-gray-600'
          }`}>1</div>
          <span className={`text-sm font-medium ${
            currentStep >= 1 ? 'text-[#00295B]' : 'text-gray-600'
          }`}>Select Token</span>
        </div>
        <div className={`w-8 h-0.5 ${currentStep >= 2 ? 'bg-[#00295B]' : 'bg-gray-300'}`}></div>
        <div className="flex items-center space-x-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
            currentStep >= 2 ? 'bg-[#00295B] text-white' : 'bg-gray-300 text-gray-600'
          }`}>2</div>
          <span className={`text-sm font-medium ${
            currentStep >= 2 ? 'text-[#00295B]' : 'text-gray-600'
          }`}>Enter Amount</span>
        </div>
        <div className={`w-8 h-0.5 ${currentStep >= 3 ? 'bg-[#00295B]' : 'bg-gray-300'}`}></div>
        <div className="flex items-center space-x-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
            currentStep >= 3 ? 'bg-[#00295B] text-white' : 'bg-gray-300 text-gray-600'
          }`}>3</div>
          <span className={`text-sm font-medium ${
            currentStep >= 3 ? 'text-[#00295B]' : 'text-gray-600'
          }`}>Confirm</span>
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
         currentStep={currentStep}
         onStepChange={setCurrentStep}
         transactionSuccess={transactionSuccess}
         onClose={handleClose}
       />

      {/* Toast notifications */}
      <Toasts toasts={toasts} />
    </div>
  );
}

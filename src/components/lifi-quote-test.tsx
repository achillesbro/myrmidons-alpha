import { useState, useRef, useEffect } from 'react';
import { getRoutes, executeRoute, getToken, getTokenBalances, getActiveRoutes, RouteExtended } from '@lifi/sdk';
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
  const [monitoringInterval, setMonitoringInterval] = useState<NodeJS.Timeout | null>(null);
  
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
  const { isConfigured, isLoading: sdkLoading, hasError: sdkError } = useLifiConfig();

  // Fetch USDT0 balance when wallet connects
  useEffect(() => {
    if (clientW.data?.account?.address) {
      fetchUSDT0Balance();
    }
  }, [clientW.data?.account?.address]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopRouteMonitoring();
    };
  }, []);

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

  // Enhanced route monitoring functions based on Li.Fi documentation
  const getStepStatus = (step: any): string => {
    if (!step.execution?.process || step.execution.process.length === 0) {
      return 'PENDING';
    }
    
    // Check all processes in the array to determine overall step status
    const processes = step.execution.process;
    const hasFailed = processes.some((process: any) => process.status === 'FAILED');
    const hasDone = processes.some((process: any) => process.status === 'DONE');
    const hasPending = processes.some((process: any) => process.status === 'PENDING');
    
    if (hasFailed) return 'FAILED';
    if (hasDone && !hasPending) return 'DONE';
    if (hasPending) return 'PENDING';
    
    return 'PROCESSING';
  };

  // Get transaction hashes from all processes in a step (as per Li.Fi docs)
  const getTransactionLinks = (route: RouteExtended) => {
    const transactionHashes: string[] = [];
    
    route.steps.forEach((step, index) => {
      step.execution?.process.forEach((process) => {
        if (process.txHash) {
          console.log(
            `Transaction Hash for Step ${index + 1}, Process ${process.type}:`,
            process.txHash
          );
          transactionHashes.push(process.txHash);
        }
      });
    });
    
    return transactionHashes;
  };

  // Check if a step is the final step (receiving USDT0 on HyperEVM)
  const isFinalStep = (step: any): boolean => {
    const isFinal = step.action?.toToken?.symbol === 'USDT0' && 
                   step.action?.toChainId === CHAIN_IDS.HYPEREVM;
    
    console.log('🔍 Checking if final step:', {
      toTokenSymbol: step.action?.toToken?.symbol,
      toChainId: step.action?.toChainId,
      expectedChainId: CHAIN_IDS.HYPEREVM,
      isFinal
    });
    
    return isFinal;
  };

  // Enhanced process monitoring based on Li.Fi documentation
  const getProcessDetails = (step: any, stepIndex: number) => {
    if (!step.execution?.process) return [];
    
    return step.execution.process.map((process: any, processIndex: number) => ({
      stepIndex,
      processIndex,
      type: process.type,
      status: process.status,
      txHash: process.txHash,
      description: `${process.type} - ${process.status}`
    }));
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

  // Enhanced route execution monitoring based on Li.Fi documentation
  const monitorRouteExecution = (route: any) => {
    console.log('🔍 Monitoring route execution:', {
      routeId: route.id,
      stepsCount: route.steps?.length,
      steps: route.steps?.map((step: any, index: number) => ({
        index,
        type: step.type,
        tool: step.toolDetails?.key,
        status: getStepStatus(step),
        processes: getProcessDetails(step, index)
      }))
    });
    
    if (!route.steps || route.steps.length === 0) {
      console.log('⚠️ No steps found in route');
      return;
    }
    
    // Track overall execution status
    let allStepsComplete = true;
    let hasFailedStep = false;
    let finalStepComplete = false;
    
    // Monitor each step and its processes
    route.steps.forEach((step: any, stepIndex: number) => {
      const stepStatus = getStepStatus(step);
      const stepDescription = getStepDescription(step, stepIndex);
      const isFinal = isFinalStep(step);
      
      console.log(`📊 Step ${stepIndex + 1}: ${stepDescription} - Status: ${stepStatus} ${isFinal ? '(FINAL)' : ''}`);
      
      // Debug step structure
      console.log('🔍 Step structure:', {
        stepIndex: stepIndex + 1,
        action: step.action,
        toolDetails: step.toolDetails,
        isFinal
      });
      
      // Track step completion
      if (stepStatus === 'FAILED') {
        hasFailedStep = true;
        allStepsComplete = false;
        pushToast('error', `${stepDescription} failed`, 5000);
      } else if (stepStatus === 'DONE') {
        if (isFinal) {
          finalStepComplete = true;
        }
        pushToast('info', `${stepDescription} completed`, 3000);
      } else if (stepStatus === 'PENDING') {
        allStepsComplete = false;
        pushToast('info', `${stepDescription} pending...`, 2000);
      } else if (stepStatus === 'PROCESSING') {
        allStepsComplete = false;
        pushToast('info', `${stepDescription} processing...`, 2000);
      } else {
        allStepsComplete = false;
      }
      
      // Monitor individual processes and show transaction hashes
      if (step.execution?.process) {
        step.execution.process.forEach((process: any, processIndex: number) => {
          if (process.txHash) {
            const explorerUrl = getExplorerUrl(step.action?.fromChainId || 0, process.txHash);
            console.log(`🔗 Process ${processIndex + 1} (${process.type}): ${process.txHash} - ${process.status}`);
            
            if (process.status === 'DONE') {
              pushToast('info', `Transaction: ${process.txHash.slice(0, 8)}...`, 5000, explorerUrl);
            }
          }
        });
      }
    });
    
    // Success detection: All steps complete AND final step (USDT0 received) is done
    console.log('🎯 Success detection check:', {
      allStepsComplete,
      hasFailedStep,
      finalStepComplete,
      shouldTriggerSuccess: allStepsComplete && !hasFailedStep && finalStepComplete
    });
    
    if (allStepsComplete && !hasFailedStep && finalStepComplete) {
      console.log('✅ Bridge execution completed - USDT0 received on HyperEVM');
      handleSuccess();
    } else if (hasFailedStep) {
      console.log('❌ Route execution failed');
    } else {
      console.log('⏳ Route execution in progress...');
    }
  };

  // Active route management based on Li.Fi documentation
  const getActiveRouteInfo = () => {
    try {
      const activeRoutes = getActiveRoutes();
      
      console.log('📋 Active routes:', activeRoutes.map((route: any) => ({
        id: route.id,
        stepsCount: route.steps?.length
      })));
      
      return activeRoutes;
    } catch (error) {
      console.warn('⚠️ Could not get active routes:', error);
      return [];
    }
  };

  // Enhanced route monitoring with active route tracking
  const monitorActiveRoutes = () => {
    const activeRoutes = getActiveRouteInfo();
    
    if (activeRoutes.length > 0) {
      console.log('🔄 Monitoring active routes...');
      activeRoutes.forEach((route: any) => {
        monitorRouteExecution(route);
      });
    }
  };

  // Start periodic monitoring for active routes
  const startRouteMonitoring = () => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }
    
    const interval = setInterval(() => {
      monitorActiveRoutes();
    }, 2000); // Check every 2 seconds
    
    setMonitoringInterval(interval);
    console.log('🔄 Started periodic route monitoring');
  };

  // Stop periodic monitoring
  const stopRouteMonitoring = () => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      setMonitoringInterval(null);
      console.log('⏹️ Stopped periodic route monitoring');
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
      console.log('🔄 Fetching USDT0 balance for address:', clientW.data.account.address);
      
      // Check if SDK is configured first
      if (!isConfigured) {
        console.warn('⚠️ Li.Fi SDK not configured, skipping USDT0 balance fetch');
        setUsdt0Balance(null);
        return;
      }
      
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
        
        console.log('✅ USDT0 balance fetched:', {
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
    } catch (error: any) {
      console.error('❌ Error fetching USDT0 balance:', error);
      
      // Check if it's an SDK configuration error
      if (error.message && error.message.includes('SDK Token Provider')) {
        console.warn('⚠️ SDK Token Provider not found, Li.Fi SDK may not be properly configured');
      }
      
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
      // Note: Don't clear amount here as it's needed for step 4 display
      
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
      
      // Start monitoring active routes
      startRouteMonitoring();
      
      // Track transaction hashes for wallet monitoring
      const txHashes: string[] = [];
      let finalTxHash = 'Unknown';
      
      const executedRoute = await executeRoute(selectedRoute, {
        updateRouteHook: (updatedRoute) => {
          console.log('🔄 Route update received:', {
            routeId: updatedRoute.id,
            steps: updatedRoute.steps?.map((step: any, index: number) => ({
              index,
              type: step.type,
              tool: step.toolDetails?.key,
              status: getStepStatus(step),
              processes: getProcessDetails(step, index)
            }))
          });
          
          // Enhanced monitoring with process-level tracking
          monitorRouteExecution(updatedRoute);
          
          // Collect all transaction hashes with better tracking
          const stepHashes = getTransactionLinks(updatedRoute);
          stepHashes.forEach(txHash => {
            if (!txHashes.includes(txHash)) {
              txHashes.push(txHash);
              finalTxHash = txHash; // Keep the latest one
              console.log(`📝 Collected tx hash: ${txHash}`);
            }
          });
          
          // Also monitor any active routes for comprehensive tracking
          monitorActiveRoutes();
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
      pushToast('error', `Bridge execution failed: ${error.message || 'Unknown error'}`, 8000);
    } finally {
      // Stop monitoring when execution completes or fails
      stopRouteMonitoring();
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
            <strong>Initializing Li.Fi SDK:</strong> {sdkLoading ? 'Loading chain configurations... This may take a moment.' : sdkError ? 'Failed to initialize. Please refresh the page.' : 'Please wait...'}
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
         isSdkConfigured={isConfigured}
         isSdkLoading={sdkLoading}
         hasSdkError={sdkError}
       />

      {/* Toast notifications */}
      <Toasts toasts={toasts} />
    </div>
  );
}

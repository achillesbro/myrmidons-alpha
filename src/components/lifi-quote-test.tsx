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


interface LiFiQuoteTestProps {
  onStepChange?: (step: number) => void;
}

// Path types for deposit flows
type DepositPath = 'A' | 'B' | null;

// Step information for each path
interface StepInfo {
  label: string;
  component: string;
  canGoBack: boolean;
}

// Comprehensive deposit state
interface DepositState {
  selectedPath: DepositPath;
  selectedToken: {
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
  } | null;
  amount: string;
  bridgeTxHash: string | null;
  bridgedUsdt0Amount: string | null;
  vaultSharesMinted: string | null;
  currentStep: number;
}

export function LiFiQuoteTest({ onStepChange }: LiFiQuoteTestProps = {}) {
  const [executing, setExecuting] = useState(false);
  
  // Comprehensive deposit state
  const [depositState, setDepositState] = useState<DepositState>({
    selectedPath: null,
    selectedToken: null,
    amount: '',
    bridgeTxHash: null,
    bridgedUsdt0Amount: null,
    vaultSharesMinted: null,
    currentStep: 1,
  });
  
  // Legacy state for backward compatibility (will be removed)
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
  
  // Initialize Li.Fi SDK configuration with enhanced error handling
  const { isConfigured } = useLifiConfig();
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  // Enhanced SDK initialization check
  useEffect(() => {
    if (isConfigured) {
      setSdkInitialized(true);
      setSdkError(null);
    } else {
      // Check if SDK is still loading or if there's an error
      const timeout = setTimeout(() => {
        if (!isConfigured) {
          setSdkError('Li.Fi SDK initialization timeout. Please refresh the page.');
        }
      }, 30000); // 30 second timeout

      return () => clearTimeout(timeout);
    }
  }, [isConfigured]);

  // Path detection logic
  const detectPath = (token: DepositState['selectedToken']): DepositPath => {
    if (!token) return null;
    
    // Path A: USDT0 on HyperEVM (direct deposit)
    if (token.tokenSymbol === 'USDT0' && token.chainId === CHAIN_IDS.HYPEREVM) {
      return 'A';
    }
    
    // Path B: Any other token (bridge + deposit)
    return 'B';
  };

  // Step information for each path
  const getStepInfo = (path: DepositPath, step: number): StepInfo => {
    if (path === 'A') {
      const steps: Record<number, StepInfo> = {
        1: { label: 'Select USDT0', component: 'TokenSelection', canGoBack: false },
        2: { label: 'Enter Amount', component: 'AmountInput', canGoBack: true },
        3: { label: 'Confirm Deposit', component: 'DepositConfirmation', canGoBack: true },
        4: { label: 'Success', component: 'DepositSuccess', canGoBack: false },
      };
      return steps[step] || { label: 'Unknown', component: 'Unknown', canGoBack: false };
    } else if (path === 'B') {
      const steps: Record<number, StepInfo> = {
        1: { label: 'Select Token', component: 'TokenSelection', canGoBack: false },
        2: { label: 'Enter Amount', component: 'AmountInput', canGoBack: true },
        3: { label: 'Confirm Bridge', component: 'BridgeConfirmation', canGoBack: true },
        4: { label: 'Bridge Success', component: 'BridgeSuccess', canGoBack: false },
        5: { label: 'Confirm Deposit', component: 'DepositConfirmation', canGoBack: false },
        6: { label: 'Success', component: 'DepositSuccess', canGoBack: false },
      };
      return steps[step] || { label: 'Unknown', component: 'Unknown', canGoBack: false };
    }
    
    return { label: 'Unknown', component: 'Unknown', canGoBack: false };
  };

  // Get total steps for current path
  const getTotalSteps = (path: DepositPath): number => {
    return path === 'A' ? 4 : path === 'B' ? 6 : 0;
  };

  // Update deposit state helper
  const updateDepositState = (updates: Partial<DepositState>) => {
    setDepositState(prev => ({ ...prev, ...updates }));
  };

  // Step navigation with path-specific validation
  const navigateToStep = (newStep: number) => {
    const path = depositState.selectedPath;
    const totalSteps = getTotalSteps(path);
    
    if (newStep < 1 || newStep > totalSteps) {
      console.warn(`Invalid step ${newStep} for path ${path}`);
      return;
    }
    
    updateDepositState({ currentStep: newStep });
    onStepChange?.(newStep);
  };

  // Go back with path-specific logic (will be used in UI components)
  // const goBack = () => {
  //   const { currentStep, selectedPath } = depositState;
  //   const stepInfo = getStepInfo(selectedPath, currentStep);
  //   
  //   if (stepInfo.canGoBack && currentStep > 1) {
  //     navigateToStep(currentStep - 1);
  //   }
  // };

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

  // Legacy clearToasts function - kept for backward compatibility
  const clearToasts = () => {
    setToasts([]);
  };

  // Li.Fi Transaction Monitoring System
  const monitorBridgeStatus = async (txHash: string, fromChainId: number, toChainId: number): Promise<{
    success: boolean;
    status: string;
    receivedAmount?: string;
    receivedToken?: string;
    error?: string;
  }> => {
    try {
      const response = await fetch(`https://li.quest/v1/status?txHash=${txHash}&fromChainId=${fromChainId}&toChainId=${toChainId}`, {
        headers: {
          'x-lifi-api-key': 'f6f27ae1-842e-479b-93df-96965d72bffd.ce2dfa79-b4f9-40f9-8420-ca0a3b07b489'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Status API error: ${response.status}`);
      }
      
      const status = await response.json();
      
      return {
        success: status.status === 'DONE',
        status: status.status,
        receivedAmount: status.receiving?.amount,
        receivedToken: status.receiving?.token?.symbol,
        error: status.status === 'FAILED' ? status.error : undefined
      };
    } catch (error: any) {
      console.error('Bridge status monitoring failed:', error);
      return {
        success: false,
        status: 'ERROR',
        error: error.message
      };
    }
  };

  const pollBridgeStatus = async (txHash: string, fromChainId: number, toChainId: number, maxAttempts = 30, intervalMs = 10000): Promise<{
    success: boolean;
    receivedAmount?: string;
    receivedToken?: string;
    error?: string;
  }> => {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const result = await monitorBridgeStatus(txHash, fromChainId, toChainId);
      
      if (result.success) {
        pushToast('success', 'Bridge completed successfully!', 5000);
        return {
          success: true,
          receivedAmount: result.receivedAmount,
          receivedToken: result.receivedToken
        };
      }
      
      if (result.status === 'FAILED') {
        pushToast('error', `Bridge failed: ${result.error || 'Unknown error'}`, 8000);
        return {
          success: false,
          error: result.error
        };
      }
      
      // Show progress toast every 5 attempts
      if (attempts % 5 === 0) {
        pushToast('info', `Bridge in progress... (${attempts + 1}/${maxAttempts})`, 3000);
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    pushToast('error', 'Bridge monitoring timed out', 8000);
    return {
      success: false,
      error: 'Monitoring timeout'
    };
  };

  const getStepStatus = (step: any): string => {
    if (!step.execution?.process || step.execution.process.length === 0) {
      return 'PENDING';
    }
    
    const latestProcess = step.execution.process[step.execution.process.length - 1];
    return latestProcess.status || 'PROCESSING';
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
    // Detect path based on selected token
    const path = detectPath(tokenInfo);
    
    // Update deposit state with new token and path
    updateDepositState({
      selectedToken: tokenInfo,
      selectedPath: path,
      currentStep: 2,
      amount: '', // Reset amount when changing tokens
    });
    
    // Legacy compatibility
    setSelectedTokenInfo(tokenInfo);
    setCurrentStep(2);
    onStepChange?.(2);
  };

  const handleAmountEnter = (enteredAmount: string) => {
    // Update both new and legacy state
    updateDepositState({ amount: enteredAmount });
    setAmount(enteredAmount);
  };

  // USDT0 Deposit Functions (works for both Path A and Path B)
  const handleUSDT0Deposit = async () => {
    const { selectedPath, selectedToken, amount, bridgedUsdt0Amount } = depositState;
    
    // Determine the amount to use based on path
    const depositAmount = selectedPath === 'B' ? bridgedUsdt0Amount : amount;
    
    if (!depositAmount) {
      console.error('No deposit amount available');
      return;
    }

    try {
      setExecuting(true);
      
      // Force switch to HyperEVM
      try {
        await switchChain(wagmiConfig, { chainId: CHAIN_IDS.HYPEREVM });
        pushToast('info', 'Switched to HyperEVM', 2000);
      } catch (error: any) {
        console.error('Chain switch failed:', error);
        pushToast('error', 'Failed to switch to HyperEVM. Please switch manually.');
        setExecuting(false);
        return;
      }

      // Convert amount to wei (USDT0 has 6 decimals)
      const amountWei = parseUnits(depositAmount, 6);
      
      // Check if approval is needed
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      // For Path B, we need to get the USDT0 token address
      const tokenAddress = selectedPath === 'B' 
        ? TOKEN_ADDRESSES[CHAIN_IDS.HYPEREVM].USDT0 
        : selectedToken?.tokenAddress;
        
      if (!tokenAddress) {
        throw new Error('Token address not found');
      }
      
      const token = new Contract(tokenAddress, erc20Abi as any, signer);
      
      let needsApproval = false;
      try {
        const allowance = await token.allowance(clientW.data?.account?.address, VAULT_ADDRESS);
        needsApproval = allowance < amountWei;
      } catch (error: any) {
        console.log('Allowance check failed, assuming no approval needed:', error.message);
        needsApproval = false;
      }
      
      if (needsApproval) {
        pushToast('info', 'Approving USDT0 spending...', 3000);
        const approveTx = await token.approve(VAULT_ADDRESS, amountWei);
        pushToast('info', `Approval tx: ${approveTx.hash}`, 7000, `https://hyperevmscan.io/tx/${approveTx.hash}`);
        await provider.waitForTransaction(approveTx.hash, 1, 20_000).catch(() => null);
        pushToast('success', 'Approval confirmed', 3000);
      }
      
      // Execute deposit
      pushToast('info', 'Depositing to vault...', 3000);
      const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      const tx = await vault.deposit(amountWei, clientW.data?.account?.address);
      pushToast('info', `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);
      
      // Wait for confirmation using wallet provider
      await provider.waitForTransaction(tx.hash, 1, 20_000).catch(() => null);
      
      // Get vault shares minted by reading the vault balance after deposit
      const vaultR = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      const userShares = await vaultR.balanceOf(clientW.data?.account?.address);
      const sharesFormatted = formatUnits(userShares, 18); // Vault shares use 18 decimals
      
      // Update state with success information
      const nextStep = selectedPath === 'A' ? 4 : 6; // Path A goes to step 4, Path B goes to step 6
      updateDepositState({
        vaultSharesMinted: sharesFormatted,
        currentStep: nextStep,
      });
      
      pushToast('success', 'Deposit successful!', 5000);
      
      // Refresh USDT0 balance
      await fetchUSDT0Balance();
      
    } catch (error: any) {
      console.error('USDT0 deposit failed:', error);
      
      // Enhanced error handling for USDT0 deposits
      let errorMessage = 'Deposit failed';
      
      if (error.message?.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user.';
      } else if (error.message?.includes('Insufficient balance')) {
        errorMessage = 'Insufficient USDT0 balance for deposit.';
      } else if (error.message?.includes('Gas estimation failed')) {
        errorMessage = 'Gas estimation failed. Please try with a higher gas limit.';
      } else if (error.message?.includes('Network error')) {
        errorMessage = 'Network error occurred. Please check your connection and try again.';
      } else if (error.message?.includes('Allowance')) {
        errorMessage = 'Token approval failed. Please try again.';
      } else if (error.message) {
        errorMessage = `Deposit failed: ${error.message}`;
      }
      
      pushToast('error', errorMessage, 8000);
      
      // Reset to previous step to allow retry
      const previousStep = selectedPath === 'A' ? 3 : 5;
      updateDepositState({
        currentStep: previousStep,
      });
    } finally {
      setExecuting(false);
    }
  };

  // Path A: Step navigation handlers
  const handlePathAStep2 = () => {
    // Move to step 3 (confirmation) when amount is entered
    if (depositState.amount && parseFloat(depositState.amount) > 0) {
      navigateToStep(3);
    } else {
      pushToast('error', 'Please enter a valid amount');
    }
  };

  const handlePathAStep3 = () => {
    // Execute USDT0 deposit
    handleUSDT0Deposit();
  };

  const handlePathAStep4 = () => {
    // Close dialog or reset to step 1
    updateDepositState({
      selectedPath: null,
      selectedToken: null,
      amount: '',
      vaultSharesMinted: null,
      currentStep: 1,
    });
    setSelectedTokenInfo(null);
    setAmount('');
    setCurrentStep(1);
    onStepChange?.(1);
  };

  // Path B: Bridge & Deposit Functions
  const handleBridgeExecution = async () => {
    const { selectedToken, amount } = depositState;
    
    if (!selectedToken || !amount) {
      console.error('Missing token or amount for bridge execution');
      return;
    }

    try {
      setExecuting(true);
      
      // Convert USD amount to native token amount
      let fromAmount: string;
      if (selectedToken.priceUSD) {
        const usdAmount = parseFloat(amount);
        const tokenPrice = parseFloat(selectedToken.priceUSD);
        const nativeAmount = usdAmount / tokenPrice;
        fromAmount = Math.round(nativeAmount * Math.pow(10, selectedToken.decimals)).toString();
      } else {
        fromAmount = Math.round(parseFloat(amount) * Math.pow(10, selectedToken.decimals)).toString();
      }

      // Get token addresses
      const fromToken = selectedToken.tokenAddress;
      const toToken = TOKEN_ADDRESSES[CHAIN_IDS.HYPEREVM].USDT0;
      
      // Ensure ETH is properly formatted as zero address
      const normalizedFromToken = fromToken === '0x0000000000000000000000000000000000000000' 
        ? '0x0000000000000000000000000000000000000000' 
        : fromToken;

      const routesRequest = {
        fromChainId: selectedToken.chainId,
        toChainId: CHAIN_IDS.HYPEREVM,
        fromTokenAddress: normalizedFromToken,
        toTokenAddress: toToken,
        fromAmount,
        fromAddress: userAddress,
      };

      const result = await getRoutes(routesRequest);
      
      if (!result.routes || result.routes.length === 0) {
        throw new Error('No routes available for this transfer');
      }

      // Select the best route
      let selectedRoute = result.routes[0];
      
      if (selectedToken.tokenSymbol === 'ETH' && selectedToken.chainId === CHAIN_IDS.ARBITRUM) {
        // For ETH on Arbitrum, prefer non-Glacis routes
        const nonGlacisRoute = result.routes.find(route => 
          !route.steps?.some(step => step.toolDetails?.key?.toLowerCase().includes('glacis'))
        );
        if (nonGlacisRoute) {
          selectedRoute = nonGlacisRoute;
        }
      }

      // Execute the route with enhanced monitoring
      const executedRoute = await executeRoute(selectedRoute, {
        updateRouteHook: (updatedRoute) => {
          console.log('Route update:', updatedRoute);
          // Monitor route execution with real-time feedback
          monitorRouteExecution(updatedRoute);
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

      // Extract final transaction hash
      let finalTxHash = 'Unknown';
      if (executedRoute.steps && executedRoute.steps.length > 0) {
        const lastStep = executedRoute.steps[executedRoute.steps.length - 1];
        if (lastStep.execution?.process && lastStep.execution.process.length > 0) {
          const lastProcess = lastStep.execution.process[lastStep.execution.process.length - 1];
          finalTxHash = lastProcess.txHash || finalTxHash;
        }
      }

      // Update state with bridge transaction hash
      updateDepositState({
        bridgeTxHash: finalTxHash,
        currentStep: 4, // Move to bridge success step
      });

      // Start monitoring bridge status in the background
      pushToast('info', 'Bridge transaction submitted. Monitoring progress...', 5000);
      
      // Start background monitoring (don't await to avoid blocking UI)
      pollBridgeStatus(finalTxHash, selectedToken.chainId, CHAIN_IDS.HYPEREVM)
        .then(result => {
          if (result.success && result.receivedAmount) {
            const receivedAmountFormatted = formatUnits(BigInt(result.receivedAmount), 6);
            updateDepositState({
              bridgedUsdt0Amount: receivedAmountFormatted
            });
          }
        })
        .catch(error => {
          console.error('Background bridge monitoring failed:', error);
        });

    } catch (error: any) {
      console.error('Bridge execution failed:', error);
      
      // Enhanced error handling with specific error messages
      let errorMessage = 'Bridge execution failed';
      
      if (error.message?.includes('No routes available')) {
        errorMessage = 'No bridge routes available for this token pair. Try a different amount or token.';
      } else if (error.message?.includes('Insufficient balance')) {
        errorMessage = 'Insufficient token balance for the bridge.';
      } else if (error.message?.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user.';
      } else if (error.message?.includes('Network error')) {
        errorMessage = 'Network error occurred. Please check your connection and try again.';
      } else if (error.message?.includes('Gas estimation failed')) {
        errorMessage = 'Gas estimation failed. Please try with a higher gas limit.';
      } else if (error.message) {
        errorMessage = `Bridge failed: ${error.message}`;
      }
      
      pushToast('error', errorMessage, 8000);
      
      // Reset to step 3 to allow retry
      updateDepositState({
        currentStep: 3,
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleBridgeSuccessDeposit = async () => {
    const { bridgeTxHash, selectedToken } = depositState;
    
    if (!bridgeTxHash || !selectedToken) {
      console.error('Missing bridge transaction hash or selected token');
      return;
    }

    try {
      pushToast('info', 'Checking bridge status...', 3000);
      
      // Monitor bridge status and get received amount
      const result = await pollBridgeStatus(
        bridgeTxHash, 
        selectedToken.chainId, 
        CHAIN_IDS.HYPEREVM
      );
      
      if (result.success && result.receivedAmount) {
        // Convert received amount from wei to USDT0 (6 decimals)
        const receivedAmountFormatted = formatUnits(BigInt(result.receivedAmount), 6);
        
        updateDepositState({
          bridgedUsdt0Amount: receivedAmountFormatted,
          currentStep: 5, // Move to deposit confirmation
        });
        
        pushToast('success', `Bridge completed! Received ${receivedAmountFormatted} USDT0`, 5000);
      } else {
        pushToast('error', `Bridge monitoring failed: ${result.error || 'Unknown error'}`, 8000);
      }
    } catch (error: any) {
      console.error('Bridge status check failed:', error);
      pushToast('error', `Failed to check bridge status: ${error.message}`, 8000);
    }
  };

  const handlePathBStep2 = () => {
    // Move to step 3 (bridge confirmation) when amount is entered
    if (depositState.amount && parseFloat(depositState.amount) > 0) {
      navigateToStep(3);
    } else {
      console.error('Please enter a valid amount');
    }
  };

  const handlePathBStep3 = () => {
    // Execute bridge
    handleBridgeExecution();
  };

  const handlePathBStep4 = () => {
    // Move to deposit step
    handleBridgeSuccessDeposit();
  };

  const handlePathBStep5 = () => {
    // Execute USDT0 deposit (same as Path A)
    handleUSDT0Deposit();
  };

  const handlePathBStep6 = () => {
    // Close dialog or reset to step 1 (same as Path A)
    handlePathAStep4();
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

  // Legacy handleDirectDeposit function - now replaced by handleUSDT0Deposit
  // This is kept for backward compatibility but is no longer used
  const handleDirectDeposit = async (_enteredAmount: string) => {
    console.warn('handleDirectDeposit is deprecated - use handleUSDT0Deposit instead');
    // This function is no longer used as we have the unified handleUSDT0Deposit
  };

  // Legacy handleExecute function - now handled by path-specific functions
  // This is kept for backward compatibility with LiFiBalanceFetcher
  const handleExecute = async () => {
    console.warn('handleExecute is deprecated - use path-specific handlers instead');
    // This function is no longer used as we have path-specific implementations
  };

  // Enhanced progress indicator component
  const renderProgressIndicator = () => {
    const { selectedPath, currentStep } = depositState;
    const totalSteps = getTotalSteps(selectedPath);
    
    if (!selectedPath || totalSteps === 0) {
      return null;
    }
    
    const isPathA = selectedPath === 'A';
    
    return (
      <div className="mb-8">
        {/* Path indicator */}
        <div className="text-center mb-4">
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
            isPathA 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : 'bg-blue-100 text-blue-800 border border-blue-200'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isPathA ? 'bg-green-500' : 'bg-blue-500'
            }`}></div>
            {isPathA ? 'Direct USDT0 Deposit' : 'Bridge & Deposit'}
          </div>
        </div>
        
        {/* Enhanced progress steps */}
        <div className="flex items-center justify-center space-x-1 mb-4">
          {Array.from({ length: totalSteps }, (_, index) => {
            const stepNumber = index + 1;
            const stepInfo = getStepInfo(selectedPath, stepNumber);
            const isActive = currentStep >= stepNumber;
            const isCurrent = currentStep === stepNumber;
            const isCompleted = currentStep > stepNumber;
            
            return (
              <div key={stepNumber} className="flex items-center">
                <div className="flex items-center space-x-3">
                  {/* Step circle with enhanced styling */}
                  <div className={`relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                    isCompleted 
                      ? 'bg-green-500 text-white shadow-lg shadow-green-200' 
                      : isCurrent 
                        ? `${isPathA ? 'bg-green-100 text-green-800 border-2 border-green-500' : 'bg-blue-100 text-blue-800 border-2 border-blue-500'} shadow-lg` 
                        : 'bg-gray-100 text-gray-500 border-2 border-gray-200'
                  }`}>
                    {isCompleted ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      stepNumber
                    )}
                    
                    {/* Current step pulse animation */}
                    {isCurrent && (
                      <div className={`absolute inset-0 rounded-full animate-ping ${
                        isPathA ? 'bg-green-400' : 'bg-blue-400'
                      } opacity-20`}></div>
                    )}
                  </div>
                  
                  {/* Step label with enhanced styling */}
                  <div className="hidden sm:block">
                    <span className={`text-sm font-medium transition-colors duration-300 ${
                      isActive ? (isPathA ? 'text-green-800' : 'text-blue-800') : 'text-gray-500'
                    }`}>
                      {stepInfo.label}
                    </span>
                  </div>
                </div>
                
                {/* Enhanced connector line */}
                {stepNumber < totalSteps && (
                  <div className={`w-8 h-0.5 mx-2 transition-colors duration-300 ${
                    isCompleted 
                      ? 'bg-green-500' 
                      : currentStep > stepNumber 
                        ? (isPathA ? 'bg-green-300' : 'bg-blue-300')
                        : 'bg-gray-200'
                  }`}></div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Progress percentage */}
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">
            Step {currentStep} of {totalSteps}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className={`h-1.5 rounded-full transition-all duration-500 ${
                isPathA ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>
    );
  };

  // Path B specific step rendering
  const renderPathBStep = () => {
    const { currentStep, selectedToken, amount, bridgedUsdt0Amount, vaultSharesMinted } = depositState;
    
    switch (currentStep) {
      case 1:
        // Step 1b: Select Token (handled by LiFiBalanceFetcher)
        return null;
        
      case 2:
        // Step 2b: Enter USD Amount
        return (
          <div className="p-6 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#00295B]">Enter USD Amount</h3>
              <button
                onClick={() => navigateToStep(1)}
                className="text-sm text-gray-600 hover:text-gray-800 flex items-center space-x-1"
              >
                <span>←</span>
                <span>Back to Token Selection</span>
              </button>
            </div>
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                {selectedToken?.logoURI && (
                  <img
                    src={selectedToken.logoURI}
                    alt={selectedToken.tokenSymbol}
                    className="w-10 h-10 rounded-full"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <div>
                  <div className="font-semibold text-lg">{selectedToken?.tokenSymbol}</div>
                  <div className="text-sm text-gray-600">{selectedToken?.chainName}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg">
                  {selectedToken ? parseFloat(selectedToken.balanceFormatted).toFixed(4) : '0.0000'} {selectedToken?.tokenSymbol}
                </div>
                <div className="text-sm text-gray-600">
                  {selectedToken?.balanceUSD || 'USD value unavailable'}
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
                onChange={(e) => handleAmountEnter(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                max={selectedToken?.balanceUSD ? parseFloat(selectedToken.balanceUSD) : parseFloat(selectedToken?.balanceFormatted || '0')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="text-xs text-gray-500 mt-1">
                Available: ${selectedToken?.balanceUSD || '0.00'} USD
                {selectedToken?.priceUSD && (
                  <span className="ml-2">
                    ({parseFloat(selectedToken.balanceFormatted).toFixed(6)} {selectedToken.tokenSymbol})
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={handlePathBStep2}
              disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > (selectedToken?.balanceUSD ? parseFloat(selectedToken.balanceUSD) : parseFloat(selectedToken?.balanceFormatted || '0'))}
              className="w-full py-3 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue to Bridge Confirmation
            </button>
          </div>
        );
        
      case 3:
        // Step 3b: Confirm Bridge
        return (
          <div className="p-6 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-blue-800">Confirm Bridge</h3>
              <button
                onClick={() => navigateToStep(2)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
              >
                <span>←</span>
                <span>Back to Amount</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-gray-800 mb-3">Bridge Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">From:</span>
                    <span className="font-medium">{selectedToken?.tokenSymbol} on {selectedToken?.chainName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">To:</span>
                    <span className="font-medium">USDT0 on HyperEVM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-medium">${amount} USD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Method:</span>
                    <span className="font-medium">Bridge & Swap via Li.Fi</span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={handlePathBStep3}
                disabled={executing}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {executing ? 'Executing Bridge...' : 'Confirm & Execute Bridge'}
              </button>
            </div>
          </div>
        );
        
      case 4:
        // Step 4b: Bridge Success
        return (
          <div className="p-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-lg">
            <div className="text-center">
              {/* Enhanced success icon with animation */}
              <div className="relative w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
                <svg className="w-10 h-10 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                {/* Success pulse animation */}
                <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20"></div>
              </div>
              
              <h3 className="text-2xl font-bold text-blue-800 mb-2">Bridge Successful!</h3>
              <p className="text-blue-700 mb-6 text-lg">Your deposit has been completed successfully. The funds have been converted to USDT0</p>
              
              {/* Enhanced bridge summary */}
              <div className="bg-white p-6 rounded-xl border border-blue-200 mb-6 shadow-sm">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  <span className="text-sm font-semibold text-gray-700">Bridge Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">From:</span>
                    <span className="font-bold text-gray-900">{selectedToken?.tokenSymbol} on {selectedToken?.chainName}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">To:</span>
                    <span className="font-bold text-gray-900">USDT0 on HyperEVM</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600 font-medium">Amount:</span>
                    <span className="font-bold text-gray-900">{bridgedUsdt0Amount || 'Calculating...'} USDT0</span>
                  </div>
                </div>
              </div>
              
              {/* Enhanced deposit button */}
              <button
                onClick={handlePathBStep4}
                className="w-full py-4 px-6 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Deposit USDT0 to Vault
              </button>
            </div>
          </div>
        );
        
      case 5:
        // Step 5b: Confirm Vault Deposit (same as Path A step 3a)
        return (
          <div className="p-6 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-blue-800">Confirm USDT0 Deposit</h3>
              <div className="text-sm text-gray-500">No back button - bridge already completed</div>
            </div>
            
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-gray-800 mb-3">Deposit Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">From:</span>
                    <span className="font-medium">USDT0 on HyperEVM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">To:</span>
                    <span className="font-medium">USDT0 PHALANX Vault on HyperEVM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-medium">{bridgedUsdt0Amount || '0.00'} USDT0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Method:</span>
                    <span className="font-medium">Direct Deposit</span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={handlePathBStep5}
                disabled={executing}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {executing ? 'Processing Deposit...' : 'Confirm & Execute Deposit'}
              </button>
            </div>
          </div>
        );
        
      case 6:
        // Step 6b: Final Success (same as Path A step 4a)
        return (
          <div className="p-8 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 shadow-lg">
            <div className="text-center">
              {/* Enhanced success icon with animation */}
              <div className="relative w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-200">
                <svg className="w-10 h-10 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                {/* Success pulse animation */}
                <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-20"></div>
              </div>
              
              <h3 className="text-2xl font-bold text-green-800 mb-2">Deposit Successful!</h3>
              <p className="text-green-700 mb-6 text-lg">Your deposit has been completed successfully</p>
              
              {/* Enhanced transaction summary */}
              <div className="bg-white p-6 rounded-xl border border-green-200 mb-6 shadow-sm">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-semibold text-gray-700">Transaction Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Amount:</span>
                    <span className="font-bold text-gray-900">{bridgedUsdt0Amount || '0.00'} USDT0</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Vault Shares:</span>
                    <span className="font-bold text-gray-900">{vaultSharesMinted || 'Calculating...'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600 font-medium">Network:</span>
                    <span className="font-bold text-gray-900">HyperEVM</span>
                  </div>
                </div>
              </div>
              
              {/* Enhanced close button */}
              <button
                onClick={handlePathBStep6}
                className="w-full py-4 px-6 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Close
              </button>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  // Path A specific step rendering
  const renderPathAStep = () => {
    const { currentStep, selectedToken, amount, vaultSharesMinted } = depositState;
    
    switch (currentStep) {
      case 1:
        // Step 1a: Select USDT0 (handled by LiFiBalanceFetcher)
        return null;
        
      case 2:
        // Step 2a: Enter USDT0 Amount
        return (
          <div className="p-6 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#00295B]">Enter USDT0 Amount</h3>
              <button
                onClick={() => navigateToStep(1)}
                className="text-sm text-gray-600 hover:text-gray-800 flex items-center space-x-1"
              >
                <span>←</span>
                <span>Back to Token Selection</span>
              </button>
            </div>
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                {selectedToken?.logoURI && (
                  <img
                    src={selectedToken.logoURI}
                    alt={selectedToken.tokenSymbol}
                    className="w-10 h-10 rounded-full"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <div>
                  <div className="font-semibold text-lg">{selectedToken?.tokenSymbol}</div>
                  <div className="text-sm text-gray-600">{selectedToken?.chainName}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg">
                  {selectedToken ? parseFloat(selectedToken.balanceFormatted).toFixed(6) : '0.000000'} USDT0
                </div>
                <div className="text-sm text-gray-600">
                  {selectedToken?.balanceUSD || 'USD value unavailable'}
                </div>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter USDT0 Amount
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => handleAmountEnter(e.target.value)}
                placeholder="0.00"
                step="0.000001"
                min="0"
                max={selectedToken ? parseFloat(selectedToken.balanceFormatted) : 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="text-xs text-gray-500 mt-1">
                Available: {selectedToken ? parseFloat(selectedToken.balanceFormatted).toFixed(6) : '0.000000'} USDT0
              </div>
            </div>

            <button
              onClick={handlePathAStep2}
              disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > (selectedToken ? parseFloat(selectedToken.balanceFormatted) : 0)}
              className="w-full py-3 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue to Confirmation
            </button>
          </div>
        );
        
      case 3:
        // Step 3a: Confirm Deposit
        return (
          <div className="p-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-blue-800">Confirm USDT0 Deposit</h3>
              <button
                onClick={() => navigateToStep(2)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1 transition-colors duration-200"
              >
                <span>←</span>
                <span>Back to Amount</span>
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Enhanced deposit summary */}
              <div className="bg-white p-6 rounded-xl border border-blue-200 shadow-sm">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  <span className="text-sm font-semibold text-gray-700">Deposit Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">From:</span>
                    <span className="font-bold text-gray-900">{selectedToken?.tokenSymbol} on {selectedToken?.chainName}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">To:</span>
                    <span className="font-bold text-gray-900">USDT0 PHALANX Vault on HyperEVM</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Amount:</span>
                    <span className="font-bold text-gray-900">{amount} USDT0</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600 font-medium">Method:</span>
                    <span className="font-bold text-gray-900">Direct Deposit</span>
                  </div>
                </div>
              </div>
              
              {/* Enhanced confirm button */}
              <button
                onClick={handlePathAStep3}
                disabled={executing}
                className="w-full py-4 px-6 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
              >
                {executing ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Processing Deposit...</span>
                  </div>
                ) : (
                  'Confirm & Execute Deposit'
                )}
              </button>
            </div>
          </div>
        );
        
      case 4:
        // Step 4a: Success
        return (
          <div className="p-8 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 shadow-lg">
            <div className="text-center">
              {/* Enhanced success icon with animation */}
              <div className="relative w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-200">
                <svg className="w-10 h-10 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                {/* Success pulse animation */}
                <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-20"></div>
              </div>
              
              <h3 className="text-2xl font-bold text-green-800 mb-2">Deposit Successful!</h3>
              <p className="text-green-700 mb-6 text-lg">Your deposit has been completed successfully</p>
              
              {/* Enhanced transaction summary */}
              <div className="bg-white p-6 rounded-xl border border-green-200 mb-6 shadow-sm">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-semibold text-gray-700">Transaction Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Amount:</span>
                    <span className="font-bold text-gray-900">{amount} USDT0</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Vault Shares:</span>
                    <span className="font-bold text-gray-900">{vaultSharesMinted || 'Calculating...'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600 font-medium">Network:</span>
                    <span className="font-bold text-gray-900">HyperEVM</span>
                  </div>
                </div>
              </div>
              
              {/* Enhanced close button */}
              <button
                onClick={handlePathAStep4}
                className="w-full py-4 px-6 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Close
              </button>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Progress Indicator */}
      {renderProgressIndicator()}
      
      {!sdkInitialized && (
        <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg shadow-sm">
          {sdkError ? (
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800">Li.Fi SDK Error</h3>
                <p className="text-sm text-red-700 mt-1">{sdkError}</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="mt-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-sm font-medium rounded-md transition-colors duration-200"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <div className="relative">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-200"></div>
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent absolute top-0 left-0"></div>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-800">Initializing Li.Fi SDK</h3>
                <p className="text-sm text-blue-700 mt-1">Loading chain configurations... This may take a moment.</p>
                <div className="mt-2 w-full bg-blue-200 rounded-full h-1.5">
                  <div className="bg-blue-600 h-1.5 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!clientW.data && (
        <div className="mb-6 p-6 bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-800">Wallet Required</h3>
              <p className="text-sm text-yellow-700 mt-1">Please connect your wallet to view balances and execute transactions.</p>
            </div>
          </div>
        </div>
      )}

      {/* Path-specific rendering */}
      {depositState.selectedPath === 'A' ? (
        renderPathAStep()
      ) : depositState.selectedPath === 'B' ? (
        renderPathBStep()
      ) : (
        /* Default: Balance Fetcher Component for step 1 */
        <LiFiBalanceFetcher
          onTokenSelect={handleTokenSelect}
          onAmountEnter={handleAmountEnter}
          onExecute={handleExecute}
          selectedToken={depositState.selectedToken || selectedTokenInfo}
          amount={depositState.amount || amount}
          isExecuting={executing}
          usdt0Balance={usdt0Balance}
          usdt0Loading={usdt0Loading}
          currentStep={depositState.currentStep || currentStep}
          onStepChange={(step) => {
            navigateToStep(step);
            setCurrentStep(step);
            onStepChange?.(step);
          }}
        />
      )}

      {/* Toast notifications */}
      <Toasts toasts={toasts} />
    </div>
  );
}

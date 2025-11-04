import { useState, useEffect, useRef } from 'react';
import { getRoutes, executeRoute, getToken, getTokenBalances } from '@lifi/sdk';
import { CHAIN_IDS } from '../lib/lifi-config';
import { useWalletClient, useConfig } from 'wagmi';
import { switchChain, getWalletClient } from '@wagmi/core';
import { formatUnits, parseUnits } from 'viem';
import { BrowserProvider, Contract } from 'ethers';
import { useLifiConfig } from '../hooks/useLifiConfig';
import { LiFiBalanceFetcher } from './lifi-balance-fetcher';
import { erc20Abi } from 'viem';
import vaultAbi from '../abis/vault.json';
import { Toasts, type Toast, type ToastKind } from './vault-shared';
import { DEFAULT_VAULT_CONFIG, type VaultConfig } from '../config/vaults.config';
import type { IVaultAdapter } from '../lib/vault-provider';

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
  onClose?: () => void;
  vaultConfig?: VaultConfig; // Vault configuration (optional, defaults to DEFAULT_VAULT_CONFIG)
  vaultAdapter?: IVaultAdapter | null; // Vault adapter (for Lagoon async vaults)
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
    bridgedTokenAmount: string | null;
    vaultSharesMinted: string | null;
    vaultSharesBefore: string | null; // Track shares before deposit to calculate newly minted
    currentStep: number;
    transactionSubsteps: Array<{label: string, status: 'pending' | 'processing' | 'completed' | 'failed', txHash?: string, chainId?: number}>;
  }

export function LiFiQuoteTest({ onStepChange, onClose, vaultConfig, vaultAdapter }: LiFiQuoteTestProps = {}) {
  const [executing, setExecuting] = useState(false);
  
  // Use provided vault config or default
  const config = vaultConfig || DEFAULT_VAULT_CONFIG;
  const VAULT_ADDRESS = config.vaultAddress;
  const UNDERLYING_SYMBOL = config.underlyingSymbol;
  const UNDERLYING_ADDRESS = config.underlyingAddress;
  
  // Comprehensive deposit state
  const [depositState, setDepositState] = useState<DepositState>({
    selectedPath: null,
    selectedToken: null,
    amount: '',
    bridgeTxHash: null,
    bridgedTokenAmount: null,
    vaultSharesMinted: null,
    vaultSharesBefore: null,
    currentStep: 1,
    transactionSubsteps: [],
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
  
  // Underlying token balance for direct deposits (fetched separately)
  const [underlyingBalance, setUnderlyingBalance] = useState<{
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
  const [underlyingLoading, setUnderlyingLoading] = useState(false);
  
  // Toast system for error handling
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef<number>(1);
  const pushToast = (kind: ToastKind, text: string, ttl = 5000, href?: string) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((t) => [...t, { id, kind, text, href }]);
    if (ttl > 0) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  };
  
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
    
    // Path A: Underlying token on HyperEVM (direct deposit)
    if (token.tokenSymbol === UNDERLYING_SYMBOL && token.chainId === CHAIN_IDS.HYPEREVM) {
      return 'A';
    }
    
    // Path B: Any other token (bridge + deposit)
    return 'B';
  };

  // Step information for each path
  const getStepInfo = (path: DepositPath, step: number): StepInfo => {
    if (path === 'A') {
      const steps: Record<number, StepInfo> = {
        1: { label: `Select ${UNDERLYING_SYMBOL}`, component: 'TokenSelection', canGoBack: false },
        2: { label: 'Enter Amount', component: 'AmountInput', canGoBack: true },
        3: { label: 'Confirm Deposit', component: 'DepositConfirmation', canGoBack: true },
        4: { label: 'Success', component: 'DepositSuccess', canGoBack: false },
      };
      return steps[step] || { label: 'Unknown', component: 'Unknown', canGoBack: false };
    } else if (path === 'B') {
      const steps: Record<number, StepInfo> = {
        1: { label: 'Select Token', component: 'TokenSelection', canGoBack: false },
        2: { label: 'Bridge & Swap', component: 'BridgeExecution', canGoBack: true },
        3: { label: 'Deposit to Vault', component: 'VaultDeposit', canGoBack: false },
        4: { label: 'Success', component: 'DepositSuccess', canGoBack: false },
      };
      return steps[step] || { label: 'Unknown', component: 'Unknown', canGoBack: false };
    }
    
    return { label: 'Unknown', component: 'Unknown', canGoBack: false };
  };

  // Get total steps for current path
  const getTotalSteps = (path: DepositPath): number => {
    return path === 'A' ? 4 : path === 'B' ? 4 : 0;
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

  // Fetch underlying token balance when wallet connects AND SDK is initialized
  useEffect(() => {
    if (clientW.data?.account?.address && sdkInitialized) {
      fetchUnderlyingBalance();
    }
  }, [clientW.data?.account?.address, sdkInitialized]);




  // Transaction substep progress component
  const renderTransactionSubsteps = (substeps: Array<{label: string, status: 'pending' | 'processing' | 'completed' | 'failed', txHash?: string, chainId?: number}>) => {
    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Transaction Progress</h4>
        <div className="space-y-2">
          {substeps.map((substep, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  substep.status === 'completed' ? 'bg-green-500' :
                  substep.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                  substep.status === 'failed' ? 'bg-red-500' :
                  'bg-gray-300'
                }`}></div>
                <span className={`text-sm ${
                  substep.status === 'completed' ? 'text-green-700' :
                  substep.status === 'processing' ? 'text-blue-700' :
                  substep.status === 'failed' ? 'text-red-700' :
                  'text-gray-500'
                }`}>
                  {substep.label}
                </span>
              </div>
              {substep.txHash && substep.chainId && (
                <a
                  href={getExplorerUrl(substep.chainId, substep.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 font-mono"
                >
                  {substep.txHash.slice(0, 8)}...{substep.txHash.slice(-6)}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    );
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
          'x-lifi-api-key': import.meta.env?.VITE_LIFI_API_KEY || ''
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
        return {
          success: true,
          receivedAmount: result.receivedAmount,
          receivedToken: result.receivedToken
        };
      }
      
      if (result.status === 'FAILED') {
        return {
          success: false,
          error: result.error
        };
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
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
      transactionSubsteps: [], // Reset substeps for new flow
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

  // Underlying Token Deposit Functions (works for both Path A and Path B)
  const handleUnderlyingDeposit = async () => {
    const { selectedPath, selectedToken, amount, bridgedTokenAmount } = depositState;
    
    // Determine the amount to use based on path
    const depositAmount = selectedPath === 'B' ? bridgedTokenAmount : amount;
    
    if (!depositAmount) {
      console.error('No deposit amount available');
      return;
    }

    try {
      setExecuting(true);
      
      // Force switch to HyperEVM
      try {
        await switchChain(wagmiConfig, { chainId: CHAIN_IDS.HYPEREVM });
      } catch (error: any) {
        console.error('Chain switch failed:', error);
        setExecuting(false);
        return;
      }

      // Convert amount to wei using config decimals
      const amountWei = parseUnits(depositAmount, config.underlyingDecimals);
      
      // Check if approval is needed
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      // For Path B, we need to get the underlying token address
      const tokenAddress = selectedPath === 'B' 
        ? UNDERLYING_ADDRESS
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
      
      let approveTx: any = null;
      if (needsApproval) {
        // Update substeps for approval
        updateDepositState({
          transactionSubsteps: [
            { label: `Approve ${UNDERLYING_SYMBOL} spending`, status: 'processing' as const, chainId: CHAIN_IDS.HYPEREVM }
          ]
        });
        
        approveTx = await token.approve(VAULT_ADDRESS, amountWei);
        
        // Update substeps with transaction hash
        updateDepositState({
          transactionSubsteps: [
            { label: `Approve ${UNDERLYING_SYMBOL} spending`, status: 'processing' as const, txHash: approveTx.hash, chainId: CHAIN_IDS.HYPEREVM }
          ]
        });
        
        await provider.waitForTransaction(approveTx.hash, 1, 20_000).catch(() => null);
        
        // Mark approval as completed
        updateDepositState({
          transactionSubsteps: [
            { label: `Approve ${UNDERLYING_SYMBOL} spending`, status: 'completed' as const, txHash: approveTx.hash, chainId: CHAIN_IDS.HYPEREVM }
          ]
        });
      }
      
      // Get shares before deposit
      const vaultBefore = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      const sharesBefore = await vaultBefore.balanceOf(clientW.data?.account?.address);
      const sharesBeforeFormatted = formatUnits(sharesBefore, 18);
      
      // Update substeps for deposit
      const depositSubsteps = [];
      if (needsApproval && approveTx) {
        depositSubsteps.push({ 
          label: `Approve ${UNDERLYING_SYMBOL} spending`, 
          status: 'completed' as const, 
          txHash: approveTx.hash, 
          chainId: CHAIN_IDS.HYPEREVM 
        });
      }
      depositSubsteps.push({ 
        label: config.type === 'lagoon' ? 'Request deposit (async)' : 'Deposit to vault', 
        status: 'processing' as const, 
        chainId: CHAIN_IDS.HYPEREVM 
      });
      
      updateDepositState({
        transactionSubsteps: depositSubsteps
      });
      
      // Execute deposit - use adapter for Lagoon async vaults, direct for others
      let tx;
      if (vaultAdapter) {
        // Use async vault adapter
        const result = await vaultAdapter.enqueueDeposit(amountWei, clientW.data?.account?.address as `0x${string}`);
        tx = { hash: result.hash };
      } else {
        // Use standard ERC-4626 deposit
        const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
        tx = await vault.deposit(amountWei, clientW.data?.account?.address);
      }
      
      // Update substeps with deposit transaction hash
      const processingSubsteps = [];
      if (needsApproval && approveTx) {
        processingSubsteps.push({ 
          label: `Approve ${UNDERLYING_SYMBOL} spending`, 
          status: 'completed' as const, 
          txHash: approveTx.hash, 
          chainId: CHAIN_IDS.HYPEREVM 
        });
      }
      processingSubsteps.push({ 
        label: config.type === 'lagoon' ? 'Request deposit (async)' : 'Deposit to vault', 
        status: 'processing' as const, 
        txHash: tx.hash, 
        chainId: CHAIN_IDS.HYPEREVM 
      });
      
      updateDepositState({
        transactionSubsteps: processingSubsteps
      });
      
      // Wait for confirmation using wallet provider and verify success
      try {
        const receipt = await provider.waitForTransaction(tx.hash, 1, 20_000);
        if (!receipt) {
          throw new Error('No receipt received');
        }
        const isReverted = receipt.status === null || receipt.status === 0 || (typeof receipt.status === 'bigint' && receipt.status === 0n);
        if (isReverted) {
          throw new Error('Transaction reverted on-chain');
        }
      } catch (waitError: any) {
        console.error('Transaction failed:', waitError);
        throw new Error('Transaction failed: ' + (waitError.message || 'Unknown error'));
      }
      
      // Mark deposit as completed
      const completedSubsteps = [];
      if (needsApproval && approveTx) {
        completedSubsteps.push({ 
          label: `Approve ${UNDERLYING_SYMBOL} spending`, 
          status: 'completed' as const, 
          txHash: approveTx.hash, 
          chainId: CHAIN_IDS.HYPEREVM 
        });
      }
      completedSubsteps.push({ 
        label: config.type === 'lagoon' ? 'Request deposit (async)' : 'Deposit to vault', 
        status: 'completed' as const, 
        txHash: tx.hash, 
        chainId: CHAIN_IDS.HYPEREVM 
      });
      
      updateDepositState({
        transactionSubsteps: completedSubsteps
      });
      
      // For async vaults, shares won't be minted immediately - show 0 or pending
      if (config.type === 'lagoon') {
        const nextStep = selectedPath === 'A' ? 4 : 4;
        updateDepositState({
          vaultSharesBefore: sharesBeforeFormatted,
          vaultSharesMinted: '0', // Shares will be claimable after settlement
          currentStep: nextStep,
        });
      } else {
        // Get vault shares after deposit for sync vaults
        const vaultAfter = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
        const userShares = await vaultAfter.balanceOf(clientW.data?.account?.address);
        
        // Calculate newly minted shares (shares after - shares before)
        const newlyMintedShares = userShares - sharesBefore;
        const newlyMintedFormatted = formatUnits(BigInt(newlyMintedShares.toString()), 18);
        
        // Update state with success information
        const nextStep = selectedPath === 'A' ? 4 : 4;
        updateDepositState({
          vaultSharesBefore: sharesBeforeFormatted,
          vaultSharesMinted: newlyMintedFormatted,
          currentStep: nextStep,
        });
      }
      
      // Refresh underlying token balance
      await fetchUnderlyingBalance();
      
    } catch (error: any) {
      console.error(`${UNDERLYING_SYMBOL} deposit failed:`, error);
      
      // Enhanced error handling for deposits
      let errorMessage = 'Deposit failed. Please try again.';
      const errorMsg = error.message?.toLowerCase() || '';
      
      if (errorMsg.includes('user rejected') || errorMsg.includes('user denied')) {
        errorMessage = 'Transaction was cancelled. Please try again.';
      } else if (errorMsg.includes('insufficient balance')) {
        errorMessage = `Insufficient ${UNDERLYING_SYMBOL} balance for deposit.`;
      } else if (errorMsg.includes('gas estimation failed') || errorMsg.includes('cannot estimate gas')) {
        errorMessage = 'Gas estimation failed. Please try again with higher gas limit.';
      } else if (errorMsg.includes('network error') || errorMsg.includes('connection') || errorMsg.includes('timeout')) {
        errorMessage = 'Network error occurred. Please check your connection and try again.';
      } else if (errorMsg.includes('allowance') || errorMsg.includes('approval')) {
        errorMessage = 'Token approval failed. Please try again.';
      } else if (errorMsg.includes('nonce') || errorMsg.includes('replacement') || errorMsg.includes('already known')) {
        errorMessage = 'Transaction conflict detected. Please wait a moment and try again.';
      } else if (errorMsg.includes('rpc error') || errorMsg.includes('internal error') || errorMsg.includes('502') || errorMsg.includes('503') || errorMsg.includes('504')) {
        errorMessage = 'Network temporarily unavailable. Please try again in a few moments.';
      } else if (errorMsg.includes('slippage') || errorMsg.includes('price impact') || errorMsg.includes('execution reverted')) {
        errorMessage = 'Price changed during transaction. Please try again.';
      } else if (errorMsg.includes('gas price') || errorMsg.includes('gas too low')) {
        errorMessage = 'Gas price too low. Please try again with higher gas.';
      } else if (errorMsg.includes('cap') && errorMsg.includes('deposit')) {
        errorMessage = 'Vault is currently closed for deposits. Please try again later.';
      } else if (errorMsg.includes('0x1425ea42') || errorMsg.includes('exceeded') || errorMsg.includes('max deposit')) {
        errorMessage = 'Deposit amount exceeds vault limits. Please try a smaller amount.';
      } else if (errorMsg.includes('missing revert data') || errorMsg.includes('call_exception') || errorMsg.includes('simulation')) {
        errorMessage = 'Transaction simulation failed. Please try again.';
      }
      
      console.error('Error:', errorMessage);
      
      // Show error toast
      pushToast('error', errorMessage);
      
      // Reset to previous step to allow retry
      const previousStep = selectedPath === 'A' ? 3 : 3;
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
      console.error('Please enter a valid amount');
    }
  };

  const handlePathAStep3 = () => {
    // Execute underlying token deposit
    handleUnderlyingDeposit();
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
    onClose?.();
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
      const toToken = UNDERLYING_ADDRESS;
      
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

      // Update substeps for bridge execution
      updateDepositState({
        transactionSubsteps: [
          { label: 'Execute bridge transaction', status: 'processing' as const, chainId: selectedToken.chainId }
        ]
      });

      // Execute the route with enhanced monitoring
      const executedRoute = await executeRoute(selectedRoute, {
        updateRouteHook: (updatedRoute) => {
          console.log('Route update:', updatedRoute);
          // Monitor route execution with real-time feedback
          monitorRouteExecution(updatedRoute);
          
          // Update substeps based on route execution status
          if (updatedRoute.steps && updatedRoute.steps.length > 0) {
            const lastStep = updatedRoute.steps[updatedRoute.steps.length - 1];
            if (lastStep.execution?.process && lastStep.execution.process.length > 0) {
              const lastProcess = lastStep.execution.process[lastStep.execution.process.length - 1];
              if (lastProcess.txHash) {
                updateDepositState({
                  transactionSubsteps: [
                    { 
                      label: 'Execute bridge transaction', 
                      status: 'processing' as const, 
                      txHash: lastProcess.txHash, 
                      chainId: selectedToken.chainId 
                    }
                  ]
                });
              }
            }
          }
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

      // Extract final transaction hash and estimated output amount
      let finalTxHash = 'Unknown';
      let estimatedOutputAmount: string | null = null;
      
      if (executedRoute.steps && executedRoute.steps.length > 0) {
        const lastStep = executedRoute.steps[executedRoute.steps.length - 1];
        if (lastStep.execution?.process && lastStep.execution.process.length > 0) {
          const lastProcess = lastStep.execution.process[lastStep.execution.process.length - 1];
          finalTxHash = lastProcess.txHash || finalTxHash;
        }
        
        // Extract estimated output amount from route estimate
        // This gives us the amount immediately without waiting for monitoring
        if (lastStep.estimate?.toAmount) {
          estimatedOutputAmount = formatUnits(
            BigInt(lastStep.estimate.toAmount), 
            config.underlyingDecimals
          );
        } else if (lastStep.estimate?.toAmountMin) {
          // Fallback to minimum amount if toAmount not available
          estimatedOutputAmount = formatUnits(
            BigInt(lastStep.estimate.toAmountMin), 
            config.underlyingDecimals
          );
        }
      }

      // Update state with bridge transaction hash and estimated amount (immediate)
      updateDepositState({
        bridgeTxHash: finalTxHash,
        bridgedTokenAmount: estimatedOutputAmount, // Set immediately from route estimate
        currentStep: 3, // Move to deposit step
        transactionSubsteps: [
          { 
            label: 'Execute bridge transaction', 
            status: 'completed' as const, 
            txHash: finalTxHash, 
            chainId: selectedToken.chainId 
          }
        ]
      });

      // Start background monitoring to verify actual received amount (optional refinement)
      // This will update the amount if it differs from the estimate
      if (!estimatedOutputAmount) {
        // Only poll if we couldn't get estimate from route
        pollBridgeStatus(finalTxHash, selectedToken.chainId, CHAIN_IDS.HYPEREVM)
          .then(result => {
            if (result.success && result.receivedAmount) {
              const receivedAmountFormatted = formatUnits(BigInt(result.receivedAmount), config.underlyingDecimals);
              updateDepositState({
                bridgedTokenAmount: receivedAmountFormatted
              });
            }
          })
          .catch(error => {
            console.error('Background bridge monitoring failed:', error);
          });
      }

    } catch (error: any) {
      console.error('Bridge execution failed:', error);
      
      // Enhanced error handling with specific error messages
      let errorMessage = 'Bridge execution failed. Please try again.';
      const errorMsg = error.message?.toLowerCase() || '';
      
      if (errorMsg.includes('no routes available') || errorMsg.includes('no route')) {
        errorMessage = 'No bridge routes available for this token pair. Try a different amount or token.';
      } else if (errorMsg.includes('insufficient balance')) {
        errorMessage = 'Insufficient token balance for the bridge.';
      } else if (errorMsg.includes('user rejected') || errorMsg.includes('user denied')) {
        errorMessage = 'Transaction was cancelled. Please try again.';
      } else if (errorMsg.includes('network error') || errorMsg.includes('connection') || errorMsg.includes('timeout')) {
        errorMessage = 'Network error occurred. Please check your connection and try again.';
      } else if (errorMsg.includes('gas estimation failed') || errorMsg.includes('cannot estimate gas')) {
        errorMessage = 'Gas estimation failed. Please try again with higher gas limit.';
      } else if (errorMsg.includes('allowance') || errorMsg.includes('approval')) {
        errorMessage = 'Token approval failed. Please try again.';
      } else if (errorMsg.includes('nonce') || errorMsg.includes('replacement') || errorMsg.includes('already known')) {
        errorMessage = 'Transaction conflict detected. Please wait a moment and try again.';
      } else if (errorMsg.includes('rpc error') || errorMsg.includes('internal error') || errorMsg.includes('502') || errorMsg.includes('503') || errorMsg.includes('504')) {
        errorMessage = 'Network temporarily unavailable. Please try again in a few moments.';
      } else if (errorMsg.includes('slippage') || errorMsg.includes('price impact') || errorMsg.includes('execution reverted')) {
        errorMessage = 'Price changed during transaction. Please try again.';
      } else if (errorMsg.includes('gas price') || errorMsg.includes('gas too low')) {
        errorMessage = 'Gas price too low. Please try again with higher gas.';
      } else if (errorMsg.includes('missing revert data') || errorMsg.includes('call_exception') || errorMsg.includes('simulation')) {
        errorMessage = 'Transaction simulation failed. Please try again.';
      } else if (error.message) {
        errorMessage = `Bridge failed: ${error.message}`;
      }
      
      console.error('Error:', errorMessage);
      
      // Show error toast
      pushToast('error', errorMessage);
      
      // Reset to step 2 to allow retry (user can re-enter amount and retry bridge)
      updateDepositState({
        currentStep: 2,
      });
    } finally {
      setExecuting(false);
    }
  };

  const handlePathBStep2 = () => {
    // Execute bridge directly when amount is entered (no confirmation step)
    if (depositState.amount && parseFloat(depositState.amount) > 0) {
      handleBridgeExecution();
    } else {
      console.error('Please enter a valid amount');
    }
  };

  const handlePathBStep3 = () => {
    // Execute vault deposit directly (no confirmation step)
    handleUnderlyingDeposit();
  };

  const handlePathBStep4 = () => {
    // Close dialog or reset to step 1 (same as Path A)
    handlePathAStep4();
  };

  // Fetch underlying token balance using Li.Fi APIs
  const fetchUnderlyingBalance = async () => {
    if (!clientW.data?.account?.address) return;
    
    setUnderlyingLoading(true);
    try {
      console.log(`Fetching ${UNDERLYING_SYMBOL} balance for address:`, clientW.data.account.address);
      
      // Get underlying token info from Li.Fi
      const tokenInfo = await getToken(CHAIN_IDS.HYPEREVM, UNDERLYING_ADDRESS);
      
      // Get token balances using Li.Fi (correct API usage)
      const balances = await getTokenBalances(clientW.data.account.address, [tokenInfo]);
      
      if (balances && balances.length > 0) {
        const balance = balances[0];
        const amountStr = balance.amount?.toString() || '0';
        const balanceFormatted = formatUnits(BigInt(amountStr), balance.decimals || config.underlyingDecimals);
        const balanceUSD = tokenInfo.priceUSD ? 
          (parseFloat(balanceFormatted) * parseFloat(tokenInfo.priceUSD)).toFixed(2) : 
          '0';
        
        console.log(`${UNDERLYING_SYMBOL} balance fetched:`, {
          balance: amountStr,
          balanceFormatted,
          balanceUSD,
          priceUSD: tokenInfo.priceUSD
        });
        
        // Only set balance if it's greater than 0
        if (parseFloat(balanceFormatted) > 0) {
          setUnderlyingBalance({
            chainId: CHAIN_IDS.HYPEREVM,
            chainName: 'HyperEVM',
            tokenSymbol: UNDERLYING_SYMBOL,
            tokenAddress: UNDERLYING_ADDRESS,
            balance: amountStr,
            balanceFormatted,
            decimals: balance.decimals || config.underlyingDecimals,
            logoURI: tokenInfo.logoURI,
            priceUSD: tokenInfo.priceUSD,
            balanceUSD: balanceUSD
          });
        } else {
          setUnderlyingBalance(null);
        }
      } else {
        setUnderlyingBalance(null);
      }
    } catch (error) {
      console.error(`Error fetching ${UNDERLYING_SYMBOL} balance:`, error);
      setUnderlyingBalance(null);
    } finally {
      setUnderlyingLoading(false);
    }
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
            {isPathA ? `Direct ${UNDERLYING_SYMBOL} Deposit` : 'Bridge & Deposit'}
          </div>
        </div>
        
        {/* Compact progress steps - responsive grid layout */}
        <div className={`grid gap-2 mb-4 ${
          totalSteps === 4 
            ? 'grid-cols-2 sm:grid-cols-4' 
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
        }`}>
          {Array.from({ length: totalSteps }, (_, index) => {
            const stepNumber = index + 1;
            const stepInfo = getStepInfo(selectedPath, stepNumber);
            const isActive = currentStep >= stepNumber;
            const isCurrent = currentStep === stepNumber;
            const isCompleted = currentStep > stepNumber;
            
            return (
              <div key={stepNumber} className="flex flex-col items-center space-y-2">
                {/* Step circle with compact styling */}
                <div className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  isCompleted 
                    ? 'bg-green-500 text-white' 
                    : isCurrent 
                      ? `${isPathA ? 'bg-green-100 text-green-800 border-2 border-green-500' : 'bg-blue-100 text-blue-800 border-2 border-blue-500'}` 
                      : 'bg-gray-100 text-gray-500 border-2 border-gray-200'
                }`}>
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                
                {/* Step label with compact styling */}
                <div className="text-center">
                  <span className={`text-xs font-medium transition-colors duration-300 ${
                    isActive ? (isPathA ? 'text-green-800' : 'text-blue-800') : 'text-gray-500'
                  }`}>
                    {stepInfo.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        
      </div>
    );
  };

  // Path B specific step rendering
  const renderPathBStep = () => {
    const { currentStep, selectedToken, amount, bridgedTokenAmount, vaultSharesMinted } = depositState;
    
    switch (currentStep) {
      case 1:
        // Step 1b: Select Token (handled by LiFiBalanceFetcher)
        return null;
        
      case 2:
        // Step 2b: Enter USD Amount & Execute Bridge
        return (
          <div className="p-4 bg-gray-50 rounded-lg">
            
            <div className="flex items-center justify-between mb-3">
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
                  ${selectedToken?.balanceUSD ? parseFloat(selectedToken.balanceUSD).toFixed(2) : '0.00'}
                </div>
              </div>
            </div>
            
            <div className="mb-3">
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
                disabled={executing}
              />
              
              {/* Percentage selector buttons */}
              <div className="flex justify-center space-x-2 mt-3">
                {[25, 50, 75, 100].map((percentage) => (
                  <button
                    key={percentage}
                    onClick={() => {
                      const maxAmount = selectedToken?.balanceUSD ? parseFloat(selectedToken.balanceUSD) : parseFloat(selectedToken?.balanceFormatted || '0');
                      const amount = (maxAmount * percentage / 100).toString();
                      handleAmountEnter(amount);
                    }}
                    className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors duration-200"
                    disabled={executing}
                  >
                    {percentage === 100 ? 'MAX' : `${percentage}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Transaction substeps for bridge execution */}
            {executing && depositState.transactionSubsteps && depositState.transactionSubsteps.length > 0 && (
              renderTransactionSubsteps(depositState.transactionSubsteps)
            )}

            <button
              onClick={handlePathBStep2}
              disabled={executing || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > (selectedToken?.balanceUSD ? parseFloat(selectedToken.balanceUSD) : parseFloat(selectedToken?.balanceFormatted || '0'))}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {executing ? 'Executing Bridge...' : 'Execute Bridge & Swap'}
            </button>
          </div>
        );
        
      case 3:
        // Step 3b: Execute Vault Deposit
        return (
          <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-lg">
            <div className="text-center">
              {/* Success icon for bridge completion */}
              <div className="relative w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-blue-800 mb-2">Bridge Successful!</h3>
              <p className="text-blue-700 mb-4 text-base">Your deposit has been converted to {UNDERLYING_SYMBOL}</p>
              
              {/* Enhanced bridge summary */}
              <div className="bg-white p-4 rounded-xl border border-blue-200 mb-4 shadow-sm">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  <span className="text-sm font-semibold text-gray-700">Bridge Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">From:</span>
                    <div className="flex items-center space-x-2">
                      {selectedToken?.logoURI && (
                        <img
                          src={selectedToken.logoURI}
                          alt={selectedToken.tokenSymbol}
                          className="w-5 h-5 rounded-full"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      )}
                      <span className="font-bold text-gray-900">{selectedToken?.tokenSymbol} on {selectedToken?.chainName}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">To:</span>
                    <div className="flex items-center space-x-2">
                      {underlyingBalance?.logoURI ? (
                        <img
                          src={underlyingBalance.logoURI}
                          alt={UNDERLYING_SYMBOL}
                          className="w-5 h-5 rounded-full"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      ) : (
                        <img
                          src="/Myrmidons-logo-dark-no-bg.png"
                          alt={UNDERLYING_SYMBOL}
                          className="w-5 h-5 rounded-full"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      )}
                      <span className="font-bold text-gray-900">{UNDERLYING_SYMBOL} on HyperEVM</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600 font-medium">Amount:</span>
                    <span className="font-bold text-gray-900">{bridgedTokenAmount || 'Calculating...'} {UNDERLYING_SYMBOL}</span>
                  </div>
                </div>
              </div>
              
              {/* Transaction substeps for deposit execution */}
              {executing && depositState.transactionSubsteps && depositState.transactionSubsteps.length > 0 && (
                renderTransactionSubsteps(depositState.transactionSubsteps)
              )}
              
              {/* Execute deposit button */}
              <button
                onClick={handlePathBStep3}
                disabled={executing}
                className="w-full py-4 px-6 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg transition-all duration-200 transform hover:-translate-y-0.5 disabled:transform-none"
              >
                {executing ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Processing Deposit...</span>
                  </div>
                ) : (
                  `Deposit ${UNDERLYING_SYMBOL} to Vault`
                )}
              </button>
            </div>
          </div>
        );
        
      case 4:
        // Step 4b: Final Success
        return (
          <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 shadow-lg">
            <div className="text-center">
              {/* Enhanced success icon */}
              <div className="relative w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-green-800 mb-2">Deposit Successful!</h3>
              <p className="text-green-700 mb-4 text-base">Your deposit has been completed successfully</p>
              
              {/* Enhanced transaction summary */}
              <div className="bg-white p-4 rounded-xl border border-green-200 mb-4 shadow-sm">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-semibold text-gray-700">Transaction Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Amount:</span>
                    <span className="font-bold text-gray-900">{bridgedTokenAmount || '0.00'} {UNDERLYING_SYMBOL}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Vault Shares:</span>
                    <div className="flex items-center space-x-2">
                      <img
                        src="/Myrmidons-logo-dark-no-bg.png"
                        alt={config.displayName}
                        className="w-5 h-5 rounded-full"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                      <span className="font-bold text-gray-900">
                        {vaultSharesMinted ? parseFloat(vaultSharesMinted).toFixed(2) : 'Calculating...'} {config.displayName}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600 font-medium">Network:</span>
                    <span className="font-bold text-gray-900">HyperEVM</span>
                  </div>
                </div>
              </div>
              
              {/* Enhanced close button */}
              <button
                onClick={handlePathBStep4}
                className="w-full py-4 px-6 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-lg transition-all duration-200 transform hover:-translate-y-0.5"
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
        // Step 1a: Select underlying token (handled by LiFiBalanceFetcher)
        return null;
        
      case 2:
        // Step 2a: Enter Amount
        return (
          <div className="p-4 bg-gray-50 rounded-lg">
            
            <div className="flex items-center justify-between mb-3">
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
                  {selectedToken ? parseFloat(selectedToken.balanceFormatted).toFixed(6) : '0.000000'} {UNDERLYING_SYMBOL}
                </div>
                <div className="text-sm text-gray-600">
                  {selectedToken?.balanceUSD || 'USD value unavailable'}
                </div>
              </div>
            </div>
            
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter {UNDERLYING_SYMBOL} Amount
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
              
              {/* Percentage selector buttons */}
              <div className="flex justify-center space-x-2 mt-3">
                {[25, 50, 75, 100].map((percentage) => (
                  <button
                    key={percentage}
                    onClick={() => {
                      const maxAmount = selectedToken ? parseFloat(selectedToken.balanceFormatted) : 0;
                      const amount = (maxAmount * percentage / 100).toString();
                      handleAmountEnter(amount);
                    }}
                    className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors duration-200"
                  >
                    {percentage === 100 ? 'MAX' : `${percentage}%`}
                  </button>
                ))}
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
          <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-blue-800">Confirm {UNDERLYING_SYMBOL} Deposit</h3>
              {!executing && (
                <button
                  onClick={() => navigateToStep(2)}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1 transition-colors duration-200"
                >
                  <span>←</span>
                  <span>Back to Amount</span>
                </button>
              )}
            </div>
            
            <div className="space-y-3">
              {/* Enhanced deposit summary */}
              <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-sm">
                <div className="flex items-center justify-center mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  <span className="text-sm font-semibold text-gray-700">Deposit Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">From:</span>
                    <div className="flex items-center space-x-2">
                      {selectedToken?.logoURI && (
                        <img
                          src={selectedToken.logoURI}
                          alt={selectedToken.tokenSymbol}
                          className="w-5 h-5 rounded-full"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      )}
                      <span className="font-bold text-gray-900">{selectedToken?.tokenSymbol} on {selectedToken?.chainName}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">To:</span>
                    <div className="flex items-center space-x-2">
                      <img
                        src="/Myrmidons-logo-dark-no-bg.png"
                        alt="Myrmidons Vault"
                        className="w-5 h-5 rounded-full"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                      <span className="font-bold text-gray-900">{config.displayName}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Amount:</span>
                    <span className="font-bold text-gray-900">{amount} {UNDERLYING_SYMBOL}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600 font-medium">Method:</span>
                    <span className="font-bold text-gray-900">Direct Deposit</span>
                  </div>
                </div>
              </div>
              
              {/* Transaction substeps */}
              {depositState.transactionSubsteps.length > 0 && renderTransactionSubsteps(depositState.transactionSubsteps)}
              
              {/* Enhanced confirm button */}
              <button
                onClick={handlePathAStep3}
                disabled={executing}
                className="w-full py-4 px-6 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg transition-all duration-200 transform hover:-translate-y-0.5 disabled:transform-none"
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
          <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 shadow-lg">
            <div className="text-center">
              {/* Success icon */}
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-green-800 mb-2">Deposit Successful!</h3>
              <p className="text-green-700 mb-4 text-base">Your deposit has been completed successfully</p>
              
              {/* Enhanced transaction summary */}
              <div className="bg-white p-4 rounded-xl border border-green-200 mb-4 shadow-sm">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-semibold text-gray-700">Transaction Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Amount:</span>
                    <span className="font-bold text-gray-900">{amount} {UNDERLYING_SYMBOL}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Vault Shares:</span>
                    <div className="flex items-center space-x-2">
                      <img
                        src="/Myrmidons-logo-dark-no-bg.png"
                        alt={config.displayName}
                        className="w-5 h-5 rounded-full"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                      <span className="font-bold text-gray-900">
                        {vaultSharesMinted ? parseFloat(vaultSharesMinted).toFixed(2) : 'Calculating...'} {config.displayName}
                      </span>
                    </div>
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
                className="w-full py-4 px-6 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-lg transition-all duration-200 transform hover:-translate-y-0.5"
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
          underlyingBalance={underlyingBalance}
          underlyingLoading={underlyingLoading}
          underlyingSymbol={UNDERLYING_SYMBOL}
          currentStep={depositState.currentStep || currentStep}
          onStepChange={(step) => {
            navigateToStep(step);
            setCurrentStep(step);
            onStepChange?.(step);
          }}
        />
      )}

      {/* Toast notifications for errors */}
      <Toasts toasts={toasts} />

    </div>
  );
}


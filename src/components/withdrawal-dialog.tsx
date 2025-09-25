import { useState, useEffect, useRef } from 'react';
import { useWalletClient, useConfig } from 'wagmi';
import { switchChain, getWalletClient } from '@wagmi/core';
import { formatUnits, parseUnits } from 'viem';
import { BrowserProvider, Contract } from 'ethers';
import { CHAIN_IDS, TOKEN_ADDRESSES } from '../lib/lifi-config';
import { erc20Abi } from 'viem';
import vaultAbi from '../abis/vault.json';
import { Toasts, type Toast, type ToastKind } from './vault-shared';

// Vault address for withdrawals
const VAULT_ADDRESS = '0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42' as `0x${string}`;

// Helper functions for chain names and explorer URLs
const getChainName = (chainId: number): string => {
  const chainNames: Record<number, string> = {
    999: 'HyperEVM',
    1: 'Ethereum',
    8453: 'Base',
    137: 'Polygon',
    42161: 'Arbitrum',
    10: 'Optimism',
  };
  return chainNames[chainId] || `Chain ${chainId}`;
};

const getExplorerUrl = (chainId: number, txHash: string): string => {
  const explorers: Record<number, string> = {
    999: 'https://hyperevmscan.io',
    1: 'https://etherscan.io',
    8453: 'https://basescan.org',
    137: 'https://polygonscan.com',
    42161: 'https://arbiscan.io',
    10: 'https://optimistic.etherscan.io',
  };
  const baseUrl = explorers[chainId] || 'https://etherscan.io';
  return `${baseUrl}/tx/${txHash}`;
};

// Withdrawal state interface
interface WithdrawalState {
  selectedToken: {
    chainId: number;
    chainName: string;
    tokenSymbol: string;
    tokenAddress: string;
    balance: string;
    balanceFormatted: string;
    decimals: number;
    logoURI?: string;
  } | null;
  amount: string;
  withdrawalTxHash: string | null;
  withdrawnUsdt0Amount: string | null;
  vaultSharesBefore: string | null;
  currentStep: number;
  transactionSubsteps: Array<{label: string, status: 'pending' | 'processing' | 'completed' | 'failed', txHash?: string, chainId?: number}>;
}

interface WithdrawalDialogProps {
  onClose?: () => void;
  userShares?: bigint;
  shareDecimals?: number;
  underlyingDecimals?: number;
}

export function WithdrawalDialog({ 
  onClose, 
  userShares = 0n, 
  shareDecimals = 18, 
  underlyingDecimals = 6 
}: WithdrawalDialogProps) {
  const [executing, setExecuting] = useState(false);
  
  // Withdrawal state
  const [withdrawalState, setWithdrawalState] = useState<WithdrawalState>({
    selectedToken: null,
    amount: '',
    withdrawalTxHash: null,
    withdrawnUsdt0Amount: null,
    vaultSharesBefore: null,
    currentStep: 1,
    transactionSubsteps: [],
  });
  
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
  
  // Initialize vault shares token info
  useEffect(() => {
    if (userShares > 0n) {
      const sharesFormatted = formatUnits(userShares, shareDecimals);
      setWithdrawalState(prev => ({
        ...prev,
        selectedToken: {
          chainId: CHAIN_IDS.HYPEREVM,
          chainName: 'HyperEVM',
          tokenSymbol: 'USDT0 PHALANX',
          tokenAddress: VAULT_ADDRESS,
          balance: userShares.toString(),
          balanceFormatted: sharesFormatted,
          decimals: shareDecimals,
          logoURI: '/Myrmidons-logo-dark-no-bg.png',
        }
      }));
    }
  }, [userShares, shareDecimals]);
  
  // Update withdrawal state helper
  const updateWithdrawalState = (updates: Partial<WithdrawalState>) => {
    setWithdrawalState(prev => ({ ...prev, ...updates }));
  };
  
  // Handle amount input
  const handleAmountEnter = (value: string) => {
    updateWithdrawalState({ amount: value });
  };
  
  // Handle step navigation
  const navigateToStep = (step: number) => {
    updateWithdrawalState({ currentStep: step });
  };
  
  // Main withdrawal execution function
  const handleUSDT0Withdrawal = async () => {
    if (!clientW.data?.account?.address) {
      pushToast('error', 'Please connect your wallet');
      return;
    }
    
    if (!withdrawalState.amount || parseFloat(withdrawalState.amount) <= 0) {
      pushToast('error', 'Please enter a valid amount');
      return;
    }
    
    try {
      setExecuting(true);
      
      // Switch to HyperEVM chain
      await switchChain(wagmiConfig, { chainId: CHAIN_IDS.HYPEREVM });
      
      // Get vault contract
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      
      // Parse amount (vault shares)
      const amountWei = parseUnits(withdrawalState.amount, shareDecimals);
      
      // Check if user has enough shares
      if (amountWei > userShares) {
        pushToast('error', 'Insufficient vault shares');
        setExecuting(false);
        return;
      }
      
      // Update substeps for withdrawal
      updateWithdrawalState({
        transactionSubsteps: [
          { label: 'Withdraw vault shares', status: 'processing' as const, chainId: CHAIN_IDS.HYPEREVM }
        ]
      });
      
      // Execute withdrawal
      const tx = await vault.withdraw(amountWei, clientW.data.account.address, clientW.data.account.address);
      
      // Update substeps with transaction hash
      updateWithdrawalState({
        transactionSubsteps: [
          { label: 'Withdraw vault shares', status: 'processing' as const, txHash: tx.hash, chainId: CHAIN_IDS.HYPEREVM }
        ]
      });
      
      // Wait for transaction confirmation
      await provider.waitForTransaction(tx.hash, 1, 20_000);
      
      // Mark withdrawal as completed
      updateWithdrawalState({
        transactionSubsteps: [
          { label: 'Withdraw vault shares', status: 'completed' as const, txHash: tx.hash, chainId: CHAIN_IDS.HYPEREVM }
        ],
        withdrawalTxHash: tx.hash,
        currentStep: 3, // Success step
      });
      
      // Calculate estimated USDT0 amount received
      const estimatedUsdt0Amount = formatUnits(amountWei, underlyingDecimals); // This is a rough estimate
      updateWithdrawalState({
        withdrawnUsdt0Amount: estimatedUsdt0Amount
      });
      
      pushToast('success', 'Withdrawal successful!');
      
    } catch (error: any) {
      console.error('Withdrawal failed:', error);
      
      // Enhanced error handling
      let errorMessage = 'Withdrawal failed';
      
      if (error.message?.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user.';
      } else if (error.message?.includes('Insufficient balance')) {
        errorMessage = 'Insufficient vault shares for withdrawal.';
      } else if (error.message?.includes('Gas estimation failed')) {
        errorMessage = 'Gas estimation failed. Please try with a higher gas limit.';
      } else if (error.message?.includes('Network error')) {
        errorMessage = 'Network error occurred. Please check your connection and try again.';
      } else if (error.message) {
        errorMessage = `Withdrawal failed: ${error.message}`;
      }
      
      pushToast('error', errorMessage);
      
      // Reset to step 2 for retry
      updateWithdrawalState({
        currentStep: 2,
        transactionSubsteps: []
      });
    } finally {
      setExecuting(false);
    }
  };
  
  // Step handlers
  const handleStep1 = () => {
    if (!withdrawalState.amount || parseFloat(withdrawalState.amount) <= 0) {
      pushToast('error', 'Please enter a valid amount');
      return;
    }
    if (parseFloat(withdrawalState.amount) > parseFloat(withdrawalState.selectedToken?.balanceFormatted || '0')) {
      pushToast('error', 'Amount exceeds available vault shares');
      return;
    }
    navigateToStep(2);
  };
  
  const handleStep2 = () => {
    handleUSDT0Withdrawal();
  };
  
  const handleStep3 = () => {
    onClose?.();
  };
  
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
  
  // Progress indicator
  const renderProgressIndicator = () => {
    const totalSteps = 2;
    const currentStep = withdrawalState.currentStep;
    
    return (
      <div className="flex items-center justify-center space-x-4 mb-6">
        {Array.from({ length: totalSteps }, (_, index) => {
          const stepNumber = index + 1;
          const isActive = currentStep >= stepNumber;
          const isCurrent = currentStep === stepNumber;
          const isCompleted = currentStep > stepNumber;
          
          return (
            <div key={stepNumber} className="flex flex-col items-center space-y-2">
              <div className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                isCompleted 
                  ? 'bg-green-500 text-white' 
                  : isCurrent 
                    ? 'bg-green-100 text-green-800 border-2 border-green-500' 
                    : 'bg-gray-100 text-gray-500 border-2 border-gray-200'
              }`}>
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNumber
                )}
              </div>
              <span className={`text-xs font-medium ${
                isActive ? 'text-gray-900' : 'text-gray-500'
              }`}>
                {stepNumber === 1 ? 'Enter Amount' : 'Confirm & Execute'}
              </span>
            </div>
          );
        })}
      </div>
    );
  };
  
  // Render step content
  const renderStep = () => {
    switch (withdrawalState.currentStep) {
      case 1:
        // Step 1: Enter Amount
        return (
          <div className="p-6 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <img
                  src="/Myrmidons-logo-dark-no-bg.png"
                  alt="USDT0 PHALANX"
                  className="w-10 h-10 rounded-full"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <div>
                  <div className="font-semibold text-lg">USDT0 PHALANX</div>
                  <div className="text-sm text-gray-600">HyperEVM</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg">
                  {withdrawalState.selectedToken ? parseFloat(withdrawalState.selectedToken.balanceFormatted).toFixed(4) : '0.0000'} USDT0 PHALANX
                </div>
                <div className="text-sm text-gray-600">
                  Vault Shares
                </div>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Amount (Vault Shares)
              </label>
              <input
                type="number"
                value={withdrawalState.amount}
                onChange={(e) => handleAmountEnter(e.target.value)}
                placeholder="0.00"
                step="0.000001"
                min="0"
                max={withdrawalState.selectedToken ? parseFloat(withdrawalState.selectedToken.balanceFormatted) : 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              
              {/* Percentage selector buttons */}
              <div className="flex justify-center space-x-2 mt-3">
                {[25, 50, 75, 100].map((percentage) => (
                  <button
                    key={percentage}
                    onClick={() => {
                      const maxAmount = withdrawalState.selectedToken ? parseFloat(withdrawalState.selectedToken.balanceFormatted) : 0;
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
              onClick={handleStep1}
              disabled={!withdrawalState.amount || parseFloat(withdrawalState.amount) <= 0 || parseFloat(withdrawalState.amount) > (withdrawalState.selectedToken ? parseFloat(withdrawalState.selectedToken.balanceFormatted) : 0)}
              className="w-full py-3 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue to Confirmation
            </button>
          </div>
        );
        
      case 2:
        // Step 2: Confirm & Execute
        return (
          <div className="p-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-blue-800">Confirm USDT0 Withdrawal</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-gray-800 mb-3">Withdrawal Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">From:</span>
                    <div className="flex items-center space-x-2">
                      <img
                        src="/Myrmidons-logo-dark-no-bg.png"
                        alt="USDT0 PHALANX"
                        className="w-4 h-4 rounded-full"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                      <span className="font-medium">USDT0 PHALANX on HyperEVM</span>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">To:</span>
                    <div className="flex items-center space-x-2">
                      <img
                        src="/Myrmidons-logo-dark-no-bg.png"
                        alt="USDT0"
                        className="w-4 h-4 rounded-full"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                      <span className="font-medium">USDT0 on HyperEVM</span>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-medium">{withdrawalState.amount} Vault Shares</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Method:</span>
                    <span className="font-medium">Direct Withdrawal</span>
                  </div>
                </div>
              </div>
              
              {/* Transaction substeps */}
              {executing && withdrawalState.transactionSubsteps.length > 0 && (
                renderTransactionSubsteps(withdrawalState.transactionSubsteps)
              )}
              
              <button
                onClick={handleStep2}
                disabled={executing}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {executing ? 'Executing Withdrawal...' : 'Confirm & Execute Withdrawal'}
              </button>
            </div>
          </div>
        );
        
      case 3:
        // Step 3: Success
        return (
          <div className="p-8 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 shadow-lg">
            <div className="text-center">
              {/* Success icon */}
              <div className="relative w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-2xl font-bold text-green-800 mb-2">Withdrawal Successful!</h3>
              <p className="text-green-700 mb-6 text-lg">Your withdrawal has been completed successfully</p>
              
              {/* Transaction summary */}
              <div className="bg-white p-6 rounded-xl border border-green-200 mb-6 shadow-sm">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-semibold text-gray-700">Transaction Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Amount:</span>
                    <span className="font-bold text-gray-900">{withdrawalState.amount} Vault Shares</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">Received:</span>
                    <div className="flex items-center space-x-2">
                      <img
                        src="/Myrmidons-logo-dark-no-bg.png"
                        alt="USDT0"
                        className="w-5 h-5 rounded-full"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                      <span className="font-bold text-gray-900">
                        {withdrawalState.withdrawnUsdt0Amount || 'Calculating...'} USDT0
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600 font-medium">Network:</span>
                    <span className="font-bold text-gray-900">HyperEVM</span>
                  </div>
                </div>
              </div>
              
              {/* Close button */}
              <button
                onClick={handleStep3}
                className="w-full py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
      {/* Progress indicator */}
      {renderProgressIndicator()}
      
      {/* Step content */}
      {renderStep()}
      
      {/* Toast notifications for errors */}
      <Toasts toasts={toasts} />
    </div>
  );
}

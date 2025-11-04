import { useState, useRef, useEffect } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useWalletClient, useConfig } from 'wagmi';
import { switchChain, getWalletClient } from '@wagmi/core';
import { BrowserProvider, Contract } from 'ethers';
import { CHAIN_IDS } from '../lib/lifi-config';
import { erc20Abi } from 'viem';
import vaultAbi from '../abis/vault.json';
import { Toasts, type Toast, type ToastKind } from './vault-shared';
import { DEFAULT_VAULT_CONFIG, type VaultConfig } from '../config/vaults.config';
import type { IVaultAdapter } from '../lib/vault-provider';
import { LiFiBalanceFetcher } from './lifi-balance-fetcher';
import { useLifiConfig } from '../hooks/useLifiConfig';
import { getRoutes, executeRoute, getToken, getTokenBalances } from '@lifi/sdk';

interface TokenBalance {
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
}

interface DepositInlineProps {
  vaultConfig?: VaultConfig;
  vaultAdapter?: IVaultAdapter | null;
  onSuccess?: () => void;
}

export function DepositInline({ vaultConfig, vaultAdapter, onSuccess }: DepositInlineProps) {
  const config = vaultConfig || DEFAULT_VAULT_CONFIG;
  const VAULT_ADDRESS = config.vaultAddress;
  const UNDERLYING_SYMBOL = config.underlyingSymbol;
  const UNDERLYING_ADDRESS = config.underlyingAddress;
  const UNDERLYING_DECIMALS = config.underlyingDecimals;

  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [underlyingBalance, setUnderlyingBalance] = useState<TokenBalance | null>(null);
  const [underlyingLoading, setUnderlyingLoading] = useState(false);
  const [transactionSteps, setTransactionSteps] = useState<Array<{
    label: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    txHash?: string;
    chainId?: number;
  }>>([]);
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
  const { isConfigured } = useLifiConfig();

  // Detect deposit path: 'A' for direct deposit (underlying on HyperEVM), 'B' for bridge
  const depositPath = selectedToken
    ? selectedToken.tokenSymbol === UNDERLYING_SYMBOL && selectedToken.chainId === CHAIN_IDS.HYPEREVM
      ? 'A'
      : 'B'
    : null;

  // Fetch underlying token balance
  const fetchUnderlyingBalance = async () => {
    if (!clientW.data?.account?.address) return;
    setUnderlyingLoading(true);
    try {
      const tokenInfo = await getToken(CHAIN_IDS.HYPEREVM, UNDERLYING_ADDRESS);
      const balances = await getTokenBalances(clientW.data.account.address, [tokenInfo]);
      if (balances && balances.length > 0) {
        const balance = balances[0];
        const amountStr = balance.amount?.toString() || '0';
        const balanceFormatted = formatUnits(BigInt(amountStr), balance.decimals || UNDERLYING_DECIMALS);
        const balanceUSD = tokenInfo.priceUSD
          ? (parseFloat(balanceFormatted) * parseFloat(tokenInfo.priceUSD)).toFixed(2)
          : '0';
        if (parseFloat(balanceFormatted) > 0) {
          setUnderlyingBalance({
            chainId: CHAIN_IDS.HYPEREVM,
            chainName: 'HyperEVM',
            tokenSymbol: UNDERLYING_SYMBOL,
            tokenAddress: UNDERLYING_ADDRESS,
            balance: amountStr,
            balanceFormatted,
            decimals: balance.decimals || UNDERLYING_DECIMALS,
            logoURI: tokenInfo.logoURI,
            priceUSD: tokenInfo.priceUSD,
            balanceUSD,
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

  // Fetch underlying balance when wallet connects
  useEffect(() => {
    if (clientW.data?.account?.address && isConfigured && !underlyingBalance && !underlyingLoading) {
      fetchUnderlyingBalance();
    }
  }, [clientW.data?.account?.address, isConfigured, underlyingBalance, underlyingLoading]);

  const handleTokenSelect = (tokenInfo: TokenBalance) => {
    setSelectedToken(tokenInfo);
    setTokenSelectorOpen(false);
    setAmount('');
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
  };

  const handleMax = () => {
    if (selectedToken) {
      setAmount(selectedToken.balanceFormatted);
    }
  };

  // Calculate USD equivalent for input amount
  const inputAmountUSD = amount && selectedToken && selectedToken.priceUSD
    ? (parseFloat(amount) * parseFloat(selectedToken.priceUSD)).toFixed(2)
    : null;

  // Helper function to get explorer URL
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

  // Render transaction steps indicator
  const renderTransactionSteps = () => {
    if (transactionSteps.length === 0) return null;

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-[#E5E2D6]">
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--heading, #00295B)' }}>Transaction Progress</h4>
        <div className="space-y-2">
          {transactionSteps.map((step, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  step.status === 'completed' ? 'bg-green-500' :
                  step.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                  step.status === 'failed' ? 'bg-red-500' :
                  'bg-gray-300'
                }`}></div>
                <span className={`text-sm ${
                  step.status === 'completed' ? 'text-green-700' :
                  step.status === 'processing' ? 'text-blue-700' :
                  step.status === 'failed' ? 'text-red-700' :
                  'text-gray-500'
                }`}>
                  {step.label}
                </span>
              </div>
              {step.txHash && step.chainId && (
                <a
                  href={getExplorerUrl(step.chainId, step.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 font-mono"
                >
                  {step.txHash.slice(0, 8)}...{step.txHash.slice(-6)}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Execute deposit
  const handleDeposit = async () => {
    if (!clientW.data?.account?.address) {
      pushToast('error', 'Please connect your wallet');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      pushToast('error', 'Please enter a valid amount');
      return;
    }

    if (!selectedToken) {
      pushToast('error', 'Please select a token');
      return;
    }

    try {
      setExecuting(true);
      setTransactionSteps([]);

      // Path A: Direct deposit
      if (depositPath === 'A') {
        await switchChain(wagmiConfig, { chainId: CHAIN_IDS.HYPEREVM });
        const amountWei = parseUnits(amount, UNDERLYING_DECIMALS);
        const provider = new BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const token = new Contract(UNDERLYING_ADDRESS, erc20Abi as any, signer);

        // Check approval
        let needsApproval = false;
        try {
          const allowance = await token.allowance(clientW.data.account.address, VAULT_ADDRESS);
          needsApproval = allowance < amountWei;
        } catch (error: any) {
          console.log('Allowance check failed:', error.message);
          needsApproval = false;
        }

        if (needsApproval) {
          setTransactionSteps([{
            label: `Approve ${UNDERLYING_SYMBOL} spending`,
            status: 'processing',
            chainId: CHAIN_IDS.HYPEREVM
          }]);
          pushToast('info', 'Approving token...');
          const approveTx = await token.approve(VAULT_ADDRESS, amountWei);
          setTransactionSteps([{
            label: `Approve ${UNDERLYING_SYMBOL} spending`,
            status: 'processing',
            txHash: approveTx.hash,
            chainId: CHAIN_IDS.HYPEREVM
          }]);
          await provider.waitForTransaction(approveTx.hash, 1, 20_000).catch(() => null);
          setTransactionSteps([{
            label: `Approve ${UNDERLYING_SYMBOL} spending`,
            status: 'completed',
            txHash: approveTx.hash,
            chainId: CHAIN_IDS.HYPEREVM
          }]);
          pushToast('success', 'Approval confirmed');
        }

        // Execute deposit
        const depositStep = {
          label: config.type === 'lagoon' ? 'Request deposit (async)' : 'Deposit to vault',
          status: 'processing' as const,
          chainId: CHAIN_IDS.HYPEREVM
        };
        setTransactionSteps(prev => needsApproval ? [...prev, depositStep] : [depositStep]);

        let tx;
        if (vaultAdapter) {
          const result = await vaultAdapter.enqueueDeposit(amountWei, clientW.data.account.address as `0x${string}`);
          tx = { hash: result.hash };
        } else {
          const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
          tx = await vault.deposit(amountWei, clientW.data.account.address);
        }

        setTransactionSteps(prev => prev.map((step, idx) => 
          idx === prev.length - 1 
            ? { ...step, status: 'processing' as const, txHash: tx.hash }
            : step
        ));

        pushToast('info', `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);
        const receipt = await provider.waitForTransaction(tx.hash, 1, 20_000);
        if (!receipt || receipt.status === null || receipt.status === 0 || (typeof receipt.status === 'bigint' && receipt.status === 0n)) {
          throw new Error('Transaction failed');
        }

        setTransactionSteps(prev => prev.map((step, idx) => 
          idx === prev.length - 1 
            ? { ...step, status: 'completed' as const }
            : step
        ));

        pushToast('success', 'Deposit successful!');
        setAmount('');
        setSelectedToken(null);
        await fetchUnderlyingBalance();
        onSuccess?.();
      } else {
        // Path B: Bridge + deposit
        const userAddress = clientW.data.account.address;
        
        // Convert token amount to wei
        const fromAmount = parseUnits(amount, selectedToken.decimals).toString();
        const fromToken = selectedToken.tokenAddress;
        const toToken = UNDERLYING_ADDRESS;
        
        // Normalize ETH address
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
          const nonGlacisRoute = result.routes.find(route => 
            !route.steps?.some(step => step.toolDetails?.key?.toLowerCase().includes('glacis'))
          );
          if (nonGlacisRoute) {
            selectedRoute = nonGlacisRoute;
          }
        }

        // Set bridge step
        setTransactionSteps([{
          label: 'Execute bridge transaction',
          status: 'processing',
          chainId: selectedToken.chainId
        }]);

        pushToast('info', 'Executing bridge transaction...');

        // Execute the route
        const executedRoute = await executeRoute(selectedRoute, {
          updateRouteHook: (updatedRoute) => {
            console.log('Route update:', updatedRoute);
            // Update step with transaction hash if available
            if (updatedRoute.steps && updatedRoute.steps.length > 0) {
              const lastStep = updatedRoute.steps[updatedRoute.steps.length - 1];
              if (lastStep.execution?.process && lastStep.execution.process.length > 0) {
                const lastProcess = lastStep.execution.process[lastStep.execution.process.length - 1];
                if (lastProcess.txHash) {
                  setTransactionSteps([{
                    label: 'Execute bridge transaction',
                    status: 'processing',
                    txHash: lastProcess.txHash,
                    chainId: selectedToken.chainId
                  }]);
                }
              }
            }
          },
          acceptExchangeRateUpdateHook: async () => {
            return true;
          },
          switchChainHook: async (chainId) => {
            try {
              const chain = await switchChain(wagmiConfig, { chainId });
              return getWalletClient(wagmiConfig, { chainId: chain.id });
            } catch (error) {
              console.error('Failed to switch chain:', error);
              throw error;
            }
          },
        });

        // Mark bridge as completed
        setTransactionSteps([{
          label: 'Execute bridge transaction',
          status: 'completed',
          chainId: selectedToken.chainId
        }]);

        // Extract estimated output amount
        let estimatedOutputAmount: string | null = null;
        if (executedRoute.steps && executedRoute.steps.length > 0) {
          const lastStep = executedRoute.steps[executedRoute.steps.length - 1];
          if (lastStep.estimate?.toAmount) {
            estimatedOutputAmount = formatUnits(
              BigInt(lastStep.estimate.toAmount), 
              UNDERLYING_DECIMALS
            );
          } else if (lastStep.estimate?.toAmountMin) {
            estimatedOutputAmount = formatUnits(
              BigInt(lastStep.estimate.toAmountMin), 
              UNDERLYING_DECIMALS
            );
          }
        }

        pushToast('success', 'Bridge completed! Depositing to vault...');

        // Now deposit the bridged amount
        await switchChain(wagmiConfig, { chainId: CHAIN_IDS.HYPEREVM });
        const depositAmount = estimatedOutputAmount || amount;
        const amountWei = parseUnits(depositAmount, UNDERLYING_DECIMALS);
        const provider = new BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const token = new Contract(UNDERLYING_ADDRESS, erc20Abi as any, signer);

        // Check approval
        let needsApproval = false;
        try {
          const allowance = await token.allowance(userAddress, VAULT_ADDRESS);
          needsApproval = allowance < amountWei;
        } catch (error: any) {
          console.log('Allowance check failed:', error.message);
          needsApproval = false;
        }

        if (needsApproval) {
          setTransactionSteps(prev => [...prev, {
            label: `Approve ${UNDERLYING_SYMBOL} spending`,
            status: 'processing',
            chainId: CHAIN_IDS.HYPEREVM
          }]);
          pushToast('info', 'Approving token...');
          const approveTx = await token.approve(VAULT_ADDRESS, amountWei);
          setTransactionSteps(prev => prev.map((step, idx) => 
            idx === prev.length - 1 
              ? { ...step, status: 'processing' as const, txHash: approveTx.hash }
              : step
          ));
          await provider.waitForTransaction(approveTx.hash, 1, 20_000).catch(() => null);
          setTransactionSteps(prev => prev.map((step, idx) => 
            idx === prev.length - 1 
              ? { ...step, status: 'completed' as const }
              : step
          ));
        }

        // Execute deposit
        const depositStep = {
          label: config.type === 'lagoon' ? 'Request deposit (async)' : 'Deposit to vault',
          status: 'processing' as const,
          chainId: CHAIN_IDS.HYPEREVM
        };
        setTransactionSteps(prev => [...prev, depositStep]);

        let tx;
        if (vaultAdapter) {
          const result = await vaultAdapter.enqueueDeposit(amountWei, userAddress as `0x${string}`);
          tx = { hash: result.hash };
        } else {
          const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
          tx = await vault.deposit(amountWei, userAddress);
        }

        setTransactionSteps(prev => prev.map((step, idx) => 
          idx === prev.length - 1 
            ? { ...step, status: 'processing' as const, txHash: tx.hash }
            : step
        ));

        pushToast('info', `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);
        const receipt = await provider.waitForTransaction(tx.hash, 1, 20_000);
        if (!receipt || receipt.status === null || receipt.status === 0 || (typeof receipt.status === 'bigint' && receipt.status === 0n)) {
          throw new Error('Transaction failed');
        }

        setTransactionSteps(prev => prev.map((step, idx) => 
          idx === prev.length - 1 
            ? { ...step, status: 'completed' as const }
            : step
        ));

        pushToast('success', 'Deposit successful!');
        setAmount('');
        setSelectedToken(null);
        await fetchUnderlyingBalance();
        onSuccess?.();
      }
    } catch (error: any) {
      console.error('Deposit failed:', error);
      let errorMessage = 'Deposit failed. Please try again.';
      if (error.message?.includes('User rejected')) {
        errorMessage = 'Transaction was cancelled.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      pushToast('error', errorMessage);
      // Mark last step as failed
      setTransactionSteps(prev => prev.map((step, idx) => 
        idx === prev.length - 1 
          ? { ...step, status: 'failed' as const }
          : step
      ));
    } finally {
      setExecuting(false);
    }
  };

  const canDeposit =
    selectedToken &&
    amount &&
    parseFloat(amount) > 0 &&
    parseFloat(amount) <= parseFloat(selectedToken.balanceFormatted) &&
    !executing;

  return (
    <div className="space-y-4">
      {/* Deposit Section */}
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4">
        <div className="text-xs mb-2" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          Deposit
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <input
              type="number"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.0"
              step="0.000001"
              min="0"
              className="w-full text-2xl font-semibold bg-transparent border-none outline-none"
              style={{ color: 'var(--heading, #00295B)' }}
              disabled={executing}
            />
            {inputAmountUSD && (
              <div className="text-xs mt-1" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
                ${inputAmountUSD} USD
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setTokenSelectorOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all"
            style={{ borderColor: 'var(--border, #E5E2D6)' }}
            disabled={executing}
          >
            {selectedToken ? (
              <>
                {selectedToken.logoURI && (
                  <img
                    src={selectedToken.logoURI}
                    alt={selectedToken.tokenSymbol}
                    className="w-5 h-5 rounded-full"
                  />
                )}
                <span className="font-semibold">{selectedToken.tokenSymbol}</span>
                <span className="text-xs">▼</span>
              </>
            ) : (
              <>
                <span className="font-semibold">Select token</span>
                <span className="text-xs">▼</span>
              </>
            )}
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
            {selectedToken
              ? `${parseFloat(selectedToken.balanceFormatted).toFixed(6)} ${selectedToken.tokenSymbol}`
              : '—'}
          </div>
          <button
            type="button"
            onClick={handleMax}
            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={!selectedToken || executing}
          >
            MAX
          </button>
        </div>
      </div>

      {/* Transaction Steps Indicator */}
      {renderTransactionSteps()}

      {/* Action Button */}
      <button
        type="button"
        onClick={handleDeposit}
        disabled={!canDeposit}
        className="w-full py-3 px-4 text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: 'var(--muted-brass, #B08D57)', color: '#fff' }}
      >
        {executing ? 'Processing...' : selectedToken ? `Deposit ${selectedToken.tokenSymbol}` : 'Enter an amount'}
      </button>

      {/* Token Selector Modal */}
      {tokenSelectorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setTokenSelectorOpen(false);
            }
          }}
        >
          <div className="absolute inset-0 backdrop-blur-sm"></div>
          <div className="relative bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-[#E5E2D6]">
              <h2 className="text-xl font-semibold text-[#00295B]">Select Token</h2>
              <button
                onClick={() => setTokenSelectorOpen(false)}
                className="text-[#101720]/60 hover:text-[#101720] text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
              <LiFiBalanceFetcher
                onTokenSelect={handleTokenSelect}
                onAmountEnter={() => {}}
                onExecute={() => {}}
                selectedToken={selectedToken}
                amount=""
                isExecuting={false}
                underlyingBalance={underlyingBalance}
                underlyingLoading={underlyingLoading}
                underlyingSymbol={UNDERLYING_SYMBOL}
                currentStep={1}
                onStepChange={() => {}}
              />
            </div>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}

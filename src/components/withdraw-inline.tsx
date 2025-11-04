import { useState, useRef } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useWalletClient, useConfig } from 'wagmi';
import { switchChain } from '@wagmi/core';
import { BrowserProvider, Contract } from 'ethers';
import { CHAIN_IDS } from '../lib/lifi-config';
import vaultAbi from '../abis/vault.json';
import { Toasts, type Toast, type ToastKind } from './vault-shared';
import { DEFAULT_VAULT_CONFIG, type VaultConfig } from '../config/vaults.config';
import type { IVaultAdapter } from '../lib/vault-provider';

interface WithdrawInlineProps {
  vaultConfig?: VaultConfig;
  vaultAdapter?: IVaultAdapter | null;
  userShares?: bigint;
  shareDecimals?: number;
  sharePriceUsd?: number | null;
  onSuccess?: () => void;
}

export function WithdrawInline({
  vaultConfig,
  vaultAdapter,
  userShares = 0n,
  shareDecimals = 18,
  sharePriceUsd,
  onSuccess,
}: WithdrawInlineProps) {
  const config = vaultConfig || DEFAULT_VAULT_CONFIG;
  const VAULT_ADDRESS = config.vaultAddress;

  const [amount, setAmount] = useState<string>('');
  const [executing, setExecuting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [transactionSteps, setTransactionSteps] = useState<Array<{
    label: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    txHash?: string;
    chainId?: number;
  }>>([]);
  const toastIdRef = useRef<number>(1);
  const pushToast = (kind: ToastKind, text: string, ttl = 5000, href?: string) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((t) => [...t, { id, kind, text, href }]);
    if (ttl > 0) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  };

  const clientW = useWalletClient();
  const wagmiConfig = useConfig();

  // Calculate USD equivalent for input shares
  const sharesFormatted = formatUnits(userShares, shareDecimals);
  const inputAmountUSD = amount && sharePriceUsd
    ? (parseFloat(amount) * sharePriceUsd).toFixed(2)
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

  const handleAmountChange = (value: string) => {
    setAmount(value);
  };

  const handleMax = () => {
    setAmount(sharesFormatted);
  };

  const handleWithdraw = async () => {
    if (!clientW.data?.account?.address) {
      pushToast('error', 'Please connect your wallet');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      pushToast('error', 'Please enter a valid amount');
      return;
    }

    try {
      setExecuting(true);
      setTransactionSteps([]);

      await switchChain(wagmiConfig, { chainId: CHAIN_IDS.HYPEREVM });
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);
      const sharesWei = parseUnits(amount, shareDecimals);

      if (sharesWei > userShares) {
        pushToast('error', 'Insufficient vault shares');
        setExecuting(false);
        return;
      }

      // Set withdrawal step
      const withdrawalStep = {
        label: config.type === 'lagoon' ? 'Request withdrawal (async)' : 'Withdraw vault shares',
        status: 'processing' as const,
        chainId: CHAIN_IDS.HYPEREVM
      };
      setTransactionSteps([withdrawalStep]);

      let tx;
      let assetsOut;

      if (vaultAdapter) {
        const result = await vaultAdapter.enqueueRedeem(sharesWei, clientW.data.account.address as `0x${string}`);
        tx = { hash: result.hash };
        assetsOut = 0n;
      } else {
        const assetsOutWei = await vault.previewRedeem(sharesWei);
        assetsOut = assetsOutWei;
        tx = await vault.withdraw(assetsOut, clientW.data.account.address, clientW.data.account.address);
      }

      setTransactionSteps([{
        ...withdrawalStep,
        status: 'processing' as const,
        txHash: tx.hash
      }]);

      pushToast('info', `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);
      const receipt = await provider.waitForTransaction(tx.hash, 1, 60_000);

      if (!receipt) {
        throw new Error('No receipt received');
      }
      const isReverted =
        receipt.status === null || receipt.status === 0 || (typeof receipt.status === 'bigint' && receipt.status === 0n);
      if (isReverted) {
        throw new Error('Transaction reverted on-chain');
      }

      setTransactionSteps([{
        ...withdrawalStep,
        status: 'completed' as const,
        txHash: tx.hash
      }]);

      pushToast('success', 'Withdrawal successful!');
      setAmount('');
      onSuccess?.();
    } catch (error: any) {
      console.error('Withdrawal failed:', error);
      let errorMessage = 'Withdrawal failed';
      if (error.message?.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user.';
      } else if (error.message?.includes('Insufficient balance')) {
        errorMessage = 'Insufficient vault shares for withdrawal.';
      } else if (error.message) {
        errorMessage = `Withdrawal failed: ${error.message}`;
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

  const canWithdraw =
    amount &&
    parseFloat(amount) > 0 &&
    parseFloat(amount) <= parseFloat(sharesFormatted) &&
    !executing &&
    userShares > 0n;

  return (
    <div className="space-y-4">
      {/* Withdraw Section */}
      <div className="bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg p-4">
        <div className="text-xs mb-2" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          Withdraw
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
          <div className="flex items-center gap-2 px-3 py-2">
            <img
              src="/Myrmidons-logo-dark-no-bg.png"
              alt={config.displayName}
              className="w-5 h-5 rounded-full"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
            <span className="font-semibold">{config.displayName}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs" style={{ color: 'var(--text, #101720)', opacity: 0.6 }}>
            {sharesFormatted} {config.displayName}
          </div>
          <button
            type="button"
            onClick={handleMax}
            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={!userShares || userShares === 0n || executing}
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
        onClick={handleWithdraw}
        disabled={!canWithdraw}
        className="w-full py-3 px-4 text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border"
        style={{ borderColor: 'var(--heading, #00295B)', color: 'var(--heading, #00295B)' }}
      >
        {executing ? 'Processing...' : amount ? 'Withdraw' : 'Enter an amount'}
      </button>

      <Toasts toasts={toasts} />
    </div>
  );
}

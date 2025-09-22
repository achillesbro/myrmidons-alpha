import React, { useState, useEffect } from 'react';
import { useWalletClient } from 'wagmi';
import { LiFiBalanceFetcher } from './lifi-balance-fetcher';
import { CHAIN_IDS, TOKEN_ADDRESSES } from '../lib/lifi-config';
import { getToken, getTokenBalances } from '@lifi/sdk';
import { switchChain } from '@wagmi/core';
import { formatUnits, parseUnits, erc20Abi } from 'viem';
import { BrowserProvider, Contract } from 'ethers';
import { Toasts, type Toast, type ToastKind } from './vault-shared';
import { useConfig } from 'wagmi';
import vaultAbi from '../abis/vault.json';

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

interface MultiStepDepositProps {
  onClose: () => void;
}

const VAULT_ADDRESS = '0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42' as `0x${string}`;

export function MultiStepDeposit({ onClose }: MultiStepDepositProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [amount, setAmount] = useState('');
  const [executing, setExecuting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [usdt0Balance, setUsdt0Balance] = useState<TokenBalance | null>(null);
  const [usdt0Loading, setUsdt0Loading] = useState(false);

  const clientW = useWalletClient();
  const wagmiConfig = useConfig();
  const toastIdRef = React.useRef<number>(1);

  const pushToast = (kind: ToastKind, text: string, ttl = 5000, href?: string) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((t) => [...t, { id, kind, text, href }]);
    if (ttl > 0) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  };

  // Fetch USDT0 balance
  useEffect(() => {
    if (!clientW.data?.account?.address) return;
    fetchUSDT0Balance();
  }, [clientW.data?.account?.address]);

  const fetchUSDT0Balance = async () => {
    if (!clientW.data?.account?.address) return;

    setUsdt0Loading(true);
    try {
      const tokenInfo = await getToken(CHAIN_IDS.HYPEREVM, TOKEN_ADDRESSES[CHAIN_IDS.HYPEREVM].USDT0);
      const balances = await getTokenBalances(clientW.data.account.address, [tokenInfo]);

      if (balances && balances.length > 0) {
        const balance = balances[0];
        const amountStr = balance.amount?.toString() || '0';
        const balanceFormatted = formatUnits(BigInt(amountStr), balance.decimals || 6);
        const balanceUSD = tokenInfo.priceUSD ?
          (parseFloat(balanceFormatted) * parseFloat(tokenInfo.priceUSD)).toFixed(2) :
          balanceFormatted;

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

  const handleTokenSelect = (token: TokenBalance) => {
    setSelectedToken(token);
    setCurrentStep(2);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };

  const handleAmountButton = (percentage: number) => {
    if (!selectedToken) return;
    
    const maxUSD = selectedToken.balanceUSD ? 
      parseFloat(selectedToken.balanceUSD.replace('$', '')) : 
      parseFloat(selectedToken.balanceFormatted);
    
    const amountUSD = (maxUSD * percentage / 100).toFixed(2);
    setAmount(amountUSD);
  };

  const handleContinue = async () => {
    if (!selectedToken || !amount) return;

    if (selectedToken.tokenSymbol === 'USDT0' && selectedToken.chainId === CHAIN_IDS.HYPEREVM) {
      // Direct deposit - skip to step 3
      setCurrentStep(3);
      return;
    }

    // For other tokens, get quote
    try {
      setCurrentStep(3);
      // Quote logic would go here
    } catch (error) {
      console.error('Error getting quote:', error);
      pushToast('error', 'Failed to get quote. Please try again.', 5000);
    }
  };

  const handleExecute = async () => {
    if (!selectedToken || !amount) return;

    if (selectedToken.tokenSymbol === 'USDT0' && selectedToken.chainId === CHAIN_IDS.HYPEREVM) {
      await handleDirectDeposit();
    } else {
      await handleBridgeDeposit();
    }
  };

  const handleDirectDeposit = async () => {
    if (!usdt0Balance || !amount || parseFloat(amount) <= 0) return;
    
    try {
      setExecuting(true);
      pushToast('info', 'Starting direct deposit...', 3000);
      
      // Force switch to HyperEVM
      try {
        await switchChain(wagmiConfig, { chainId: CHAIN_IDS.HYPEREVM });
        pushToast('info', 'Switched to HyperEVM', 2000);
      } catch (error: any) {
        console.error('Chain switch failed:', error);
        pushToast('error', 'Failed to switch to HyperEVM. Please switch manually.', 5000);
        setExecuting(false);
        return;
      }
      
      const usdt0Amount = parseUnits(amount, usdt0Balance.decimals);
      
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new Contract(VAULT_ADDRESS, vaultAbi as any, signer);

      // Check if approval is needed
      let needsApproval = false;
      try {
        const token = new Contract(usdt0Balance.tokenAddress, erc20Abi as any, signer);
        const allowance = await token.allowance(clientW.data?.account?.address, VAULT_ADDRESS);
        needsApproval = allowance < usdt0Amount;
      } catch (error) {
        console.log('Token may not require approval, proceeding with deposit');
      }

      if (needsApproval) {
        pushToast('info', 'Approving USDT0 spending...', 3000);
        const token = new Contract(usdt0Balance.tokenAddress, erc20Abi as any, signer);
        const approveTx = await token.approve(VAULT_ADDRESS, usdt0Amount);
        pushToast('info', `Approval tx: ${approveTx.hash}`, 7000, `https://hyperevmscan.io/tx/${approveTx.hash}`);
        await provider.waitForTransaction(approveTx.hash, 1, 20_000).catch(() => null);
        pushToast('success', 'Approval confirmed', 3000);
      }

      // Execute deposit
      pushToast('info', 'Depositing to vault...', 3000);
      const tx = await vault.deposit(usdt0Amount, clientW.data?.account?.address);
      pushToast('info', `Transaction submitted: ${tx.hash}`, 7000, `https://hyperevmscan.io/tx/${tx.hash}`);

      await provider.waitForTransaction(tx.hash, 1, 20_000).catch(() => null);
      pushToast('success', 'Deposit successful', 5000);

      // Refresh balance and close
      await fetchUSDT0Balance();
      onClose();

    } catch (error: any) {
      pushToast('error', `Deposit failed: ${error.message || 'Unknown error'}`, 8000);
    } finally {
      setExecuting(false);
    }
  };

  const handleBridgeDeposit = async () => {
    // Bridge deposit logic would go here
    pushToast('info', 'Bridge deposit not yet implemented', 3000);
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-[#00295B] mb-2">Select Token</h3>
        <p className="text-sm text-[#101720]/70">Choose the token you want to deposit</p>
      </div>
      
      <LiFiBalanceFetcher
        onTokenSelect={handleTokenSelect}
        onAmountEnter={() => {}}
        onExecute={() => {}}
        selectedToken={selectedToken}
        amount=""
        isExecuting={false}
        usdt0Balance={usdt0Balance}
        usdt0Loading={usdt0Loading}
      />
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-[#00295B] mb-2">Enter Amount</h3>
        <p className="text-sm text-[#101720]/70">How much would you like to deposit?</p>
      </div>

      {selectedToken && (
        <div className="space-y-4">
          {/* Selected Token Display */}
          <div className="flex items-center justify-between p-4 bg-[#FFFFF5] border border-[#E5E2D6] rounded-lg">
            <div className="flex items-center space-x-3">
              {selectedToken.logoURI && (
                <img
                  src={selectedToken.logoURI}
                  alt={selectedToken.tokenSymbol}
                  className="w-8 h-8 rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div>
                <div className="font-semibold text-[#00295B]">{selectedToken.tokenSymbol}</div>
                <div className="text-sm text-[#101720]/70">{selectedToken.chainName}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm text-[#101720]">
                {parseFloat(selectedToken.balanceFormatted).toFixed(6)}
              </div>
              <div className="text-xs text-[#101720]/70">
                {selectedToken.balanceUSD}
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#00295B] mb-2">
                ${amount || '0.00'}
              </div>
              <div className="text-sm text-[#101720]/70">
                {selectedToken.tokenSymbol === 'USDT0' ? 
                  `↑↓ ${amount || '0.00'} USDT0` : 
                  `↑↓ ${amount || '0.00'} ${selectedToken.tokenSymbol}`
                }
              </div>
            </div>

            <input
              type="number"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              className="w-full p-4 text-center text-lg border border-[#E5E2D6] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00295B]"
            />

            {/* Quick Select Buttons */}
            <div className="flex space-x-2">
              {[25, 50, 75, 100].map((percentage) => (
                <button
                  key={percentage}
                  onClick={() => handleAmountButton(percentage)}
                  className="flex-1 px-3 py-2 text-sm bg-white border border-[#E5E2D6] rounded-md hover:bg-[#F5F5F0] focus:outline-none focus:ring-2 focus:ring-[#00295B]"
                >
                  {percentage === 100 ? 'Max' : `${percentage}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Transaction Summary */}
          <div className="flex items-center justify-between p-4 bg-[#F5F5F0] rounded-lg">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">1</div>
              <span className="text-sm text-[#101720]">You send {selectedToken.tokenSymbol}</span>
            </div>
            <div className="text-2xl">→</div>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">$</div>
              <span className="text-sm text-[#101720]">You receive USDT0</span>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={!amount || parseFloat(amount) <= 0}
        className="w-full py-3 px-4 bg-[#00295B] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#001a3d] transition-colors"
      >
        Continue
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-[#00295B] mb-2">Confirm Transaction</h3>
        <p className="text-sm text-[#101720]/70">Review your deposit details</p>
      </div>

      {selectedToken && (
        <div className="space-y-4">
          {/* Transaction Summary */}
          <div className="bg-[#F5F5F0] rounded-lg p-6">
            <div className="text-center mb-4">
              <div className="text-2xl font-bold text-[#00295B]">${amount}</div>
              <div className="text-sm text-[#101720]/70">
                {selectedToken.tokenSymbol === 'USDT0' ? 
                  `${amount} Deposit into USDT0 PHALANX` : 
                  `${amount} ${selectedToken.tokenSymbol} → USDT0`
                }
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-[#00295B] rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">👛</span>
                  </div>
                  <span className="text-sm text-[#101720]">Wallet</span>
                </div>
                <span className="text-sm text-[#101720] font-mono">
                  (...{clientW.data?.account?.address?.slice(-4)})
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-[#101720]">Estimated time</span>
                <span className="text-sm text-[#101720]">&lt; 1 min</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-[#101720]">You send</span>
                <span className="text-sm text-[#101720] font-mono">
                  {amount} {selectedToken.tokenSymbol}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-[#101720]">You receive</span>
                <span className="text-sm text-[#101720] font-mono">
                  {amount} USDT0
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[#E5E2D6]">
              <div className="flex items-center justify-between text-sm text-[#101720]/70">
                <span>Transaction breakdown</span>
                <span>→</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-[#101720]/60 text-center">
            By clicking on Confirm Order, you agree to our{' '}
            <a href="#" className="underline hover:text-[#00295B]">terms</a>.
          </div>

          <button
            onClick={handleExecute}
            disabled={executing}
            className="w-full py-3 px-4 bg-[#00295B] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#001a3d] transition-colors"
          >
            {executing ? 'Processing...' : 'CONFIRM ORDER'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Step Progress */}
      <div className="flex items-center justify-center space-x-4">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step <= currentStep 
                ? 'bg-[#00295B] text-white' 
                : 'bg-[#E5E2D6] text-[#101720]/60'
            }`}>
              {step}
            </div>
            {step < 3 && (
              <div className={`w-8 h-0.5 mx-2 ${
                step < currentStep ? 'bg-[#00295B]' : 'bg-[#E5E2D6]'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}

      {/* Navigation */}
      {currentStep > 1 && (
        <div className="flex justify-between">
          <button
            onClick={() => setCurrentStep(currentStep - 1)}
            className="px-4 py-2 text-[#101720]/70 hover:text-[#101720] transition-colors"
          >
            ← Back
          </button>
          {currentStep < 3 && (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-4 py-2 bg-[#00295B] text-white rounded-lg hover:bg-[#001a3d] transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}

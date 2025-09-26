// src/lib/wallet-provider.ts
import { BrowserProvider } from 'ethers';

// Type for the global ethereum object
interface EthereumProvider {
  isMetaMask?: boolean;
  isRabby?: boolean;
  isOKXWallet?: boolean;
  providers?: EthereumProvider[];
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

/**
 * Safely detects and returns the appropriate Ethereum provider
 * Handles conflicts between multiple wallet extensions
 */
export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // If no ethereum object exists
  if (!window.ethereum) {
    console.warn('No Ethereum provider found. Please install a wallet extension.');
    return null;
  }

  // If ethereum object has providers array (multiple wallets detected)
  if (window.ethereum.providers && Array.isArray(window.ethereum.providers)) {
    // Prefer MetaMask if available
    const metaMaskProvider = window.ethereum.providers.find(
      (provider: any) => provider.isMetaMask
    );
    
    if (metaMaskProvider) {
      console.log('Multiple wallets detected, using MetaMask');
      return metaMaskProvider;
    }

    // Fallback to first available provider
    console.log('Multiple wallets detected, using first available provider');
    return window.ethereum.providers[0];
  }

  // Single provider case
  return window.ethereum;
}

/**
 * Creates a safe BrowserProvider instance
 * Handles wallet conflicts and provides better error messages
 */
export function createSafeBrowserProvider(): BrowserProvider | null {
  try {
    const provider = getEthereumProvider();
    
    if (!provider) {
      throw new Error('No Ethereum provider available');
    }

    return new BrowserProvider(provider);
  } catch (error) {
    console.error('Failed to create BrowserProvider:', error);
    return null;
  }
}

/**
 * Checks if a wallet is connected
 */
export function isWalletConnected(): boolean {
  const provider = getEthereumProvider();
  return provider !== null;
}

/**
 * Gets the current wallet address if connected
 */
export async function getCurrentAddress(): Promise<string | null> {
  try {
    const provider = getEthereumProvider();
    if (!provider) return null;

    const accounts = await provider.request({ method: 'eth_accounts' });
    return accounts[0] || null;
  } catch (error) {
    console.error('Failed to get current address:', error);
    return null;
  }
}

/**
 * Requests wallet connection
 */
export async function requestWalletConnection(): Promise<string[]> {
  try {
    const provider = getEthereumProvider();
    if (!provider) {
      throw new Error('No Ethereum provider available');
    }

    const accounts = await provider.request({ 
      method: 'eth_requestAccounts' 
    });
    
    return accounts;
  } catch (error) {
    console.error('Failed to request wallet connection:', error);
    throw error;
  }
}

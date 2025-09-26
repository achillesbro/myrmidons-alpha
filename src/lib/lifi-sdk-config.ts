import { config, EVM, getChains, ChainType } from '@lifi/sdk';
import { getWalletClient, switchChain } from '@wagmi/core';

// Initialize the Li.Fi SDK configuration
config.set({
  integrator: 'earn-basic-app',
  apiKey: process.env.NEXT_PUBLIC_LIFI_API_KEY || '',
  // Disable chain preloading since we'll load chains dynamically
  preloadChains: false,
});

// Function to update the EVM provider with current wagmi config
export const updateLifiConfig = async (wagmiConfig: any) => {
  try {
    // Fetch EVM chains from Li.Fi API
    const chains = await getChains({
      chainTypes: [ChainType.EVM],
    });
    
    // Update chain configuration for Li.Fi SDK
    config.setChains(chains);
    
    // Set up the EVM provider
    config.setProviders([
      EVM({
        getWalletClient: async () => {
          return getWalletClient(wagmiConfig);
        },
        switchChain: async (chainId: number) => {
          const chain = await switchChain(wagmiConfig, { chainId });
          return getWalletClient(wagmiConfig, { chainId: chain.id });
        },
      }),
    ]);
    
    console.log('Li.Fi SDK configured with chains:', chains.length);
  } catch (error) {
    console.error('Failed to configure Li.Fi SDK:', error);
  }
};

import { config, EVM, getChains, ChainType } from '@lifi/sdk';
import { getWalletClient, switchChain } from '@wagmi/core';

// Initialize the Li.Fi SDK configuration
config.set({
  integrator: 'earn-basic-app',
  // Disable chain preloading since we'll load chains dynamically
  preloadChains: false,
});

// Function to update the EVM provider with current wagmi config
export const updateLifiConfig = async (wagmiConfig: any) => {
  try {
    console.log('🔄 Initializing Li.Fi SDK...');
    
    // Fetch EVM chains from Li.Fi API with retry logic
    let chains;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`🔄 Attempting to fetch chains (attempt ${retryCount + 1}/${maxRetries})...`);
        chains = await getChains({
          chainTypes: [ChainType.EVM],
        });
        break; // Success, exit retry loop
      } catch (fetchError) {
        retryCount++;
        console.warn(`⚠️ Chain fetch attempt ${retryCount} failed:`, fetchError);
        
        if (retryCount >= maxRetries) {
          throw fetchError; // Re-throw if all retries failed
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
    
    if (!chains || chains.length === 0) {
      throw new Error('No chains received from Li.Fi API');
    }
    
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
    
    console.log('✅ Li.Fi SDK configured successfully with chains:', chains.length);
    return true;
  } catch (error) {
    console.error('❌ Failed to configure Li.Fi SDK:', error);
    
    // Try to set up basic configuration even if chain fetching fails
    try {
      console.log('🔄 Attempting fallback configuration...');
      
      // Set up basic EVM provider without chains
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
      
      console.log('⚠️ Li.Fi SDK configured with fallback (no chains loaded)');
      return false; // Indicate partial success
    } catch (fallbackError) {
      console.error('❌ Fallback configuration also failed:', fallbackError);
      return false;
    }
  }
};

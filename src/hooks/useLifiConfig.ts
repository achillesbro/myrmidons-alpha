import { useEffect, useState } from 'react';
import { useConfig } from 'wagmi';
import { updateLifiConfig } from '../lib/lifi-sdk-config';

export const useLifiConfig = () => {
  const wagmiConfig = useConfig();
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (wagmiConfig && !isConfigured && !isLoading) {
      setIsLoading(true);
      setHasError(false);
      
      updateLifiConfig(wagmiConfig).then((success) => {
        setIsConfigured(true);
        setIsLoading(false);
        if (!success) {
          setHasError(true);
        }
      }).catch((error) => {
        console.error('Li.Fi configuration failed:', error);
        setIsConfigured(false);
        setIsLoading(false);
        setHasError(true);
      });
    }
  }, [wagmiConfig, isConfigured, isLoading]);

  return { wagmiConfig, isConfigured, isLoading, hasError };
};

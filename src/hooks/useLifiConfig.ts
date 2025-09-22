import { useEffect, useState } from 'react';
import { useConfig } from 'wagmi';
import { updateLifiConfig } from '../lib/lifi-sdk-config';

export const useLifiConfig = () => {
  const wagmiConfig = useConfig();
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (wagmiConfig && !isConfigured) {
      updateLifiConfig(wagmiConfig).then(() => {
        setIsConfigured(true);
      });
    }
  }, [wagmiConfig, isConfigured]);

  return { wagmiConfig, isConfigured };
};

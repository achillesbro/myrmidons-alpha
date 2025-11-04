import { Analytics } from '@vercel/analytics/react';
import {
  getDefaultConfig,
  RainbowKitProvider,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
//import { mainnet } from "wagmi/chains";
import { hyperEVM } from "./chains/hyperEVM";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";
import { useEffect, useState } from "react";
import { Address } from "viem";
import { mainnet, arbitrum, base, optimism, bsc } from "wagmi/chains";
import {
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";
import "@rainbow-me/rainbowkit/styles.css";
import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "./service/apollo.client";
import { VaultAPIView } from "./components/vault-api-view";
import { SiteFooter } from "./components/site-footer";
import LandingPage from "./components/landing/LandingPage";
import SiteHeader from "./components/layout/SiteHeader";
import { useTranslation } from 'react-i18next'
import i18n from "./i18n";
import { DEFAULT_VAULT_CONFIG, getVaultConfigById, type VaultConfig } from "./config/vaults.config";

const TABS = ["VAULTINFO", "LIFI_TEST"] as const;
type Tab = typeof TABS[number];
const TAB_PARAM = "tab";
const VAULT_PARAM = "vault"; // New: vault selection parameter
const STORAGE_KEY = "myrmidons_activeTab";

function normalizeTabParam(value: string | null): Tab | null {
  if (!value) return null;
  const v = value.toUpperCase();
  // Back-compat: map old names to the new VAULTINFO tab
  if (v === "SDK" || v === "USERPOSITION") return "VAULTINFO" as Tab;
  if (v === "API" || v === "VAULTINFO") return "VAULTINFO" as Tab;
  if (v === "LIFI_TEST") return "LIFI_TEST" as Tab;
  return null;
}

function getInitialTab(): Tab | null {
  try {
    const url = new URL(window.location.href);
    const fromUrl = normalizeTabParam(url.searchParams.get(TAB_PARAM));
    if (fromUrl) return fromUrl;
    return null; // No tab means landing page
  } catch {
    return null; // No tab means landing page
  }
}

// Get vault config from URL param or default
function getVaultFromUrl(): VaultConfig {
  try {
    const url = new URL(window.location.href);
    const vaultId = url.searchParams.get(VAULT_PARAM);
    if (vaultId) {
      const config = getVaultConfigById(vaultId);
      if (config) return config;
    }
  } catch {
    // noop
  }
  return DEFAULT_VAULT_CONFIG;
}

const TestInterface = () => {
  const [activeTab, setActiveTab] = useState<Tab | null>(() => getInitialTab());
  const [vaultConfig, setVaultConfig] = useState<VaultConfig>(() => getVaultFromUrl());
  // Sync vaultAddress with vaultConfig
  const [vaultAddress, setVaultAddress] = useState<Address>(vaultConfig.vaultAddress);

  const { t } = useTranslation();

  // Update vaultAddress when vaultConfig changes
  useEffect(() => {
    setVaultAddress(vaultConfig.vaultAddress);
  }, [vaultConfig]);

  // Persist + deep-link (URL ?tab=... & ?vault=...)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      
      if (activeTab) {
        localStorage.setItem(STORAGE_KEY, activeTab);
        url.searchParams.set(TAB_PARAM, activeTab.toLowerCase());
        
        // Add vault param if we're on vault info tab
        if (activeTab === "VAULTINFO" && vaultConfig) {
          url.searchParams.set(VAULT_PARAM, vaultConfig.id);
        }
      } else {
        // Landing page - remove tab param but keep vault param for links
        url.searchParams.delete(TAB_PARAM);
      }
      
      // replaceState so we don't spam history on every click
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* noop */
    }
  }, [activeTab, vaultConfig]);

  // Optional: keep in sync if user uses back/forward with external links
  useEffect(() => {
    const onPop = () => {
      const url = new URL(window.location.href);
      const tab = normalizeTabParam(url.searchParams.get(TAB_PARAM));
      const newVaultConfig = getVaultFromUrl();
      
      if (tab && tab !== activeTab) setActiveTab(tab);
      if (newVaultConfig.id !== vaultConfig.id) setVaultConfig(newVaultConfig);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [activeTab, vaultConfig]);

  useEffect(() => {
    if (activeTab) {
      const page = activeTab === "VAULTINFO" ? t('tabs.vault') : 'Test';
      document.title = `${t('brand')} — ${page}`;
    } else {
      document.title = `${t('brand')} — Landing`;
    }
  }, [activeTab, t]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SiteHeader />
      <div className="px-6">
        <div className="h-8" />
        {/* Main Content Area - centered */}
        <div className="max-w-6xl mx-auto">
          <div className="flex-1">
            {!activeTab ? (
              // Landing page
              <LandingPage />
            ) : activeTab === "VAULTINFO" ? (
              <VaultAPIView vaultAddress={vaultAddress} vaultConfig={vaultConfig} />
            ) : null}
          </div>
        </div>
      </div>
      <SiteFooter />
      <Analytics />
    </div>
  );
};

// Configuration for your app (Wagmi, RainbowKit, React Query, etc.)
const config = getDefaultConfig({
  appName: i18n.t('brand'),
  projectId: "841b6ddde2826ce0acf2d1b1f81f8582",
  chains: [
    mainnet,
    arbitrum, 
    base,
    optimism,
    bsc,
    hyperEVM],
  wallets: [
    {
      groupName: "Popular",
      wallets: [metaMaskWallet, rabbyWallet, okxWallet],
    },
  ],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [bsc.id]: http(),
    [hyperEVM.id]: http("https://rpc.hyperliquid.xyz/evm"),
  },
});

const queryClient = new QueryClient();

// Main App component
function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: '#B08D57',          // Muted Brass
            accentColorForeground: '#FFFFFF',
            borderRadius: 'large',
            overlayBlur: 'small',
          })}
        >
          <ApolloProvider client={apolloClient}>
            <TestInterface />
          </ApolloProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
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
import { Address, getAddress, isAddress } from "viem";
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
import { AboutView } from "./components/about-view";
import { SiteFooter } from "./components/site-footer";
import LandingPage from "./components/landing/LandingPage";
import SiteHeader from "./components/layout/SiteHeader";
import { useTranslation } from 'react-i18next'
import i18n from "./i18n";

const DEFAULT_VAULT: Address = (import.meta.env.VITE_MORPHO_VAULT || "0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42") as Address;

const TABS = ["VAULTINFO", "ABOUT", "LIFI_TEST"] as const;
type Tab = typeof TABS[number];
const TAB_PARAM = "tab";
const STORAGE_KEY = "myrmidons_activeTab";

function normalizeTabParam(value: string | null): Tab | null {
  if (!value) return null;
  const v = value.toUpperCase();
  // Back-compat: map old names to the new VAULTINFO tab
  if (v === "SDK" || v === "USERPOSITION") return "VAULTINFO" as Tab;
  if (v === "API" || v === "VAULTINFO") return "VAULTINFO" as Tab;
  if (v === "ABOUT") return "ABOUT" as Tab;
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

const TestInterface = () => {
  const [activeTab, setActiveTab] = useState<Tab | null>(() => getInitialTab());
  const [vaultAddressInput] = useState<string>(DEFAULT_VAULT);
  // `vaultAddress` is validated to be an Address
  const [vaultAddress, setVaultAddress] = useState(DEFAULT_VAULT);

  const { t } = useTranslation();

  useEffect(() => {
    if (vaultAddressInput.length >= 42) {
      if (isAddress(vaultAddressInput, { strict: false })) {
        setVaultAddress(getAddress(vaultAddressInput));
      } else {
        window.alert("Please enter a valid address.");
      }
    }
  }, [vaultAddressInput]);

  // Persist + deep-link (URL ?tab=...)
  useEffect(() => {
    try {
      if (activeTab) {
        localStorage.setItem(STORAGE_KEY, activeTab);
        const url = new URL(window.location.href);
        url.searchParams.set(TAB_PARAM, activeTab.toLowerCase());
        // replaceState so we don't spam history on every click
        window.history.replaceState(null, "", url.toString());
      } else {
        // Landing page - remove tab param
        const url = new URL(window.location.href);
        url.searchParams.delete(TAB_PARAM);
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      /* noop */
    }
  }, [activeTab]);

  // Optional: keep in sync if user uses back/forward with external links
  useEffect(() => {
    const onPop = () => {
      const url = new URL(window.location.href);
      const tab = normalizeTabParam(url.searchParams.get(TAB_PARAM));
      if (tab && tab !== activeTab) setActiveTab(tab);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab) {
      const page = activeTab === "VAULTINFO" ? t('tabs.vault') : t('tabs.about');
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
              <VaultAPIView vaultAddress={vaultAddress} />
            ) : (
              <AboutView />
            )}
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
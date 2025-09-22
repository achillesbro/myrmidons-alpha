import { Analytics } from '@vercel/analytics/react';
import {
  getDefaultConfig,
  RainbowKitProvider,
  ConnectButton,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
//import { mainnet } from "wagmi/chains";
import { hyperEVM } from "./chains/hyperEVM";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";
import { useEffect, useState } from "react";
import { Address, getAddress, isAddress } from "viem";
import { mainnet, arbitrum, base } from "wagmi/chains";
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
import { LiFiQuoteTest } from "./components/lifi-quote-test";
import { useTranslation } from 'react-i18next'
import i18n from "./i18n";

const DEFAULT_VAULT: Address = "0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42";

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

function getInitialTab(): Tab {
  try {
    const url = new URL(window.location.href);
    const fromUrl = normalizeTabParam(url.searchParams.get(TAB_PARAM));
    if (fromUrl) return fromUrl;
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    const storageTab = normalizeTabParam(fromStorage);
    return storageTab ?? "VAULTINFO";
  } catch {
    return "VAULTINFO";
  }
}

const TestInterface = () => {
  const [activeTab, setActiveTab] = useState<Tab>(() => getInitialTab());
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
      localStorage.setItem(STORAGE_KEY, activeTab);
      const url = new URL(window.location.href);
      url.searchParams.set(TAB_PARAM, activeTab.toLowerCase());
      // replaceState so we don’t spam history on every click
      window.history.replaceState(null, "", url.toString());
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
    const page = activeTab === "VAULTINFO" ? t('tabs.vaultInfo') : 
                 activeTab === "ABOUT" ? t('tabs.about') : 
                 "Li.Fi Test";
    document.title = `${t('brand')} — ${page}`;
  }, [activeTab, t]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Full-width top band */}
      <div className="w-full bg-[var(--text)]">
        <div className="max-w-7xl mx-auto flex justify-between items-center h-20 px-6 overflow-hidden">
          <div className="flex items-center gap-3">
            <img
              src="/myrmidons-creamy.png"
              alt="Myrmidons Strategies logo"
              className="h-20 w-auto select-none"
            />
            <h1 className="text-3xl font-bold !text-[var(--bg)]">{t('brand')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <ConnectButton />
          </div>
        </div>
      </div>
      <div className="px-6">
        <div className="h-8" />
        {/* Main Content Area - centered */}
        <div className="max-w-6xl mx-auto">
          <div className="flex-1">
            {/* Tab Navigation */}
            <div className="flex space-x-4 mb-6">
              <button
                aria-pressed={activeTab === "VAULTINFO"}
                onClick={() => setActiveTab("VAULTINFO")}
                className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center border ${
                  activeTab === "VAULTINFO"
                    ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                    : "bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:bg-[color-mix(in_oklab,var(--text)_5%,transparent)]"
                }`}
              >
                {t('tabs.vault')}
              </button>
              <button
                aria-pressed={activeTab === "ABOUT"}
                onClick={() => setActiveTab("ABOUT")}
                className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center border ${
                  activeTab === "ABOUT"
                    ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                    : "bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:bg-[color-mix(in_oklab,var(--text)_5%,transparent)]"
                }`}
              >
                {t('tabs.about')}
              </button>
              <button
                aria-pressed={activeTab === "LIFI_TEST"}
                onClick={() => setActiveTab("LIFI_TEST")}
                className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center border ${
                  activeTab === "LIFI_TEST"
                    ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                    : "bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:bg-[color-mix(in_oklab,var(--text)_5%,transparent)]"
                }`}
              >
                Li.Fi Test
              </button>
            </div>

            {activeTab === "VAULTINFO" ? (
              <VaultAPIView vaultAddress={vaultAddress} />
            ) : activeTab === "ABOUT" ? (
              <AboutView />
            ) : (
              <LiFiQuoteTest />
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
    [hyperEVM.id]: http("https://rpc.hyperliquid.xyz/evm"),
  },
});

const queryClient = new QueryClient();

// Main App component
function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <ApolloProvider client={apolloClient}>
            <TestInterface />
          </ApolloProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
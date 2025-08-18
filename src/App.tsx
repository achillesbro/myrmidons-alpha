// src/App.tsx
import {
  getDefaultConfig,
  RainbowKitProvider,
  ConnectButton,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { mainnet, anvil, base } from "wagmi/chains";
import { hyperEVM } from "./chains/hyperEVM";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";
import { useEffect, useState } from "react";
import { Address, getAddress, Hex, isAddress, isHex } from "viem";
import {
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";
import "@rainbow-me/rainbowkit/styles.css";
import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "./service/apollo.client";
import { VaultAPIView } from "./components/vault-api-view";
import { VaultSdkView } from "./components/vault-sdk-view";

const DEFAULT_VAULT: Address = "0xDCd35A430895cc8961ea0F5B42348609114a9d0c";

const TestInterface = () => {
  const [activeTab, setActiveTab] = useState<"SDK" | "API">("SDK");
  // `vaultAddressInput` is whatever the user types in -- any length string as long as it's Hex
  const [vaultAddressInput, setVaultAddressInput] =
    useState<Hex>(DEFAULT_VAULT);
  // `vaultAddress` is validated to be an Address
  const [vaultAddress, setVaultAddress] = useState(DEFAULT_VAULT);

  useEffect(() => {
    if (vaultAddressInput.length >= 42) {
      if (isAddress(vaultAddressInput, { strict: false })) {
        setVaultAddress(getAddress(vaultAddressInput));
      } else {
        window.alert("Please enter a valid address.");
      }
    }
  }, [vaultAddressInput]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Full-width top band */}
      <div className="w-full bg-[var(--text)]">
        <div className="max-w-7xl mx-auto flex justify-between items-center py-4 px-6">
          <h1 className="text-3xl font-bold !text-[var(--bg)]">Myrmidons Strategies</h1>
          <div>
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
                aria-pressed={activeTab === "SDK"}
                onClick={() => setActiveTab("SDK")}
                className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center border ${
                  activeTab === "SDK"
                    ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                    : "bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:bg-[color-mix(in_oklab,var(--text)_5%,transparent)]"
                }`}
              >
                User Position
              </button>
              <button
                aria-pressed={activeTab === "API"}
                onClick={() => setActiveTab("API")}
                className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center border ${
                  activeTab === "API"
                    ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                    : "bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:bg-[color-mix(in_oklab,var(--text)_5%,transparent)]"
                }`}
              >
                Vault Information
              </button>
            </div>

            {activeTab === "SDK" ? (
              <VaultSdkView vaultAddress={vaultAddress} />
            ) : (
              <VaultAPIView vaultAddress={vaultAddress} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Configuration for your app (Wagmi, RainbowKit, React Query, etc.)
const config = getDefaultConfig({
  appName: "Test Wagmi Interface",
  projectId: "841b6ddde2826ce0acf2d1b1f81f8582",
  chains: [mainnet, anvil, base, hyperEVM],
  wallets: [
    {
      groupName: "Popular",
      wallets: [metaMaskWallet, rabbyWallet, okxWallet],
    },
  ],
  transports: {
    [mainnet.id]: http(),
    [anvil.id]: http("http://127.0.0.1:8545"),
    [base.id]: http("https://mainnet.base.org"),
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

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
    <div className="min-h-screen bg-[#FFFFF5] text-[#101720] px-4 py-6 md:px-8">
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-[#00295B]">
            Myrmidons Strategies
          </h1>
          <div>
            <ConnectButton />
          </div>
        </div>

        {/* Main Layout - Adjust the gap */}
        <div className="flex gap-8">
          {/* Left Sidebar - Make it narrower */}
          <div className="w-72 shrink-0">
            <div className="bg-[#FFFFF5] rounded-lg p-6 border-[1.5px] border-[#E5E2D6] sticky top-8">
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <span className="mr-2">▲</span> Vault Parameters
              </h2>
              <div className="mb-4 bg-[#FFFFF5] border border-[#E5E2D6] rounded-md p-3">
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                  <span className="text-sm text-[#101720]/80">
                    Ethereum Mainnet
                  </span>
                </div>
                <p className="text-xs text-[#101720]/60 mt-1">
                  Currently only supporting Ethereum Mainnet
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Vault Address
                </label>
                <input
                  type="text"
                  name="vaultAddress"
                  value={vaultAddressInput}
                  onChange={(ev) => {
                    const value = ev.target.value;
                    if (isHex(value) && value.length <= 42) setVaultAddressInput(value);
                  }}
                  className="w-full bg-[#FFFFF5] border-[0.5px] border-[#E5E2D6] rounded p-2 text-sm text-[#101720]"
                />
              </div>
            </div>
          </div>

          {/* Main Content Area - Allow it to take remaining width */}
          <div className="flex-1">
            {/* Tab Navigation */}
            <div className="flex space-x-4 mb-6">
              <button
                aria-pressed={activeTab === "SDK"}
                onClick={() => setActiveTab("SDK")}
                className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center border ${
                  activeTab === "SDK"
                    ? "bg-[#101720] text-[#FFFFF5] border-[#101720]"
                    : "bg-[#FFFFF5] text-[#101720] border-[#E5E2D6] hover:bg-[rgba(16,23,32,0.06)]"
                }`}
              >
                1. SDK View & Interaction
              </button>
              <button
                aria-pressed={activeTab === "API"}
                onClick={() => setActiveTab("API")}
                className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center border ${
                  activeTab === "API"
                    ? "bg-[#101720] text-[#FFFFF5] border-[#101720]"
                    : "bg-[#FFFFF5] text-[#101720] border-[#E5E2D6] hover:bg-[rgba(16,23,32,0.06)]"
                }`}
              >
                2. API View
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

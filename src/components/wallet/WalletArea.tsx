// Keep this file as the ONLY place that imports wagmi/rainbowkit for the header.
// Assumes your app already wraps with WagmiConfig + RainbowKitProvider somewhere central.
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function WalletArea() {
  // Minimal, consistent, and styled by RainbowKit theme you already use.
  // If you want the "pill trio" look (Chain / Token / Address), keep ConnectButton and add your own pills beside it.
  return (
    <div className="flex items-center gap-2">
      <ConnectButton
        accountStatus={{ smallScreen: 'avatar', largeScreen: 'address' }}
        chainStatus={{ smallScreen: 'icon', largeScreen: 'icon' }}
        showBalance={{ smallScreen: false, largeScreen: true }}
      />
    </div>
  );
}

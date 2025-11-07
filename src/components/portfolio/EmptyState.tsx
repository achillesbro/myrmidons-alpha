import { ConnectButton } from "@rainbow-me/rainbowkit";

export function EmptyState() {
  return (
    <div className="rounded-2xl shadow-sm bg-white border border-black/5 p-12 text-center">
      <div className="max-w-md mx-auto">
        <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--heading, #00295B)' }}>
          Connect Your Wallet
        </h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text, #101720)', opacity: 0.7 }}>
          Connect your wallet to view your portfolio positions across all Myrmidons vaults.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    </div>
  );
}


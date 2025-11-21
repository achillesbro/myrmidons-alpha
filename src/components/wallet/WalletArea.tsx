// Keep this file as the ONLY place that imports wagmi/rainbowkit for the header.
// Assumes your app already wraps with WagmiConfig + RainbowKitProvider somewhere central.
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function WalletArea() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        accountModalOpen,
        chainModalOpen,
        connectModalOpen,
        mounted,
      }) => {
        const ready = mounted && !connectModalOpen && !accountModalOpen && !chainModalOpen;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <div className="wallet-capsule">
                    <button
                      onClick={openConnectModal}
                      type="button"
                      className="wallet-connect-btn"
                    >
                      Connect wallet
                    </button>
                  </div>
                );
              }

              if (chain.unsupported) {
                return (
                  <div className="wallet-capsule">
                    <button
                      onClick={openChainModal}
                      type="button"
                      className="wallet-chip wallet-chip--network"
                      style={{ color: '#DC2626' }}
                    >
                      Wrong network
                    </button>
                  </div>
                );
              }

              return (
                <div className="wallet-capsule">
                  {/* Wallet address / account */}
                  <button
                    onClick={openAccountModal}
                    type="button"
                    className="wallet-chip wallet-chip--address"
                  >
                    {account.ensAvatar && (
                      <img
                        alt={account.ensName ?? 'ENS avatar'}
                        src={account.ensAvatar}
                        className="wallet-avatar"
                      />
                    )}
                    <span>{account.displayName}</span>
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

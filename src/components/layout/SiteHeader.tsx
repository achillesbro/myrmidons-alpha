import React, { Suspense, useEffect, useState } from 'react';

const WalletArea = React.lazy(() => import('../wallet/WalletArea')); // lazy-hydrated

export default function SiteHeader() {
  const [walletReady, setWalletReady] = useState(false);

  // Idle hydration to protect LCP on landing
  useEffect(() => {
    const id = window.setTimeout(() => setWalletReady(true), 1200);
    return () => clearTimeout(id);
  }, []);

  return (
    <header
      className="w-full sticky top-0 z-40"
      style={{ background: 'var(--text)', boxShadow: '0 1px 0 rgba(0,0,0,0.15)' }}
    >
      <div className="max-w-6xl mx-auto h-16 flex items-center justify-between px-4">
        {/* Brand lockup with navigation */}
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-3">
            <img 
              src="/myrmidons-creamy.png" 
              alt="Myrmidons Strategies" 
              className="h-8 w-8" 
            />
            <span className="text-xl md:text-2xl font-semibold font-heading" style={{ color: 'var(--bg)' }}>
              Myrmidons Strategies
            </span>
          </a>

          {/* Primary nav - moved closer to brand */}
          <nav className="hidden md:flex items-center gap-6">
            <a 
              href="/" 
              className="text-sm hover:opacity-75 transition-opacity" 
              style={{ color: 'var(--bg)', opacity: 0.9 }}
            >
              Home
            </a>
            <a 
              href="/?tab=vaultinfo&vault=usdt0" 
              className="text-sm hover:opacity-75 transition-opacity" 
              style={{ color: 'var(--bg)', opacity: 0.9 }}
            >
              USDT0 Vault
            </a>
            <a 
              href="/?tab=vaultinfo&vault=whype" 
              className="text-sm hover:opacity-75 transition-opacity" 
              style={{ color: 'var(--bg)', opacity: 0.9 }}
            >
              WHYPE Vault
            </a>
            <a 
              href="/?tab=about" 
              className="text-sm hover:opacity-75 transition-opacity" 
              style={{ color: 'var(--bg)', opacity: 0.9 }}
            >
              About
            </a>
          </nav>
        </div>

        {/* Wallet / RainbowKit area (lazy) */}
        <div className="flex items-center gap-3">
          {walletReady ? (
            <Suspense
              fallback={
                <a
                  href="/?tab=vaultinfo&vault=usdt0"
                  className="px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ background: 'var(--muted-brass)', color: '#fff' }}
                  aria-label="Connect wallet"
                >
                  Connect
                </a>
              }
            >
              <WalletArea />
            </Suspense>
          ) : (
            <a
              href="/?tab=vaultinfo&vault=usdt0"
              className="px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--muted-brass)', color: '#fff' }}
              aria-label="Connect wallet"
            >
              Connect
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

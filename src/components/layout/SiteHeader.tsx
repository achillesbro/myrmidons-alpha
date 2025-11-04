import React, { Suspense, useEffect, useState, useRef } from 'react';

const WalletArea = React.lazy(() => import('../wallet/WalletArea')); // lazy-hydrated

export default function SiteHeader() {
  const [walletReady, setWalletReady] = useState(false);
  const [morphoDropdownOpen, setMorphoDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Idle hydration to protect LCP on landing
  useEffect(() => {
    const id = window.setTimeout(() => setWalletReady(true), 1200);
    return () => clearTimeout(id);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMorphoDropdownOpen(false);
      }
    }

    if (morphoDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [morphoDropdownOpen]);

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
              href="/?tab=vaultinfo&vault=hypairdrop" 
              className="text-sm hover:opacity-75 transition-opacity" 
              style={{ color: 'var(--bg)', opacity: 0.9 }}
            >
              HypAirdrop
            </a>
            {/* Morpho Vaults Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setMorphoDropdownOpen(!morphoDropdownOpen)}
                className="nav-link-dropdown text-sm hover:opacity-75 transition-opacity"
                style={{ color: 'var(--bg)', opacity: 0.9 }}
              >
                Morpho Vaults
                <svg
                  className={`nav-chevron w-3 h-3 inline-block ml-1 transition-transform ${morphoDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ verticalAlign: 'baseline', marginBottom: '1px' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {morphoDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 rounded-lg shadow-lg min-w-[160px]"
                  style={{ 
                    background: 'var(--bg)', 
                    border: '1px solid var(--border, #E5E2D6)',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  <a
                    href="/?tab=vaultinfo&vault=usdt0"
                    className="block px-4 py-2 text-sm transition-colors rounded-t-lg hover:opacity-100"
                    style={{ 
                      color: 'var(--text)', 
                      opacity: 0.9,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--muted-brass, #B08D57)';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text)';
                    }}
                    onClick={() => setMorphoDropdownOpen(false)}
                  >
                    USDT0 Vault
                  </a>
                  <a
                    href="/?tab=vaultinfo&vault=whype"
                    className="block px-4 py-2 text-sm transition-colors rounded-b-lg hover:opacity-100"
                    style={{ 
                      color: 'var(--text)', 
                      opacity: 0.9,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--muted-brass, #B08D57)';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text)';
                    }}
                    onClick={() => setMorphoDropdownOpen(false)}
                  >
                    WHYPE Vault
                  </a>
                </div>
              )}
            </div>
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

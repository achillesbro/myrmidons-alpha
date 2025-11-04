import { track } from '../../utils/analytics';

export default function Hero() {

  const scrollToVaults = () => {
    const vaultsSection = document.getElementById('vaults');
    if (vaultsSection) {
      vaultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    track('cta_click', { where: 'hero', target: 'hypairdrop_deposit' });
  };

  return (
    <section className="relative w-full py-16 md:py-24" style={{ background: 'var(--bg, #FFFFF5)' }}>
      {/* Background image with 20% opacity - full width, starting from header */}
      <div 
        className="absolute w-screen bg-cover bg-center bg-no-repeat z-0"
        style={{ 
          backgroundImage: 'url(/trojan-war-heroes-greek-army.png)',
          opacity: 0.2,
          left: '50%',
          transform: 'translateX(-50%)',
          top: '-64px', // Start from header height (64px)
          bottom: 0,
          height: 'calc(100% + 64px)' // Extend upward to cover header gap
        }}
      />
      
      {/* Subtle readability overlay over the hero artwork */}
      <div
        className="absolute w-screen pointer-events-none z-10"
        style={{ 
          background: 'linear-gradient(180deg, rgba(16,23,32,0.25) 0%, rgba(16,23,32,0.00) 60%)',
          left: '50%',
          transform: 'translateX(-50%)',
          top: '-64px', // Start from header height (64px)
          bottom: 0,
          height: 'calc(100% + 64px)' // Extend upward to cover header gap
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 z-20">
        <h1
          className="text-3xl md:text-5xl font-semibold leading-tight max-w-[60ch]"
          style={{ color: 'var(--heading, #00295B)' }}
        >
          Hyperliquid, unified.
        </h1>

        <p
          className="mt-4 text-base md:text-lg max-w-[60ch]"
          style={{ color: 'var(--text, #101720)' }}
        >
          Hyperliquid is not two ecosystems: it is one surface. Myrmidons targets dApps that bridge Core + EVM, farming points with HypAirdrop and offering non-custodial yield via Morpho vaults. Deposit from any chain in seconds.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={scrollToVaults}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'var(--muted-brass, #B08D57)', color: '#fff' }}
            aria-label="Deposit into our vaults"
          >
            Deposit into our vaults
          </button>
        </div>
      </div>
    </section>
  );
}

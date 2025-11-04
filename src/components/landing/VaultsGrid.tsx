export default function VaultsGrid() {
  return (
    <section id="vaults" className="w-full py-12">
      <div className="max-w-6xl mx-auto px-4">
        <h2
          className="text-xl md:text-2xl font-semibold mb-6"
          style={{ color: 'var(--obsidian-navy, #00295B)' }}
        >
          What we build
        </h2>
        <div className="grid gap-4 md:gap-6 md:grid-cols-2">
          <div className="p-6 md:p-7 rounded-2xl shadow-sm" style={{ background: '#fff' }}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--obsidian-navy, #00295B)' }}>
              HypAirdrop
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--midnight-blue, #101720)' }}>
              Points-first strategy across Hyperliquid dApps that integrate <strong>Core + EVM</strong>. Deposits and withdrawals are
              <strong> async</strong> with <strong>epoch-based</strong> settlement. <strong>Airdrops and points are not guaranteed.</strong>
            </p>
            <div className="mt-4">
              <a
                href="/?tab=vaultinfo&vault=hypairdrop"
                className="inline-block px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--muted-brass, #B08D57)', color: '#fff' }}
              >
                Explore HypAirdrop
              </a>
            </div>
          </div>

          <div className="p-6 md:p-7 rounded-2xl shadow-sm" style={{ background: '#fff' }}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--obsidian-navy, #00295B)' }}>
              Morpho Vaults
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--midnight-blue, #101720)' }}>
              ERC-4626 vaults on Morpho for stable, on-chain yield. Deposits/withdrawals interact directly with vault contracts.
            </p>
            <div className="mt-4">
              <a
                href="/?tab=vaultinfo"
                className="inline-block px-4 py-2 rounded-xl text-sm font-medium border"
                style={{ borderColor: 'var(--obsidian-navy, #00295B)', color: 'var(--obsidian-navy, #00295B)' }}
              >
                View Vaults
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

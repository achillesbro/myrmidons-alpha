import InnerPageHero from "./InnerPageHero";

export function AboutView() {
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <InnerPageHero
        title="About Myrmidons"
        subtitle=""
        badges={[]}
      />

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
        {/* Subheader */}
        <p className="text-base md:text-lg mb-8" style={{ color: 'var(--midnight-blue, #101720)' }}>
          <strong>Myrmidons</strong> is a Hyperliquid-native dApp that unifies exposure to <strong>Core + EVM</strong>.
          We farm points where the two layers truly connect, and offer non-custodial yield via Morpho vaults.
        </p>

        {/* Core + EVM Thesis (mini-manifesto) */}
        <section className="mt-6">
          <h2
            className="text-xl md:text-2xl font-semibold mb-3"
            style={{ color: 'var(--obsidian-navy, #00295B)' }}
          >
            Core + EVM Thesis
          </h2>
          <div
            className="p-6 md:p-8 rounded-2xl shadow-sm"
            style={{ background: '#fff', color: 'var(--midnight-blue, #101720)' }}
          >
            <p className="text-sm md:text-base">
              Hyperliquid isn't two ecosystems; it's <strong>one surface</strong> with two execution layers. Treating Core and
              EVM as silos misses incentives, liquidity, and UX. We focus on dApps that <strong>bridge the layers in practice</strong>—routing
              activity and rewards across both. <a href="/?tab=vaultinfo&vault=hypairdrop#deposit" className="underline" style={{ color: 'var(--obsidian-navy, #00295B)' }}>HypAirdrop</a> captures that
              cross-surface upside; <a href="/?tab=vaultinfo" className="underline" style={{ color: 'var(--obsidian-navy, #00295B)' }}>Morpho Vaults</a> provide transparent, non-custodial yield alongside it.
            </p>
          </div>
        </section>

        {/* What we build */}
        <section className="mt-6">
          <h2
            className="text-xl md:text-2xl font-semibold mb-3"
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
                  href="/?tab=vaultinfo&vault=hypairdrop#deposit"
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
        </section>

        {/* How it works */}
        <section className="mt-6">
          <h2
            className="text-xl md:text-2xl font-semibold mb-3"
            style={{ color: 'var(--obsidian-navy, #00295B)' }}
          >
            How it works
          </h2>
          <div className="p-6 md:p-8 rounded-2xl shadow-sm" style={{ background: '#fff' }}>
            <ol className="list-decimal ml-5 space-y-1 text-sm md:text-base" style={{ color: 'var(--midnight-blue, #101720)' }}>
              <li>Connect wallet.</li>
              <li>Choose <a href="/?tab=vaultinfo&vault=hypairdrop#deposit" className="underline" style={{ color: 'var(--obsidian-navy, #00295B)' }}>HypAirdrop</a> (points-first, custodial) or <a href="/?tab=vaultinfo" className="underline" style={{ color: 'var(--obsidian-navy, #00295B)' }}>Morpho Vaults</a> (yield-first, non-custodial).</li>
              <li>Deposit (bridge optional). HypAirdrop withdrawals are <strong>async</strong> and processed on the next <strong>epoch</strong>.</li>
            </ol>
          </div>
        </section>

        {/* Principles */}
        <section className="mt-6">
          <h2
            className="text-xl md:text-2xl font-semibold mb-3"
            style={{ color: 'var(--obsidian-navy, #00295B)' }}
          >
            Principles
          </h2>
          <div className="p-6 md:p-8 rounded-2xl shadow-sm" style={{ background: '#fff' }}>
            <ul className="list-disc ml-5 space-y-1 text-sm md:text-base" style={{ color: 'var(--midnight-blue, #101720)' }}>
              <li><strong>Core + EVM, one surface</strong>: allocate where incentives span both layers.</li>
              <li><strong>On-chain transparency</strong>: positions and vault math are explicit.</li>
              <li><strong>Risk-first</strong>: custody model, settlement cadence, fees—upfront.</li>
              <li><strong>No promises</strong>: airdrops/points are never guaranteed.</li>
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-6">
          <h2
            className="text-xl md:text-2xl font-semibold mb-3"
            style={{ color: 'var(--obsidian-navy, #00295B)' }}
          >
            FAQ
          </h2>

          <div className="space-y-3">
            <details className="p-4 md:p-5 rounded-2xl shadow-sm bg-white">
              <summary className="cursor-pointer font-semibold" style={{ color: 'var(--obsidian-navy, #00295B)' }}>
                Difference between HypAirdrop and Morpho vaults?
              </summary>
              <div className="mt-2 text-sm" style={{ color: 'var(--midnight-blue, #101720)' }}>
                HypAirdrop is <strong>custodial</strong> (Lagoon), <strong>points-first</strong>, settles on <strong>epochs</strong>, withdrawals are <strong>async</strong>. 
                Morpho vaults are <strong>non-custodial</strong> ERC-4626 strategies with yield as the main objective.
              </div>
            </details>

            <details className="p-4 md:p-5 rounded-2xl shadow-sm bg-white">
              <summary className="cursor-pointer font-semibold" style={{ color: 'var(--obsidian-navy, #00295B)' }}>
                Are airdrops/points guaranteed?
              </summary>
              <div className="mt-2 text-sm" style={{ color: 'var(--midnight-blue, #101720)' }}>
                No. Outcomes and allocations are external and never guaranteed.
              </div>
            </details>

            <details className="p-4 md:p-5 rounded-2xl shadow-sm bg-white">
              <summary className="cursor-pointer font-semibold" style={{ color: 'var(--obsidian-navy, #00295B)' }}>
                How are points distributed in HypAirdrop?
              </summary>
              <div className="mt-2 text-sm" style={{ color: 'var(--midnight-blue, #101720)' }}>
                Pro-rata by <strong>time × amount</strong> within each epoch, following the strategy's snapshot rules at settlement.
              </div>
            </details>

            <details className="p-4 md:p-5 rounded-2xl shadow-sm bg-white">
              <summary className="cursor-pointer font-semibold" style={{ color: 'var(--obsidian-navy, #00295B)' }}>
                When can I withdraw from HypAirdrop?
              </summary>
              <div className="mt-2 text-sm" style={{ color: 'var(--midnight-blue, #101720)' }}>
                Requests queue and are processed on the next <strong>epoch settlement</strong> (async). 
                Morpho vault withdrawals follow their contract/liquidity rules.
              </div>
            </details>

            <details className="p-4 md:p-5 rounded-2xl shadow-sm bg-white">
              <summary className="cursor-pointer font-semibold" style={{ color: 'var(--obsidian-navy, #00295B)' }}>
                Fees?
              </summary>
              <div className="mt-2 text-sm" style={{ color: 'var(--midnight-blue, #101720)' }}>
                Displayed per product before deposit. HypAirdrop may include management/performance-style parameters; 
                Morpho vaults follow their ERC-4626 parameters.
              </div>
            </details>
          </div>
        </section>

        {/* Contact */}
        <section className="mt-8">
          <div className="p-6 md:p-8 rounded-2xl shadow-sm" style={{ background: '#fff' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--obsidian-navy, #00295B)' }}>Contact</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--midnight-blue, #101720)' }}>
              Partnerships / due diligence: <a className="underline" href="mailto:contact@myrmidons-strategies.com" style={{ color: 'var(--obsidian-navy, #00295B)' }}>contact@myrmidons-strategies.com</a>.
              Social links are available in the header and footer.
            </p>
          </div>
        </section>

        {/* Risk disclosure */}
        <div className="text-center text-xs opacity-70 mt-8"
             style={{ color: 'var(--midnight-blue, #101720)' }}>
          DeFi involves smart-contract, market, and operational risk. <strong>HypAirdrop is custodial with epoch-based settlements; airdrops/points are not guaranteed.</strong> Do your own research.
        </div>
      </div>
    </div>
  );
}
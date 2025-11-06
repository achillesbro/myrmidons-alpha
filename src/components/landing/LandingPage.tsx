import Hero from './Hero';
import ValueProps from './ValueProps';
import VaultsGrid from './VaultsGrid';
import TrustSection from './TrustSection';

function FAQSection() {
  return (
    <section className="w-full py-12">
      <div className="max-w-6xl mx-auto px-4">
        <h2
          className="text-xl md:text-2xl font-semibold mb-6"
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
              How are the funds handled for HypAirdrop?
            </summary>
            <div className="mt-2 text-sm" style={{ color: 'var(--midnight-blue, #101720)' }}>
              Funds are secured in a Safe multisig (2-of-3) smart account, preventing any unilateral withdrawals.
              All activity is fully auditable on-chain and managed through verified addresses only.
              Curator address: <a href="https://debank.com/profile/0x8Ec77176F71F5ff53B71b01FC492F46Ea4e55A77" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--obsidian-navy, #00295B)' }}>0x8Ec77176F71F5ff53B71b01FC492F46Ea4e55A77</a>.
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
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
      <main>
        <Hero />
        <ValueProps />
        <VaultsGrid />
        <FAQSection />
        <TrustSection />
        {/* Minimal risk footer note (legal can replace later) */}
        <div className="text-center text-xs opacity-70 py-8" style={{ color:'var(--midnight-blue,#101720)' }}>
          DeFi carries risk, including smart-contract and market risk. For HypAirdrop, airdrops/points are not guaranteed and withdrawals may be asynchronous. Do your own research.
        </div>
      </main>
  );
}

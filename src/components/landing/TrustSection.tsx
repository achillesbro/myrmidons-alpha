export default function TrustSection() {
  return (
    <section className="w-full py-12">
      <div className="max-w-6xl mx-auto px-4 grid gap-8 md:grid-cols-2">
        {/* Non-custodial pillar */}
        <div className="p-6 rounded-2xl shadow-sm" style={{ background:'#fff' }}>
          <h3 className="text-lg font-semibold" style={{ color:'var(--obsidian-navy,#00295B)' }}>
            Morpho Vaults
          </h3>
          <ul className="mt-2 text-sm list-disc ml-5 space-y-1" style={{ color:'var(--midnight-blue,#101720)' }}>
            <li>ERC-4626 vaults on Morpho; on-chain and verifiable.</li>
            <li>Deposits/withdrawals direct with vault contracts.</li>
            <li>Yield-first; diversified across screened markets.</li>
          </ul>
        </div>

        {/* Custodial pillar */}
        <div className="p-6 rounded-2xl shadow-sm" style={{ background:'#fff' }}>
          <h3 className="text-lg font-semibold" style={{ color:'var(--obsidian-navy,#00295B)' }}>
            HypAirdrop
          </h3>
          <ul className="mt-2 text-sm list-disc ml-5 space-y-1" style={{ color:'var(--midnight-blue,#101720)' }}>
            <li>Strategy prioritizes points farming across HyperEVM dApps.</li>
            <li>Withdrawals may be asynchronous; NAV/settlements periodic.</li>
            <li>Airdrops/points not guaranteed; higher strategy risk.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

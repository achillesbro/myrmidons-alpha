import { Trans, useTranslation } from "react-i18next";
import InnerPageHero from "./InnerPageHero";

export function AboutView() {
  const { t, ready } = useTranslation();
  
  // Show skeleton while translations are loading
  if (!ready) {
    return (
      <div className="space-y-6">
        {/* Hero Section Skeleton */}
        <div className="relative w-full py-10 md:py-12" style={{ background: 'var(--bg, #FFFFF5)' }}>
          <div className="relative max-w-6xl mx-auto px-4">
            <div className="text-center">
              <div className="h-8 md:h-10 bg-[#E1E1D6] rounded w-2/3 mx-auto mb-3 animate-pulse"></div>
              <div className="h-5 bg-[#E1E1D6] rounded w-1/2 mx-auto mb-4 animate-pulse"></div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-6 bg-[#E1E1D6] rounded-full w-20 animate-pulse"></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main content skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Side index skeleton */}
          <aside className="hidden lg:block lg:col-span-3">
            <nav className="sticky top-24 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 bg-[#E1E1D6] rounded w-24 animate-pulse"></div>
              ))}
            </nav>
          </aside>

          {/* Content skeleton */}
          <div className="lg:col-span-9 space-y-6">
            {/* Feature cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg border bg-white animate-pulse">
                  <div className="h-5 bg-[#E1E1D6] rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-[#E1E1D6] rounded w-full"></div>
                </div>
              ))}
            </div>

            {/* Timeline skeleton */}
            <div className="space-y-4">
              <div className="h-6 bg-[#E1E1D6] rounded w-32 mb-4 animate-pulse"></div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#E1E1D6] rounded-full animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-[#E1E1D6] rounded w-24 mb-1"></div>
                    <div className="h-3 bg-[#E1E1D6] rounded w-full"></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Security section skeleton */}
            <div className="space-y-4">
              <div className="h-6 bg-[#E1E1D6] rounded w-40 mb-3 animate-pulse"></div>
              <div className="h-3 bg-[#E1E1D6] rounded w-full mb-2"></div>
              <div className="h-3 bg-[#E1E1D6] rounded w-4/5"></div>
            </div>

            {/* Accordions skeleton */}
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border rounded-lg p-4 animate-pulse">
                  <div className="h-5 bg-[#E1E1D6] rounded w-1/2 mb-2"></div>
                  <div className="space-y-1">
                    <div className="h-3 bg-[#E1E1D6] rounded w-full"></div>
                    <div className="h-3 bg-[#E1E1D6] rounded w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <InnerPageHero
        title={t("aboutView.title", { defaultValue: "About Myrmidons Strategies" })}
        subtitle={t("aboutView.motto", { defaultValue: "Excellence forged in the heat of battle." })}
        badges={[
          { label: "Powered by Morpho", href: "https://morpho.org/" },
          { label: "Audited" },
          { label: "Transparency" },
          { label: "HyperEVM" },
        ]}
      />

      {/* Main content with side index on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sticky side index - desktop only */}
        <aside className="hidden lg:block lg:col-span-3">
          <nav className="sticky top-24 space-y-2">
            <a
              href="#overview"
              className="block px-3 py-2 text-sm rounded transition-colors hover:bg-[rgba(0,41,91,0.05)]"
              style={{ color: 'var(--heading, #00295B)' }}
            >
              {t("aboutView.sideIndex.overview")}
            </a>
            <a
              href="#strategy"
              className="block px-3 py-2 text-sm rounded transition-colors hover:bg-[rgba(0,41,91,0.05)]"
              style={{ color: 'var(--heading, #00295B)' }}
            >
              {t("aboutView.sideIndex.strategy")}
            </a>
            <a
              href="#faq"
              className="block px-3 py-2 text-sm rounded transition-colors hover:bg-[rgba(0,41,91,0.05)]"
              style={{ color: 'var(--heading, #00295B)' }}
            >
              {t("aboutView.sideIndex.faq")}
            </a>
            <a
              href="#risks"
              className="block px-3 py-2 text-sm rounded transition-colors hover:bg-[rgba(0,41,91,0.05)]"
              style={{ color: 'var(--heading, #00295B)' }}
            >
              {t("aboutView.sideIndex.risks")}
            </a>
          </nav>
        </aside>

        {/* Main content area */}
        <div className="lg:col-span-9 space-y-4">
          {/* Intro (always visible) */}
          <section id="overview" className="card p-6">
        <p className="text-[var(--text)]">
          {t("aboutView.p1")}
        </p>

        {/* Feature Cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--border, #E5E2D6)', background: '#fff' }}>
            <h4 className="text-base font-semibold mb-2" style={{ color: 'var(--heading, #00295B)' }}>
              {t("aboutView.featureCards.curated.title")}
            </h4>
            <p className="text-sm" style={{ color: 'var(--text, #101720)' }}>
              {t("aboutView.featureCards.curated.description")}
            </p>
          </div>
          <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--border, #E5E2D6)', background: '#fff' }}>
            <h4 className="text-base font-semibold mb-2" style={{ color: 'var(--heading, #00295B)' }}>
              {t("aboutView.featureCards.riskFirst.title")}
            </h4>
            <p className="text-sm" style={{ color: 'var(--text, #101720)' }}>
              {t("aboutView.featureCards.riskFirst.description")}
            </p>
          </div>
          <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--border, #E5E2D6)', background: '#fff' }}>
            <h4 className="text-base font-semibold mb-2" style={{ color: 'var(--heading, #00295B)' }}>
              {t("aboutView.featureCards.frictionless.title")}
            </h4>
            <p className="text-sm" style={{ color: 'var(--text, #101720)' }}>
              {t("aboutView.featureCards.frictionless.description")}
            </p>
          </div>
        </div>

        {/* How it works - Timeline */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-[var(--heading)] mb-4">
            {t("aboutView.howItWorks.title")}
          </h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: 'rgba(176,141,87,0.15)', color: 'var(--accent-brass, #B08D57)' }}>
                1
              </div>
              <div>
                <h4 className="font-semibold mb-1" style={{ color: 'var(--heading, #00295B)' }}>{t("aboutView.timeline.connect.title")}</h4>
                <p className="text-sm" style={{ color: 'var(--text, #101720)' }}>{t("aboutView.timeline.connect.description")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: 'rgba(176,141,87,0.15)', color: 'var(--accent-brass, #B08D57)' }}>
                2
              </div>
              <div>
                <h4 className="font-semibold mb-1" style={{ color: 'var(--heading, #00295B)' }}>{t("aboutView.timeline.allocate.title")}</h4>
                <p className="text-sm" style={{ color: 'var(--text, #101720)' }}>{t("aboutView.timeline.allocate.description")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: 'rgba(176,141,87,0.15)', color: 'var(--accent-brass, #B08D57)' }}>
                3
              </div>
              <div>
                <h4 className="font-semibold mb-1" style={{ color: 'var(--heading, #00295B)' }}>{t("aboutView.timeline.withdraw.title")}</h4>
                <p className="text-sm" style={{ color: 'var(--text, #101720)' }}>{t("aboutView.timeline.withdraw.description")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Security & trust */}
        <div className="mt-8" id="security">
          <h3 className="text-lg font-semibold text-[var(--heading)] mb-3">
            {t("aboutView.securityTrust.title")}
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text, #101720)' }}>
            {t("aboutView.securityTrust.description")}
          </p>
        </div>

        {/* Notes */}
        <div className="mt-6 p-3 bg-[var(--background)] border border-[var(--border)] rounded">
          <p className="text-[var(--text)] text-sm opacity-80">
            {t("aboutView.notes")}
          </p>
        </div>
      </section>


      {/* Strategy (accordion above FAQ) */}
      <details id="strategy" className="card overflow-hidden mb-3">
        <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-[var(--heading)] border-b border-[var(--border)]">
          {t("aboutView.strategy.title", { defaultValue: "Our Strategy" })}
        </summary>
        <div className="p-6">
          <p className="text-[var(--text)]">
            {t("aboutView.strategy.p1", {
              defaultValue:
                "The vault pursues systematic, risk‑managed yield on HyperEVM by allocating across selected Morpho markets. Positioning is constructed to favour liquidity, preserve principal over full cycles, and compound returns where prudent."
            })}
          </p>
          <p className="text-[var(--text)] mt-3">
            {t("aboutView.strategy.p2", {
              defaultValue:
                "The investable universe includes HYPE, BTC, ETH, USD‑linked assets, and principal tokens where carry and maturity profiles are attractive. Allocation weights adapt to market conditions, rate differentials, utilisation, and incentives."
            })}
          </p>
          <ul className="list-disc pl-5 text-[var(--text)] mt-3 space-y-1">
            <li>
              {t("aboutView.strategy.bullets.risk", {
                defaultValue:
                  "Risk‑first sizing: supply caps, conservative LLTV constraints, and ongoing monitoring of drawdowns and liquidations."
              })}
            </li>
            <li>
              {t("aboutView.strategy.bullets.liquidity", {
                defaultValue:
                  "Liquidity discipline: preference for deep‑liquidity markets and orderly redemption capacity."
              })}
            </li>
            <li>
              {t("aboutView.strategy.bullets.rebalance", {
                defaultValue:
                  "Dynamic rebalancing: respond to rates, utilisation, and incentives while minimising unnecessary churn."
              })}
            </li>
            <li>
              {t("aboutView.strategy.bullets.transparency", {
                defaultValue:
                  "Transparency: state and performance are observable on‑chain and reflected in live metrics."
              })}
            </li>
          </ul>
          <p className="text-[var(--text)] mt-3">
            {t("aboutView.strategy.p3", {
              defaultValue:
                "Objective: durable, competitive, risk‑adjusted returns over time. This is not a guarantee of performance."
            })}
          </p>

          {/* Deep Liquidity Markets */}
          <div className="mt-6">
            <h4 className="text-lg font-semibold text-[var(--heading)] mb-3">
              {t("aboutView.strategy.deepLiquidity.title")}
            </h4>
            <p className="text-[var(--text)] mb-3">
              {t("aboutView.strategy.deepLiquidity.p1")}
            </p>
            <ul className="list-disc pl-5 text-[var(--text)] space-y-1">
              <li>{t("aboutView.strategy.deepLiquidity.bullets.1")}</li>
              <li>{t("aboutView.strategy.deepLiquidity.bullets.2")}</li>
              <li>{t("aboutView.strategy.deepLiquidity.bullets.3")}</li>
            </ul>
          </div>

          {/* LLTV Constraints */}
          <div className="mt-6">
            <h4 className="text-lg font-semibold text-[var(--heading)] mb-3">
              {t("aboutView.strategy.lltv.title")}
            </h4>
            <p className="text-[var(--text)] mb-3">
              {t("aboutView.strategy.lltv.p1")}
            </p>
            <ul className="list-disc pl-5 text-[var(--text)] space-y-1">
              <li>{t("aboutView.strategy.lltv.bullets.1")}</li>
              <li>{t("aboutView.strategy.lltv.bullets.2")}</li>
              <li>{t("aboutView.strategy.lltv.bullets.3")}</li>
            </ul>
          </div>

          {/* Why USDT0 */}
          <div className="mt-6">
            <h4 className="text-lg font-semibold text-[var(--heading)] mb-3">
              {t("aboutView.strategy.usdt0.title")}
            </h4>
            <ul className="list-disc pl-5 text-[var(--text)] space-y-1">
              <li>{t("aboutView.strategy.usdt0.bullets.1")}</li>
              <li>{t("aboutView.strategy.usdt0.bullets.2")}</li>
              <li>{t("aboutView.strategy.usdt0.bullets.3")}</li>
            </ul>
          </div>
        </div>
      </details>

      {/* FAQ (accordion wrapper with nested Q&A) */}
      <details id="faq" className="card overflow-hidden" open>
        <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-[var(--heading)] border-b border-[var(--border)]">
          {t("aboutView.faq.title", { defaultValue: "FAQ" })}
        </summary>
        <div className="p-6">
          {/* How to deposit (moved under FAQ) */}
          <details className="mb-3" open>
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">
              {t("aboutView.howNew.title")}
            </summary>
            <div className="mt-2 text-[var(--text)] space-y-6">
              {/* A) One-time setup (first deposit) */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--heading)] mb-2">
                  {t("aboutView.howNew.setup.title")}
                </h3>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    <Trans
                      i18nKey="aboutView.howNew.setup.items.1"
                      components={{
                        rabby: (
                          <a
                            className="link underline"
                            href="https://rabby.io/"
                            target="_blank"
                            rel="noreferrer"
                          />
                        ),
                      }}
                    />
                  </li>
                  <li>
                    <Trans
                      i18nKey="aboutView.howNew.setup.items.2"
                      components={{
                        kraken: (
                          <a
                            className="link underline"
                            href="https://www.kraken.com/"
                            target="_blank"
                            rel="noreferrer"
                          />
                        ),
                      }}
                    />
                  </li>
                  <li>
                    {t("aboutView.howNew.setup.items.3")}
                  </li>
                </ol>
              </div>

              {/* B) Per-deposit flow */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--heading)] mb-2">
                  {t("aboutView.howNew.flow.title")}
                </h3>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>{t("aboutView.howNew.flow.items.1")}</li>
                  <li>{t("aboutView.howNew.flow.items.2")}</li>
                  <li>{t("aboutView.howNew.flow.items.3")}</li>
                  <li>{t("aboutView.howNew.flow.items.4")}</li>
                  <li>{t("aboutView.howNew.flow.items.5")}</li>
                </ol>
              </div>

              {/* C) Common pitfalls & quick checks */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--heading)] mb-2">
                  {t("aboutView.howNew.pitfalls.title")}
                </h3>
                <ul className="list-disc pl-5 space-y-2">
                  <li>{t("aboutView.howNew.pitfalls.items.1")}</li>
                  <li>{t("aboutView.howNew.pitfalls.items.2")}</li>
                  <li>{t("aboutView.howNew.pitfalls.items.3")}</li>
                  <li>{t("aboutView.howNew.pitfalls.items.4")}</li>
                  <li>{t("aboutView.howNew.pitfalls.items.5")}</li>
                </ul>
              </div>

              {/* Note */}
              <div className="mt-4 p-3 bg-[var(--background)] border border-[var(--border)] rounded">
                <p className="text-[var(--text)] text-sm">
                  {t("aboutView.howNew.note")}
                </p>
              </div>
            </div>
          </details>


          <details className="mb-3">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q1.title")}</summary>
            <p className="mt-2 text-[var(--text)]">{t("aboutView.faq.q1.body")}</p>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q2.title")}</summary>
            <p className="mt-2 text-[var(--text)]">{t("aboutView.faq.q2.body")}</p>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q3.title")}</summary>
            <p className="mt-2 text-[var(--text)]">{t("aboutView.faq.q3.body")}</p>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q4.title")}</summary>
            <p className="mt-2 text-[var(--text)]">{t("aboutView.faq.q4.body", { defaultValue: "Withdrawals are initiated from “Operations” in the Vault Information page: specify an amount or select Max, then confirm in the wallet." })}</p>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q5.title")}</summary>
            <p className="mt-2 text-[var(--text)]">{t("aboutView.faq.q5.body")}</p>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q6.title")}</summary>
            <p className="mt-2 text-[var(--text)]">{t("aboutView.faq.q6.body")}</p>
          </details>

          <details id="risks">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q7.title")}</summary>
            <div className="mt-2 text-[var(--text)]">
              <p className="mb-2">{t("aboutView.faq.q7.body")}</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>{t("aboutView.faq.q7.risks.contract")}</li>
                <li>{t("aboutView.faq.q7.risks.market")}</li>
                <li>{t("aboutView.faq.q7.risks.stablecoin")}</li>
                <li>{t("aboutView.faq.q7.risks.oracle")}</li>
              </ul>
              <p className="mt-2 text-sm text-[var(--text)]/80">{t("aboutView.faq.q7.disclaimer")}</p>
            </div>
          </details>
        </div>
      </details>
        </div>
      </div>
    </div>
  );
}
import { Trans, useTranslation } from "react-i18next";
export function AboutView() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {/* Intro (always visible) */}
      <section className="card p-6">
        <h2 className="text-2xl mb-2">
          {t("aboutView.title", { defaultValue: "About Myrmidons Strategies" })}
        </h2>
        <p className="text-[var(--heading)] italic mb-2">
          {t("aboutView.motto", { defaultValue: "“Excellence forged in the heat of battle.”" })}
        </p>
        <p className="text-[var(--text)]">
          {t("aboutView.p1")}
        </p>

        {/* What we do */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-[var(--heading)] mb-3">
            {t("aboutView.whatWeDo.title")}
          </h3>
          <ul className="list-disc pl-5 text-[var(--text)] space-y-1">
            <li>{t("aboutView.whatWeDo.bullets.curated")}</li>
            <li>{t("aboutView.whatWeDo.bullets.risk")}</li>
            <li>{t("aboutView.whatWeDo.bullets.oversight")}</li>
            <li>{t("aboutView.whatWeDo.bullets.ux")}</li>
          </ul>
        </div>

        {/* How the vault works */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-[var(--heading)] mb-3">
            {t("aboutView.howItWorks.title")}
          </h3>
          <ul className="list-disc pl-5 text-[var(--text)] space-y-1">
            <li>{t("aboutView.howItWorks.bullets.underlying")}</li>
            <li>{t("aboutView.howItWorks.bullets.allocation")}</li>
            <li>{t("aboutView.howItWorks.bullets.accrual")}</li>
            <li>{t("aboutView.howItWorks.bullets.access")}</li>
          </ul>
        </div>

        {/* Security & trust */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-[var(--heading)] mb-3">
            {t("aboutView.securityTrust.title")}
          </h3>
          <ul className="list-disc pl-5 text-[var(--text)] space-y-1">
            <li>{t("aboutView.securityTrust.bullets.custodial")}</li>
            <li>{t("aboutView.securityTrust.bullets.morpho")}</li>
            <li>{t("aboutView.securityTrust.bullets.transparency")}</li>
          </ul>
        </div>

        {/* Notes */}
        <div className="mt-6 p-3 bg-[var(--background)] border border-[var(--border)] rounded">
          <p className="text-[var(--text)] text-sm">
            {t("aboutView.notes")}
          </p>
        </div>
      </section>


      {/* Strategy (accordion above FAQ) */}
      <details className="card overflow-hidden mb-3">
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
      <details className="card overflow-hidden">
        <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-[var(--heading)] border-b border-[var(--border)]">
          {t("aboutView.faq.title", { defaultValue: "FAQ" })}
        </summary>
        <div className="p-6">
          {/* How to deposit (moved under FAQ) */}
          <details className="mb-3">
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

          <details>
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q7.title")}</summary>
            <div className="mt-2 text-[var(--text)]">
              <p className="mb-3">{t("aboutView.faq.q7.body")}</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>{t("aboutView.faq.q7.risks.contract")}</li>
                <li>{t("aboutView.faq.q7.risks.market")}</li>
                <li>{t("aboutView.faq.q7.risks.stablecoin")}</li>
                <li>{t("aboutView.faq.q7.risks.oracle")}</li>
                <li>{t("aboutView.faq.q7.risks.utilization")}</li>
              </ul>
              <p className="mt-3 text-sm text-[var(--text)]/80">{t("aboutView.faq.q7.disclaimer")}</p>
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}
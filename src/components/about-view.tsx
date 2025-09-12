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
          {t("aboutView.p1", {
            defaultValue:
              "Myrmidons Strategies implements investment strategies in crypto assets, with primary focus on the Hyperliquid ecosystem."
          })}
        </p>
        <p className="text-[var(--text)] mt-3">
          {t("aboutView.p2", {
            defaultValue:
              "The mandate is to offer diversified, curated exposure to DeFi via ERC‑4626 vaults—aiming to maximise risk‑adjusted yield while maintaining disciplined risk management and transparency. The platform serves both experienced participants and newcomers."
          })}
        </p>
        <ul className="list-disc pl-5 text-[var(--text)] mt-3 space-y-1">
          <li>{t("aboutView.bullets.curated", { defaultValue: "Curated cryptocurrencies across DeFi." })}</li>
          <li>{t("aboutView.bullets.hyperliquid", { defaultValue: "Hyperliquid‑focused opportunity set." })}</li>
          <li>{t("aboutView.bullets.risk", { defaultValue: "Risk‑first engineering and monitoring." })}</li>
        </ul>
      </section>

      {/* How to deposit (accordion) */}
      <details className="card overflow-hidden">
        <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-[var(--heading)] border-b border-[var(--border)]">
          {t("aboutView.howNew.title", { defaultValue: "How to deposit" })}
        </summary>
        <div className="p-6 space-y-6 text-[var(--text)]">
          {/* A) One‑time setup (first deposit) */}
          <div>
            <h3 className="text-lg font-semibold text-[var(--heading)] mb-2">
              {t("aboutView.howNew.setup.title", { defaultValue: "A) One‑time setup (first deposit)" })}
            </h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                <Trans
                  i18nKey="aboutView.howNew.setup.items.1"
                  defaultValue="Install a self‑custodial wallet. Recommended: <rabby>Rabby Wallet</rabby>. Always download from the official site to avoid phishing."
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
                  defaultValue="Create an account on a reputable exchange (recommended: <kraken>Kraken</kraken>) and purchase ETH."
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
                {t("aboutView.howNew.setup.items.3", { defaultValue: "Withdraw ETH to your wallet on Arbitrum One (Layer 2). This gives you fast/cheap transactions and ETH for gas on Arbitrum." })}
              </li>
              <li>
                {t("aboutView.howNew.setup.items.4", { defaultValue: "Understand gas on HyperEVM: the native gas token is HYPE (not ETH). You will need a small amount of HYPE to transact on HyperEVM." })}
              </li>
              <li>
                <Trans
                  i18nKey="aboutView.howNew.setup.items.5"
                  defaultValue="Bridge & swap using a trusted aggregator such as <jumper>Jumper Exchange</jumper>: swap from ETH on Arbitrum to USDT0 on HyperEVM (the vault’s underlying). Also bridge a small amount of HYPE (e.g., ~$10) for gas on HyperEVM."
                  components={{
                    jumper: (
                      <a
                        className="link underline"
                        href="https://jumper.exchange/?fromChain=42161&fromToken=0x0000000000000000000000000000000000000000&toChain=999&toToken=0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb"
                        target="_blank"
                        rel="noreferrer"
                      />
                    ),
                  }}
                />
              </li>
              <li>
                {t("aboutView.howNew.setup.items.6", { defaultValue: "Add/switch to the HyperEVM network in your wallet, then return here." })}
              </li>
            </ol>
          </div>

          {/* B) Per‑deposit flow */}
          <div>
            <h3 className="text-lg font-semibold text-[var(--heading)] mb-2">
              {t("aboutView.howNew.flow.title", { defaultValue: "B) Per‑deposit flow" })}
            </h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>{t("aboutView.howNew.flow.items.1", { defaultValue: "Connect the wallet and select HyperEVM." })}</li>
              <li>{t("aboutView.howNew.flow.items.2", { defaultValue: "Ensure you hold USDT0 on HyperEVM and a small HYPE balance for gas." })}</li>
              <li>{t("aboutView.howNew.flow.items.3", { defaultValue: "Enter the deposit amount. If this is the first time for USDT0, approve the token for the vault (choose exact or infinite)." })}</li>
              <li>{t("aboutView.howNew.flow.items.4", { defaultValue: "Submit the deposit and confirm in the wallet." })}</li>
              <li>{t("aboutView.howNew.flow.items.5", { defaultValue: "After confirmation, the position updates and shares appear under User Position." })}</li>
            </ol>
          </div>

          {/* C) Common pitfalls & quick checks */}
          <div>
            <h3 className="text-lg font-semibold text-[var(--heading)] mb-2">
              {t("aboutView.howNew.pitfalls.title", { defaultValue: "C) Common pitfalls & quick checks" })}
            </h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>{t("aboutView.howNew.pitfalls.items.1", { defaultValue: "Ensure the connected network is HyperEVM; ETH is not the gas token on HyperEVM (HYPE is)." })}</li>
              <li>{t("aboutView.howNew.pitfalls.items.2", { defaultValue: "Keep a small buffer of HYPE for fees on HyperEVM (e.g., ~$10)." })}</li>
              <li>{t("aboutView.howNew.pitfalls.items.3", { defaultValue: "If the token approval is pending, wait for confirmation before submitting the deposit." })}</li>
              <li>{t("aboutView.howNew.pitfalls.items.4", { defaultValue: "If a transaction fails, re‑check the amount, allowance, and gas token balance before retrying." })}</li>
            </ul>
          </div>
        </div>
      </details>

      {/* Fees (accordion) */}
      <details className="card overflow-hidden">
        <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-[var(--heading)] border-b border-[var(--border)]">
          {t("aboutView.fees.title", { defaultValue: "Fees" })}
        </summary>
        <div className="p-6">
          <p className="text-[var(--text)]">
            {t("aboutView.fees.body", {
              defaultValue:
                "This vault takes a performance fee on yield (if any). The current fee and recipient are shown live on the Vault Information page. This section explains how fees work at a high level; actual values are read on‑chain."
            })}
          </p>
        </div>
      </details>

      {/* Risks (accordion) */}
      <details className="card overflow-hidden">
        <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-[var(--heading)] border-b border-[var(--border)]">
          {t("aboutView.risks.title", { defaultValue: "Risks" })}
        </summary>
        <div className="p-6">
          <ul className="list-disc pl-5 space-y-1 text-[var(--text)]">
            <li>{t("aboutView.risks.items.contract", { defaultValue: "Smart contract vulnerabilities or protocol risk." })}</li>
            <li>{t("aboutView.risks.items.market", { defaultValue: "Market/liquidity risk across underlying positions." })}</li>
            <li>{t("aboutView.risks.items.infrastructure", { defaultValue: "Chain/RPC outages and infrastructure dependencies." })}</li>
            <li>{t("aboutView.risks.items.operational", { defaultValue: "Wallet/key management and operational mistakes." })}</li>
          </ul>
        </div>
      </details>

      {/* FAQ (accordion wrapper with nested Q&A) */}
      <details className="card overflow-hidden">
        <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-[var(--heading)] border-b border-[var(--border)]">
          {t("aboutView.faq.title", { defaultValue: "FAQ" })}
        </summary>
        <div className="p-6">
          <details className="mb-3">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q1.title", { defaultValue: "How do ERC‑4626 vaults work?" })}</summary>
            <div className="mt-2 text-muted space-y-2">
              <p>
                {t("aboutView.faq.q1.p1", {
                  defaultValue:
                    "An ERC‑4626 vault is analogous to an investment fund or ETF. Depositors contribute the underlying token (e.g., WHYPE) and receive vault shares that represent proportional ownership."
                })}
              </p>
              <ul className="list-disc pl-5">
                <li><strong>{t("aboutView.faq.q1.depositLabel", { defaultValue: "Deposits" })}</strong>: {t("aboutView.faq.q1.deposit", { defaultValue: "Underlying is deposited and shares are minted to reflect proportional ownership." })}</li>
                <li><strong>{t("aboutView.faq.q1.earningsLabel", { defaultValue: "Earnings" })}</strong>: {t("aboutView.faq.q1.earnings", { defaultValue: "As the strategy earns, the economic value per share tends to increase. The share count typically remains constant unless further deposits or withdrawals occur." })}</li>
                <li><strong>{t("aboutView.faq.q1.withdrawalsLabel", { defaultValue: "Withdrawals" })}</strong>: {t("aboutView.faq.q1.withdrawals", { defaultValue: "Shares are burned to redeem the corresponding amount of underlying." })}</li>
              </ul>
              <p>
                {t("aboutView.faq.q1.p2", {
                  defaultValue:
                    "Example: a 100‑token deposit that experiences ~5% positive performance would later redeem to approximately 105 tokens (less any applicable fees and rounding). Negative performance reduces redemption value."
                })}
              </p>
              <p>
                {t("aboutView.faq.q1.p3", {
                  defaultValue:
                    "APY is variable and driven by market conditions and allocation. Share value reflects vault performance over time."
                })}
              </p>
            </div>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q2.title", { defaultValue: "What wallets are supported?" })}</summary>
            <p className="mt-2 text-muted">{t("aboutView.faq.q2.body", { defaultValue: "MetaMask, Rabby, OKX (via RainbowKit)." })}</p>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q3.title", { defaultValue: "When does APY update?" })}</summary>
            <p className="mt-2 text-muted">{t("aboutView.faq.q3.body", { defaultValue: "APY is computed from on‑chain state; it changes as markets evolve and as the vault accrues." })}</p>
          </details>

          <details>
            <summary className="cursor-pointer font-semibold text-[var(--heading)]">{t("aboutView.faq.q4.title", { defaultValue: "How do I withdraw?" })}</summary>
            <p className="mt-2 text-muted">{t("aboutView.faq.q4.body", { defaultValue: "Withdrawals are initiated from “Operations” in the Vault Information page: specify an amount or select Max, then confirm in the wallet." })}</p>
          </details>
        </div>
      </details>
    </div>
  );
}
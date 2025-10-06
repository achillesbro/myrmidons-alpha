import { useVaultSummaries } from '../../hooks/useVaultSummaries';
import { vaults } from '../../config/vaults.config';
import { useTranslation } from 'react-i18next';
import VaultCard from './VaultCard';

export default function VaultsGrid() {
  const { t } = useTranslation();
  const { summaries } = useVaultSummaries();

  return (
    <section className="w-full py-12">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-2xl font-semibold" style={{ color:'var(--heading,#00295B)' }}>
          {t('landing.vaults.title')}
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {vaults.map(v => (
            <VaultCard
              key={v.id}
              model={v}
              kpis={{
                tvlUSD: summaries[v.id]?.tvlUSD,
                apy: summaries[v.id]?.apy,
                marketsCount: summaries[v.id]?.marketsCount,
                updatedAt: summaries[v.id]?.updatedAt,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

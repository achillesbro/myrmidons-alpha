import { fmtPct, fmtUSD } from '../../utils/format';
import { Skeleton } from '../ui/Skeleton';
import { track } from '../../utils/analytics';
import { useTranslation } from 'react-i18next';
import type { VaultCardModel } from '../../config/vaults.config';

type Props = {
  model: VaultCardModel;
  kpis: { tvlUSD?: number; apy?: number; marketsCount?: number; updatedAt?: number; };
};

const toUtcHm = (ms?: number) => {
  if (!ms) return null;
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
};

export default function VaultCard({ model, kpis }: Props) {
  const { t } = useTranslation();
  const { name, objectiveKey, tagsKey, links, chainId } = model;
  
  // Get translated objective and tags
  const objective = t(objectiveKey);
  const tags = t(tagsKey, { returnObjects: true }) as string[];

  return (
    <div className="p-6 rounded-2xl shadow-sm flex flex-col justify-between"
         style={{ background:'#fff', color:'var(--text,#101720)' }}>
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold" style={{ color:'var(--heading,#00295B)' }}>{name}</h3>
          <span className="text-xs px-2 py-1 rounded-full"
                style={{ background:'rgba(176,141,87,0.12)', color:'var(--muted-brass,#B08D57)' }}>
            {chainId}
          </span>
        </div>
        <p className="mt-2 text-sm">{objective}</p>
        <div className="mt-3 flex gap-2 flex-wrap">
          {tags.map((tag, index) => (
            <span key={index} className="text-xs px-2 py-1 rounded-full border"
                  style={{ borderColor:'rgba(0,41,91,0.2)', color:'var(--heading,#00295B)' }}>
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="opacity-70">{t('landing.vaults.phalanx.tvlLabel')}</div>
            {kpis.tvlUSD == null ? <Skeleton className="w-20 h-4 mt-1"/> : <div className="font-medium mt-1">{fmtUSD(kpis.tvlUSD)}</div>}
          </div>
          <div>
            <div className="opacity-70">{t('landing.vaults.phalanx.apyLabel')}</div>
            {kpis.apy == null ? <Skeleton className="w-16 h-4 mt-1"/> : <div className="font-medium mt-1">{fmtPct(kpis.apy)}</div>}
          </div>
          <div>
            <div className="opacity-70">{t('landing.vaults.phalanx.marketsLabel')}</div>
            {kpis.marketsCount == null ? <Skeleton className="w-10 h-4 mt-1"/> : <div className="font-medium mt-1">{kpis.marketsCount}</div>}
          </div>
        </div>

        {/* Last updated timestamp */}
        {toUtcHm(kpis.updatedAt) && (
          <div className="mt-3 text-xs opacity-70">Last updated · {toUtcHm(kpis.updatedAt)}</div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <a
          href={links.details}
          onClick={() => track('vault_view_details_click', { vault: model.id })}
          className="px-4 py-2 rounded-xl border text-sm font-medium"
          style={{ borderColor:'var(--heading,#00295B)', color:'var(--heading,#00295B)' }}
        >
          {t('landing.vaults.phalanx.viewDetails')}
        </a>
        <a
          href={links.deposit}
          onClick={() => track('vault_deposit_click', { vault: model.id })}
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background:'var(--muted-brass,#B08D57)', color:'#fff' }}
        >
          {t('landing.vaults.phalanx.deposit')}
        </a>
      </div>
    </div>
  );
}

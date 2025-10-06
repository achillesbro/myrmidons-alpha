
import { useTranslation } from 'react-i18next';

export default function TrustSection() {
  const { t } = useTranslation();

  return (
    <section className="w-full py-12">
      <div className="max-w-6xl mx-auto px-4 grid gap-8 md:grid-cols-2">
        <div className="p-6 rounded-2xl shadow-sm" style={{ background:'#fff' }}>
          <h3 className="text-lg font-semibold" style={{ color:'var(--heading,#00295B)' }}>
            {t('landing.trust.nonCustodial.title')}
          </h3>
          <p className="mt-2 text-sm" style={{ color:'var(--text,#101720)' }}>
            {t('landing.trust.nonCustodial.description')}
          </p>
        </div>
        <div className="p-6 rounded-2xl shadow-sm" style={{ background:'#fff' }}>
          <h3 className="text-lg font-semibold" style={{ color:'var(--heading,#00295B)' }}>
            {t('landing.trust.howItWorks.title')}
          </h3>
          <ol className="mt-2 text-sm list-decimal ml-5 space-y-1" style={{ color:'var(--text,#101720)' }}>
            {(t('landing.trust.howItWorks.steps', { returnObjects: true }) as string[]).map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

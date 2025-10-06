
import { useTranslation } from 'react-i18next';

export default function ValueProps() {
  const { t } = useTranslation();

  const items = [
    { 
      title: t('landing.valueProps.curated.title'), 
      body: t('landing.valueProps.curated.description') 
    },
    { 
      title: t('landing.valueProps.riskFirst.title'), 
      body: t('landing.valueProps.riskFirst.description') 
    },
    { 
      title: t('landing.valueProps.frictionless.title'), 
      body: t('landing.valueProps.frictionless.description') 
    },
  ];

  return (
    <section className="w-full py-12">
      <div className="max-w-6xl mx-auto px-4 grid gap-6 md:grid-cols-3">
        {items.map((it, index) => (
          <div key={index} className="p-6 rounded-2xl shadow-sm"
               style={{ background: '#fff', color: 'var(--text, #101720)' }}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--heading,#00295B)' }}>{it.title}</h3>
            <p className="mt-2 text-sm">{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

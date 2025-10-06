import { track } from '../../utils/analytics';
import { useTranslation } from 'react-i18next';

export default function SocialStrip() {
  const { t } = useTranslation();
  
  const socials = [
    { name: 'X', href: 'https://x.com/myrmidons_strat' },
    // { name: 'Telegram', href: 'https://t.me/...' },
  ];
  
  return (
    <section className="w-full py-12">
      <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center gap-4 justify-between">
        <p className="text-sm" style={{ color:'var(--text,#101720)' }}>
          {t('landing.social.contact')} <a className="underline" href={`mailto:${t('landing.social.email')}`}>{t('landing.social.email')}</a>.
        </p>
        <div className="flex gap-3">
          {socials.map(s => (
            <a key={s.name} href={s.href} aria-label={s.name}
               onClick={() => track('social_click', { name: s.name })}
               className="px-3 py-2 rounded-xl text-sm font-medium border"
               style={{ borderColor:'rgba(0,41,91,0.2)', color:'var(--heading,#00295B)' }}>
              {s.name}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

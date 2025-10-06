import { track } from '../../utils/analytics';
import { useTranslation } from 'react-i18next';

export default function Hero() {
  const { t } = useTranslation();

  return (
    <section className="relative w-full py-16 md:py-24" style={{ background: 'var(--bg, #FFFFF5)' }}>
      {/* Background image with 20% opacity - full width, starting from header */}
      <div 
        className="absolute w-screen bg-cover bg-center bg-no-repeat z-0"
        style={{ 
          backgroundImage: 'url(/trojan-war-heroes-greek-army.png)',
          opacity: 0.2,
          left: '50%',
          transform: 'translateX(-50%)',
          top: '-64px', // Start from header height (64px)
          bottom: 0,
          height: 'calc(100% + 64px)' // Extend upward to cover header gap
        }}
      />
      
      {/* Subtle readability overlay over the hero artwork */}
      <div
        className="absolute w-screen pointer-events-none z-10"
        style={{ 
          background: 'linear-gradient(180deg, rgba(16,23,32,0.25) 0%, rgba(16,23,32,0.00) 60%)',
          left: '50%',
          transform: 'translateX(-50%)',
          top: '-64px', // Start from header height (64px)
          bottom: 0,
          height: 'calc(100% + 64px)' // Extend upward to cover header gap
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 z-20">
        <h1
          className="text-3xl md:text-5xl font-semibold leading-tight max-w-[60ch]"
          style={{ color: 'var(--heading, #00295B)' }}
        >
          {t('landing.hero.title')}
        </h1>

        <p
          className="mt-4 text-base md:text-lg max-w-[60ch]"
          style={{ color: 'var(--text, #101720)' }}
        >
          {t('landing.hero.subtitle')}
        </p>

        {/* BADGE ROW — Powered by Morpho */}
        <div className="mt-3 flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
            style={{ background: 'rgba(0,41,91,0.08)', color: 'var(--heading, #00295B)' }}
          >
            {/* Replace with Morpho mono mark if available */}
            <span aria-hidden="true">◇</span>
            {t('landing.hero.poweredBy')}
          </span>
          <a
            href="https://morpho.org/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs underline"
            style={{ color: 'var(--heading, #00295B)' }}
          >
            {t('landing.hero.learnMore')}
          </a>
        </div>

        {/* CTAs */}
        <div className="mt-8 flex gap-3">
          <a
            href="/?tab=vaultinfo"
            onClick={() => track('hero_deposit_click')}
            className="px-5 py-3 rounded-2xl font-medium"
            style={{ background: 'var(--muted-brass, #B08D57)', color: '#fff' }}
            aria-label={t('landing.hero.ctaPrimary')}
          >
            {t('landing.hero.ctaPrimary')}
          </a>
          <a
            href="/?tab=about"
            className="px-5 py-3 rounded-2xl font-medium border"
            style={{ borderColor: 'var(--heading, #00295B)', color: 'var(--heading, #00295B)' }}
            aria-label={t('landing.hero.ctaSecondary')}
          >
            {t('landing.hero.ctaSecondary')}
          </a>
        </div>
      </div>
    </section>
  );
}

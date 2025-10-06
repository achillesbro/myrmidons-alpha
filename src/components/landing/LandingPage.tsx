import Hero from './Hero';
import ValueProps from './ValueProps';
import VaultsGrid from './VaultsGrid';
import TrustSection from './TrustSection';
import { useTranslation } from 'react-i18next';

export default function LandingPage() {
  const { t } = useTranslation();

  return (
      <main>
        <Hero />
        <ValueProps />
        <VaultsGrid />
        <TrustSection />
        {/* Minimal risk footer note (legal can replace later) */}
        <div className="text-center text-xs opacity-70 py-8" style={{ color:'var(--text,#101720)' }}>
          {t('landing.footer.disclaimer')}
        </div>
      </main>
  );
}

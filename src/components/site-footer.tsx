import { LanguageSwitcher } from './LanguageSwitcher';
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-10 border-t border-[var(--border)] bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[var(--text)]">
        <div className="text-sm opacity-80">© {year} Myrmidons Strategies</div>
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-4 text-sm">
            <a
              href="https://x.com/myrmidons_strat"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline hover:opacity-80"
              aria-label="Myrmidons Strategies on X (Twitter)"
            >
              X / Twitter
            </a>
            <span className="opacity-40">•</span>
            <a
              href="https://medium.com/@myrmidons.strategies"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline hover:opacity-80"
              aria-label="Myrmidons Strategies on Medium"
            >
              Medium
            </a>
          </nav>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
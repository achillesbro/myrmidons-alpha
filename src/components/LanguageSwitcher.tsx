import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = (i18n.resolvedLanguage || 'en') as 'en' | 'fr'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const setLang = (lng: 'en' | 'fr') => {
    if (lng !== current) i18n.changeLanguage(lng)
    setOpen(false)
  }

  return (
    <div className="lang-switcher relative inline-block text-sm" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language menu"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--heading)]"
      >
        <span>Language</span>
        <svg
          className={`ml-1 h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" />
        </svg>
      </button>

      {open && (
        // Drop-UP: position the menu above the button
        <div className="absolute right-0 bottom-full mb-2 min-w-[120px] rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-lg z-50">
          <ul role="listbox" className="py-1">
            <li>
              <button
                className="w-full flex items-center gap-1 px-2 py-2 text-left text-[var(--heading)] hover:opacity-80 border-0 outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                style={{ outline: 'none', boxShadow: 'none' }}
                onClick={() => setLang('en')}
              >
                <span aria-hidden>🇬🇧</span>
                <span className="font-medium">EN</span>
                {current === 'en' && <span className="ml-auto">✓</span>}
              </button>
            </li>
            <li>
              <button
                className="w-full flex items-center gap-1 px-2 py-2 text-left text-[var(--heading)] hover:opacity-80 border-0 outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                style={{ outline: 'none', boxShadow: 'none' }}
                onClick={() => setLang('fr')}
              >
                <span aria-hidden>🇫🇷</span>
                <span className="font-medium">FR</span>
                {current === 'fr' && <span className="ml-auto">✓</span>}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
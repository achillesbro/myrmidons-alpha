import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import initial resources (we’ll add more keys later)
import en from './en.json'
import fr from './fr.json'

i18n
  .use(LanguageDetector)     // detects from localStorage, navigator, querystring
  .use(initReactI18next)     // passes i18n instance to react-i18next
  .init({
    resources: { en: { translation: en }, fr: { translation: fr } },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnNull: false
  })

// Keep <html lang="..."> in sync
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng || 'en'
  }
})

export default i18n
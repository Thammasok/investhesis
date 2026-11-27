import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './catalogue/en/index'

/**
 * The one i18next instance (design.md §Store and lookup). English is bundled and is the fallback;
 * Thai is a lazy chunk that `setLanguage` registers. Init is synchronous, so `t` works at import.
 * Only `src/i18n/` imports `i18next` (oxlint); components use react-i18next hooks.
 */
export const i18n = i18next.createInstance()

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  initAsync: false,
  keySeparator: '.',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

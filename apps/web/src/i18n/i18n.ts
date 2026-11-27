import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './catalogue/en/index.ts'

export type { I18n }

/**
 * One i18next instance (ADR-001): English bundled as the fallback, a single `translation`
 * namespace, synchronous init. `escapeValue` is off because React and sonner render strings as text.
 * Thai is added later by `language.ts` (FR-014). `react` binds the instance to react-i18next's hooks
 * (the app's instance only: a test instance must not replace it).
 */
export function createI18n({ react = false }: { react?: boolean } = {}): I18n {
  const instance = i18next.createInstance()
  if (react) instance.use(initReactI18next)
  void instance.init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en', 'th'],
    defaultNS: 'translation',
    ns: ['translation'],
    keySeparator: '.',
    nsSeparator: false,
    initAsync: false,
    interpolation: { escapeValue: false },
    // The tag set of `Trans` is only what a message's `components` name; no HTML node is kept.
    react: { useSuspense: false, transKeepBasicHtmlNodesFor: [] },
  })
  return instance
}

export const i18n = createI18n({ react: true })

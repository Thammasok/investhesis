import type { Language } from '@investhesis/domain'
import { i18n } from './i18n'

export const LANGUAGE_STORAGE_KEY = 'investhesis.language'

let thai: Promise<void> | undefined

/** Loads the Thai catalogue once and registers it; English is already bundled. */
function loadThai(): Promise<void> {
  thai ??= import('./catalogue/th/index').then(({ th }) => {
    i18n.addResourceBundle('th', 'translation', th, true, true)
  })
  return thai
}

export function getLanguage(): Language {
  return i18n.language === 'th' ? 'th' : 'en'
}

/**
 * Switches the interface language: waits for the Thai chunk, tells i18next (components re-render
 * through `languageChanged`), sets `<html lang>` and remembers the choice in this browser.
 * Choosing the current language changes nothing.
 */
export async function setLanguage(language: Language): Promise<void> {
  if (language === 'th') await loadThai()
  if (i18n.language !== language) await i18n.changeLanguage(language)
  document.documentElement.lang = language
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
}

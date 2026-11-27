import type { Language } from '@investhesis/domain'
import { LANGUAGE_STORAGE_KEY } from './language'

const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'th'

/**
 * FR-003 order: the saved choice, then the first browser language that is Thai or English, else English.
 * Own code, no detector plugin.
 */
export function detect(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
  languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
): Language {
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // fall through to the browser languages
  }
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0]
    if (primary === 'th' || primary === 'en') return primary
  }
  return 'en'
}

function safeStorage(): Storage | undefined {
  try {
    return localStorage
  } catch {
    return undefined
  }
}

import type { Language } from '@investhesis/domain'

export const LANGUAGE_STORAGE_KEY = 'investhesis.language'

const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'th'

type ReadableStorage = Pick<Storage, 'getItem'>

/**
 * The language to start in (FR-003): the saved choice if valid, else the first browser language
 * whose primary subtag is Thai or English (Thai wins), else English. A storage that throws counts
 * as empty.
 */
export function detect(
  storage: ReadableStorage | undefined = safeStorage(),
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
    if (primary === 'th') return 'th'
    if (primary === 'en') return 'en'
  }
  return 'en'
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

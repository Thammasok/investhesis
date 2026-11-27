import type { Language } from '@investhesis/domain'
import { detect, LANGUAGE_STORAGE_KEY } from './detect.ts'
import { i18n as appInstance, type I18n } from './i18n.ts'

type ThaiModule = { th: object }
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>

const loadThaiChunk = (): Promise<ThaiModule> => import('./catalogue/th/index.ts')

function browserStorage(): WritableStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/**
 * The language of an i18next instance. `setLanguage('th')` awaits the lazy Thai chunk once,
 * registers it, changes the language, sets `<html lang>` and saves the choice (FR-010, FR-014). A
 * failed chunk load leaves the language as it was and can be tried again. `init` does the same
 * without saving: a detected language is not a choice (FR-003).
 */
export function createLanguage(
  instance: I18n,
  loadThai: () => Promise<ThaiModule> = loadThaiChunk,
  storage: () => WritableStorage | undefined = browserStorage,
) {
  let thai: Promise<void> | undefined
  let thaiLoaded = false

  const ensureThai = (): Promise<void> => {
    thai ??= loadThai().then(
      (module) => {
        instance.addResourceBundle('th', 'translation', module.th, true, true)
        thaiLoaded = true
      },
      (error: unknown) => {
        thai = undefined
        throw error
      },
    )
    return thai
  }

  const getLanguage = (): Language => (instance.language === 'th' ? 'th' : 'en')

  // With every bundle in memory i18next changes language synchronously, so once Thai is loaded a
  // switch takes effect before this returns (tests rely on it; the promise only awaits the chunk).
  const finish = (lang: Language, save: boolean): void => {
    if (getLanguage() !== lang) void instance.changeLanguage(lang)
    document.documentElement.lang = lang
    if (!save) return
    try {
      storage()?.setItem(LANGUAGE_STORAGE_KEY, lang)
    } catch {
      // Private mode or blocked storage: the language still applies for this visit.
    }
  }

  const apply = (lang: Language, save: boolean): Promise<void> => {
    if (lang === 'th' && !thaiLoaded) return ensureThai().then(() => finish(lang, save))
    finish(lang, save)
    return Promise.resolve()
  }

  return {
    getLanguage,
    /** Starts in `lang` (the detected one) without saving it. */
    init: (lang: Language) => apply(lang, false),
    setLanguage: (lang: Language) => apply(lang, true),
    /** Back to English with nothing saved; for tests. Takes effect at once (resources are in memory). */
    reset(): void {
      void instance.changeLanguage('en')
      document.documentElement.lang = 'en'
      try {
        storage()?.removeItem(LANGUAGE_STORAGE_KEY)
      } catch {
        // nothing saved to remove
      }
    },
  }
}

const app = createLanguage(appInstance)
export const { getLanguage, setLanguage, reset: resetLanguage } = app
/** Applies the detected language before the first render (main.tsx). */
export const initLanguage = (lang: Language = detect()): Promise<void> => app.init(lang)

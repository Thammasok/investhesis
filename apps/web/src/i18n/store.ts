import type { Language } from '@investhesis/domain'
import type { Catalogue } from './catalogue-types.ts'
import { LANGUAGE_STORAGE_KEY } from './detect.ts'

type WritableStorage = Pick<Storage, 'setItem'>

export type I18nStore = {
  getLanguage: () => Language
  /** The Thai catalogue once loaded, else null. */
  getThai: () => Catalogue | null
  subscribe: (listener: () => void) => () => void
  /** Switches the language: loads Thai once, sets `<html lang>`, saves the choice and notifies. */
  setLanguage: (lang: Language) => Promise<void>
  /** Starts in `lang` without saving it (the detected language is not a choice). */
  init: (lang: Language) => Promise<void>
  /** Back to English with nothing saved; for tests. */
  reset: () => void
}

/**
 * The language store. `loadThai` is the dynamic import of the Thai chunk; it runs at most once.
 * English is in the main chunk, so only Thai waits (FR-014).
 */
export function createI18nStore(
  loadThai: () => Promise<Catalogue>,
  storage: () => WritableStorage | undefined = () => globalThis.localStorage,
): I18nStore {
  let language: Language = 'en'
  let thai: Catalogue | null = null
  let loading: Promise<void> | null = null
  const listeners = new Set<() => void>()

  const ensureThai = (): Promise<void> => {
    if (thai) return Promise.resolve()
    loading ??= loadThai().then(
      (table) => {
        thai = table
      },
      (error: unknown) => {
        loading = null
        throw error
      },
    )
    return loading
  }

  const apply = (lang: Language, save: boolean): void => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang
    if (save) {
      try {
        storage()?.setItem(LANGUAGE_STORAGE_KEY, lang)
      } catch {
        // private mode or blocked storage: the choice lasts for this visit only
      }
    }
    if (lang === language) return
    language = lang
    for (const listener of [...listeners]) listener()
  }

  return {
    getLanguage: () => language,
    getThai: () => thai,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async setLanguage(lang) {
      if (lang === language) return
      if (lang === 'th') await ensureThai()
      apply(lang, true)
    },
    async init(lang) {
      if (lang === 'th') await ensureThai()
      apply(lang, false)
    },
    reset() {
      apply('en', false)
    },
  }
}

const loadThaiChunk = async (): Promise<Catalogue> => (await import('./catalogue/th/index.ts')).th

const store = createI18nStore(loadThaiChunk)

export const getLanguage = store.getLanguage
export const getThai = store.getThai
export const subscribe = store.subscribe
export const setLanguage = store.setLanguage
export const init = store.init
export const resetLanguage = store.reset

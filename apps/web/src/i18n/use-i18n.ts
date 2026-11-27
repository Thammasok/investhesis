import { useCallback, useSyncExternalStore } from 'react'
import type { Language } from '@investhesis/domain'
import type { CatalogueKey, Params } from './catalogue-types.ts'
import { getLanguage, subscribe } from './store.ts'
import { translate, type TFunction } from './t.ts'

/** The current language; the component re-renders when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage)
}

/** `t` bound to the current language; the component re-renders when the language changes. */
export function useT(): TFunction {
  const lang = useLanguage()
  return useCallback((key: CatalogueKey, params?: Params) => translate(lang, key, params), [lang])
}

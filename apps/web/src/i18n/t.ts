import type { Language } from '@investhesis/domain'
import type { Catalogue, CatalogueEntry, CatalogueKey, English, Params } from './catalogue-types.ts'
import { en } from './catalogue/en/index.ts'
import { getLanguage, getThai } from './store.ts'

type Table = Readonly<Record<string, unknown>>

const entryAt = (table: Table | null, key: string): CatalogueEntry | undefined => {
  let node: unknown = table
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Table)[part]
  }
  if (typeof node === 'string') return node
  if (typeof node === 'object' && node !== null && typeof (node as { other?: unknown }).other === 'string') {
    return node as CatalogueEntry
  }
  return undefined
}

const rules = new Map<Language, Intl.PluralRules>()
const pluralRules = (lang: Language): Intl.PluralRules => {
  let r = rules.get(lang)
  if (!r) rules.set(lang, (r = new Intl.PluralRules(lang)))
  return r
}

/** The message text of `key` in `lang` before placeholders are filled; English when `lang` lacks it, the key itself when neither has it. */
export function templateWith(
  tables: { en: Table; th: Table | null },
  lang: Language,
  key: string,
  params?: Params,
): string {
  const entry = (lang === 'th' ? entryAt(tables.th, key) : undefined) ?? entryAt(tables.en, key)
  if (entry === undefined) return key
  if (typeof entry === 'string') return entry
  const count = params?.count
  if (typeof count !== 'number') return entry.other
  const category = pluralRules(lang).select(count)
  const plural = entry as { one?: string; other: string }
  return (category === 'one' ? plural.one : undefined) ?? plural.other
}

/** Fills `{name}` placeholders; a placeholder with no param stays as written. */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

export function translateWith(
  tables: { en: Table; th: Table | null },
  lang: Language,
  key: string,
  params?: Params,
): string {
  return interpolate(templateWith(tables, lang, key, params), params)
}

const current = () => ({ en: en as Table, th: getThai() as Table | null })

/** `t` for a language: used by `useT` and by loaders and actions through `t`. */
export function translate(lang: Language, key: CatalogueKey | (string & {}), params?: Params): string {
  return translateWith(current(), lang, key, params)
}

export function template(lang: Language, key: string, params?: Params): string {
  return templateWith(current(), lang, key, params)
}

export type TFunction = (key: CatalogueKey, params?: Params) => string

/** `t` in the current language, for code outside React (loaders, actions, toasts). */
export const t: TFunction = (key, params) => translate(getLanguage(), key, params)

/** Looks a key up leniently: a route handle may hold plain text, which is returned as it is. */
export const tLoose = (lang: Language, key: string, params?: Params): string => translate(lang, key, params)

export type { Catalogue, English }

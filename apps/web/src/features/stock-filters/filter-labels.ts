import {
  LENS_LABELS_BY_LANGUAGE,
  NOT_SET_LABELS,
  STOCK_FILTERS,
  lensValueLabel,
  type FilterKey,
  type FilterState,
  type Language,
  type LensLabelKey,
  type StockFilter,
} from '@investhesis/domain'
import { i18n } from '@/i18n/i18n'
import { orderedValues } from './filter-address'

const FILTER_BY_KEY = new Map<FilterKey, StockFilter>(STOCK_FILTERS.map((f) => [f.key, f]))

export const filterOf = (key: FilterKey): StockFilter => FILTER_BY_KEY.get(key) as StockFilter

/** A filter's name: the lens name from the domain, or the catalogue's for Held and Exchange. */
export function filterLabel(key: FilterKey, lang: Language): string {
  const lenses: Record<string, string> = LENS_LABELS_BY_LANGUAGE[lang]
  const lens = lenses[key as LensLabelKey]
  if (lens !== undefined) return lens
  return i18n.t(key === 'held' ? 'filters.names.held' : 'filters.names.exchange', { lng: lang })
}

/**
 * What a value is called on screen: "Not set" for `null`, "Held" / "Not held" for the held filter, the
 * lens label (glossary) for a lens value. The stored value stays the canonical one.
 */
export function valueLabel(key: FilterKey, value: string | null, lang: Language): string {
  if (value === null) return NOT_SET_LABELS[lang]
  if (key === 'held') return i18n.t(value === 'yes' ? 'filters.held.yes' : 'filters.held.no', { lng: lang })
  return lensValueLabel(key, value, lang)
}

export type ActiveFilter = { key: FilterKey; label: string; text: string }

/** The active filters as removable items, in sheet order: `Market: TH`, `Economic cycle: Cyclical, Not set`. */
export function activeFilters(state: FilterState, lang: Language): ActiveFilter[] {
  const out: ActiveFilter[] = []
  for (const filter of STOCK_FILTERS) {
    const picked = state.picks.get(filter.key)
    if (!picked || picked.size === 0) continue
    const label = filterLabel(filter.key, lang)
    const values = orderedValues(filter, picked).map((v) => valueLabel(filter.key, v, lang))
    out.push({ key: filter.key, label, text: `${label}: ${values.join(', ')}` })
  }
  return out
}

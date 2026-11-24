import { NOT_SET_LABEL, STOCK_FILTERS, type FilterKey, type FilterState, type StockFilter } from '@investhesis/domain'
import { orderedValues } from './filter-address'

const FILTER_BY_KEY = new Map<FilterKey, StockFilter>(STOCK_FILTERS.map((f) => [f.key, f]))

export const filterOf = (key: FilterKey): StockFilter => FILTER_BY_KEY.get(key) as StockFilter

/** What a value is called on screen: "Not set" for `null`, "Held" / "Not held" for the held filter. */
export function valueLabel(key: FilterKey, value: string | null): string {
  if (value === null) return NOT_SET_LABEL
  if (key === 'held') return value === 'yes' ? 'Held' : 'Not held'
  return value
}

export type ActiveFilter = { key: FilterKey; label: string; text: string }

/** The active filters as removable items, in sheet order: `Market: TH`, `Economic cycle: Cyclical, Not set`. */
export function activeFilters(state: FilterState): ActiveFilter[] {
  const out: ActiveFilter[] = []
  for (const filter of STOCK_FILTERS) {
    const picked = state.picks.get(filter.key)
    if (!picked || picked.size === 0) continue
    const values = orderedValues(filter, picked).map((v) => valueLabel(filter.key, v))
    out.push({ key: filter.key, label: filter.label, text: `${filter.label}: ${values.join(', ')}` })
  }
  return out
}

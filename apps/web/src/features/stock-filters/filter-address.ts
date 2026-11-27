import {
  STOCK_FILTERS,
  type FilterKey,
  type FilterState,
  type StockFilter,
} from '@investhesis/domain'
import { getLanguage } from '@/i18n/language'
import { i18n } from '@/i18n/i18n'
import { DEFAULT_SORT, SORTABLE_COLUMNS, type SortColumn, type SortState } from '@/features/stocks/sort-stocks'
import { filterLabel } from './filter-labels'

/** What the address asks for, after the fallbacks. `notes` has one entry per dropped part. */
export type AddressView = { state: FilterState; sort: SortState; notes: string[] }

const collator = new Intl.Collator('en')
const lower = (s: string) => s.toLocaleLowerCase('en')

export const EMPTY_FILTER_STATE: FilterState = { q: '', picks: new Map() }

function readPicks(filter: StockFilter, values: string[], notes: string[]): Set<string | null> | null {
  const picked = new Set<string | null>()
  const fromData = filter.vocabulary === 'fromData'
  const vocabulary = fromData ? [] : (filter.vocabulary as readonly string[])
  for (const raw of values) {
    // An empty value means "Not set": no stored value is empty.
    if (raw === '') {
      if (filter.allowNotSet) picked.add(null)
      else notes.push(i18n.t('filters.notes.emptyValue', { label: filterLabel(filter.key, getLanguage()) }))
      continue
    }
    if (fromData) {
      picked.add(raw)
      continue
    }
    const canonical = vocabulary.find((v) => lower(v) === lower(raw))
    if (canonical !== undefined) picked.add(canonical)
    else notes.push(i18n.t('filters.notes.badValue', { value: raw, label: filterLabel(filter.key, getLanguage()) }))
  }
  return picked.size > 0 ? picked : null
}

/**
 * Reads `?q=&<filter>=…&sort=&dir=` (FR-006). Absent is the default with no note; a known part with a
 * bad value is dropped with one note each; unknown parameter names are ignored silently. Nothing is
 * rewritten in the address.
 */
export function readFilters(params: URLSearchParams, options: { sort?: boolean } = {}): AddressView {
  const withSort = options.sort ?? true
  const notes: string[] = []

  let q = ''
  const qs = params.getAll('q')
  if (qs.length > 1) notes.push(i18n.t('filters.notes.searchTwice'))
  else if (qs.length === 1) q = (qs[0] as string).trim()

  const picks = new Map<FilterKey, ReadonlySet<string | null>>()
  for (const filter of STOCK_FILTERS) {
    const values = params.getAll(filter.key)
    if (values.length === 0) continue
    const picked = readPicks(filter, values, notes)
    if (picked) picks.set(filter.key, picked)
  }

  let column: SortColumn = DEFAULT_SORT.column
  let direction = DEFAULT_SORT.direction
  if (withSort) {
    const sorts = params.getAll('sort')
    if (sorts.length > 1) notes.push(i18n.t('filters.notes.sortTwice'))
    else if (sorts.length === 1) {
      const found = SORTABLE_COLUMNS.find((c) => c === (sorts[0] as string))
      if (found) column = found
      else notes.push(i18n.t('filters.notes.badSort', { value: sorts[0] }))
    }

    const dirs = params.getAll('dir')
    if (dirs.length > 1) notes.push(i18n.t('filters.notes.dirTwice'))
    else if (dirs.length === 1) {
      if (dirs[0] === 'asc' || dirs[0] === 'desc') direction = dirs[0]
      else notes.push(i18n.t('filters.notes.badDir', { value: dirs[0] }))
    }

  }

  return { state: { q, picks }, sort: { column, direction }, notes }
}

/** A filter's picked values in display order: vocabulary order (free text sorted), "Not set" (`null`) last. */
export function orderedValues(filter: StockFilter, picked: ReadonlySet<string | null>): (string | null)[] {
  const values = [...picked].filter((v): v is string => v !== null)
  if (filter.vocabulary === 'fromData') values.sort((a, b) => collator.compare(a, b))
  else {
    const vocabulary = filter.vocabulary as readonly string[]
    values.sort((a, b) => vocabulary.indexOf(a) - vocabulary.indexOf(b))
  }
  return picked.has(null) ? [...values, null] : values
}

/**
 * The parameters of a view in canonical order: `q`, then each filter in sheet order with its values in
 * vocabulary order, then the sort when one is given (the default sort is not written).
 */
export function filterPairs(state: FilterState, sort?: SortState): [string, string][] {
  const pairs: [string, string][] = []
  const q = state.q.trim()
  if (q !== '') pairs.push(['q', q])
  for (const filter of STOCK_FILTERS) {
    const picked = state.picks.get(filter.key)
    if (!picked) continue
    for (const value of orderedValues(filter, picked)) pairs.push([filter.key, value ?? ''])
  }
  if (sort) {
    if (sort.column !== DEFAULT_SORT.column) pairs.push(['sort', sort.column])
    if (sort.direction !== DEFAULT_SORT.direction) pairs.push(['dir', sort.direction])
  }
  return pairs
}

/**
 * The canonical query string of a view, so equal views have equal addresses. The default sort is not
 * written; a descending sort writes `dir=desc`. Returns '' for the bare page.
 */
export function filterSearch(state: FilterState, sort: SortState = DEFAULT_SORT): string {
  const text = new URLSearchParams(filterPairs(state, sort)).toString()
  return text === '' ? '' : `?${text}`
}

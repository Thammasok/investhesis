import {
  STOCK_FILTERS,
  type FilterKey,
  type FilterState,
  type StockFilter,
} from '@investhesis/domain'
import { DEFAULT_SORT, SORTABLE_COLUMNS, type SortColumn, type SortState } from '@/features/stocks/sort-stocks'

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
      else notes.push(`An empty ${filter.label} value isn't valid, so it was left out.`)
      continue
    }
    if (fromData) {
      picked.add(raw)
      continue
    }
    const canonical = vocabulary.find((v) => lower(v) === lower(raw))
    if (canonical !== undefined) picked.add(canonical)
    else notes.push(`"${raw}" isn't a ${filter.label} value, so that filter was left out.`)
  }
  return picked.size > 0 ? picked : null
}

/**
 * Reads `?q=&<filter>=…&sort=&dir=` (FR-006). Absent is the default with no note; a known part with a
 * bad value is dropped with one note each; unknown parameter names are ignored silently. Nothing is
 * rewritten in the address.
 */
export function readFilters(params: URLSearchParams): AddressView {
  const notes: string[] = []

  let q = ''
  const qs = params.getAll('q')
  if (qs.length > 1) notes.push('The search was given more than once, so it was left out.')
  else if (qs.length === 1) q = (qs[0] as string).trim()

  const picks = new Map<FilterKey, ReadonlySet<string | null>>()
  for (const filter of STOCK_FILTERS) {
    const values = params.getAll(filter.key)
    if (values.length === 0) continue
    const picked = readPicks(filter, values, notes)
    if (picked) picks.set(filter.key, picked)
  }

  let column: SortColumn = DEFAULT_SORT.column
  const sorts = params.getAll('sort')
  if (sorts.length > 1) notes.push('The sort column was given more than once, so the default order is used.')
  else if (sorts.length === 1) {
    const found = SORTABLE_COLUMNS.find((c) => c === (sorts[0] as string))
    if (found) column = found
    else notes.push(`"${sorts[0]}" isn't a column you can sort by, so the default order is used.`)
  }

  let direction = DEFAULT_SORT.direction
  const dirs = params.getAll('dir')
  if (dirs.length > 1) notes.push('The sort direction was given more than once, so ascending is used.')
  else if (dirs.length === 1) {
    if (dirs[0] === 'asc' || dirs[0] === 'desc') direction = dirs[0]
    else notes.push(`"${dirs[0]}" isn't a sort direction, so ascending is used.`)
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

/** The filter parameters of a state in canonical order: `q`, then each filter in sheet order, values in vocabulary order. */
export function filterPairs(state: FilterState): [string, string][] {
  const pairs: [string, string][] = []
  const q = state.q.trim()
  if (q !== '') pairs.push(['q', q])
  for (const filter of STOCK_FILTERS) {
    const picked = state.picks.get(filter.key)
    if (!picked) continue
    for (const value of orderedValues(filter, picked)) pairs.push([filter.key, value ?? ''])
  }
  return pairs
}

/**
 * The canonical query string of a view, so equal views have equal addresses. The default sort is not
 * written; a descending sort writes `dir=desc`. Returns '' for the bare page.
 */
export function filterSearch(state: FilterState, sort: SortState = DEFAULT_SORT): string {
  const pairs = filterPairs(state)
  if (sort.column !== DEFAULT_SORT.column) pairs.push(['sort', sort.column])
  if (sort.direction !== DEFAULT_SORT.direction) pairs.push(['dir', sort.direction])
  const text = new URLSearchParams(pairs).toString()
  return text === '' ? '' : `?${text}`
}

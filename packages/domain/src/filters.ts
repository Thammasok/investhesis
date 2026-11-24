import { CONCENTRATION_LENSES, type GroupableStock } from './concentration.ts'
import { ALL_EXCHANGES, ALL_INDEXES, LENS_VALUES, MARKETS } from './vocabulary.ts'

/** The part of a stock that search and filters read. Structural, so API rows and web rows both fit. */
export interface FilterableStock extends GroupableStock {
  ticker: string
  name: string
  exchange: string
}

export type LensFilterKey = Exclude<(typeof CONCENTRATION_LENSES)[number]['key'], 'market'>
export type FilterKey = 'market' | 'exchange' | 'held' | LensFilterKey

export interface StockFilter {
  key: FilterKey
  label: string
  kind: 'single' | 'multi'
  /** Fixed vocabulary in display order, or `fromData` for free text taken from the stocks. */
  vocabulary: readonly string[] | 'fromData'
  /** False when every stock always has a value (market, exchange, held). */
  allowNotSet: boolean
  get: (stock: FilterableStock) => string | readonly string[] | null
}

export interface FilterState {
  /** Trimmed search text; '' means no search. */
  q: string
  /** One entry per active filter; `null` in a set means "Not set". An empty set is no filter. */
  picks: ReadonlyMap<FilterKey, ReadonlySet<string | null>>
}

export interface FilterOption {
  /** `null` is the "Not set" option, always last. */
  value: string | null
  count: number
}

const lensFilter = (key: LensFilterKey): StockFilter => {
  const lens = CONCENTRATION_LENSES.find((l) => l.key === key)
  if (!lens) throw new RangeError(`unknown lens ${key}`)
  const vocabulary =
    key === 'valueChain' || key === 'themes'
      ? 'fromData'
      : key === 'indexMembership'
        ? ALL_INDEXES
        : LENS_VALUES[key as keyof typeof LENS_VALUES]
  return { key, label: lens.label, kind: lens.kind, vocabulary, allowNotSet: true, get: lens.get }
}

/** The filters of FR-002, in the order of the filter sheet. */
export const STOCK_FILTERS: readonly StockFilter[] = [
  {
    key: 'market',
    label: 'Market',
    kind: 'single',
    vocabulary: MARKETS,
    allowNotSet: false,
    get: (s) => s.market,
  },
  {
    key: 'held',
    label: 'Held',
    kind: 'single',
    vocabulary: ['yes', 'no'],
    allowNotSet: false,
    get: (s) => (s.holding === null ? 'no' : 'yes'),
  },
  {
    key: 'exchange',
    label: 'Exchange',
    kind: 'single',
    vocabulary: ALL_EXCHANGES,
    allowNotSet: false,
    get: (s) => s.exchange,
  },
  ...(CONCENTRATION_LENSES.filter((l) => l.key !== 'market').map((l) =>
    lensFilter(l.key as LensFilterKey),
  ) satisfies StockFilter[]),
]

const lower = (s: string) => s.toLocaleLowerCase('en')

/** Values of a stock for one filter, as a list (empty = Not set). */
const valuesOf = (filter: StockFilter, stock: FilterableStock): readonly string[] => {
  const v = filter.get(stock)
  return v === null ? [] : typeof v === 'string' ? [v] : v
}

/**
 * Keeps the stocks that match the search and every active filter (OR within a filter, AND across),
 * in input order. Returns a new array; the input is not changed.
 */
export function applyStockFilters<T extends FilterableStock>(stocks: readonly T[], state: FilterState): T[] {
  const q = lower(state.q.trim())
  const active: { filter: StockFilter; wanted: Set<string | null>; fold: boolean }[] = []
  for (const filter of STOCK_FILTERS) {
    const picked = state.picks.get(filter.key)
    if (!picked || picked.size === 0) continue
    const fold = filter.vocabulary === 'fromData'
    const wanted = new Set<string | null>([...picked].map((v) => (fold && v !== null ? lower(v) : v)))
    active.push({ filter, wanted, fold })
  }

  return stocks.filter((stock) => {
    if (q !== '') {
      const hit =
        lower(stock.ticker).includes(q) ||
        lower(stock.name).includes(q) ||
        stock.themes.some((t) => lower(t).includes(q))
      if (!hit) return false
    }
    for (const { filter, wanted, fold } of active) {
      const values = valuesOf(filter, stock)
      if (values.length === 0) {
        if (!wanted.has(null)) return false
      } else if (!values.some((v) => wanted.has(fold ? lower(v) : v))) {
        return false
      }
    }
    return true
  })
}

const collator = new Intl.Collator('en')

/**
 * For every filter: its options with the number of the given stocks having each, in vocabulary
 * order (free text: distinct values, case-insensitive, first spelling kept, sorted), then "Not
 * set". Counts are over the stocks passed in, not over a filtered result.
 */
export function filterOptions(stocks: readonly FilterableStock[]): Record<FilterKey, FilterOption[]> {
  const result = {} as Record<FilterKey, FilterOption[]>
  for (const filter of STOCK_FILTERS) {
    const fromData = filter.vocabulary === 'fromData'
    const counts = new Map<string, number>()
    const spelling = new Map<string, string>()
    let notSet = 0
    for (const stock of stocks) {
      const values = valuesOf(filter, stock)
      if (values.length === 0) {
        notSet++
        continue
      }
      for (const key of new Set(values.map((v) => (fromData ? lower(v) : v)))) {
        counts.set(key, (counts.get(key) ?? 0) + 1)
        if (fromData && !spelling.has(key)) spelling.set(key, values.find((v) => lower(v) === key) ?? key)
      }
    }
    const options: FilterOption[] = fromData
      ? [...counts]
          .map(([key, count]) => ({ value: spelling.get(key) ?? key, count }))
          .sort((a, b) => collator.compare(a.value as string, b.value as string))
      : (filter.vocabulary as readonly string[]).map((value) => ({ value, count: counts.get(value) ?? 0 }))
    if (filter.allowNotSet) options.push({ value: null, count: notSet })
    result[filter.key] = options
  }
  return result
}

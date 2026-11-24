import {
  applyStockFilters,
  CONCENTRATION_LENSES,
  formatDecimal,
  groupConcentration,
  parseDecimal,
  type ConcentrationGroup,
  type ConcentrationLens,
  type ConcentrationResult,
  type FilterState,
} from '@investhesis/domain'
import { filterPairs } from '@/features/stock-filters/filter-address'
import { formatMoney } from '@/lib/number-format'
import type { ListSummary, Stock } from '@/features/stocks/types'

export type Measure = 'count' | 'value'
export type Settings = {
  concentrationThreshold: number
  usdThbRate: string | null
  usdThbRateUpdatedAt: string | null
}

export const DEFAULT_LENS = CONCENTRATION_LENSES[0] as ConcentrationLens
export const DEFAULT_MEASURE: Measure = 'count'

/** What the address asks for, after the fallbacks. `notes` has one entry per correction (nothing is rewritten in the address). */
export type View = {
  /** `all`, `held` or a list id. */
  scope: string
  list: ListSummary | null
  lens: ConcentrationLens
  /** What the address asks for; `plan` may still show count when value cannot be computed. */
  measure: Measure
  notes: string[]
}

/** Reads `?scope=&lens=&measure=` (FR-012). Absent is the default without a note; present but wrong is the default with one. */
export function readView(params: URLSearchParams, lists: readonly ListSummary[]): View {
  const notes: string[] = []
  const one = (name: string): string | null | undefined => {
    const all = params.getAll(name)
    if (all.length === 0) return undefined
    return all.length === 1 ? (all[0] as string) : null
  }

  let scope = 'all'
  let list: ListSummary | null = null
  const rawScope = one('scope')
  if (rawScope !== undefined) {
    const found = rawScope === null ? undefined : lists.find((l) => l.id === rawScope)
    if (rawScope === 'all' || rawScope === 'held') scope = rawScope
    else if (found) {
      scope = found.id
      list = found
    } else notes.push('That list no longer exists. Showing all stocks.')
  }

  let lens = DEFAULT_LENS
  const rawLens = one('lens')
  if (rawLens !== undefined) {
    const found = rawLens === null ? undefined : CONCENTRATION_LENSES.find((l) => l.key === rawLens)
    if (found) lens = found
    else notes.push(`That grouping isn't available. Showing ${DEFAULT_LENS.label}.`)
  }

  let measure = DEFAULT_MEASURE
  const rawMeasure = one('measure')
  if (rawMeasure !== undefined) {
    if (rawMeasure === 'count' || rawMeasure === 'value') measure = rawMeasure
    else notes.push("That measure isn't available. Showing Count.")
  }
  return { scope, list, lens, measure, notes }
}

/** The canonical address of a view: every control, always in this order, then the search and filters (FR-010). */
export function viewSearch(view: Pick<View, 'scope' | 'measure'> & { lens: { key: string } }, filters?: FilterState): string {
  const pairs: [string, string][] = [
    ['scope', view.scope],
    ['lens', view.lens.key],
    ['measure', view.measure],
    ...(filters ? filterPairs(filters) : []),
  ]
  return `?${new URLSearchParams(pairs).toString()}`
}

/** The concentration view of a scope with the given search and filters: the link on the stocks pages (FR-009). */
export function concentrationHref(scope: string, filters: FilterState): string {
  return `/concentration${viewSearch({ scope, lens: DEFAULT_LENS, measure: DEFAULT_MEASURE }, filters)}`
}

export function stocksInScope(stocks: readonly Stock[], scope: string): Stock[] {
  if (scope === 'all') return [...stocks]
  if (scope === 'held') return stocks.filter((s) => s.holding !== null)
  return stocks.filter((s) => s.listIds.includes(scope))
}

export type ValueBlock =
  | { available: true; zeroTotal: boolean }
  | { available: false; reason: 'no-amounts' | 'needs-rate' }

export type Plan = {
  /** The stocks that are grouped: the scope's stocks that pass the search and filters. */
  inScope: Stock[]
  /** How many stocks the scope has before the search and filters. */
  scopeCount: number
  /** The measure shown: the requested one unless value cannot be computed. */
  measure: Measure
  value: ValueBlock
  result: ConcentrationResult
  /** Sorted by the shown measure, largest first, "Not set" last. */
  groups: ConcentrationGroup[]
  flagged: ConcentrationGroup[]
}

const cents = (group: ConcentrationGroup): bigint => parseDecimal(group.value, 2) ?? 0n

/** Groups the stocks in scope and picks the measure. Pure and synchronous: it reruns on every control change (NFR-001). */
export function planView(args: { stocks: readonly Stock[]; view: View; settings: Settings; filters?: FilterState }): Plan {
  const { view, settings } = args
  const scoped = stocksInScope(args.stocks, view.scope)
  const inScope = args.filters ? applyStockFilters(scoped, args.filters) : scoped
  const result = groupConcentration({
    stocks: inScope,
    lens: view.lens,
    usdThbRate: settings.usdThbRate,
    threshold: settings.concentrationThreshold,
  })
  const valued = inScope.length - result.leftOut.notHeld.length - result.leftOut.noAmount.length - result.leftOut.needsRate.length
  const value: ValueBlock =
    valued > 0
      ? { available: true, zeroTotal: parseDecimal(result.totalValue, 2) === 0n }
      : { available: false, reason: result.leftOut.needsRate.length > 0 ? 'needs-rate' : 'no-amounts' }
  const measure: Measure = view.measure === 'value' && value.available ? 'value' : 'count'

  const byLabel = (a: ConcentrationGroup, b: ConcentrationGroup) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
  const groups = [...result.groups].sort((a, b) => {
    if (a.notSet !== b.notSet) return a.notSet ? 1 : -1
    if (measure === 'value') {
      const d = cents(b) - cents(a)
      if (d !== 0n) return d > 0n ? 1 : -1
    }
    return b.count - a.count || byLabel(a, b)
  })
  const flagged = groups.filter((g) => (measure === 'value' ? g.valueFlag : g.countFlag))
  return { inScope, scopeCount: scoped.length, measure, value, result, groups, flagged }
}

/** `฿72,500.00` from the domain's two-decimal THB text. */
export function thb(text: string): string {
  return formatMoney(parseDecimal(text, 2) ?? 0n, 2, 'THB')
}

/** `"36.250000"` to `36.25`; six decimals stay when they matter. */
export function formatRate(text: string): string {
  const scaled = parseDecimal(text, 6)
  if (scaled === null) return text
  let f = formatDecimal(scaled, 6)
  while (f.endsWith('0') && /\.\d{3,}$/.test(f)) f = f.slice(0, -1)
  return f
}

/** `23 Nov 2026`, in the browser's time zone (G-9). */
export function formatSavedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** `Threshold 40% · 1 USD = 36.25 THB, saved 23 Nov 2026` (G-16 for no rate). */
export function settingsLine(settings: Settings): string {
  const rate =
    settings.usdThbRate === null
      ? 'No exchange rate saved'
      : `1 USD = ${formatRate(settings.usdThbRate)} THB${settings.usdThbRateUpdatedAt ? `, saved ${formatSavedDate(settings.usdThbRateUpdatedAt)}` : ''}`
  return `Threshold ${settings.concentrationThreshold}% · ${rate}`
}

export function scopeName(view: View): string {
  return view.scope === 'all' ? 'all stocks' : view.scope === 'held' ? 'held stocks' : `list ${view.list?.name ?? ''}`
}

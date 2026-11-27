import { i18n } from '@/i18n/i18n'
import type { ListSummary, Stock } from '@/features/stocks/types'

/** What the address's `scope` param asks for, after the fallback. `notes` has one entry per correction. */
export type ScopeRead = {
  /** `all`, `held` or a list id. */
  scope: string
  list: ListSummary | null
  notes: string[]
}

/** Reads `?scope=` (FR-012 of concentration, FR-007 of value chains). Absent is `all` without a note; present but wrong is `all` with one. */
export function readScope(params: URLSearchParams, lists: readonly ListSummary[]): ScopeRead {
  const notes: string[] = []
  let scope = 'all'
  let list: ListSummary | null = null
  const all = params.getAll('scope')
  if (all.length > 0) {
    const raw = all.length === 1 ? (all[0] as string) : null
    const found = raw === null ? undefined : lists.find((l) => l.id === raw)
    if (raw === 'all' || raw === 'held') scope = raw
    else if (found) {
      scope = found.id
      list = found
    } else notes.push(i18n.t('filters.scope.gone'))
  }
  return { scope, list, notes }
}

export function stocksInScope(stocks: readonly Stock[], scope: string): Stock[] {
  if (scope === 'all') return [...stocks]
  if (scope === 'held') return stocks.filter((s) => s.holding !== null)
  return stocks.filter((s) => s.listIds.includes(scope))
}

export function scopeName(view: Pick<ScopeRead, 'scope' | 'list'>): string {
  return view.scope === 'all'
    ? i18n.t('filters.scope.nameAll')
    : view.scope === 'held'
      ? i18n.t('filters.scope.nameHeld')
      : i18n.t('filters.scope.nameList', { name: view.list?.name ?? '' })
}

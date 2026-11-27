import { applyStockFilters, chainKey, ChainRename, groupChains, type ChainsResult, type FilterState } from '@investhesis/domain'
import { filterSearch } from '@/features/stock-filters/filter-address'
import { readScope, stocksInScope, type ScopeRead } from '@/features/stock-filters/scope'
import { thb } from '@/features/concentration/concentration-model'
import { i18n } from '@/i18n/i18n'
import type { ListSummary, Stock } from '@/features/stocks/types'

/** `3 stocks`, in the current language. */
export const stocksLabel = (count: number): string =>
  i18n.t('chains.stockCount', { count, n: count.toLocaleString('en-US') })

export { concentrationHref } from '@/features/concentration/concentration-model'

/** What the address asks for, after the fallback: `/chains` has only the scope of its own (FR-007). */
export type ChainsView = ScopeRead

/** Reads `?scope=`: absent is `all` without a note, present but wrong is `all` with one. */
export const readChainsView = (params: URLSearchParams, lists: readonly ListSummary[]): ChainsView =>
  readScope(params, lists)

export type ChainsPlan = {
  /** How many stocks the scope has before the search and filters. */
  scopeCount: number
  /** The stocks in view: the scope's stocks that pass the search and filters. */
  inView: Stock[]
  result: ChainsResult
}

/** Scope, then search and filters, then grouping. Pure and synchronous: it reruns on every control change (NFR-001). */
export function planChains(args: {
  stocks: readonly Stock[]
  scope: string
  filters: FilterState
  usdThbRate: string | null
}): ChainsPlan {
  const scoped = stocksInScope(args.stocks, args.scope)
  const inView = applyStockFilters(scoped, args.filters)
  return { scopeCount: scoped.length, inView, result: groupChains({ stocks: inView, usdThbRate: args.usdThbRate }) }
}

/**
 * The stocks page (or the list page for a list scope) with the current search and filters, the held
 * filter for the held scope, and the value-chain pick replaced by `chain` (`null` is "Not set"), FR-006 and FR-008.
 */
export function chainStocksHref(scope: string, filters: FilterState, chain: string | null): string {
  const picks = new Map(filters.picks)
  picks.set('valueChain', new Set([chain]))
  if (scope === 'held') picks.set('held', new Set(['yes']))
  const base = scope === 'all' || scope === 'held' ? '/stocks' : `/lists/${scope}`
  return `${base}${filterSearch({ q: filters.q, picks })}`
}

/** `1 held stock has no shares or cost and is left out of the value.`; the rate part joins when both apply. */
export function leftOutText(leftOut: { noAmount: number; needsRate: number }): string | null {
  const { noAmount, needsRate } = leftOut
  if (noAmount === 0 && needsRate === 0) return null
  const amount = i18n.t('chains.leftOut.amount', { count: noAmount, n: noAmount })
  if (needsRate === 0) return i18n.t('chains.leftOut.single', { count: noAmount, what: amount })
  const rate = i18n.t('chains.leftOut.usd', { count: needsRate, n: needsRate })
  if (noAmount === 0) return i18n.t('chains.leftOut.single', { count: needsRate, what: rate })
  return i18n.t('chains.leftOut.both', { amount, needs: i18n.t('chains.leftOut.needs', { count: needsRate, n: needsRate }) })
}

/**
 * `3 stocks · 2 held · ฿1,020,000.00 · 41.3%`: parts with nothing to say are dropped (`2 stocks · none held`).
 * The value shows only when a held stock was valued, never the domain's `0.00` for none (G-FR-005).
 */
export function countsText(counts: { count: number; held: number; value: string; valued: boolean; share?: string | null }): string {
  const parts = [
    stocksLabel(counts.count),
    counts.held === 0 ? i18n.t('chains.counts.noneHeld') : i18n.t('chains.counts.held', { n: counts.held }),
  ]
  if (counts.valued) {
    parts.push(thb(counts.value))
    if (counts.share) parts.push(`${counts.share}%`)
  }
  return parts.join(' · ')
}

/** A chain as the rename dialog needs it: its title and every stock the investor has in it, in view or not. */
export type RenameTarget = { key: string; title: string; count: number }

export type RenameDecision =
  | { kind: 'invalid' }
  | { kind: 'unchanged' }
  | { kind: 'rename'; to: string }
  | { kind: 'merge'; to: string; other: RenameTarget }

/**
 * What submitting `typed` does (FR-009, FR-010). A name with the same key as the chain itself is a
 * plain rename (a case-only change counts as a change); another chain's key asks for a merge first.
 */
export function decideRename(typed: string, chain: RenameTarget, all: ReadonlyMap<string, RenameTarget>): RenameDecision {
  const to = typed.trim()
  if (!ChainRename.safeParse({ from: chain.title, to, merge: false }).success) return { kind: 'invalid' }
  if (to === chain.title) return { kind: 'unchanged' }
  const key = chainKey(to)
  const other = key === chain.key ? undefined : all.get(key)
  return other ? { kind: 'merge', to, other } : { kind: 'rename', to }
}

import { i18n } from '@/i18n/i18n'
import type { StockFilters } from './use-stock-filters'

/** The search box's id, so a page can move focus to it (Clear all on the no-match card). */
export const SEARCH_ID = 'stock-search'

/** `3 stocks`, `1,248 stocks`: the count with the noun in the right number, for any language. */
export const stocksLabel = (count: number): string =>
  i18n.t('filters.stockCount', { count, n: count.toLocaleString('en-US') })

/** "3 of 42 stocks" while filtered, "42 stocks" otherwise. */
export function resultText(filters: StockFilters, suffix = ''): string {
  const { shown, total, deferredActive } = filters
  const stocks = stocksLabel(total)
  return deferredActive
    ? i18n.t('filters.result.filtered', { shown: shown.length, stocks, suffix })
    : i18n.t('filters.result.all', { stocks, suffix })
}


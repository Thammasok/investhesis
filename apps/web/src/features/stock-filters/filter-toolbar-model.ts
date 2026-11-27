import { countLabel } from '@/features/stocks/format'
import type { StockFilters } from './use-stock-filters'

/** The search box's id, so a page can move focus to it (Clear all on the no-match card). */
export const SEARCH_ID = 'stock-search'

/** "3 of 42 stocks" while filtered, "42 stocks" otherwise. */
export function resultText(filters: StockFilters, suffix = ''): string {
  const { shown, total, deferredActive } = filters
  return deferredActive ? `${shown.length} of ${countLabel(total, 'stock')}${suffix}` : `${countLabel(total, 'stock')}${suffix}`
}


import { applyStockFilters, filterOptions, type FilterableStock } from '@investhesis/domain'
import { useMemo } from 'react'
import { useFilterState, type FilterStateOptions } from './use-filter-state'

/**
 * The filter state of a page plus what it shows: `shown` is the stocks that match (rendered from the
 * deferred state), `options` the per-filter values and counts over the page's base set, not over the
 * result (FR-004).
 */
export function useStockFilters<T extends FilterableStock>(stocks: readonly T[], stateOptions?: FilterStateOptions) {
  const filter = useFilterState(stateOptions)
  const options = useMemo(() => filterOptions(stocks), [stocks])
  const shown = useMemo(() => applyStockFilters(stocks, filter.deferredState), [stocks, filter.deferredState])
  const activeCount = useMemo(
    () => [...filter.state.picks.values()].filter((v) => v.size > 0).length,
    [filter.state],
  )
  const deferredActive =
    filter.deferredState.q.trim() !== '' || [...filter.deferredState.picks.values()].some((v) => v.size > 0)
  return { ...filter, options, shown, total: stocks.length, activeCount, deferredActive }
}

export type StockFilters = ReturnType<typeof useStockFilters>

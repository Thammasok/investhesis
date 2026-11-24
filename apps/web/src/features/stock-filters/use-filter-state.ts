import type { FilterState } from '@investhesis/domain'
import { useCallback, useDeferredValue, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { nextSort, type SortColumn, type SortState } from '@/features/stocks/sort-stocks'
import { filterSearch, readFilters } from './filter-address'

/**
 * Search, filters and sort of a stocks table, kept in the address (ADR-003). Writes use `replace`, so
 * a keystroke or a pick adds no history entry and Back means "previous page". `state` is current;
 * `deferredState` is what the table renders, so typing stays responsive (NFR-001).
 */
export function useFilterState() {
  const [params, setParams] = useSearchParams()
  const view = useMemo(() => readFilters(params), [params])
  const deferredState = useDeferredValue(view.state)

  /** Applies a change to the latest address, not to a render's copy, so quick successive changes both land. */
  const update = useCallback(
    (change: (current: { state: FilterState; sort: SortState }) => { state: FilterState; sort: SortState }) =>
      setParams(
        (previous) => {
          const current = readFilters(previous)
          const next = change({ state: current.state, sort: current.sort })
          return new URLSearchParams(filterSearch(next.state, next.sort))
        },
        { replace: true },
      ),
    [setParams],
  )

  const setState = useCallback((state: FilterState) => update((c) => ({ ...c, state })), [update])
  const toggleSort = useCallback(
    (column: SortColumn) => update((c) => ({ ...c, sort: nextSort(c.sort, column) })),
    [update],
  )

  return { state: view.state, deferredState, sort: view.sort, notes: view.notes, setState, toggleSort }
}

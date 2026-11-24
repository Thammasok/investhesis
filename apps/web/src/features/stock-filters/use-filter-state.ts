import type { FilterKey, FilterState } from '@investhesis/domain'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { nextSort, type SortColumn, type SortState } from '@/features/stocks/sort-stocks'
import { filterSearch, readFilters } from './filter-address'

type View = { state: FilterState; sort: SortState }

/**
 * Search, filters and sort of a stocks table, kept in the address (ADR-003). Writes use `replace`, so
 * a keystroke or a pick adds no history entry and Back means "previous page". `state` is current;
 * `deferredState` is what the table renders, so typing stays responsive (NFR-001).
 */
export function useFilterState() {
  const [params, setParams] = useSearchParams()
  const view = useMemo(() => readFilters(params), [params])
  const deferredState = useDeferredValue(view.state)

  // Writes that were made but have not reached the address yet, oldest first. React Router does not queue
  // `setSearchParams` updates, so a second write before the first has rendered would start from a stale
  // address and undo it; each write starts from the last one in flight instead.
  const inFlight = useRef<string[]>([])
  const current = params.toString()
  useEffect(() => {
    const at = inFlight.current.indexOf(current)
    // The address caught up with a write (drop it and the older ones), or changed from outside (drop all).
    inFlight.current = at >= 0 ? inFlight.current.slice(at + 1) : []
  }, [current])

  /** Applies a change on top of the newest address, written or in flight, so quick successive changes all land. */
  const update = useCallback(
    (change: (current: View) => View) => {
      const base = readFilters(new URLSearchParams(inFlight.current.at(-1) ?? current))
      const next = change({ state: base.state, sort: base.sort })
      const search = new URLSearchParams(filterSearch(next.state, next.sort))
      inFlight.current.push(search.toString())
      setParams(search, { replace: true })
    },
    [current, setParams],
  )

  const setQuery = useCallback((q: string) => update((c) => ({ ...c, state: { ...c.state, q } })), [update])
  const setPicks = useCallback(
    (key: FilterKey, picked: ReadonlySet<string | null> | null) =>
      update((c) => {
        const picks = new Map(c.state.picks)
        if (picked && picked.size > 0) picks.set(key, picked)
        else picks.delete(key)
        return { ...c, state: { ...c.state, picks } }
      }),
    [update],
  )
  /** Adds or removes one value of a filter on the latest address, so two quick clicks both count. */
  const togglePick = useCallback(
    (key: FilterKey, value: string | null) =>
      update((c) => {
        const picks = new Map(c.state.picks)
        const next = new Set(picks.get(key) ?? [])
        if (next.has(value)) next.delete(value)
        else next.add(value)
        if (next.size > 0) picks.set(key, next)
        else picks.delete(key)
        return { ...c, state: { ...c.state, picks } }
      }),
    [update],
  )
  /** Clears every filter; the search stays unless `includingSearch`. */
  const clearFilters = useCallback(
    (includingSearch = false) =>
      update((c) => ({ ...c, state: { q: includingSearch ? '' : c.state.q, picks: new Map() } })),
    [update],
  )
  const toggleSort = useCallback(
    (column: SortColumn) => update((c) => ({ ...c, sort: nextSort(c.sort, column) })),
    [update],
  )

  return {
    state: view.state,
    deferredState,
    sort: view.sort,
    notes: view.notes,
    setQuery,
    setPicks,
    togglePick,
    clearFilters,
    toggleSort,
  }
}

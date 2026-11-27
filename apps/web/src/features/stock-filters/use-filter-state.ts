import type { FilterKey, FilterState } from '@investhesis/domain'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { getLanguage } from '@/i18n/language'
import { nextSort, type SortColumn, type SortState } from '@/features/stocks/sort-stocks'
import { filterPairs, readFilters } from './filter-address'

type View = { state: FilterState; sort: SortState }

export type FilterStateOptions = {
  /** Other parameters of the page to carry along, written first and in this order (`/concentration`: scope, lens, measure). */
  keep?: readonly string[]
  /** Whether the page sorts (the stocks tables) or not (`/concentration`). Default true. */
  sort?: boolean
}

const NO_KEEP: readonly string[] = []

/**
 * Search, filters and sort of a stocks table, kept in the address (ADR-003). Writes use `replace`, so
 * a keystroke or a pick adds no history entry and Back means "previous page". `state` is current;
 * `deferredState` is what the table renders, so typing stays responsive (NFR-001).
 */
export function useFilterState({ keep = NO_KEEP, sort: withSort = true }: FilterStateOptions = {}) {
  useTranslation() // the notes are worded in the current language
  const lang = getLanguage()
  const [params, setParams] = useSearchParams()
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => readFilters(params, { sort: withSort }), [params, withSort, lang])
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
  const write = useCallback(
    (
      change: (current: View, kept: Map<string, string>) => { view: View; kept: Map<string, string> },
      immediate = false,
    ) => {
      const base = new URLSearchParams(inFlight.current.at(-1) ?? current)
      const read = readFilters(base, { sort: withSort })
      const kept = new Map(keep.flatMap((name) => (base.has(name) ? [[name, base.get(name) as string] as const] : [])))
      const next = change({ state: read.state, sort: read.sort }, kept)
      const pairs: [string, string][] = [
        ...keep.flatMap((name) => (next.kept.has(name) ? [[name, next.kept.get(name) as string] as [string, string]] : [])),
        ...filterPairs(next.view.state, withSort ? next.view.sort : undefined),
      ]
      const search = new URLSearchParams(pairs)
      inFlight.current.push(search.toString())
      // A click shows its result at once (a checkbox must flip when clicked); typing must not, or the box and
      // the address would update inside one input event.
      setParams(search, { replace: true, flushSync: immediate })
    },
    [current, keep, setParams, withSort],
  )
  const update = useCallback(
    (change: (current: View) => View, immediate = false) => write((c, kept) => ({ view: change(c), kept }), immediate),
    [write],
  )

  const setQuery = useCallback((q: string) => update((c) => ({ ...c, state: { ...c.state, q } })), [update])
  const setPicks = useCallback(
    (key: FilterKey, picked: ReadonlySet<string | null> | null) =>
      update((c) => {
        const picks = new Map(c.state.picks)
        if (picked && picked.size > 0) picks.set(key, picked)
        else picks.delete(key)
        return { ...c, state: { ...c.state, picks } }
      }, true),
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
      }, true),
    [update],
  )
  /** Clears every filter; the search stays unless `includingSearch`. */
  const clearFilters = useCallback(
    (includingSearch = false) =>
      update((c) => ({ ...c, state: { q: includingSearch ? '' : c.state.q, picks: new Map() } }), true),
    [update],
  )
  const toggleSort = useCallback(
    (column: SortColumn) => update((c) => ({ ...c, sort: nextSort(c.sort, column) }), true),
    [update],
  )

  return {
    state: view.state,
    deferredState,
    sort: view.sort,
    notes: view.notes,
    /** Sets the kept parameters (scope, lens, measure) and leaves the filters as they are; `null` removes one. */
    setKept: (next: Record<string, string | null>) =>
      write((c, kept) => {
        const merged = new Map(kept)
        for (const [name, value] of Object.entries(next)) {
          if (value === null) merged.delete(name)
          else merged.set(name, value)
        }
        return { view: c, kept: merged }
      }, true),
    setQuery,
    setPicks,
    togglePick,
    clearFilters,
    toggleSort,
  }
}

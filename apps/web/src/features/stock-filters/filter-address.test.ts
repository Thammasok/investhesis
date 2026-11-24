import type { FilterKey, FilterState } from '@investhesis/domain'
import { describe, expect, it } from 'vitest'
import { filterSearch, readFilters } from './filter-address'

const picks = (entries: Partial<Record<FilterKey, (string | null)[]>>): FilterState['picks'] =>
  new Map(Object.entries(entries).map(([k, v]) => [k as FilterKey, new Set(v)]))
const asObject = (state: FilterState) =>
  Object.fromEntries([...state.picks].map(([k, v]) => [k, [...v]]))

describe('readFilters', () => {
  it('TC-U-580: reads filters, Not set and the canonical spelling', () => {
    const view = readFilters(new URLSearchParams('?q=ptt&market=th&economicCycle=Cyclical&economicCycle=&themes=ai'))
    expect(view.state.q).toBe('ptt')
    expect(asObject(view.state)).toEqual({ market: ['TH'], economicCycle: ['Cyclical', null], themes: ['ai'] })
    expect(view.notes).toEqual([])
  })

  it('TC-U-581: bad parts are dropped with one note each; unknown names are ignored silently', () => {
    const view = readFilters(new URLSearchParams('?market=Bitcoin&sort=price&q=a&q=b&utm_source=mail'))
    expect(view.state.picks.size).toBe(0)
    expect(view.sort).toEqual({ column: 'ticker', direction: 'asc' })
    expect(view.state.q).toBe('')
    expect(view.notes).toHaveLength(3)
    expect(view.notes.join(' ')).not.toContain('utm_source')
    expect(view.notes).toContain('"Bitcoin" isn\'t a Market value, so that filter was left out.')
  })

  it('TC-U-585: a good value next to a bad one keeps the good one; Not set only where allowed', () => {
    const view = readFilters(new URLSearchParams('?market=TH&market=Bitcoin&held=&exchange=SET&held=maybe'))
    expect(asObject(view.state)).toEqual({ market: ['TH'], exchange: ['SET'] })
    expect(view.notes).toHaveLength(3)
  })

  it('TC-U-586: None is an ordinary value, an empty value is Not set', () => {
    const view = readFilters(new URLSearchParams('?valueChainPosition=none&valueChain='))
    expect(asObject(view.state)).toEqual({ valueChainPosition: ['None'], valueChain: [null] })
  })

  it('TC-U-587: sort and dir, a repeated sort, a bad direction, a direction alone', () => {
    expect(readFilters(new URLSearchParams('?sort=held&dir=desc')).sort).toEqual({ column: 'held', direction: 'desc' })
    expect(readFilters(new URLSearchParams('?sort=name')).sort).toEqual({ column: 'name', direction: 'asc' })
    expect(readFilters(new URLSearchParams('?dir=desc')).sort).toEqual({ column: 'ticker', direction: 'desc' })
    const repeated = readFilters(new URLSearchParams('?sort=name&sort=market&dir=up'))
    expect(repeated.sort).toEqual({ column: 'ticker', direction: 'asc' })
    expect(repeated.notes).toHaveLength(2)
  })

  it('TC-U-588: the search is trimmed', () => {
    expect(readFilters(new URLSearchParams('?q=%20%20ptt%20')).state.q).toBe('ptt')
  })
})

describe('filterSearch', () => {
  it('TC-U-582: writes the canonical address', () => {
    const state: FilterState = {
      q: 'ptt',
      picks: picks({ economicCycle: ['Defensive', null, 'Cyclical'], market: ['TH'] }),
    }
    expect(filterSearch(state, { column: 'held', direction: 'desc' })).toBe(
      '?q=ptt&market=TH&economicCycle=Cyclical&economicCycle=Defensive&economicCycle=&sort=held&dir=desc',
    )
  })

  it('TC-U-589: the default sort is not written and an empty view is bare', () => {
    expect(filterSearch({ q: '', picks: new Map() })).toBe('')
    expect(filterSearch({ q: '  ', picks: picks({ market: [] }) }, { column: 'ticker', direction: 'asc' })).toBe('')
    expect(filterSearch({ q: '', picks: new Map() }, { column: 'name', direction: 'asc' })).toBe('?sort=name')
    expect(filterSearch({ q: '', picks: new Map() }, { column: 'ticker', direction: 'desc' })).toBe('?dir=desc')
  })

  it('TC-U-590: free-text values sort, Not set last', () => {
    const state: FilterState = { q: '', picks: picks({ themes: [null, 'EV', 'AI'] }) }
    expect(filterSearch(state)).toBe('?themes=AI&themes=EV&themes=')
  })

  it('TC-U-583: a state survives the round trip, with no notes', () => {
    const state: FilterState = {
      q: 'ptt',
      picks: picks({ market: ['TH'], economicCycle: ['Cyclical', null], themes: ['ai'], indexMembership: ['S&P 500'] }),
    }
    const sort = { column: 'sector', direction: 'desc' } as const
    const back = readFilters(new URLSearchParams(filterSearch(state, sort)))
    expect(back.notes).toEqual([])
    expect(back.sort).toEqual(sort)
    expect(back.state.q).toBe('ptt')
    expect(asObject(back.state)).toEqual(asObject(state))
  })

  it('TC-U-584: Thai search text survives the address', () => {
    const search = filterSearch({ q: 'ปตท.', picks: new Map() })
    expect(search).toContain('%E0%B8')
    expect(readFilters(new URLSearchParams(search)).state.q).toBe('ปตท.')
  })
})

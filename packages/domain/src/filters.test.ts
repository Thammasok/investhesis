import { describe, expect, it } from 'vitest'
import { CONCENTRATION_LENSES } from './concentration.ts'
import {
  STOCK_FILTERS,
  applyStockFilters,
  filterOptions,
  type FilterKey,
  type FilterState,
  type FilterableStock,
} from './filters.ts'

let n = 0
const stock = (over: Partial<FilterableStock> & { ticker: string }): FilterableStock => ({
  id: `id-${++n}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  market: 'TH',
  exchange: 'SET',
  name: over.ticker,
  gicsSector: null,
  setIndustryGroup: null,
  valueChain: null,
  valueChainPosition: null,
  size: null,
  style: null,
  economicCycle: null,
  lynchType: null,
  lifeCycle: null,
  customers: [],
  revenueTypes: [],
  moat: null,
  themes: [],
  volatility: null,
  indexMembership: [],
  holding: null,
  ...over,
})

const state = (q: string, picks: Partial<Record<FilterKey, (string | null)[]>> = {}): FilterState => ({
  q,
  picks: new Map(Object.entries(picks).map(([k, v]) => [k as FilterKey, new Set(v)])),
})
const tickers = (rows: readonly FilterableStock[]) => rows.map((s) => s.ticker)

describe('applyStockFilters', () => {
  it('TC-U-500: search matches ticker, name and theme, ignoring case and spaces', () => {
    const stocks = [
      stock({ ticker: 'PTT', name: 'PTT Public Company Limited' }),
      stock({ ticker: 'NVDA', market: 'US', exchange: 'NASDAQ', themes: ['AI'] }),
      stock({ ticker: 'KBANK' }),
    ]
    expect(["  ptt ", 'ai', 'public'].map((q) => tickers(applyStockFilters(stocks, state(q))))).toEqual([
      ['PTT'],
      ['NVDA'],
      ['PTT'],
    ])
  })

  it('TC-U-501: Thai text is matched as typed', () => {
    const stocks = [
      stock({ ticker: 'PTTEP', name: 'บริษัท ปตท. สำรวจและผลิตปิโตรเลียม จำกัด (มหาชน)' }),
      stock({ ticker: 'KBANK' }),
    ]
    expect(tickers(applyStockFilters(stocks, state('ปตท.')))).toEqual(['PTTEP'])
  })

  it('TC-U-502: OR within a filter, AND across filters', () => {
    const stocks = [
      stock({ ticker: 'A', economicCycle: 'Cyclical' }),
      stock({ ticker: 'B', economicCycle: 'Defensive' }),
      stock({ ticker: 'C', market: 'US', exchange: 'NYSE', economicCycle: 'Cyclical' }),
    ]
    const out = applyStockFilters(stocks, state('', { market: ['TH'], economicCycle: ['Cyclical', 'Defensive'] }))
    expect(tickers(out)).toEqual(['A', 'B'])
  })

  it('TC-U-503: Not set on a single-value field, and None is an ordinary value', () => {
    const stocks = [
      stock({ ticker: 'A', valueChainPosition: null }),
      stock({ ticker: 'B', valueChainPosition: 'None' }),
      stock({ ticker: 'C', valueChainPosition: 'Upstream' }),
    ]
    expect(tickers(applyStockFilters(stocks, state('', { valueChainPosition: [null] })))).toEqual(['A'])
    expect(tickers(applyStockFilters(stocks, state('', { valueChainPosition: ['None'] })))).toEqual(['B'])
  })

  it('TC-U-504: multi-value fields match any picked value, Not set matches an empty list', () => {
    const stocks = [
      stock({ ticker: 'A', themes: ['AI', 'EV'] }),
      stock({ ticker: 'B', themes: [] }),
      stock({ ticker: 'C', themes: ['GLP-1'] }),
    ]
    expect(tickers(applyStockFilters(stocks, state('', { themes: ['EV', 'GLP-1'] })))).toEqual(['A', 'C'])
    expect(tickers(applyStockFilters(stocks, state('', { themes: [null] })))).toEqual(['B'])
    expect(tickers(applyStockFilters(stocks, state('', { themes: ['ev'] })))).toEqual(['A'])
    expect(tickers(applyStockFilters(stocks, state('', { themes: ['EV', null] })))).toEqual(['A', 'B'])
  })

  it('TC-U-505: held filter', () => {
    const stocks = [
      stock({ ticker: 'A', holding: { shares: '10.0000', averageCost: '5.0000', costCurrency: 'THB' } }),
      stock({ ticker: 'B', holding: { shares: null, averageCost: null, costCurrency: 'THB' } }),
      stock({ ticker: 'C', holding: null }),
    ]
    expect(tickers(applyStockFilters(stocks, state('', { held: ['yes'] })))).toEqual(['A', 'B'])
    expect(tickers(applyStockFilters(stocks, state('', { held: ['no'] })))).toEqual(['C'])
    expect(tickers(applyStockFilters(stocks, state('', { held: ['yes', 'no'] })))).toEqual(['A', 'B', 'C'])
  })

  it('TC-U-506: empty state keeps every stock in input order, as a new array', () => {
    const stocks = [stock({ ticker: 'C' }), stock({ ticker: 'A' }), stock({ ticker: 'B' })]
    const out = applyStockFilters(stocks, state('', { market: [] }))
    expect(tickers(out)).toEqual(['C', 'A', 'B'])
    expect(out).not.toBe(stocks)
    expect(tickers(stocks)).toEqual(['C', 'A', 'B'])
  })

  it('TC-U-510: exchange, index membership and free-text value chain filters', () => {
    const stocks = [
      stock({ ticker: 'A', exchange: 'SET', indexMembership: ['SET50'], valueChain: 'Oil and gas' }),
      stock({ ticker: 'B', exchange: 'mai', indexMembership: [], valueChain: 'oil AND gas' }),
      stock({ ticker: 'C', market: 'US', exchange: 'NYSE', indexMembership: ['S&P 500'] }),
    ]
    expect(tickers(applyStockFilters(stocks, state('', { exchange: ['mai'] })))).toEqual(['B'])
    expect(tickers(applyStockFilters(stocks, state('', { indexMembership: ['SET50', null] })))).toEqual(['A', 'B'])
    expect(tickers(applyStockFilters(stocks, state('', { valueChain: ['OIL AND GAS'] })))).toEqual(['A', 'B'])
    expect(tickers(applyStockFilters(stocks, state('', { valueChain: [null] })))).toEqual(['C'])
  })

  it('TC-U-511: search and filters combine', () => {
    const stocks = [
      stock({ ticker: 'PTT', economicCycle: 'Cyclical' }),
      stock({ ticker: 'PTTEP', economicCycle: 'Defensive' }),
    ]
    expect(tickers(applyStockFilters(stocks, state('ptt', { economicCycle: ['Cyclical'] })))).toEqual(['PTT'])
  })

  it('TC-U-512: 200 stocks with a search and 4 active filters run in under 10 ms', () => {
    const stocks = Array.from({ length: 200 }, (_, i) =>
      stock({
        ticker: `T${i}`,
        market: i % 2 ? 'US' : 'TH',
        exchange: i % 2 ? 'NYSE' : 'SET',
        economicCycle: ['Cyclical', 'Defensive', 'Sensitive'][i % 3] ?? null,
        themes: [`theme${i % 7}`, `x${i % 5}`],
        holding: i % 4 === 0 ? { shares: '1.0000', averageCost: '1.0000', costCurrency: 'THB' } : null,
      }),
    )
    const s = state('t1', {
      market: ['TH', 'US'],
      economicCycle: ['Cyclical', 'Defensive'],
      held: ['yes', 'no'],
      themes: ['theme1', 'theme2', 'x3'],
    })
    applyStockFilters(stocks, s) // warm up
    const t0 = performance.now()
    applyStockFilters(stocks, s)
    expect(performance.now() - t0).toBeLessThan(10)
  })
})

describe('filterOptions', () => {
  it('TC-U-507: counts vocabulary values, zeros and Not set in vocabulary order', () => {
    const stocks = [
      stock({ ticker: 'A', economicCycle: 'Cyclical' }),
      stock({ ticker: 'B', economicCycle: 'Cyclical' }),
      stock({ ticker: 'C', economicCycle: null }),
    ]
    expect(filterOptions(stocks).economicCycle.map((o) => [o.value, o.count])).toEqual([
      ['Cyclical', 2],
      ['Sensitive', 0],
      ['Defensive', 0],
      [null, 1],
    ])
  })

  it('TC-U-508: free-text options merge case-insensitively, keep the first spelling and sort', () => {
    const stocks = [
      stock({ ticker: 'A', themes: ['AI'] }),
      stock({ ticker: 'B', themes: ['ai', 'EV'] }),
      stock({ ticker: 'C', themes: ['Dividend'] }),
    ]
    expect(filterOptions(stocks).themes.map((o) => [o.value, o.count])).toEqual([
      ['AI', 2],
      ['Dividend', 1],
      ['EV', 1],
      [null, 0],
    ])
  })

  it('TC-U-513: market, exchange and held have no Not set option; a stock counts once per value', () => {
    const stocks = [
      stock({ ticker: 'A', themes: ['AI', 'ai'], holding: { shares: null, averageCost: null, costCurrency: 'THB' } }),
      stock({ ticker: 'B', market: 'US', exchange: 'NYSE' }),
    ]
    const o = filterOptions(stocks)
    expect(o.market.map((x) => [x.value, x.count])).toEqual([['US', 1], ['TH', 1]])
    expect(o.held.map((x) => [x.value, x.count])).toEqual([['yes', 1], ['no', 1]])
    expect(o.exchange.some((x) => x.value === null)).toBe(false)
    expect(o.themes.find((x) => x.value === 'AI')?.count).toBe(1)
  })

  it('TC-U-514: no stocks gives zero counts and an empty free-text list with only Not set', () => {
    const o = filterOptions([])
    expect(o.themes).toEqual([{ value: null, count: 0 }])
    expect(o.market.every((x) => x.count === 0)).toBe(true)
  })
})

describe('STOCK_FILTERS', () => {
  it('TC-U-509: order and labels', () => {
    expect(STOCK_FILTERS.map((f) => f.key)).toEqual([
      'market',
      'held',
      'exchange',
      'gicsSector',
      'setIndustryGroup',
      'valueChainPosition',
      'valueChain',
      'size',
      'style',
      'economicCycle',
      'lynchType',
      'lifeCycle',
      'customers',
      'revenueTypes',
      'moat',
      'themes',
      'volatility',
      'indexMembership',
    ])
    expect(STOCK_FILTERS.find((f) => f.key === 'gicsSector')?.label).toBe('Sector (GICS)')
    expect(STOCK_FILTERS.find((f) => f.key === 'held')?.label).toBe('Held')
  })

  it('TC-U-515: lens getters are the concentration lenses (no second copy)', () => {
    for (const lens of CONCENTRATION_LENSES.filter((l) => l.key !== 'market')) {
      const f = STOCK_FILTERS.find((x) => x.key === lens.key)
      expect(f?.get).toBe(lens.get)
      expect(f?.kind).toBe(lens.kind)
    }
  })
})

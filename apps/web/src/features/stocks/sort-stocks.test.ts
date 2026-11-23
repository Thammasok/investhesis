import { describe, expect, it } from 'vitest'
import { makeStock } from '@/test/stock-fixtures'
import { SORTABLE_COLUMNS, sortStocks } from './sort-stocks'

const tickers = (list: { ticker: string }[]) => list.map((s) => s.ticker)

describe('sortStocks', () => {
  const stocks = [
    makeStock({ ticker: 'MSFT', name: 'Microsoft', gicsSector: 'Information Technology' }),
    makeStock({ ticker: 'AAPL', name: 'apple', gicsSector: null }),
    makeStock({ ticker: 'BRK.B', name: 'Apple Hospitality', gicsSector: 'Financials' }),
    makeStock({ ticker: 'pttep', name: 'บมจ. ปตท. สำรวจ', market: 'TH', gicsSector: 'Energy' }),
  ]

  it('TC-U-133: sorts by ticker case-insensitively in both directions', () => {
    expect(tickers(sortStocks(stocks, 'ticker', 'asc'))).toEqual(['AAPL', 'BRK.B', 'MSFT', 'pttep'])
    expect(tickers(sortStocks(stocks, 'ticker', 'desc'))).toEqual(['pttep', 'MSFT', 'BRK.B', 'AAPL'])
  })

  it('TC-U-133: sorts names case-insensitively and deterministically, Thai after Latin', () => {
    const asc = tickers(sortStocks(stocks, 'name', 'asc'))
    expect(asc).toEqual(['AAPL', 'BRK.B', 'MSFT', 'pttep'])
    expect(tickers(sortStocks(stocks, 'name', 'desc'))).toEqual([...asc].reverse())
  })

  it('TC-U-133: an unset sector sorts last in both directions', () => {
    expect(tickers(sortStocks(stocks, 'sector', 'asc'))).toEqual(['pttep', 'BRK.B', 'MSFT', 'AAPL'])
    expect(tickers(sortStocks(stocks, 'sector', 'desc'))).toEqual(['MSFT', 'BRK.B', 'pttep', 'AAPL'])
  })

  it('TC-U-133: sorts by market with the ticker as the tie-breaker, stably', () => {
    expect(tickers(sortStocks(stocks, 'market', 'asc'))).toEqual(['pttep', 'AAPL', 'BRK.B', 'MSFT'])
  })

  it('TC-U-133: does not mutate its input', () => {
    const copy = [...stocks]
    sortStocks(stocks, 'ticker', 'desc')
    expect(stocks).toEqual(copy)
  })

  it('TC-U-133: only ticker, name, market, sector and held are sortable', () => {
    expect(SORTABLE_COLUMNS).toEqual(['ticker', 'name', 'market', 'sector', 'held'])
  })

  it('TC-C-411: held sort is held first, shares descending (exact), held without shares, then not held; ties by ticker', () => {
    const h = (ticker: string, shares: string | null) => makeStock({ ticker, holding: { shares, averageCost: null, costCurrency: 'USD' } })
    const list = [
      makeStock({ ticker: 'AAPL' }),
      h('PTTEP', null),
      h('TSLA', '9.0000'),
      h('MSFT', '10.0000'),
      h('BIG2', '99999999999999.9998'),
      h('NVDA', '120.5000'),
      h('BIG1', '99999999999999.9999'),
      h('ZZZ', '10.0000'),
    ]
    expect(tickers(sortStocks(list, 'held', 'desc'))).toEqual(['BIG1', 'BIG2', 'NVDA', 'MSFT', 'ZZZ', 'TSLA', 'PTTEP', 'AAPL'])
    expect(tickers(sortStocks(list, 'held', 'asc'))).toEqual(['AAPL', 'PTTEP', 'TSLA', 'MSFT', 'ZZZ', 'NVDA', 'BIG2', 'BIG1'])
  })
})

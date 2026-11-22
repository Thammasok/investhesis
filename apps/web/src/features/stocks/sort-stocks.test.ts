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

  it('TC-U-133: only ticker, name, market and sector are sortable', () => {
    expect(SORTABLE_COLUMNS).toEqual(['ticker', 'name', 'market', 'sector'])
  })
})

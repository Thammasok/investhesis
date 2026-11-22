import { describe, expect, it } from 'vitest'
import { countLabel, identityLine } from './format'
import { makeStock } from '@/test/stock-fixtures'

describe('format helpers', () => {
  it.each([
    [0, 'stock', '0 stocks'],
    [1, 'stock', '1 stock'],
    [2, 'stock', '2 stocks'],
    [1248, 'row', '1,248 rows'],
    [1, 'list', '1 list'],
  ])('TC-U-134: countLabel(%i, %s) is %s', (n, noun, expected) => {
    expect(countLabel(n, noun)).toBe(expected)
  })

  it('TC-U-134: identityLine joins market, exchange, currency and indexes', () => {
    const nvda = makeStock({ indexMembership: ['S&P 500', 'Nasdaq-100'] })
    expect(identityLine(nvda)).toBe('US · NASDAQ · USD · S&P 500, Nasdaq-100')
    expect(identityLine(makeStock({ market: 'TH', exchange: 'SET', currency: 'THB', indexMembership: ['SET50'] }))).toBe(
      'TH · SET · THB · SET50',
    )
    expect(identityLine(makeStock())).toBe('US · NASDAQ · USD')
  })
})

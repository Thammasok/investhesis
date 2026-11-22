import { describe, expect, it } from 'vitest'
import {
  ALL_EXCHANGES,
  ALL_INDEXES,
  CURRENCY_BY_MARKET,
  EXCHANGES_BY_MARKET,
  INDEXES_BY_MARKET,
  LENS_VALUES,
  MARKETS,
  TICKER_PATTERN,
  charLength,
  normaliseTicker,
} from './vocabulary.ts'

const valid = (raw: string) => TICKER_PATTERN.test(normaliseTicker(raw))

describe('vocabulary', () => {
  it.each([
    [' brk.b ', 'BRK.B', true],
    ['pttep', 'PTTEP', true],
    ['ADVANC-R', 'ADVANC-R', true],
    ['.ABC', '.ABC', false],
    ['ABCDEFGHIJKLM', 'ABCDEFGHIJKLM', false],
    ['A B', 'A B', false],
  ])('TC-U-010: ticker %j normalises to %j (valid: %s)', (raw, normalised, ok) => {
    expect(normaliseTicker(raw)).toBe(normalised)
    expect(valid(raw)).toBe(ok)
  })

  it.each([
    ['A', true],
    ['ABCDEFGHIJKL', true],
    ['ABCDEFGHIJKLM', false],
    ['A.B-C', true],
    ['-ABC', false],
    ['.ABC', false],
    ['AB_C', false],
    ['ABC/D', false],
    ['АAPL', false],
    ['ＡＡＰＬ', false],
    [' brk.b ', true],
    ['AAPL\n', true],
    ['0700', true],
    ['ß', false],
    ['ſ', false],
    ['', false],
  ])('TC-U-120: ticker %j is valid: %s', (raw, ok) => {
    expect(() => normaliseTicker(raw)).not.toThrow()
    expect(valid(raw)).toBe(ok)
  })

  it('TC-U-120: a trailing newline inside the pattern is not tolerated', () => {
    expect(TICKER_PATTERN.test('AAPL\n')).toBe(false)
  })

  it('TC-U-120: charLength counts code points', () => {
    expect(charLength('😀😀')).toBe(2)
    expect(charLength('ก็')).toBe(2)
    expect(charLength('')).toBe(0)
  })

  it('TC-U-016: market rules cover both markets', () => {
    expect(MARKETS).toEqual(['US', 'TH'])
    expect(EXCHANGES_BY_MARKET).toEqual({ US: ['NYSE', 'NASDAQ'], TH: ['SET', 'mai'] })
    expect(CURRENCY_BY_MARKET).toEqual({ US: 'USD', TH: 'THB' })
    expect(INDEXES_BY_MARKET).toEqual({ US: ['S&P 500', 'Nasdaq-100'], TH: ['SET50', 'SET100'] })
    expect(ALL_EXCHANGES).toHaveLength(4)
    expect(ALL_INDEXES).toHaveLength(4)
  })

  // Spelling copied from requirements FR-003, independently of the implementation.
  const fr003 = {
    gicsSector: 'Communication Services|Consumer Discretionary|Consumer Staples|Energy|Financials|Health Care|Industrials|Information Technology|Materials|Real Estate|Utilities',
    setIndustryGroup: 'Agro & Food Industry|Consumer Products|Financials|Industrials|Property & Construction|Resources|Services|Technology',
    valueChainPosition: 'Upstream|Midstream|Downstream|Integrated|None',
    size: 'Mega|Large|Mid|Small|Micro',
    style: 'Growth|Value|Dividend|Quality',
    economicCycle: 'Cyclical|Sensitive|Defensive',
    lynchType: 'Fast Grower|Stalwart|Slow Grower|Cyclical|Turnaround|Asset Play',
    lifeCycle: 'Growth|Mature|Turnaround|Decline',
    customers: 'B2B|B2C|Government',
    revenueTypes: 'Subscription|Transaction fee|Product sale|Ads|Rent|Interest',
    moat: 'Brand|Network effect|Switching cost|Cost advantage|Efficient scale|Intangibles|Unclear',
    volatility: 'High|Mid|Low',
  }

  it.each(Object.entries(fr003))('TC-U-123: LENS_VALUES.%s equals FR-003 with no duplicates', (key, spelling) => {
    const actual = LENS_VALUES[key as keyof typeof LENS_VALUES]
    expect([...actual]).toEqual(spelling.split('|'))
    expect(new Set(actual).size).toBe(actual.length)
  })

  it('TC-U-123: LENS_VALUES has exactly the FR-003 lens lists', () => {
    expect(Object.keys(LENS_VALUES).sort()).toEqual(Object.keys(fr003).sort())
  })
})

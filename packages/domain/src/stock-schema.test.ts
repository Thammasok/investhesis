import { describe, expect, it } from 'vitest'
import { ListName } from './list-name.ts'
import { StockInput, StockPatch } from './stock-schema.ts'
import { ALL_EXCHANGES, ALL_INDEXES, EXCHANGES_BY_MARKET, INDEXES_BY_MARKET, LENS_VALUES, MARKETS } from './vocabulary.ts'

const us = { market: 'US', exchange: 'NASDAQ', ticker: 'AAPL', name: 'Apple Inc.' }
const th = { market: 'TH', exchange: 'SET', ticker: 'PTT', name: 'PTT' }

const parse = (input: unknown) => StockInput.safeParse(input)
const paths = (input: unknown) => {
  const r = parse(input)
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}
const dataOf = (input: unknown) => {
  const r = parse(input)
  return r.success ? r.data : undefined
}
const patchPaths = (input: unknown) => {
  const r = StockPatch.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('StockInput', () => {
  it('TC-U-011: an exchange from the wrong market fails at exchange', () => {
    expect(paths({ ...th, exchange: 'NASDAQ' })).toEqual(['exchange'])
  })

  it('TC-U-011: TH on SET is valid and its currency is THB', () => {
    const r = parse(th)
    expect(r.success && r.data.currency).toBe('THB')
  })

  it('TC-U-122: only the four own-market exchanges are valid, with currency from the market', () => {
    let valid = 0
    for (const market of MARKETS) {
      for (const exchange of ALL_EXCHANGES) {
        const own = (EXCHANGES_BY_MARKET[market] as readonly string[]).includes(exchange)
        expect(dataOf({ ...us, market, exchange })?.currency).toBe(own ? (market === 'US' ? 'USD' : 'THB') : undefined)
        expect(paths({ ...us, market, exchange })).toEqual(own ? [] : ['exchange'])
        if (own) valid += 1
      }
    }
    expect(valid).toBe(4)
  })

  it('TC-U-122: only the four own-market indexes are valid', () => {
    let valid = 0
    for (const market of MARKETS) {
      const exchange = EXCHANGES_BY_MARKET[market][0]
      for (const index of ALL_INDEXES) {
        const own = (INDEXES_BY_MARKET[market] as readonly string[]).includes(index)
        const input = { ...us, market, exchange, indexMembership: [index] }
        expect(paths(input)).toEqual(own ? [] : ['indexMembership'])
        if (own) valid += 1
      }
    }
    expect(valid).toBe(4)
  })

  it('TC-U-122: empty and repeated index lists never crash; repeats collapse', () => {
    const empty = parse({ ...us, indexMembership: [] })
    expect(empty.success && empty.data.indexMembership).toEqual([])
    const repeated = parse({ ...us, indexMembership: ['S&P 500', 'S&P 500'] })
    expect(repeated.success && repeated.data.indexMembership).toEqual(['S&P 500'])
    expect(paths({ ...us, indexMembership: ['Dow'] })).toEqual(['indexMembership.0'])
  })

  it('TC-U-012: a TH SET group without a GICS sector fails at gicsSector', () => {
    expect(paths({ ...th, setIndustryGroup: 'Resources' })).toEqual(['gicsSector'])
  })

  it('TC-U-012: a TH GICS sector without a SET group fails at setIndustryGroup', () => {
    expect(paths({ ...th, gicsSector: 'Energy' })).toEqual(['setIndustryGroup'])
  })

  it('TC-U-012: a TH stock with both sectors is valid, and with neither is valid', () => {
    expect(parse({ ...th, setIndustryGroup: 'Resources', gicsSector: 'Energy' }).success).toBe(true)
    expect(parse(th).success).toBe(true)
  })

  it('TC-U-012: a US stock must not carry a SET group', () => {
    expect(paths({ ...us, setIndustryGroup: 'Services' })).toEqual(['setIndustryGroup'])
  })

  it('TC-U-013: a position other than None needs a chain name', () => {
    expect(paths({ ...us, valueChainPosition: 'Upstream' })).toEqual(['valueChain'])
    expect(parse({ ...us, valueChainPosition: 'None' }).success).toBe(true)
  })

  it('TC-U-013: a chain name alone is valid and a position with a name is valid', () => {
    expect(parse({ ...us, valueChain: 'Oil & Gas' }).success).toBe(true)
    const r = parse({ ...us, valueChain: ' Oil & Gas ', valueChainPosition: 'Upstream' })
    expect(r.success && r.data.valueChain).toBe('Oil & Gas')
  })

  it('TC-U-014: themes are de-duplicated case-insensitively keeping the first spelling', () => {
    const r = parse({ ...us, themes: ['AI', 'ai', ' EV '] })
    expect(r.success && r.data.themes).toEqual(['AI', 'EV'])
  })

  it('TC-U-014: 21 distinct themes fail at themes, 20 pass', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`)
    expect(paths({ ...us, themes: many(21) })).toEqual(['themes'])
    expect(parse({ ...us, themes: many(20) }).success).toBe(true)
    expect(parse({ ...us, themes: [...many(20), 'T0'] }).success).toBe(true)
  })

  it('TC-U-014: a 41-character theme fails at themes.0; an empty theme fails too', () => {
    expect(paths({ ...us, themes: ['x'.repeat(41)] })).toEqual(['themes.0'])
    expect(parse({ ...us, themes: ['x'.repeat(40)] }).success).toBe(true)
    expect(paths({ ...us, themes: ['  '] })).toEqual(['themes.0'])
  })

  it.each([
    ['A', true],
    ['n'.repeat(200), true],
    ['n'.repeat(201), false],
    ['', false],
    ['   ', false],
    ['ก'.repeat(200), true],
    ['😀'.repeat(200), true],
    ['😀'.repeat(201), false],
    ['ก็'.repeat(100), true],
  ])('TC-U-121: name %#', (name, ok) => {
    expect(dataOf({ ...us, name })?.name).toBe(ok ? name.trim() : undefined)
    expect(paths({ ...us, name })).toEqual(ok ? [] : ['name'])
  })

  it('TC-U-121: combining marks are neither normalised nor stripped', () => {
    const name = 'ก็'.repeat(3)
    const r = parse({ ...us, name })
    expect(r.success && [...r.data.name].length).toBe(6)
  })

  it('TC-U-123: StockInput accepts only the canonical spelling of each lens value', () => {
    const fieldOf = (key: string) => (key === 'gicsSector' ? 'gicsSector' : key)
    for (const [key, values] of Object.entries(LENS_VALUES)) {
      const multi = key === 'customers' || key === 'revenueTypes'
      const base = key === 'setIndustryGroup' ? { ...th, gicsSector: 'Energy' } : us
      const build = (v: string) => ({ ...base, [fieldOf(key)]: multi ? [v] : v })
      for (const v of values) {
        if (key === 'valueChainPosition' && v !== 'None') continue
        expect(parse(build(v)).success, `${key}=${v}`).toBe(true)
        const lower = v.toLowerCase()
        expect(parse(build(lower)).success, `${key}=${v} lower`).toBe(lower === v)
      }
    }
  })

  it('TC-U-123: a value from another lens is rejected', () => {
    expect(paths({ ...us, style: 'Cyclical' })).toEqual(['style'])
  })

  it('TC-U-020: omitted and null lenses come out as null or empty lists', () => {
    const r = parse({ ...us, moat: null })
    expect(r.success && r.data).toMatchObject({
      moat: null,
      volatility: null,
      customers: [],
      revenueTypes: [],
      themes: [],
      indexMembership: [],
      gicsSector: null,
    })
  })

  it('TC-U-131: server-owned keys are rejected, never kept', () => {
    for (const extra of [
      { currency: 'EUR' },
      { userId: 'u' },
      { user_id: 'u' },
      { id: 'i' },
      { lensSources: { economicCycle: 'auto' } },
      { createdAt: 'now' },
    ]) {
      const r = parse({ ...us, ...extra })
      expect(r.success).toBe(false)
      expect(paths({ ...us, ...extra })).toEqual(Object.keys(extra))
    }
  })

  it('TC-U-011: required fields are reported as required', () => {
    for (const key of ['ticker', 'market', 'exchange', 'name']) {
      const { [key as keyof typeof us]: _omit, ...rest } = us
      expect(paths(rest)).toContain(key)
    }
  })

  it('TC-U-010: the ticker is normalised and validated inside the schema', () => {
    const r = parse({ ...us, ticker: ' brk.b ' })
    expect(r.success && r.data.ticker).toBe('BRK.B')
    expect(paths({ ...us, ticker: 'A B' })).toEqual(['ticker'])
  })
})

describe('StockPatch', () => {
  it.each([
    [{ ticker: 'X' }, ['ticker']],
    [{ market: 'TH' }, ['market']],
    [{ name: null }, ['name']],
    [{ exchange: null }, ['exchange']],
    [{ id: 'x' }, ['id']],
    [{ lensSources: {} }, ['lensSources']],
  ])('TC-U-130: %j is rejected at %j', (patch, expected) => {
    expect(patchPaths(patch)).toEqual(expected)
  })

  it.each([
    [{ moat: null }],
    [{ themes: [] }],
    [{ customers: [] }],
    [{ valueChainPosition: null, valueChain: null }],
    [{}],
    [{ name: ' New name ', exchange: 'mai' }],
  ])('TC-U-130: %j is accepted', (patch) => {
    expect(StockPatch.safeParse(patch).success).toBe(true)
  })

  it('TC-U-130: an empty patch stays empty and null stays null', () => {
    expect(StockPatch.parse({})).toEqual({})
    expect(StockPatch.parse({ moat: null })).toEqual({ moat: null })
    expect(StockPatch.parse({ name: ' x ' })).toEqual({ name: 'x' })
  })

  it('TC-U-130: lens values in a patch are validated', () => {
    expect(patchPaths({ size: 'Huge' })).toEqual(['size'])
  })
})

describe('ListName', () => {
  it.each([
    ['A', 'A'],
    ['a'.repeat(60), 'a'.repeat(60)],
    ['  Core holdings  ', 'Core holdings'],
    ['หุ้นหลัก', 'หุ้นหลัก'],
    ['ก'.repeat(60), 'ก'.repeat(60)],
    ['Core  holdings', 'Core  holdings'],
  ])('TC-U-129: %j is accepted as %j', (raw, expected) => {
    expect(ListName.parse(raw)).toBe(expected)
  })

  it.each(['a'.repeat(61), '', '   '])('TC-U-129: %j is rejected', (raw) => {
    expect(ListName.safeParse(raw).success).toBe(false)
  })

  it('TC-U-129: a non-string is rejected', () => {
    expect(ListName.safeParse(5).success).toBe(false)
  })
})

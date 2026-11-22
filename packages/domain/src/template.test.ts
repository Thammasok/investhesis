import { describe, expect, it } from 'vitest'
import { StockInput } from './stock-schema.ts'
import { TEMPLATE_COLUMNS, canonicaliseRow, type RowResult } from './template.ts'
import { LENS_VALUES } from './vocabulary.ts'

const minimalUs = { ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', name: 'Apple Inc.' }
const minimalTh = { ticker: 'PTT', market: 'TH', exchange: 'SET', name: 'PTT' }

const okInput = (cells: Record<string, string>) => {
  const r = canonicaliseRow(cells)
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.errors)}`)
  return r.input
}
const errorPaths = (cells: Record<string, string>) => {
  const r: RowResult = canonicaliseRow(cells)
  return r.ok ? [] : r.errors.map((e) => e.path)
}

describe('TEMPLATE_COLUMNS', () => {
  it('TC-U-128: 19 columns in FR-015 order, multi exactly for the list columns', () => {
    expect(TEMPLATE_COLUMNS.map((c) => c.header)).toEqual([
      'ticker',
      'market',
      'exchange',
      'name',
      'index_membership',
      'sector',
      'gics_sector',
      'value_chain',
      'value_chain_position',
      'size',
      'style',
      'economic_cycle',
      'lynch_type',
      'life_cycle',
      'customers',
      'revenue_types',
      'moat',
      'themes',
      'volatility',
    ])
    expect(TEMPLATE_COLUMNS.filter((c) => c.kind === 'multi').map((c) => c.header)).toEqual([
      'index_membership',
      'customers',
      'revenue_types',
      'themes',
    ])
    expect(new Set(TEMPLATE_COLUMNS.map((c) => c.header)).size).toBe(19)
  })

  it('TC-U-128: every field (and thField) is a StockInput key', () => {
    const keys = Object.keys(StockInput.parse(minimalUs))
    const used = TEMPLATE_COLUMNS.flatMap((c) => ('thField' in c ? [c.field, c.thField] : [c.field]))
    expect(used.filter((f) => !keys.includes(f))).toEqual([])
  })
})

describe('canonicaliseRow', () => {
  it('TC-U-017: matches ignoring case and spaces and maps sector by market', () => {
    const r = canonicaliseRow({
      ticker: ' pttep',
      market: 'th',
      exchange: 'set',
      name: 'ปตท.สผ.',
      sector: 'resources',
      gics_sector: 'energy',
      style: ' DIVIDEND ',
      themes: 'Energy; energy ;LNG',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.input).toMatchObject({
      ticker: 'PTTEP',
      market: 'TH',
      exchange: 'SET',
      currency: 'THB',
      setIndustryGroup: 'Resources',
      gicsSector: 'Energy',
      style: 'Dividend',
      themes: ['Energy', 'LNG'],
    })
    expect(r.input.name).toBe('ปตท.สผ.')
  })

  it('TC-U-018: MAI is canonicalised to mai', () => {
    expect(okInput({ ...minimalTh, exchange: 'MAI' }).exchange).toBe('mai')
  })

  it('TC-U-019: every failed field is reported with a message', () => {
    const r = canonicaliseRow({ ticker: '', market: 'JP', exchange: 'SET', name: '', size: 'Huge' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.map((e) => e.path).sort()).toEqual(['market', 'name', 'size', 'ticker'])
    for (const e of r.errors) {
      expect(e.message.length).toBeGreaterThan(0)
      expect(e.column).toBe(e.path)
    }
  })

  it('TC-U-020: empty cells mean not set', () => {
    expect(okInput({ ...minimalUs, moat: '', customers: '', volatility: '  ' })).toMatchObject({
      moat: null,
      customers: [],
      volatility: null,
    })
  })

  it('TC-U-020: a row with only the required cells has every lens unset', () => {
    expect(okInput(minimalUs)).toEqual({
      ...minimalUs,
      currency: 'USD',
      indexMembership: [],
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
    })
  })

  it('TC-U-123: canonicaliseRow accepts canonical, lower, upper and padded spellings of every lens value', () => {
    const column: Record<string, string> = {
      gicsSector: 'sector',
      valueChainPosition: 'value_chain_position',
      lynchType: 'lynch_type',
      lifeCycle: 'life_cycle',
      revenueTypes: 'revenue_types',
      economicCycle: 'economic_cycle',
    }
    for (const [key, values] of Object.entries(LENS_VALUES)) {
      if (key === 'setIndustryGroup') continue
      const header = column[key] ?? key
      for (const v of values) {
        for (const cell of [v, v.toLowerCase(), v.toUpperCase(), `  ${v} `]) {
          const cells: Record<string, string> = { ...minimalUs, [header]: cell }
          if (key === 'valueChainPosition') cells.value_chain = 'Chain'
          const input = okInput(cells) as Record<string, unknown>
          const got = input[key]
          expect(got, `${key}: ${cell}`).toEqual(Array.isArray(got) ? [v] : v)
        }
      }
    }
    for (const v of LENS_VALUES.setIndustryGroup) {
      const input = okInput({ ...minimalTh, sector: v.toUpperCase(), gics_sector: 'energy' })
      expect(input.setIndustryGroup).toBe(v)
    }
  })

  it('TC-U-123: index names match ignoring case; a value from another lens is rejected', () => {
    expect(okInput({ ...minimalUs, index_membership: 's&p 500; NASDAQ-100' }).indexMembership).toEqual([
      'S&P 500',
      'Nasdaq-100',
    ])
    expect(errorPaths({ ...minimalUs, style: 'Cyclical' })).toEqual(['style'])
  })

  it('TC-U-125: multi-value cells', () => {
    expect(okInput({ ...minimalUs, customers: 'b2b; B2C ;' }).customers).toEqual(['B2B', 'B2C'])
    expect(okInput({ ...minimalUs, customers: 'B2B;;B2C' }).customers).toEqual(['B2B', 'B2C'])
    expect(okInput({ ...minimalUs, customers: 'B2B;b2b' }).customers).toEqual(['B2B'])
    expect(errorPaths({ ...minimalUs, customers: 'B2B;Retail' })).toEqual(['customers'])
    expect(okInput({ ...minimalUs, revenue_types: 'Ads;Rent' }).revenueTypes).toEqual(['Ads', 'Rent'])
    expect(okInput({ ...minimalUs, themes: 'AI;ai; EV ' }).themes).toEqual(['AI', 'EV'])
    expect(errorPaths({ ...minimalUs, themes: `ok;${'x'.repeat(41)}` })).toEqual(['themes'])
    expect(errorPaths({ ...minimalUs, themes: Array.from({ length: 21 }, (_, i) => `t${i}`).join(';') })).toEqual([
      'themes',
    ])
    expect(okInput({ ...minimalTh, index_membership: 'SET50;SET100' }).indexMembership).toEqual(['SET50', 'SET100'])
    expect(errorPaths({ ...minimalUs, index_membership: 'SET50' })).toEqual(['indexMembership'])
  })

  it('TC-U-126: sector and gics_sector by market', () => {
    expect(okInput({ ...minimalUs, sector: 'Information Technology' }).gicsSector).toBe('Information Technology')
    expect(errorPaths({ ...minimalUs, sector: 'Resources' })).toEqual(['gicsSector'])
    expect(okInput({ ...minimalUs, gics_sector: 'Garbage', sector: 'Energy' }).gicsSector).toBe('Energy')
    expect(okInput({ ...minimalTh, sector: 'Resources', gics_sector: 'Energy' })).toMatchObject({
      setIndustryGroup: 'Resources',
      gicsSector: 'Energy',
    })
    expect(errorPaths({ ...minimalTh, sector: 'Resources' })).toEqual(['gicsSector'])
    expect(errorPaths({ ...minimalTh, gics_sector: 'Energy' })).toEqual(['setIndustryGroup'])
    expect(errorPaths({ ...minimalTh, sector: 'Information Technology', gics_sector: 'Energy' })).toEqual([
      'setIndustryGroup',
    ])
  })

  it('TC-U-126: error columns point at the file column the investor filled', () => {
    const column = (cells: Record<string, string>) => {
      const r = canonicaliseRow(cells)
      return r.ok ? [] : r.errors.map((e) => e.column)
    }
    expect(column({ ...minimalUs, sector: 'Resources' })).toEqual(['sector'])
    expect(column({ ...minimalTh, sector: 'Resources' })).toEqual(['gics_sector'])
    expect(column({ ...minimalTh, gics_sector: 'Energy' })).toEqual(['sector'])
    expect(column({ ...minimalUs, value_chain_position: 'Upstream' })).toEqual(['value_chain'])
  })

  it('TC-U-126: value chain rules', () => {
    expect(errorPaths({ ...minimalUs, value_chain_position: 'Upstream' })).toEqual(['valueChain'])
    const nameOnly = okInput({ ...minimalUs, value_chain: 'Oil & Gas' })
    expect(nameOnly).toMatchObject({ valueChain: 'Oil & Gas', valueChainPosition: null })
    expect(okInput({ ...minimalUs, value_chain_position: 'none' }).valueChainPosition).toBe('None')
  })

  it('TC-U-127: text is kept byte for byte, only surrounding spaces are trimmed', () => {
    const name = (n: string) => okInput({ ...minimalUs, name: n }).name
    expect(name(' Apple Inc ')).toBe('Apple Inc')
    const nfc = 'ก็ ก่ ก้'.normalize('NFC')
    const nfd = 'ก็ ก่ ก้'.normalize('NFD')
    expect(name(nfc)).toBe(nfc)
    expect(name(nfd)).toBe(nfd)
    expect(name('a‍b')).toBe('a‍b')
    expect(name('Berkshire "B", Inc.')).toBe('Berkshire "B", Inc.')
    expect(name('line1\nline2')).toBe('line1\nline2')
    expect(name('😀')).toBe('😀')
    expect(okInput({ ...minimalUs, ticker: '\taapl\t' }).ticker).toBe('AAPL')
  })

  it('TC-U-131: a server-owned key in the cells is ignored, never carried over', () => {
    const input = okInput({ ...minimalUs, currency: 'EUR', user_id: 'x', id: 'y' })
    expect(input.currency).toBe('USD')
    expect(Object.keys(input)).not.toContain('user_id')
    expect(Object.keys(input)).not.toContain('id')
  })

  it('TC-U-019: required cells missing from the object are reported', () => {
    expect(errorPaths({}).sort()).toEqual(['exchange', 'market', 'name', 'ticker'])
  })

  it('TC-U-019: the same problem is not reported twice', () => {
    expect(errorPaths({ ...minimalUs, customers: 'x;y' })).toEqual(['customers'])
  })
})

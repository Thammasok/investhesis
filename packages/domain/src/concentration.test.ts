import { describe, expect, it } from 'vitest'
import { CONCENTRATION_LENSES, groupConcentration } from './index.ts'
import type { GroupableStock } from './index.ts'

type Holding = NonNullable<GroupableStock['holding']>

const stock = (id: string, over: Partial<GroupableStock> = {}): GroupableStock => ({
  id,
  market: 'US',
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
const held = (shares: string | null, averageCost: string | null, costCurrency = 'THB'): Holding => ({
  shares,
  averageCost,
  costCurrency,
})
const find = (r: ReturnType<typeof groupConcentration>, label: string) => r.groups.find((g) => g.label === label)

describe('CONCENTRATION_LENSES', () => {
  it('TC-U-420: lists the sixteen lenses of FR-006 in order with their kind', () => {
    expect(CONCENTRATION_LENSES.map((l) => l.key)).toEqual([
      'gicsSector', 'setIndustryGroup', 'valueChainPosition', 'valueChain', 'size', 'style',
      'economicCycle', 'lynchType', 'lifeCycle', 'customers', 'revenueTypes', 'moat', 'themes',
      'volatility', 'market', 'indexMembership',
    ])
    expect(CONCENTRATION_LENSES[0]?.label).toBe('Sector (GICS)')
    expect(CONCENTRATION_LENSES.filter((l) => l.kind === 'multi').map((l) => l.key)).toEqual([
      'customers', 'revenueTypes', 'themes', 'indexMembership',
    ])
  })

  it('TC-U-420: every getter reads its own field', () => {
    const s = stock('a', {
      gicsSector: 'Energy', setIndustryGroup: 'sig', valueChain: 'vc', valueChainPosition: 'Upstream',
      size: 'Large', style: 'Growth', economicCycle: 'Cyclical', lynchType: 'Stalwart', lifeCycle: 'Mature',
      customers: ['B2B'], revenueTypes: ['Recurring'], moat: 'Wide', themes: ['AI'], volatility: 'Low',
      market: 'TH', indexMembership: ['SET50'],
    })
    const got = CONCENTRATION_LENSES.map((l) => l.get(s))
    expect(got).toEqual([
      'Energy', 'sig', 'Upstream', 'vc', 'Large', 'Growth', 'Cyclical', 'Stalwart', 'Mature',
      ['B2B'], ['Recurring'], 'Wide', ['AI'], 'Low', 'TH', ['SET50'],
    ])
  })
})

describe('groupConcentration', () => {
  it('TC-U-420: single-value counts, Not set last and never flagged', () => {
    const r = groupConcentration({
      stocks: [
        stock('A', { gicsSector: 'IT' }), stock('B', { gicsSector: 'IT' }),
        stock('C', { gicsSector: 'Energy' }), stock('D'),
      ],
      lens: 'gicsSector', usdThbRate: null, threshold: 40,
    })
    expect(r.groups.map((g) => [g.label, g.count, g.countShare, g.countFlag])).toEqual([
      ['IT', 2, '50.0', true], ['Energy', 1, '25.0', false], ['Not set', 1, '25.0', false],
    ])
    expect(r.groups[2]?.notSet).toBe(true)
    expect(r.multiValue).toBe(false)
  })

  it('TC-U-420: Not set is never flagged even when it is the biggest group', () => {
    const r = groupConcentration({
      stocks: [stock('A'), stock('B'), stock('C', { moat: 'Wide' })],
      lens: 'moat', usdThbRate: null, threshold: 40,
    })
    expect(find(r, 'Not set')).toMatchObject({ count: 2, countFlag: false, valueFlag: false })
    expect(r.groups.at(-1)?.label).toBe('Not set')
  })

  it('TC-U-421: a multi-value lens counts a stock in each group', () => {
    const r = groupConcentration({
      stocks: [stock('A', { themes: ['AI', 'EV'] }), stock('B', { themes: ['AI'] }), stock('C')],
      lens: 'themes', usdThbRate: null, threshold: 40,
    })
    expect(r.groups.map((g) => [g.label, g.countShare])).toEqual([
      ['AI', '66.7'], ['EV', '33.3'], ['Not set', '33.3'],
    ])
    expect(r.multiValue).toBe(true)
    expect(find(r, 'AI')?.stockIds).toEqual(['A', 'B'])
  })

  it('TC-U-421: a repeated value in one stock counts once; ties sort by label', () => {
    const r = groupConcentration({
      stocks: [stock('A', { themes: ['B', 'B'] }), stock('B', { themes: ['A'] })],
      lens: 'themes', usdThbRate: null, threshold: 90,
    })
    expect(r.groups.map((g) => [g.label, g.count])).toEqual([['A', 1], ['B', 1]])
  })

  it('TC-U-422: value at cost converts USD with the rate', () => {
    const r = groupConcentration({
      stocks: [
        stock('A', { market: 'US', holding: held('10', '100', 'USD') }),
        stock('B', { market: 'TH', holding: held('1000', '20.5', 'THB') }),
      ],
      lens: 'market', usdThbRate: '36.25', threshold: 40,
    })
    expect(find(r, 'US')).toMatchObject({ value: '36250.00', valueShare: '63.9' })
    expect(find(r, 'TH')).toMatchObject({ value: '20500.00', valueShare: '36.1' })
    expect(r.totalValue).toBe('56750.00')
  })

  it('TC-U-423: stocks left out of value shares', () => {
    const r = groupConcentration({
      stocks: [
        stock('A', { holding: held('1', '1', 'USD') }),
        stock('B', { holding: held(null, '1') }),
        stock('B2', { holding: held('1', null) }),
        stock('C'),
        stock('D', { holding: held('1', '5', 'THB') }),
      ],
      lens: 'market', usdThbRate: null, threshold: 40,
    })
    expect(r.leftOut).toEqual({ needsRate: ['A'], noAmount: ['B', 'B2'], notHeld: ['C'] })
    expect(r.totalValue).toBe('5.00')
    expect(find(r, 'US')?.count).toBe(5)
  })

  it('TC-U-423: a zero or unreadable rate also needs a rate', () => {
    const stocks = [stock('A', { holding: held('1', '1', 'USD') })]
    expect(groupConcentration({ stocks, lens: 'market', usdThbRate: '0', threshold: 40 }).leftOut.needsRate).toEqual(['A'])
    expect(groupConcentration({ stocks, lens: 'market', usdThbRate: 'x', threshold: 40 }).leftOut.needsRate).toEqual(['A'])
  })

  it('TC-U-424: the flag uses the exact share, not the shown one', () => {
    const r = groupConcentration({
      stocks: [
        stock('X', { moat: 'X', holding: held('1', '3996') }),
        stock('Y', { moat: 'Y', holding: held('1', '6004') }),
      ],
      lens: 'moat', usdThbRate: null, threshold: 40,
    })
    expect(find(r, 'X')).toMatchObject({ valueShare: '40.0', valueFlag: false })
    expect(find(r, 'Y')).toMatchObject({ valueShare: '60.0', valueFlag: true })
  })

  it('TC-U-425: a share equal to the threshold is flagged', () => {
    const r = groupConcentration({
      stocks: [
        stock('1', { moat: 'X' }), stock('2', { moat: 'X' }),
        stock('3', { moat: 'Y' }), stock('4', { moat: 'Y' }), stock('5', { moat: 'Z' }),
      ],
      lens: 'moat', usdThbRate: null, threshold: 40,
    })
    expect(find(r, 'X')).toMatchObject({ countShare: '40.0', countFlag: true })
    expect(find(r, 'Z')?.countFlag).toBe(false)
  })

  it('TC-U-426: a zero total value has no value shares', () => {
    const r = groupConcentration({
      stocks: [stock('A', { moat: 'X', holding: held('1', '0') }), stock('B', { moat: 'Y', holding: held('2', '0') })],
      lens: 'moat', usdThbRate: null, threshold: 40,
    })
    for (const g of r.groups) expect(g).toMatchObject({ valueShare: null, valueFlag: false })
    expect(r.totalValue).toBe('0.00')
  })

  it('TC-U-427: decimal sums are exact', () => {
    const r = groupConcentration({
      stocks: [stock('A', { holding: held('1', '0.1') }), stock('B', { holding: held('1', '0.2') })],
      lens: 'market', usdThbRate: null, threshold: 40,
    })
    expect(find(r, 'US')?.value).toBe('0.30')
  })

  it('TC-U-427: a USD rate keeps six decimals exactly', () => {
    const r = groupConcentration({
      stocks: [stock('A', { holding: held('0.0001', '0.0001', 'USD') })],
      lens: 'market', usdThbRate: '36.123457', threshold: 40,
    })
    expect(r.totalValue).toBe('0.00')
    const big = groupConcentration({
      stocks: [stock('A', { holding: held('99999999999999.9999', '99999999999999.9999', 'USD') })],
      lens: 'market', usdThbRate: '999999999999.999999', threshold: 40,
    })
    expect(big.totalValue).toMatch(/^\d{40,}\.\d{2}$/)
  })

  it('TC-U-420: no stocks gives no groups; an unknown lens throws', () => {
    expect(groupConcentration({ stocks: [], lens: 'moat', usdThbRate: null, threshold: 40 }).groups).toEqual([])
    expect(() =>
      groupConcentration({ stocks: [], lens: 'nope' as never, usdThbRate: null, threshold: 40 }),
    ).toThrow(RangeError)
  })

  it('TC-U-420: accepts a lens object as well as its key', () => {
    const lens = { key: 'moat', label: 'Moat', kind: 'single', get: (s: GroupableStock) => s.moat } as const
    const r = groupConcentration({ stocks: [stock('A', { moat: 'Wide' })], lens, usdThbRate: null, threshold: 40 })
    expect(r.groups[0]?.label).toBe('Wide')
  })

  it('TC-U-420: 200 stocks with a multi-value lens group in under 20 ms', () => {
    const stocks = Array.from({ length: 200 }, (_, i) =>
      stock(`s${i}`, { themes: ['AI', `T${i % 7}`, `U${i % 13}`], holding: held('10', '12.5') }),
    )
    groupConcentration({ stocks, lens: 'themes', usdThbRate: null, threshold: 40 })
    const t0 = performance.now()
    groupConcentration({ stocks, lens: 'themes', usdThbRate: null, threshold: 40 })
    expect(performance.now() - t0).toBeLessThan(20)
  })
})

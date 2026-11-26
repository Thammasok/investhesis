import { describe, expect, it } from 'vitest'
import { CHAIN_AREAS, ChainRename, chainKey, groupChains, valueAtCost } from './index.ts'
import type { GroupableStock } from './index.ts'

type Holding = NonNullable<GroupableStock['holding']>
type ChainStock = Parameters<typeof groupChains>[0]['stocks'][number]

const thb = (shares: string | null, averageCost: string | null): Holding => ({ shares, averageCost, costCurrency: 'THB' })
const usd = (shares: string | null, averageCost: string | null): Holding => ({ shares, averageCost, costCurrency: 'USD' })

let seq = 0
const stock = (over: Partial<ChainStock> & { ticker?: string } = {}): ChainStock => {
  seq += 1
  return {
    id: `s${seq}`,
    ticker: `T${seq}`,
    name: `Stock ${seq}`,
    createdAt: '2026-01-01T00:00:00.000Z',
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
  }
}
const inChain = (name: string, over: Partial<ChainStock> = {}) => stock({ valueChain: name, ...over })

describe('chains', () => {
  it('TC-U-900 chainKey folds case and surrounding spaces only', () => {
    const keys = [' AI & Semis ', 'ai & semis', 'AI &  Semis', 'น้ำมัน'].map(chainKey)
    expect(keys).toEqual(['ai & semis', 'ai & semis', 'ai &  semis', 'น้ำมัน'])
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[1])
  })

  it('TC-U-901 valueAtCost matches what groupConcentration used to compute', () => {
    const scaled = (r: ReturnType<typeof valueAtCost>) => ('value' in r ? Number(r.value) / 1e14 : r.reason)
    expect(valueAtCost(thb('10', '12.5'), null)).toEqual({ value: 125n * 10n ** 14n / 1n })
    expect(scaled(valueAtCost(thb('10', '12.5'), null))).toBe(125)
    expect(scaled(valueAtCost(usd('2', '100.25'), '36.5'))).toBe(7318.25)
    expect(valueAtCost(usd('2', '100.25'), null)).toEqual({ reason: 'needs-rate' })
    expect(valueAtCost(thb(null, '1'), null)).toEqual({ reason: 'no-amount' })
    expect(valueAtCost(thb('1', null), null)).toEqual({ reason: 'no-amount' })
    expect(valueAtCost(null, null)).toEqual({ reason: 'not-held' })
  })

  it('TC-U-902 stocks group into chains ignoring case, ordered by size then title', () => {
    const stocks = [
      inChain('Oil & Gas'),
      inChain('AI & Semis'),
      inChain('ai & semis'),
      inChain('AI & Semis'),
      inChain('Banks'),
    ]
    const { chains } = groupChains({ stocks, usdThbRate: null })
    expect(chains.map((c) => [c.title, c.count])).toEqual([
      ['AI & Semis', 3],
      ['Banks', 1],
      ['Oil & Gas', 1],
    ])
    expect(chains[0]?.key).toBe('ai & semis')
  })

  it('TC-U-903 the earliest-created stock spelling titles the chain; ties break by id', () => {
    const stocks = [
      inChain('AI & Semis', { id: 'b', createdAt: '2026-02-01T00:00:00.000Z' }),
      inChain('ai & semis', { id: 'c', createdAt: '2026-01-01T00:00:00.000Z' }),
      inChain('X Chain', { id: 'b2', createdAt: '2026-03-01T00:00:00.000Z' }),
      inChain('x chain', { id: 'a1', createdAt: '2026-03-01T00:00:00.000Z' }),
    ]
    const { chains } = groupChains({ stocks, usdThbRate: null })
    expect(chains.map((c) => [c.title, c.spellings])).toEqual([
      ['ai & semis', ['ai & semis', 'AI & Semis']],
      ['x chain', ['x chain', 'X Chain']],
    ])
  })

  it('TC-U-904 areas follow the position; lanes always present, extra areas only when used', () => {
    const positions = ['Upstream', 'Downstream', 'Integrated', 'None', null]
    const stocks = [
      ...positions.map((p) => inChain('Big', { valueChainPosition: p })),
      inChain('Small', { valueChainPosition: 'Midstream' }),
    ]
    const { chains } = groupChains({ stocks, usdThbRate: null })
    expect(chains[0]?.areas.map((a) => [a.position, a.count])).toEqual([
      ['Upstream', 1],
      ['Midstream', 0],
      ['Downstream', 1],
      ['Integrated', 1],
      ['NoPosition', 2],
    ])
    expect(chains[1]?.areas.map((a) => a.position)).toEqual(['Upstream', 'Midstream', 'Downstream'])
    expect(CHAIN_AREAS).toEqual(['Upstream', 'Midstream', 'Downstream', 'Integrated', 'NoPosition'])
  })

  it('TC-U-905 order inside an area is valued held, unvalued held, not held, each by ticker', () => {
    const lane = { valueChainPosition: 'Midstream' }
    const stocks = [
      inChain('C', { ...lane, ticker: 'INTC' }),
      inChain('C', { ...lane, ticker: 'NVDA', holding: thb(null, null) }),
      inChain('C', { ...lane, ticker: 'MSFT', holding: thb('1', '100') }),
      inChain('C', { ...lane, ticker: 'ARM' }),
      inChain('C', { ...lane, ticker: 'AMD', holding: thb(null, null) }),
      inChain('C', { ...lane, ticker: 'AAPL', holding: thb('1', '300') }),
    ]
    const byId = new Map(stocks.map((s) => [s.id, s.ticker]))
    const area = groupChains({ stocks, usdThbRate: null }).chains[0]?.areas[1]
    expect(area?.stocks.map((s) => byId.get(s.id))).toEqual(['AAPL', 'MSFT', 'AMD', 'NVDA', 'ARM', 'INTC'])
    expect(area?.stocks.map((s) => [s.held, s.value])).toEqual([
      [true, '300.00'],
      [true, '100.00'],
      [true, null],
      [true, null],
      [false, null],
      [false, null],
    ])
  })

  it('TC-U-906 counts, values and shares per area and per chain are exact', () => {
    const stocks = [
      inChain('C', { valueChainPosition: 'Upstream', holding: thb('1', '100') }),
      inChain('C', { valueChainPosition: 'Midstream', holding: thb('1', '200') }),
      inChain('C', { valueChainPosition: 'Midstream' }),
      inChain('C', { valueChainPosition: 'Downstream', holding: usd('1', '0.01') }),
    ]
    const chain = groupChains({ stocks, usdThbRate: '36.123456' }).chains[0]
    expect(chain).toMatchObject({ value: '300.36', held: 3, count: 4 })
    const [up, mid, down] = chain?.areas ?? []
    expect(up).toMatchObject({ value: '100.00', valueShare: '33.3', count: 1, held: 1 })
    expect(mid).toMatchObject({ value: '200.00', valueShare: '66.6', count: 2, held: 1 })
    expect(down).toMatchObject({ value: '0.36', valueShare: '0.1', count: 1, held: 1 })
  })

  it('TC-U-907 left-out held stocks are counted, rate need is reported, zero value gives null shares', () => {
    const stocks = [
      inChain('C', { valueChainPosition: 'Upstream', holding: thb(null, '5') }),
      inChain('C', { valueChainPosition: 'Upstream', holding: usd('1', '5') }),
    ]
    const result = groupChains({ stocks, usdThbRate: null })
    const chain = result.chains[0]
    expect(result.needsRate).toBe(true)
    expect(chain).toMatchObject({ leftOut: { noAmount: 1, needsRate: 1 }, value: '0.00', held: 2 })
    expect(chain?.areas.every((a) => a.valueShare === null)).toBe(true)
  })

  it('TC-U-908 stocks with no chain name are reported, not grouped', () => {
    const none = [stock(), stock(), stock()]
    const result = groupChains({ stocks: [...none, inChain('Banks')], usdThbRate: null })
    expect(result.chains).toHaveLength(1)
    expect(result.noChainIds).toEqual(none.map((s) => s.id))
    expect(result.needsRate).toBe(false)
  })

  it('TC-U-909 ChainRename accepts a valid body and applies the name rules to "to"', () => {
    expect(ChainRename.parse({ from: 'AI semis', to: '  AI & Semis  ' })).toEqual({
      from: 'AI semis',
      to: 'AI & Semis',
      merge: false,
    })
    const paths = (input: unknown) => {
      const r = ChainRename.safeParse(input)
      return r.success ? null : r.error.issues.map((i) => i.path.join('.'))
    }
    expect(paths({ from: 'x', to: '' })).toEqual(['to'])
    expect(paths({ from: 'x', to: 'a'.repeat(61) })).toEqual(['to'])
    expect(paths({ from: 'x', to: '😀'.repeat(60) })).toBeNull()
  })

  it('TC-U-910 ChainRename rejects a missing from, a non-boolean merge and unknown keys', () => {
    const paths = (input: unknown) => {
      const r = ChainRename.safeParse(input)
      return r.success ? null : r.error.issues.map((i) => i.path.join('.'))
    }
    expect(paths({ to: 'X' })).toEqual(['from'])
    expect(paths({ from: 'A', to: 'X', merge: 'yes' })).toEqual(['merge'])
    expect(paths({ from: 'A', to: 'X', userId: 'u' })).toEqual(['userId'])
  })
})

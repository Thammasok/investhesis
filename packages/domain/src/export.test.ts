import { describe, expect, it } from 'vitest'
import { BackupV1, EXPORT_COLUMNS, exportRow, toDelimited, type ExportableStock } from './export.ts'
import { canonicaliseRow, TEMPLATE_COLUMNS } from './template.ts'
import { StockInput } from './stock-schema.ts'

const base = (over: Partial<ExportableStock>): ExportableStock => ({
  id: 'x',
  ticker: 'NVDA',
  market: 'US',
  exchange: 'NASDAQ',
  name: 'NVIDIA',
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
  listIds: [],
  ...over,
})
const col = (row: string[], header: string) => row[EXPORT_COLUMNS.indexOf(header)]

describe('EXPORT_COLUMNS and exportRow', () => {
  it('TC-U-520: the template headers, then the five export-only columns', () => {
    expect(EXPORT_COLUMNS).toHaveLength(24)
    expect(EXPORT_COLUMNS.slice(0, 19)).toEqual(TEMPLATE_COLUMNS.map((c) => c.header))
    expect(EXPORT_COLUMNS.slice(19)).toEqual(['lists', 'held', 'shares', 'average_cost', 'cost_currency'])
  })

  it('TC-U-521: a US stock puts GICS in sector and leaves gics_sector empty', () => {
    const row = exportRow(
      base({ gicsSector: 'Information Technology', indexMembership: ['S&P 500', 'Nasdaq-100'] }),
      new Map(),
    )
    expect(row).toHaveLength(24)
    expect(col(row, 'sector')).toBe('Information Technology')
    expect(col(row, 'gics_sector')).toBe('')
    expect(col(row, 'index_membership')).toBe('S&P 500;Nasdaq-100')
    expect(['lists', 'shares', 'average_cost', 'cost_currency'].map((h) => col(row, h))).toEqual(['', '', '', ''])
    expect(col(row, 'held')).toBe('no')
  })

  it('TC-U-522: a TH stock puts the SET group in sector and GICS in gics_sector', () => {
    const row = exportRow(
      base({ ticker: 'PTTEP', market: 'TH', exchange: 'SET', setIndustryGroup: 'Resources', gicsSector: 'Energy' }),
      new Map(),
    )
    expect(col(row, 'sector')).toBe('Resources')
    expect(col(row, 'gics_sector')).toBe('Energy')
  })

  it('TC-U-523: holdings columns', () => {
    const a = exportRow(
      base({ holding: { shares: '1000.0000', averageCost: '120.5000', costCurrency: 'THB' } }),
      new Map(),
    )
    const b = exportRow(base({ holding: { shares: null, averageCost: null, costCurrency: 'USD' } }), new Map())
    const pick = (r: string[]) => ['held', 'shares', 'average_cost', 'cost_currency'].map((h) => col(r, h))
    expect(pick(a)).toEqual(['yes', '1000.0000', '120.5000', 'THB'])
    expect(pick(b)).toEqual(['yes', '', '', 'USD'])
  })

  it('TC-U-524: list names sorted and joined, unknown ids ignored', () => {
    const names = new Map([
      ['l1', 'core'],
      ['l2', 'Watching'],
    ])
    expect(col(exportRow(base({ listIds: ['l2', 'l1', 'gone'] }), names), 'lists')).toBe('core;Watching')
  })

  it('TC-U-529: exportRow fed through canonicaliseRow gives the same StockInput (US and TH)', () => {
    const us = base({
      gicsSector: 'Information Technology',
      valueChain: 'Chips',
      valueChainPosition: 'Upstream',
      size: 'Mega',
      style: 'Growth',
      economicCycle: 'Cyclical',
      lynchType: 'Fast Grower',
      lifeCycle: 'Growth',
      customers: ['B2B', 'B2C'],
      revenueTypes: ['Product sale'],
      moat: 'Network effect',
      themes: ['AI', 'GPU'],
      volatility: 'High',
      indexMembership: ['S&P 500', 'Nasdaq-100'],
    })
    const th = base({
      ticker: 'PTTEP',
      market: 'TH',
      exchange: 'SET',
      name: 'PTT Exploration, "PTTEP"',
      setIndustryGroup: 'Resources',
      gicsSector: 'Energy',
      valueChain: 'Oil and gas',
      valueChainPosition: 'Upstream',
      size: 'Large',
      style: 'Dividend',
      economicCycle: 'Cyclical',
      lynchType: 'Stalwart',
      lifeCycle: 'Mature',
      customers: ['B2B'],
      revenueTypes: ['Product sale'],
      moat: 'Cost advantage',
      themes: ['Energy'],
      volatility: 'Mid',
      indexMembership: ['SET50'],
    })
    for (const stock of [us, th]) {
      const row = exportRow(stock, new Map())
      const cells = Object.fromEntries(EXPORT_COLUMNS.map((h, i) => [h, row[i] ?? '']))
      const result = canonicaliseRow(cells)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const { id: _i, holding: _h, listIds: _l, ...expected } = stock
      expect(result.input).toEqual(StockInput.parse(expected))
    }
  })
})

describe('toDelimited', () => {
  it('TC-U-525: comma quoting, CRLF, nothing escaped for formulas', () => {
    expect(toDelimited([['a,b', 'say "hi"', 'line1\nline2', '=1+1', 'plain']], ',')).toBe(
      '"a,b","say ""hi""","line1\nline2",=1+1,plain\r\n',
    )
  })

  it('TC-U-526: a tab separator quotes tabs, not commas', () => {
    expect(toDelimited([['a,b', 'c\td']], '\t')).toBe('a,b\t"c\td"\r\n')
  })

  it('TC-U-530: CR is quoted; no rows is an empty string', () => {
    expect(toDelimited([['a\rb']], ',')).toBe('"a\rb"\r\n')
    expect(toDelimited([], ',')).toBe('')
  })
})

describe('BackupV1', () => {
  const stamp = '2026-11-24T09:30:00.000Z'
  const uuid = '0193a0aa-0000-7000-8000-000000000001'
  const stock = {
    id: uuid,
    market: 'TH',
    ticker: 'PTT',
    exchange: 'SET',
    currency: 'THB',
    name: 'PTT',
    indexMembership: ['SET50'],
    gicsSector: 'Energy',
    setIndustryGroup: 'Resources',
    valueChain: null,
    valueChainPosition: null,
    size: null,
    style: null,
    economicCycle: 'Cyclical',
    lynchType: null,
    lifeCycle: null,
    customers: [],
    revenueTypes: [],
    moat: null,
    themes: [],
    volatility: null,
    lensSources: { economicCycle: 'default' },
    holding: { shares: '1000.0000', averageCost: null, costCurrency: 'THB' },
    createdAt: stamp,
    updatedAt: stamp,
  }
  const settings = { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null }
  const head = { format: 'investhesis-backup', formatVersion: 1, exportedAt: stamp }

  it('TC-U-527: accepts a full and an empty backup', () => {
    const full = {
      ...head,
      stocks: [stock],
      lists: [{ id: uuid, name: 'Core', createdAt: stamp, updatedAt: stamp, stockIds: [uuid] }],
      settings: { concentrationThreshold: 35, usdThbRate: '34.045000', usdThbRateUpdatedAt: stamp },
    }
    expect(BackupV1.safeParse(full).success).toBe(true)
    expect(BackupV1.safeParse({ ...head, stocks: [], lists: [], settings }).success).toBe(true)
  })

  it('TC-U-528: rejects a wrong format or version and a stock with listIds, naming the path', () => {
    const ok = { ...head, stocks: [], lists: [], settings }
    const path = (v: unknown) => BackupV1.safeParse(v).error?.issues[0]?.path
    expect(path({ ...ok, format: 'other' })).toEqual(['format'])
    expect(path({ ...ok, formatVersion: 2 })).toEqual(['formatVersion'])
    expect(path({ ...ok, stocks: [{ ...stock, listIds: [] }] })).toEqual(['stocks', 0, 'listIds'])
    expect(path({ ...ok, formatVersion: undefined })).toEqual(['formatVersion'])
  })
})

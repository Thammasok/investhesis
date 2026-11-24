import { EXPORT_COLUMNS, exportRow, toDelimited, type ExportableStock } from '@investhesis/domain'
import ExcelJS from 'exceljs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { filePart, multipart } from '../../../test/multipart.ts'
import { mapHeaders } from './imports.service.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

type Json = Record<string, unknown>
const preview = (a: FastifyInstance, file: string | Buffer, name = 'x.csv') =>
  a.inject({ method: 'POST', url: '/imports/preview', ...multipart([filePart(file, name)]) })
const confirm = (a: FastifyInstance, file: string, options: Record<string, string> = {}) =>
  a.inject({
    method: 'POST',
    url: '/imports',
    ...multipart([...Object.entries({ duplicateMode: 'skip', newListName: 'Imported', ...options }).map(([name, value]) => ({ name, value })), filePart(file, 'x.csv')]),
  })
const api = async (a: FastifyInstance, method: 'POST' | 'PATCH' | 'GET', url: string, payload?: unknown): Promise<Json> => {
  const res = await a.inject({ method, url, ...(payload !== undefined && { payload: payload as object }) })
  if (res.statusCode >= 300) throw new Error(`${url} answered ${res.statusCode}: ${res.payload}`)
  return res.json() as Json
}

const stockOf = (over: Partial<ExportableStock> & { ticker: string }): ExportableStock => ({
  id: 'x', market: 'US', exchange: 'NASDAQ', name: over.ticker, gicsSector: null, setIndustryGroup: null, valueChain: null,
  valueChainPosition: null, size: null, style: null, economicCycle: null, lynchType: null, lifeCycle: null, customers: [],
  revenueTypes: [], moat: null, themes: [], volatility: null, indexMembership: [], holding: null, listIds: [], ...over,
})
const file = (rows: string[][]) => toDelimited([[...EXPORT_COLUMNS], ...rows], ',')

describe('mapHeaders and export-only columns', () => {
  it('TC-U-560 export-only headers are known, ignored and listed as written', () => {
    const header = ['ticker', 'market', 'exchange', 'name', 'Lists', 'held', 'shares', 'average_cost', 'cost_currency']
    const { index, warnings, ignoredColumns } = mapHeaders(header)
    expect(warnings).toEqual([])
    expect(ignoredColumns).toEqual(['Lists', 'held', 'shares', 'average_cost', 'cost_currency'])
    for (const h of ['lists', 'held', 'shares', 'average_cost', 'cost_currency']) expect(index.has(h)).toBe(false)
    expect([...index.keys()]).toEqual(['ticker', 'market', 'exchange', 'name'])
  })

  it('TC-U-561 a repeated export-only header is a duplicate; the first is the one reported', () => {
    const { warnings, ignoredColumns } = mapHeaders(['ticker', 'market', 'exchange', 'name', 'held', 'HELD'])
    expect(warnings).toEqual(['Duplicate column "HELD" ignored'])
    expect(ignoredColumns).toEqual(['held'])
  })
})

describe('import of a file written by the export', () => {
  it('TC-U-562 a template-only file has no ignored columns', async () => {
    const template = await t.app.inject({ method: 'GET', url: '/imports/template.csv' })
    const res = await preview(t.app, template.payload)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ headerWarnings: [], ignoredColumns: [] })
  })

  it('TC-A-511 names only real unknown columns as warnings, in CSV and XLSX alike', async () => {
    const header = [...EXPORT_COLUMNS.slice(0, 19), 'Lists', 'HELD', 'shares', 'average_cost', 'cost_currency', 'colour']
    const row = ['AAPL', 'US', 'NASDAQ', 'Apple', ...Array(15).fill(''), 'Core', 'no', '', '', '', 'red']
    const text = toDelimited([header, row], ',')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('stocks')
    ws.addRow(header)
    ws.addRow(row)
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer())
    for (const res of [await preview(t.app, text), await preview(t.app, xlsx, 'x.xlsx')]) {
      expect(res.statusCode).toBe(200)
      const body = res.json() as Json
      expect(body['headerWarnings']).toEqual(['Unknown column "colour" ignored'])
      expect(body['ignoredColumns']).toEqual(['Lists', 'HELD', 'shares', 'average_cost', 'cost_currency'])
    }
  })

  it('an export of two stocks previews clean and confirms with no holding and no list membership', async () => {
    const user = newUserId()
    const a = await t.appFor(user)
    const text = file([
      exportRow(stockOf({ ticker: 'PTT', market: 'TH', exchange: 'SET', setIndustryGroup: 'Resources', gicsSector: 'Energy', holding: { shares: '1000.0000', averageCost: '34.5000', costCurrency: 'THB' }, listIds: ['l1'] }), new Map([['l1', 'Core']])),
      exportRow(stockOf({ ticker: 'NVDA', gicsSector: 'Information Technology', themes: ['AI'] }), new Map()),
    ])
    const res = await preview(a, '﻿' + text)
    const body = res.json() as Json
    expect(body['headerWarnings']).toEqual([])
    expect(body['counts']).toEqual({ new: 2, duplicate: 0, error: 0 })
    expect(body['ignoredColumns']).toEqual(['lists', 'held', 'shares', 'average_cost', 'cost_currency'])

    const done = await confirm(a, '﻿' + text)
    expect(done.statusCode).toBeLessThan(300)
    const stocks = ((await api(a, 'GET', '/stocks')) as { items: Json[] }).items
    expect(stocks.map((s) => s['ticker']).sort()).toEqual(['NVDA', 'PTT'])
    for (const s of stocks) expect(s['holding']).toBeNull()
    const held = await t.handle.pool.query('select count(*)::int n from app.holdings where user_id = $1', [user])
    expect(held.rows[0].n).toBe(0)
  })

  it('TC-A-505 an export imported into an empty account gives the same stocks, with no holding and no list', async () => {
    const source = await t.appFor(newUserId())
    const fresh = await t.appFor(newUserId())
    const lenses = {
      valueChain: 'Chips', valueChainPosition: 'Upstream', size: 'Mega', style: 'Growth', economicCycle: 'Cyclical',
      lynchType: 'Fast Grower', lifeCycle: 'Growth', customers: ['B2B', 'B2C'], revenueTypes: ['Product sale'],
      moat: 'Network effect', themes: ['AI', 'GPU'], volatility: 'High',
    }
    await api(source, 'POST', '/stocks', { ticker: 'NVDA', market: 'US', exchange: 'NASDAQ', name: 'NVIDIA, "Corp"', indexMembership: ['S&P 500', 'Nasdaq-100'], gicsSector: 'Information Technology', ...lenses, holding: { shares: '10', averageCost: '100' } })
    await api(source, 'POST', '/stocks', { ticker: 'PTTEP', market: 'TH', exchange: 'SET', name: 'บริษัท ปตท. สำรวจ', indexMembership: ['SET50'], gicsSector: 'Energy', setIndustryGroup: 'Resources', ...lenses, valueChain: 'Oil and gas' })
    const core = await api(source, 'POST', '/lists', { name: 'Core' })
    const stocksOf = async (a: FastifyInstance) => ((await api(a, 'GET', '/stocks')) as { items: Json[] }).items
    await api(source, 'POST', `/lists/${core['id']}/stocks`, { stockId: (await stocksOf(source))[0]?.['id'] })

    const csv = (await source.inject({ method: 'GET', url: '/exports/backup.csv' })).payload
    const res = await preview(fresh, csv)
    expect(res.json()).toMatchObject({ headerWarnings: [], counts: { new: 2, duplicate: 0, error: 0 } })
    expect((await confirm(fresh, csv, { newListName: 'Imported' })).statusCode).toBeLessThan(300)

    const keep = ['ticker', 'market', 'exchange', 'name', 'indexMembership', 'gicsSector', 'setIndustryGroup', 'valueChain', 'valueChainPosition', 'size', 'style', 'economicCycle', 'lynchType', 'lifeCycle', 'customers', 'revenueTypes', 'moat', 'themes', 'volatility']
    const pick = (s: Json) => Object.fromEntries(keep.map((k) => [k, s[k]]))
    const byTicker = (xs: Json[]) => Object.fromEntries(xs.map((s) => [s['ticker'] as string, s]))
    const before = byTicker(await stocksOf(source))
    const after = byTicker(await stocksOf(fresh))
    expect(Object.keys(after).sort()).toEqual(['NVDA', 'PTTEP'])
    for (const ticker of Object.keys(before)) expect(pick(after[ticker] as Json)).toEqual(pick(before[ticker] as Json))
    expect(Object.values(after).every((s) => s['holding'] === null)).toBe(true)
    expect(((await api(fresh, 'GET', '/lists')) as { items: Json[] }).items.map((l) => l['name'])).toEqual(['Imported'])
  })

  it('TC-U-563 confirm does not apply holdings or lists from the file', async () => {
    const user = newUserId()
    const a = await t.appFor(user)
    const text = file([exportRow(stockOf({ ticker: 'PTT', market: 'TH', exchange: 'SET', setIndustryGroup: 'Resources', gicsSector: 'Energy', holding: { shares: '1000.0000', averageCost: '1.0000', costCurrency: 'THB' }, listIds: ['l1'] }), new Map([['l1', 'Core']]))])
    const res = await confirm(a, text, { newListName: 'Target' })
    expect(res.statusCode).toBeLessThan(300)
    const stock = ((await api(a, 'GET', '/stocks')) as { items: Json[] }).items[0] as Json
    expect(stock['holding']).toBeNull()
    expect(stock['listIds']).toHaveLength(1) // only the chosen target list, never "Core" from the file
    const lists = ((await api(a, 'GET', '/lists')) as { items: Json[] }).items
    expect(lists.map((l) => l['name'])).toEqual(['Target'])
  })

  it('TC-A-512 an update import leaves an existing holding and its lists alone', async () => {
    const user = newUserId()
    const a = await t.appFor(user)
    const ptt = await api(a, 'POST', '/stocks', { ticker: 'PTT', market: 'TH', exchange: 'SET', name: 'Old name', holding: { shares: '1000', averageCost: '34.5' } })
    const core = await api(a, 'POST', '/lists', { name: 'Core' })
    await api(a, 'POST', `/lists/${core['id']}/stocks`, { stockId: ptt['id'] })
    const text = file([exportRow(stockOf({ ticker: 'PTT', market: 'TH', exchange: 'SET', name: 'New name', holding: null, listIds: ['x'] }), new Map([['x', 'Other']]))])
    const res = await confirm(a, text, { duplicateMode: 'update', newListName: 'Target' })
    expect(res.statusCode).toBeLessThan(300)
    const after = await api(a, 'GET', `/stocks/${ptt['id']}`)
    expect(after['name']).toBe('New name')
    expect(after['holding']).toEqual({ shares: '1000.0000', averageCost: '34.5000', costCurrency: 'THB' })
    expect(after['listIds']).toContain(core['id'])
    const names = ((await api(a, 'GET', '/lists')) as { items: Json[] }).items.map((l) => l['name']).sort()
    expect(names).toEqual(['Core', 'Target'])
  })
})

import { parse } from 'csv-parse/sync'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BackupV1, EXPORT_COLUMNS } from '@investhesis/domain'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'

const NOW = new Date('2026-11-24T09:30:00.000Z')
let t: TestApp
let u: string
let app: FastifyInstance

beforeAll(async () => {
  u = newUserId()
  t = await buildTestApp(u, { now: () => NOW })
  app = t.app
})
afterAll(() => t.cleanup())

// Response bodies are parsed JSON, checked field by field below.
// oxlint-disable-next-line no-explicit-any
type Json = Record<string, any>
const post = async (a: FastifyInstance, url: string, payload: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<Json> => {
  const res = await a.inject({ method, url, payload: payload as object })
  if (res.statusCode >= 300) throw new Error(`${url} answered ${res.statusCode}: ${res.payload}`)
  return res.json()
}
const stock = (ticker: string, extra: Json = {}) => ({ ticker, market: 'US', exchange: 'NASDAQ', name: `${ticker} Inc`, ...extra })
const th = (ticker: string, extra: Json = {}) => ({ ticker, market: 'TH', exchange: 'SET', name: `${ticker} PCL`, ...extra })
const json = async (a = app) => {
  const res = await a.inject({ method: 'GET', url: '/exports/backup.json' })
  return { res, body: res.json() as Json }
}
const csv = async (a = app) => {
  const res = await a.inject({ method: 'GET', url: '/exports/backup.csv' })
  const text = res.payload
  const records = parse(text.replace(/^﻿/, ''), { columns: false }) as string[][]
  return { res, text, records }
}

describe('backup export (account with data)', () => {
  let ptt: Json
  let aapl: Json
  let core: Json
  beforeAll(async () => {
    // Arrange: PTT (TH, held), AAPL (US, not held), a list with AAPL added first, settings
    ptt = await post(app, '/stocks', th('PTT', { holding: { shares: '1000', averageCost: '34.5' } }))
    aapl = await post(app, '/stocks', stock('AAPL'))
    core = await post(app, '/lists', { name: 'Core' })
    await post(app, `/lists/${core.id}/stocks`, { stockId: aapl.id })
    await new Promise((r) => setTimeout(r, 15))
    await post(app, `/lists/${core.id}/stocks`, { stockId: ptt.id })
    await post(app, '/settings', { concentrationThreshold: 35, usdThbRate: '34.045' }, 'PATCH')
  })

  it('TC-U-540 and TC-A-500 answers the full JSON backup that parses with BackupV1', async () => {
    const { res, body } = await json()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    expect(res.headers['content-disposition']).toBe('attachment; filename="investhesis-backup-2026-11-24.json"')
    expect(BackupV1.safeParse(body).success).toBe(true)
    expect(body['format']).toBe('investhesis-backup')
    expect(body['formatVersion']).toBe(1)
    expect(body['exportedAt']).toBe(NOW.toISOString())
    expect(body['stocks'].map((s: Json) => s['ticker'])).toEqual(['PTT', 'AAPL']) // TH before US
    expect(body['stocks'][0]['holding']).toEqual({ shares: '1000.0000', averageCost: '34.5000', costCurrency: 'THB' })
    expect(body['stocks'][1]['holding']).toBeNull()
    expect(body['lists']).toHaveLength(1)
    expect(body['lists'][0]).toMatchObject({ name: 'Core', stockIds: [aapl['id'], ptt['id']] }) // added order
    expect(body['settings']).toMatchObject({ concentrationThreshold: 35, usdThbRate: '34.045000' })
    expect(typeof body['settings']['usdThbRateUpdatedAt']).toBe('string')
  })

  it('TC-A-501 carries no user id, no list ids on stocks and no unexpected key', async () => {
    const { res, body } = await json()
    expect(Object.keys(body).sort()).toEqual(['exportedAt', 'format', 'formatVersion', 'lists', 'settings', 'stocks'])
    for (const s of body['stocks']) expect(s).not.toHaveProperty('listIds')
    for (const word of [u, 'userId', 'user_id', 'listIds']) expect(res.payload).not.toContain(word)
  })

  it('TC-U-542 answers the CSV backup with a BOM, the export header and one row per stock', async () => {
    const { res, text, records } = await csv()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toBe('attachment; filename="investhesis-backup-2026-11-24.csv"')
    expect(text.startsWith('﻿')).toBe(true)
    expect(text.endsWith('\r\n')).toBe(true)
    expect(records[0]).toEqual([...EXPORT_COLUMNS])
    const col = (row: string[], h: string) => row[EXPORT_COLUMNS.indexOf(h)]
    expect(records).toHaveLength(3)
    expect(col(records[1] as string[], 'ticker')).toBe('PTT')
    expect(['held', 'shares', 'average_cost', 'cost_currency', 'lists'].map((h) => col(records[1] as string[], h))).toEqual(['yes', '1000.0000', '34.5000', 'THB', 'Core'])
    expect(['ticker', 'held', 'shares', 'cost_currency', 'lists'].map((h) => col(records[2] as string[], h))).toEqual(['AAPL', 'no', '', '', 'Core'])
  })

  it('TC-A-504 names the files by the UTC date of the clock', async () => {
    const at = async (iso: string) => {
      const a = await buildTestApp(newUserId(), { now: () => new Date(iso) })
      try {
        const j = await a.app.inject({ method: 'GET', url: '/exports/backup.json' })
        const c = await a.app.inject({ method: 'GET', url: '/exports/backup.csv' })
        return [j.headers['content-disposition'], c.headers['content-disposition'], j.json().exportedAt]
      } finally {
        await a.cleanup()
      }
    }
    expect(await at('2026-11-24T23:30:00Z')).toEqual([
      'attachment; filename="investhesis-backup-2026-11-24.json"',
      'attachment; filename="investhesis-backup-2026-11-24.csv"',
      '2026-11-24T23:30:00.000Z',
    ])
    expect((await at('2026-11-25T00:00:00Z'))[0]).toBe('attachment; filename="investhesis-backup-2026-11-25.json"')
    expect((await at('2026-12-31T23:59:59Z'))[1]).toBe('attachment; filename="investhesis-backup-2026-12-31.csv"')
  })
})

describe('backup export (other cases)', () => {
  it('TC-U-541 and TC-A-514 an empty account gets empty arrays, default settings and a header-only CSV', async () => {
    const empty = newUserId()
    const a = await t.appFor(empty)
    const { body } = await json(a)
    expect(BackupV1.safeParse(body).success).toBe(true)
    expect(body['stocks']).toEqual([])
    expect(body['lists']).toEqual([])
    expect(body['settings']).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null })
    const { text } = await csv(a)
    expect(text).toBe(`﻿${EXPORT_COLUMNS.join(',')}\r\n`)
    // Exporting only reads: the defaults are not saved as a settings row
    const rows = await t.handle.pool.query('select count(*) n from app.user_settings where user_id = $1', [empty])
    expect(Number(rows.rows[0].n)).toBe(0)
  })

  it('TC-U-543 and TC-A-507 never shows another user stocks, lists, holdings or settings', async () => {
    const x = newUserId()
    const w = newUserId()
    const ax = await t.appFor(x)
    const aw = await t.appFor(w)
    const sx = await post(ax, '/stocks', stock('XONLY', { holding: { shares: '11', averageCost: '22' } }))
    const lx = await post(ax, '/lists', { name: 'X list' })
    await post(ax, `/lists/${lx['id']}/stocks`, { stockId: sx['id'] })
    await ax.inject({ method: 'PATCH', url: '/settings', payload: { concentrationThreshold: 35 } })
    const sw = await post(aw, '/stocks', stock('WONLY'))
    await aw.inject({ method: 'PATCH', url: '/settings', payload: { concentrationThreshold: 60 } })

    const jx = await json(ax)
    const jw = await json(aw)
    expect(jx.body['stocks'].map((s: Json) => s['ticker'])).toEqual(['XONLY'])
    expect(jw.body['stocks'].map((s: Json) => s['ticker'])).toEqual(['WONLY'])
    expect(jx.body['settings']['concentrationThreshold']).toBe(35)
    expect(jw.body['settings']['concentrationThreshold']).toBe(60)
    expect(jw.res.payload).not.toContain(sx['id'])
    expect(jw.res.payload).not.toContain('X list')
    expect(jx.res.payload).not.toContain(sw['id'])
    expect((await csv(aw)).text).not.toContain('XONLY')
  })

  it('TC-A-503 keeps exact decimals and held-with-unknown-amounts in both formats', async () => {
    const a = await t.appFor(newUserId())
    await post(a, '/stocks', stock('DEC1', { holding: { shares: '0.0001', averageCost: '99999999999999.9999' } }))
    await post(a, '/stocks', stock('DEC2', { holding: {} }))
    await post(a, '/stocks', stock('DEC3'))
    const { body } = await json(a)
    const by = (tk: string) => body['stocks'].find((s: Json) => s['ticker'] === tk)
    expect(by('DEC1')['holding']).toEqual({ shares: '0.0001', averageCost: '99999999999999.9999', costCurrency: 'USD' })
    expect(by('DEC2')['holding']).toEqual({ shares: null, averageCost: null, costCurrency: 'USD' })
    const { records } = await csv(a)
    const row = (tk: string) => records.find((r) => r[0] === tk) as string[]
    const pick = (tk: string) => ['held', 'shares', 'average_cost', 'cost_currency'].map((h) => row(tk)[EXPORT_COLUMNS.indexOf(h)])
    expect(pick('DEC1')).toEqual(['yes', '0.0001', '99999999999999.9999', 'USD'])
    expect(pick('DEC2')).toEqual(['yes', '', '', 'USD'])
    expect(pick('DEC3')).toEqual(['no', '', '', ''])
  })

  it('TC-A-506 writes cells as typed: quoted when needed, never escaped for formulas', async () => {
    const a = await t.appFor(newUserId())
    await post(a, '/stocks', stock('ODD1', { name: 'Acme, "Inc"', themes: ['@x', 'line one'] }))
    await post(a, '/stocks', stock('ODD2', { name: '=1+1' }))
    const { text, records } = await csv(a)
    const row = (tk: string) => records.find((r) => r[0] === tk) as string[]
    expect(row('ODD1')[EXPORT_COLUMNS.indexOf('name')]).toBe('Acme, "Inc"')
    expect(row('ODD1')[EXPORT_COLUMNS.indexOf('themes')]).toBe('@x;line one')
    expect(row('ODD2')[EXPORT_COLUMNS.indexOf('name')]).toBe('=1+1')
    expect(text).toContain('"Acme, ""Inc"""')
    expect(text).toContain(',=1+1,')
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(3)
  })

  it('TC-A-513 declares both backup routes, the BackupV1 body and the ignored-columns field in the OpenAPI document', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/openapi.json' })).json() as Json
    for (const path of ['/exports/backup.json', '/exports/backup.csv']) {
      const op = doc['paths'][path]['get']
      expect(op['security']).toEqual([{ bearerAuth: [] }])
      expect(Object.keys(op['responses'])).toEqual(expect.arrayContaining(['200', '401', '503']))
    }
    const body = doc['paths']['/exports/backup.json']['get']['responses']['200']['content']['application/json']['schema']
    expect(Object.keys(body['properties']).sort()).toEqual(['exportedAt', 'format', 'formatVersion', 'lists', 'settings', 'stocks'])
    expect(doc['paths']['/exports/backup.csv']['get']['produces'] ?? Object.keys(doc['paths']['/exports/backup.csv']['get']['responses']['200']['content'] ?? {})).toEqual(expect.arrayContaining(['text/csv']))
    const preview = doc['paths']['/imports/preview']['post']['responses']['200']['content']['application/json']['schema']
    expect(preview['properties']['ignoredColumns']).toMatchObject({ type: 'array', items: { type: 'string' } })
  })

  it('TC-A-502 lists are ordered by name and membership by the time it was added', async () => {
    const a = await t.appFor(newUserId())
    const s1 = await post(a, '/stocks', stock('M1'))
    const s2 = await post(a, '/stocks', stock('M2'))
    const s3 = await post(a, '/stocks', stock('M3'))
    const watching = await post(a, '/lists', { name: 'Watching' })
    const core = await post(a, '/lists', { name: 'core' })
    for (const s of [s3, s1, s2]) {
      await post(a, `/lists/${core['id']}/stocks`, { stockId: s['id'] })
      await new Promise((r) => setTimeout(r, 10))
    }
    await post(a, `/lists/${watching['id']}/stocks`, { stockId: s1['id'] })
    const { body } = await json(a)
    expect(body['lists'].map((l: Json) => l['name'])).toEqual(['core', 'Watching'])
    expect(body['lists'][0]['stockIds']).toEqual([s3['id'], s1['id'], s2['id']])
    expect(body['lists'][1]['stockIds']).toEqual([s1['id']])
  })
})

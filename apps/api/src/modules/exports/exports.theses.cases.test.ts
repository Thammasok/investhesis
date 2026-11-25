import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BackupV1, BackupV2 } from '@investhesis/domain'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'

// oxlint-disable-next-line no-explicit-any
type Json = Record<string, any>

const NOW = new Date('2026-11-24T09:30:00.000Z')
const logs: string[] = []
let t: TestApp
const U = newUserId()
const V = newUserId()
let appV: FastifyInstance

beforeAll(async () => {
  t = await buildTestApp(U, { now: () => NOW, logStream: { write: (line: string) => void logs.push(line) } })
  appV = await t.appFor(V)
})
afterAll(() => t.cleanup())

const entry = (app: FastifyInstance, s: string, extra: Json = {}) =>
  app.inject({ method: 'POST', url: `/stocks/${s}/theses`, payload: { type: 'buy', date: '2026-01-10', note: 'n', ...extra } }).then((r) => r.json() as Json)
const list = async (app: FastifyInstance, s: string): Promise<Json[]> => (await app.inject({ method: 'GET', url: `/stocks/${s}/theses` })).json().items
const backup = async (app: FastifyInstance = t.app) => {
  const res = await app.inject({ method: 'GET', url: '/exports/backup.json' })
  expect(res.statusCode).toBe(200)
  return { res, body: BackupV2.parse(res.json()) }
}

describe('backup version 2: thesis entries', () => {
  it('TC-A-732 the backup holds every entry equal to the lists, in stock then list order, and v1 sections unchanged', async () => {
    const user = newUserId()
    const app = await t.appFor(user)
    const [nvda, ptt] = [await seedStock(t.handle, user, 'B732N'), await seedStock(t.handle, user, 'B732P')]
    await entry(app, nvda, { date: '2026-11-20', note: 'A', targetPrice: '180', invalidation: 'inv' })
    const middle = await entry(app, nvda, { type: 'update', date: '2026-10-03', note: 'B' })
    await app.inject({ method: 'PATCH', url: `/stocks/${nvda}/theses/${middle.id}`, payload: { note: 'B edited' } })
    await entry(app, nvda, { date: '2025-03-14', note: 'C'.repeat(700) })
    await entry(app, ptt, { date: '2026-05-05', note: 'on PTT' })
    const sv = await seedStock(t.handle, V, 'B732V')
    await entry(appV, sv, { note: 'not yours' })

    const { body } = await backup(app)
    expect(body.formatVersion).toBe(2)
    expect(body.theses).toHaveLength(4)
    const expected = [] as Json[]
    for (const s of [nvda, ptt].sort()) expected.push(...(await list(app, s)))
    expect(body.theses).toEqual(expected)
    expect(body.theses.map((e) => e.note)).not.toContain('not yours')
    expect(body.stocks.map((s) => s.ticker).sort()).toEqual(['B732N', 'B732P'])
    // Everything but the version and the entries is what version 1 held.
    const { theses: _theses, ...rest } = body
    expect(BackupV1.safeParse({ ...rest, formatVersion: 1 }).success).toBe(true)
  })

  it('TC-A-733 backup.csv is byte-identical before and after entries are added', async () => {
    const user = newUserId()
    const app = await t.appFor(user)
    const s = await seedStock(t.handle, user, 'B733')
    const csv = () => app.inject({ method: 'GET', url: '/exports/backup.csv' })
    const before = await csv()
    for (const note of ['one', 'two', 'three']) await entry(app, s, { note })
    const after = await csv()
    expect(after.payload).toBe(before.payload)
    expect(after.payload.startsWith('﻿')).toBe(true)
    expect(after.payload).toContain('\r\n')
    expect(after.headers['content-disposition']).toMatch(/investhesis-backup-2026-11-24\.csv/)
    expect(after.payload).not.toContain('three')
  })

  it('TC-A-735 after a stock with entries is deleted, the backup has neither the stock nor its entries', async () => {
    const user = newUserId()
    const app = await t.appFor(user)
    const [gone, kept] = [await seedStock(t.handle, user, 'B735G'), await seedStock(t.handle, user, 'B735K')]
    await entry(app, gone, { note: 'goes with the stock' })
    const keep = await entry(app, kept, { note: 'stays' })
    expect((await app.inject({ method: 'DELETE', url: `/stocks/${gone}` })).statusCode).toBe(204)
    const { body } = await backup(app)
    expect(body.theses).toEqual([keep])
    const stockIds = new Set(body.stocks.map((s) => s.id))
    for (const e of body.theses) expect(stockIds.has(e.stockId)).toBe(true)
  })

  it('TC-A-736 the backup response carries the entry text and no log line does', async () => {
    const user = newUserId()
    const app = await t.appFor(user)
    const s = await seedStock(t.handle, user, 'B736')
    const sentinels = ['SENTINEL-NOTE-736', 'SENTINEL-INV-736', '987654.3210']
    await entry(app, s, { note: sentinels[0], invalidation: sentinels[1], targetPrice: sentinels[2] })
    logs.length = 0
    const { res } = await backup(app)
    for (const sentinel of sentinels) expect(res.payload).toContain(sentinel)
    const text = logs.join('\n')
    for (const sentinel of sentinels) expect(text).not.toContain(sentinel)
    const requestLine = logs.map((l) => JSON.parse(l)).find((l) => l.res?.statusCode !== undefined && String(l.msg).includes('completed'))
    expect(requestLine?.res.statusCode).toBe(200)
    expect(requestLine).not.toHaveProperty('body')
    expect(requestLine).not.toHaveProperty('req.body')
  })

  it('TC-A-737 a large backup is valid, complete and named by the UTC date', async () => {
    const insert = (user: string, stockId: string, length: number) =>
      t.handle.pool.query(
        `insert into app.theses (user_id, stock_id, type, entry_date, note, created_at, updated_at)
         select $1, $2, 'review', date '2026-01-01' - g, repeat('n', $3::int), now(), now() from generate_series(1, 200) g`,
        [user, stockId, length],
      )
    const [shortUser, longUser] = [newUserId(), newUserId()]
    const [a, b] = [await t.appFor(shortUser), await t.appFor(longUser)]
    const [sa, sb] = [await seedStock(t.handle, shortUser, 'B737A'), await seedStock(t.handle, longUser, 'B737B')]
    await insert(shortUser, sa, 2000)
    await insert(longUser, sb, 10000)
    for (const [app, expectedLength] of [[a, 2000], [b, 10000]] as const) {
      const { res, body } = await backup(app)
      expect(body.theses).toHaveLength(200)
      expect(body.theses.every((e) => e.note.length === expectedLength)).toBe(true)
      expect(res.headers['content-disposition']).toMatch(/filename="?investhesis-backup-2026-11-24\.json"?/)
    }
  })
})

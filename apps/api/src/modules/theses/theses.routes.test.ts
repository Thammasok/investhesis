import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THESIS_TYPES } from '@investhesis/domain'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'

let t: TestApp
let clock: Date | undefined
const U = newUserId()
const V = newUserId()
let appV: FastifyInstance

beforeAll(async () => {
  t = await buildTestApp(U, { now: () => clock ?? new Date() })
  appV = await t.appFor(V)
})
afterAll(() => t.cleanup())

const call = (app: FastifyInstance, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload !== undefined && { payload: payload as object }) })
const base = (extra: Record<string, unknown> = {}) => ({ type: 'buy', date: '2026-01-10', note: 'a note', ...extra })
const stock = (tk: string, user = U) => seedStock(t.handle, user, tk)
const post = (stockId: string, body: unknown) => call(t.app, 'POST', `/stocks/${stockId}/theses`, body)
const errorPaths = (res: { json(): { errors?: { path: string }[] } }) => (res.json().errors ?? []).map((e) => e.path).sort()

describe('theses routes', () => {
  it('TC-U-740 create and list in order', async () => {
    const s = await stock('TL740')
    const first = await post(s, base({ date: '2026-01-10', note: 'old' }))
    const a = await post(s, base({ date: '2026-11-20', note: 'A' }))
    const b = await post(s, base({ date: '2026-11-20', note: 'B' }))
    expect([first.statusCode, a.statusCode, b.statusCode]).toEqual([201, 201, 201])
    expect(first.json()).toMatchObject({ stockId: s, type: 'buy', targetPrice: null, invalidation: null })
    expect(first.json()).not.toHaveProperty('userId')
    const list = await call(t.app, 'GET', `/stocks/${s}/theses`)
    expect(list.statusCode).toBe(200)
    expect(list.json().items.map((e: { note: string }) => e.note)).toEqual(['B', 'A', 'old'])
    expect(THESIS_TYPES).toContain(list.json().items[0].type)
  })

  it('TC-U-741 validation errors carry field paths', async () => {
    const s = await stock('TL741')
    const res = await post(s, { type: 'hold', date: '2999-01-01', note: '', targetPrice: 5, invalidation: 'x'.repeat(2001) })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('validation_failed')
    expect(errorPaths(res)).toEqual(['date', 'invalidation', 'note', 'targetPrice', 'type'])
    const nul = await post(s, base({ note: 'a\u0000b' }))
    expect([nul.statusCode, errorPaths(nul)]).toEqual([400, ['note']])
    expect((await post(s, null)).statusCode).toBe(400)
    expect((await call(t.app, 'POST', '/stocks/not-a-uuid/theses', base())).statusCode).toBe(400)
  })

  it('TC-U-742 a no-op patch writes nothing', async () => {
    const s = await stock('TL742')
    const e = (await post(s, base({ targetPrice: '180' }))).json()
    const res = await call(t.app, 'PATCH', `/stocks/${s}/theses/${e.id}`, { note: e.note, targetPrice: '180.0000', date: e.date })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(e)
    expect(res.json().updatedAt).toBe(res.json().createdAt)
    expect((await call(t.app, 'PATCH', `/stocks/${s}/theses/${e.id}`, {})).json()).toEqual(e)
  })

  it('TC-U-743 a real patch moves updatedAt and null clears', async () => {
    const s = await stock('TL743')
    const e = (await post(s, base({ targetPrice: '180', invalidation: 'x' }))).json()
    const res = await call(t.app, 'PATCH', `/stocks/${s}/theses/${e.id}`, { targetPrice: null, invalidation: null, type: 'update' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ targetPrice: null, invalidation: null, type: 'update' })
    expect(Date.parse(res.json().updatedAt)).toBeGreaterThan(Date.parse(res.json().createdAt))
    const bad = await call(t.app, 'PATCH', `/stocks/${s}/theses/${e.id}`, { note: '', date: '2999-01-01' })
    expect([bad.statusCode, errorPaths(bad)]).toEqual([400, ['date', 'note']])
    const unknown = await call(t.app, 'PATCH', `/stocks/${s}/theses/${e.id}`, { userId: 'x' })
    expect(errorPaths(unknown)).toEqual(['userId'])
  })

  it('TC-U-744 delete returns the entry and restore puts it back unchanged', async () => {
    const s = await stock('TL744')
    const created = (await post(s, base({ targetPrice: '42.25', invalidation: 'inv' }))).json()
    const edited = (await call(t.app, 'PATCH', `/stocks/${s}/theses/${created.id}`, { note: 'edited' })).json()
    const deleted = await call(t.app, 'DELETE', `/stocks/${s}/theses/${created.id}`)
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json()).toEqual(edited)
    expect((await call(t.app, 'GET', `/stocks/${s}/theses`)).json().items).toEqual([])
    const restored = await call(t.app, 'POST', `/stocks/${s}/theses/restore`, { entry: deleted.json() })
    expect(restored.statusCode).toBe(201)
    expect(restored.json()).toEqual(edited)
    const again = await call(t.app, 'POST', `/stocks/${s}/theses/restore`, { entry: deleted.json() })
    expect([again.statusCode, again.json().code]).toEqual([409, 'thesis_exists'])
    expect((await call(t.app, 'DELETE', `/stocks/${s}/theses/${created.id}`)).statusCode).toBe(200)
    expect((await call(t.app, 'DELETE', `/stocks/${s}/theses/${created.id}`)).statusCode).toBe(404)
  })

  it('TC-U-745 restore refuses a foreign stock, a future time and malformed entries', async () => {
    const [s1, s2] = [await stock('TL745A'), await stock('TL745B')]
    const e = (await call(t.app, 'DELETE', `/stocks/${s1}/theses/${(await post(s1, base())).json().id}`)).json()
    const restore = (path: string, entry: unknown) => call(t.app, 'POST', `/stocks/${path}/theses/restore`, { entry })
    const wrongStock = await restore(s2, e)
    expect([wrongStock.statusCode, errorPaths(wrongStock)]).toEqual([400, ['entry.stockId']])
    const future = await restore(s1, { ...e, updatedAt: new Date(Date.now() + 3_600_000).toISOString() })
    expect([future.statusCode, errorPaths(future)]).toEqual([400, ['entry.updatedAt']])
    const reversed = await restore(s1, { ...e, createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-19T00:00:00.000Z' })
    expect(errorPaths(reversed)).toEqual(['entry.updatedAt'])
    expect(errorPaths(await restore(s1, { ...e, userId: 'x', id: 'nope' }))).toEqual(['entry.id', 'entry.userId'])
    expect((await call(t.app, 'POST', `/stocks/${s1}/theses/restore`, {})).statusCode).toBe(400)
    expect((await restore(s1, { ...e, note: '' })).statusCode).toBe(400)
    expect((await restore(s1, e)).statusCode).toBe(201)
  })

  it("TC-U-746 another user's stock and entry are not found", async () => {
    const s = await stock('TL746')
    const e = (await post(s, base())).json()
    const res = [
      await call(appV, 'GET', `/stocks/${s}/theses`),
      await call(appV, 'POST', `/stocks/${s}/theses`, base()),
      await call(appV, 'PATCH', `/stocks/${s}/theses/${e.id}`, { note: 'hacked' }),
      await call(appV, 'DELETE', `/stocks/${s}/theses/${e.id}`),
      await call(appV, 'POST', `/stocks/${s}/theses/restore`, { entry: { ...e, id: '0192f0a0-0000-7000-8000-0000000000e1' } }),
    ]
    expect(res.map((r) => r.statusCode)).toEqual([404, 404, 404, 404, 404])
    expect(res.every((r) => r.json().code === 'not_found')).toBe(true)
    expect((await call(t.app, 'GET', `/stocks/${s}/theses`)).json().items).toEqual([e])
    const mine = await stock('TL746V', V)
    expect((await call(t.app, 'GET', `/stocks/${mine}/theses`)).statusCode).toBe(404)
  })

  it('TC-U-747 the date bound uses the latest date anywhere', async () => {
    const s = await stock('TL747')
    clock = new Date('2026-11-24T18:00:00Z')
    try {
      const ok = await post(s, base({ date: '2026-11-25' }))
      const bad = await post(s, base({ date: '2026-11-26' }))
      expect([ok.statusCode, bad.statusCode, errorPaths(bad)]).toEqual([201, 400, ['date']])
    } finally {
      clock = undefined
    }
  })

  it('a stock delete takes its entries with it', async () => {
    const s = await stock('TL740C')
    await post(s, base())
    expect((await call(t.app, 'DELETE', `/stocks/${s}`)).statusCode).toBe(204)
    const { rows } = await t.handle.pool.query('select count(*)::int n from app.theses where stock_id = $1', [s])
    expect(rows[0].n).toBe(0)
  })

  it('documents the five routes with bearerAuth in /openapi.json', async () => {
    const spec = (await call(t.app, 'GET', '/openapi.json')).json()
    const paths = spec.paths
    expect(Object.keys(paths['/stocks/{stockId}/theses'])).toEqual(['get', 'post'])
    expect(Object.keys(paths['/stocks/{stockId}/theses/{thesisId}'])).toEqual(['patch', 'delete'])
    expect(Object.keys(paths['/stocks/{stockId}/theses/restore'])).toEqual(['post'])
    for (const op of [paths['/stocks/{stockId}/theses'].get, paths['/stocks/{stockId}/theses/restore'].post]) {
      expect(op.security).toEqual([{ bearerAuth: [] }])
    }
  })
})

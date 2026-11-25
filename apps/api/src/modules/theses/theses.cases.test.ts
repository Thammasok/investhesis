import http from 'node:http'
import https from 'node:https'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.ts'
import { loadConfig } from '../../config/env.ts'
import { uuidv7 } from '../../lib/ids.ts'
import { baseEnv } from '../../../test/env.ts'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'

// Response bodies are parsed JSON, checked field by field below.
// oxlint-disable-next-line no-explicit-any
type Json = Record<string, any>

let t: TestApp
let appV: FastifyInstance
let clock: Date | undefined
const U = newUserId()
const V = newUserId()
const bodies: string[] = []

beforeAll(async () => {
  t = await buildTestApp(U, { now: () => clock ?? new Date() })
  appV = await t.appFor(V)
})
afterAll(() => t.cleanup())

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
const call = async (app: FastifyInstance, method: Method, url: string, payload?: unknown) => {
  const res = await app.inject({ method, url, ...(payload !== undefined && { payload: payload as object }) })
  bodies.push(res.payload)
  return res
}
const raw = async (url: string, text: string) => {
  const res = await t.app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: text })
  bodies.push(res.payload)
  return res
}
const stock = (tk: string, user = U) => seedStock(t.handle, user, tk)
const path = (s: string) => `/stocks/${s}/theses`
const base = (extra: Json = {}) => ({ type: 'buy', date: '2026-01-10', note: 'n', ...extra })
const post = (s: string, body: unknown) => call(t.app, 'POST', path(s), body)
const make = async (s: string, extra: Json = {}): Promise<Json> => (await post(s, base(extra))).json()
const list = async (s: string): Promise<Json[]> => (await call(t.app, 'GET', path(s))).json().items
const paths = (res: { json(): Json }): string[] => ((res.json().errors ?? []) as { path: string }[]).map((e) => e.path).sort()
const at = (iso: string) => new Date(iso)
const withClock = async <T>(now: Date, run: () => Promise<T>): Promise<T> => {
  clock = now
  try {
    return await run()
  } finally {
    clock = undefined
  }
}
const stored = async (id: string) =>
  (await t.handle.pool.query('select target_price::text tp, note, invalidation, entry_date::text d from app.theses where id = $1', [id])).rows[0]

describe('thesis API: create and list', () => {
  it('TC-A-704 a stock with no entries lists an empty array', async () => {
    const s = await stock('A704')
    const res = await call(t.app, 'GET', path(s))
    expect([res.statusCode, res.json()]).toEqual([200, { items: [] }])
  })

  it('TC-A-705 every type is accepted and echoed with null optionals and equal timestamps', async () => {
    const s = await stock('A705')
    for (const type of ['buy', 'sell', 'update', 'review']) {
      const res = await post(s, { type, date: '2026-01-10', note: 'n' })
      expect(res.statusCode).toBe(201)
      const e = res.json()
      expect(e).toMatchObject({ type, stockId: s, targetPrice: null, invalidation: null, date: '2026-01-10', note: 'n' })
      expect(e.createdAt).toBe(e.updatedAt)
      expect(e.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
      expect(e).not.toHaveProperty('userId')
    }
  })

  it('TC-A-706 a minimal and a full body are stored as given, with the target at four places', async () => {
    const s = await stock('A706')
    const minimal = await post(s, { type: 'buy', date: '2026-01-10', note: 'n' })
    expect([minimal.statusCode, minimal.json().targetPrice, minimal.json().invalidation]).toEqual([201, null, null])
    const full = await post(s, base({ targetPrice: '42.25', invalidation: 'x' }))
    expect(full.statusCode).toBe(201)
    expect(full.json()).toMatchObject({ targetPrice: '42.2500', invalidation: 'x' })
    expect((await stored(full.json().id)).tp).toBe('42.2500')
  })

  it('TC-A-707 target price boundaries: exact strings in, 400 on the bad shapes, no float artefact', async () => {
    const s = await stock('A707')
    const ok: [unknown, string][] = [['180', '180.0000'], ['0.0001', '0.0001'], ['12345678901234.5678', '12345678901234.5678']]
    for (const [input, out] of ok) {
      const res = await post(s, base({ targetPrice: input }))
      expect([res.statusCode, res.json().targetPrice]).toEqual([201, out])
      expect((await stored(res.json().id)).tp).toBe(out)
    }
    for (const input of ['0', '123456789012345', '1.23456', '-1', '1e3', ' 180', 180]) {
      const res = await post(s, base({ targetPrice: input }))
      expect([String(input), res.statusCode, paths(res)]).toEqual([String(input), 400, ['targetPrice']])
    }
    for (const input of ['', null]) {
      const res = await post(s, base({ targetPrice: input }))
      expect([res.statusCode, res.json().targetPrice]).toEqual([201, null])
    }
  })

  it('TC-A-708 note and invalidation length are counted in code points after trimming', async () => {
    const s = await stock('A708')
    const accepted = ['a', 'a'.repeat(10000), '😀'.repeat(10000), 'ก็'.repeat(5000)]
    for (const note of accepted) expect((await post(s, base({ note }))).statusCode).toBe(201)
    for (const note of ['a'.repeat(10001), '   ', '']) {
      const res = await post(s, base({ note }))
      expect([res.statusCode, paths(res)]).toEqual([400, ['note']])
    }
    const missing = await post(s, { type: 'buy', date: '2026-01-10' })
    expect([missing.statusCode, paths(missing)]).toEqual([400, ['note']])

    expect((await post(s, base({ invalidation: 'a'.repeat(2000) }))).statusCode).toBe(201)
    const long = await post(s, base({ invalidation: 'a'.repeat(2001) }))
    expect([long.statusCode, paths(long)]).toEqual([400, ['invalidation']])
    const blank = await post(s, base({ invalidation: '   ' }))
    expect([blank.statusCode, blank.json().invalidation]).toEqual([201, null])
  })

  it('TC-A-709 CRLF becomes LF and the text is trimmed; a lone CR is kept as typed', async () => {
    const s = await stock('A709')
    const res = await post(s, base({ note: '  Capex up\r\nMargins hold  ' }))
    expect(res.json().note).toBe('Capex up\nMargins hold')
    expect((await stored(res.json().id)).note).toBe('Capex up\nMargins hold')
    expect((await post(s, base({ note: 'a\rb' }))).json().note).toBe('a\rb')
  })

  it('TC-A-710 the date bound moves with the clock at the UTC+14 edge', async () => {
    const s = await stock('A710')
    const accepted = (date: unknown) => post(s, base({ date })).then((r) => r.statusCode)
    await withClock(at('2026-11-24T09:59:59Z'), async () => {
      expect(await accepted('2026-11-24')).toBe(201)
      expect(await accepted('2024-02-29')).toBe(201)
      for (const date of ['2026-11-25', '2025-02-29', '2026-13-01', '24/11/2026', '2026-1-5', '', 20261124]) {
        const res = await post(s, base({ date }))
        expect([String(date), res.statusCode, paths(res)]).toEqual([String(date), 400, ['date']])
      }
    })
    await withClock(at('2026-11-24T10:00:00Z'), async () => {
      expect(await accepted('2026-11-25')).toBe(201)
    })
  })

  it('TC-A-711 a NUL character is a 400 on its path in create, patch and restore, and writes nothing', async () => {
    const s = await stock('A711')
    const e = await make(s)
    const before = await list(s)
    const creates = [await post(s, base({ note: 'a\u0000b' })), await post(s, base({ invalidation: 'x\u0000' }))]
    expect(creates.map((r) => [r.statusCode, paths(r)])).toEqual([[400, ['note']], [400, ['invalidation']]])
    const patched = await call(t.app, 'PATCH', `${path(s)}/${e.id}`, { note: 'a\u0000' })
    expect([patched.statusCode, paths(patched)]).toEqual([400, ['note']])
    const restored = await call(t.app, 'POST', `${path(s)}/restore`, { entry: { ...e, id: uuidv7(), note: 'a\u0000b' } })
    expect([restored.statusCode, paths(restored)]).toEqual([400, ['entry.note']])
    expect(await list(s)).toEqual(before)
  })

  it('TC-A-712 a body that is not an object, or that carries an extra key, is 400 validation_failed with a request id', async () => {
    const s = await stock('A712')
    for (const text of ['null', '[]', '"text"', '{}']) {
      const res = await raw(path(s), text)
      expect([text, res.statusCode, res.json().code]).toEqual([text, 400, 'validation_failed'])
      expect(res.json().requestId).toBeTruthy()
    }
    const empty = await raw(path(s), '')
    expect(empty.statusCode).toBe(400)
    expect(empty.json().requestId).toBeTruthy()
    for (const key of ['userId', 'id']) {
      const res = await post(s, { ...base(), [key]: 'x' })
      expect([key, res.statusCode, res.json().code, paths(res)]).toEqual([key, 400, 'validation_failed', [key]])
      expect(res.json().requestId).toBeTruthy()
    }
    expect(await list(s)).toEqual([])
  })

  it('TC-A-713 malformed ids are 400 on all five routes; unknown well-formed ids are 404', async () => {
    const s = await stock('A713')
    const e = await make(s)
    const unknown = uuidv7()
    for (const bad of ['abc', '123']) {
      const res = [
        await call(t.app, 'GET', `/stocks/${bad}/theses`),
        await call(t.app, 'POST', `/stocks/${bad}/theses`, base()),
        await call(t.app, 'PATCH', `${path(s)}/${bad}`, { note: 'x' }),
        await call(t.app, 'DELETE', `${path(s)}/${bad}`),
        await call(t.app, 'POST', `/stocks/${bad}/theses/restore`, { entry: e }),
      ]
      expect(res.map((r) => r.statusCode)).toEqual([400, 400, 400, 400, 400])
    }
    const unknownStock = [
      await call(t.app, 'GET', path(unknown)),
      await call(t.app, 'POST', path(unknown), base()),
      await call(t.app, 'POST', `${path(unknown)}/restore`, { entry: { ...e, id: uuidv7(), stockId: unknown } }),
    ]
    expect(unknownStock.map((r) => [r.statusCode, r.json().code])).toEqual([[404, 'not_found'], [404, 'not_found'], [404, 'not_found']])
    const unknownEntry = [await call(t.app, 'PATCH', `${path(s)}/${unknown}`, { note: 'x' }), await call(t.app, 'DELETE', `${path(s)}/${unknown}`)]
    expect(unknownEntry.map((r) => [r.statusCode, r.json().code])).toEqual([[404, 'not_found'], [404, 'not_found']])
  })
})

describe('thesis API: patch', () => {
  const full = { type: 'buy', date: '2026-02-02', note: 'original', targetPrice: '180', invalidation: 'inv' }

  it('TC-A-714 a patch changes only the field it names and moves updatedAt', async () => {
    const s = await stock('A714')
    const cases: [string, Json, Json][] = [
      ['type', { type: 'sell' }, { type: 'sell' }],
      ['date', { date: '2026-03-03' }, { date: '2026-03-03' }],
      ['note', { note: 'changed' }, { note: 'changed' }],
      ['target new', { targetPrice: '200.5' }, { targetPrice: '200.5000' }],
      ['target null', { targetPrice: null }, { targetPrice: null }],
      ['target empty', { targetPrice: '' }, { targetPrice: null }],
      ['invalidation new', { invalidation: 'other' }, { invalidation: 'other' }],
      ['invalidation null', { invalidation: null }, { invalidation: null }],
      ['invalidation empty', { invalidation: '' }, { invalidation: null }],
    ]
    for (const [label, patch, expected] of cases) {
      const original = await make(s, full)
      const res = await call(t.app, 'PATCH', `${path(s)}/${original.id}`, patch)
      expect([label, res.statusCode]).toEqual([label, 200])
      const { updatedAt, ...rest } = res.json()
      const { updatedAt: _u, ...before } = original
      expect({ label, ...rest }).toEqual({ label, ...before, ...expected })
      expect(Date.parse(updatedAt)).toBeGreaterThan(Date.parse(original.createdAt))
    }
  })

  it('TC-A-715 empty strings clear both optional fields; an equal number written differently is no change', async () => {
    const s = await stock('A715')
    const e = await make(s, full)
    const cleared = await call(t.app, 'PATCH', `${path(s)}/${e.id}`, { targetPrice: '', invalidation: '' })
    expect([cleared.json().targetPrice, cleared.json().invalidation]).toEqual([null, null])
    const g = await make(s, { targetPrice: '180.0000' })
    const same = await call(t.app, 'PATCH', `${path(s)}/${g.id}`, { targetPrice: '180.00' })
    expect(same.statusCode).toBe(200)
    expect(same.json().updatedAt).toBe(same.json().createdAt)
    expect(same.json()).toEqual(g)
  })

  it('TC-A-716 an invalid patch is 400 on the right paths and leaves the entry unchanged', async () => {
    const s = await stock('A716')
    const e = await make(s, full)
    const url = `${path(s)}/${e.id}`
    const bad: [Json, string[]][] = [
      [{ note: '' }, ['note']],
      [{ date: '2999-01-01' }, ['date']],
      [{ type: 'hold' }, ['type']],
      [{ targetPrice: 0 }, ['targetPrice']],
      [{ userId: 'x' }, ['userId']],
      [{ note: '', date: 'bad' }, ['date', 'note']],
    ]
    for (const [patch, expected] of bad) {
      const res = await call(t.app, 'PATCH', url, patch)
      expect([JSON.stringify(patch), res.statusCode, paths(res)]).toEqual([JSON.stringify(patch), 400, expected])
    }
    expect(await list(s)).toEqual([e])
  })

  it('TC-A-717 updatedAt moves at least a millisecond past createdAt, forward on each edit and not on a no-op', async () => {
    const s = await stock('A717')
    const now = at('2026-11-24T09:30:00.000Z')
    await withClock(now, async () => {
      const e = await make(s)
      expect(e.createdAt).toBe(now.toISOString())
      const first = (await call(t.app, 'PATCH', `${path(s)}/${e.id}`, { note: 'changed' })).json()
      expect(Date.parse(first.updatedAt) - Date.parse(e.createdAt)).toBe(1)
      const second = (await call(t.app, 'PATCH', `${path(s)}/${e.id}`, { note: 'changed again' })).json()
      expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt))
      const noop = (await call(t.app, 'PATCH', `${path(s)}/${e.id}`, { note: 'changed again' })).json()
      expect(noop.updatedAt).toBe(second.updatedAt)
    })
  })
})

describe('thesis API: delete and restore', () => {
  it('TC-A-718 delete answers with the entry; a second delete, a patch and a wrong-stock path are 404', async () => {
    const [s1, s2] = [await stock('A718A'), await stock('A718B')]
    const e = await make(s1)
    const wrong = [await call(t.app, 'PATCH', `${path(s2)}/${e.id}`, { note: 'x' }), await call(t.app, 'DELETE', `${path(s2)}/${e.id}`)]
    expect(wrong.map((r) => r.statusCode)).toEqual([404, 404])
    expect(await list(s1)).toEqual([e])
    const del = await call(t.app, 'DELETE', `${path(s1)}/${e.id}`)
    expect([del.statusCode, del.json()]).toEqual([200, e])
    expect(await list(s1)).toEqual([])
    const again = [await call(t.app, 'DELETE', `${path(s1)}/${e.id}`), await call(t.app, 'PATCH', `${path(s1)}/${e.id}`, { note: 'x' })]
    expect(again.map((r) => r.statusCode)).toEqual([404, 404])
  })

  it('TC-A-719 restoring the middle entry brings back the same order, times and edited marker', async () => {
    const s = await stock('A719')
    const a = await make(s, { date: '2026-11-20', note: 'Capex keeps rising.\nMargins hold.', targetPrice: '180', invalidation: 'Gross margin below 65%.' })
    const b0 = await make(s, { type: 'update', date: '2026-10-03', note: 'middle' })
    const b = (await call(t.app, 'PATCH', `${path(s)}/${b0.id}`, { note: 'middle edited' })).json()
    const c = await make(s, { date: '2025-03-14', note: 'x'.repeat(700) })
    expect(Date.parse(b.updatedAt)).toBeGreaterThan(Date.parse(b.createdAt))
    const before = await list(s)
    expect(before.map((e) => e.id)).toEqual([a.id, b.id, c.id])

    const del = await call(t.app, 'DELETE', `${path(s)}/${b.id}`)
    const restored = await call(t.app, 'POST', `${path(s)}/restore`, { entry: del.json() })
    expect([restored.statusCode, restored.json()]).toEqual([201, b])
    expect(await list(s)).toEqual(before)
  })

  it("TC-A-720 an id held by another user's entry is 409 and neither side changes", async () => {
    const [su, sv] = [await stock('A720U'), await stock('A720V', V)]
    const theirs = (await call(appV, 'POST', path(sv), base({ note: 'theirs' }))).json()
    const res = await call(t.app, 'POST', `${path(su)}/restore`, { entry: { ...theirs, stockId: su } })
    expect([res.statusCode, res.json().code]).toEqual([409, 'thesis_exists'])
    expect((await call(appV, 'GET', path(sv))).json().items).toEqual([theirs])
    expect(await list(su)).toEqual([])
  })

  it('TC-A-721 restore times are bounded by the clock and must be ISO with a zone', async () => {
    const s = await stock('A721')
    const now = at('2026-11-24T09:30:00.000Z')
    const entry = (over: Json = {}) => ({
      id: uuidv7(),
      stockId: s,
      type: 'buy',
      date: '2026-01-10',
      note: 'x',
      targetPrice: null,
      invalidation: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ...over,
    })
    const restore = (e: Json) => call(t.app, 'POST', `${path(s)}/restore`, { entry: e })
    await withClock(now, async () => {
      expect((await restore(entry())).statusCode).toBe(201)
      const future = await restore(entry({ updatedAt: new Date(now.getTime() + 1).toISOString(), createdAt: now.toISOString() }))
      expect([future.statusCode, paths(future)]).toEqual([400, ['entry.updatedAt']])
      const reversed = await restore(entry({ createdAt: new Date(now.getTime() - 999).toISOString(), updatedAt: new Date(now.getTime() - 1000).toISOString() }))
      expect([reversed.statusCode, paths(reversed)]).toEqual([400, ['entry.updatedAt']])
      const noZone = await restore(entry({ createdAt: '2026-11-24T09:30:00' }))
      expect([noZone.statusCode, paths(noZone)]).toEqual([400, ['entry.createdAt']])
      const text = await restore(entry({ updatedAt: 'yesterday' }))
      expect([text.statusCode, paths(text)]).toEqual([400, ['entry.updatedAt']])
    })
  })

  it('TC-A-722 a malformed entry is 400 on its own path and inserts nothing', async () => {
    const s = await stock('A722')
    const e = await make(s)
    await call(t.app, 'DELETE', `${path(s)}/${e.id}`)
    const url = `${path(s)}/restore`
    const cases: [string, unknown, string][] = [
      ['no entry', {}, 'entry'],
      ['null', { entry: null }, 'entry'],
      ['array', { entry: [] }, 'entry'],
      ['future date', { entry: { ...e, date: '2999-01-01' } }, 'entry.date'],
      ['target 0', { entry: { ...e, targetPrice: '0' } }, 'entry.targetPrice'],
      ['type hold', { entry: { ...e, type: 'hold' } }, 'entry.type'],
      ['unknown key', { entry: { ...e, userId: 'x' } }, 'entry.userId'],
      ['bad id', { entry: { ...e, id: 'nope' } }, 'entry.id'],
    ]
    for (const [label, body, expected] of cases) {
      const res = await call(t.app, 'POST', url, body)
      expect([label, res.statusCode, paths(res)]).toEqual([label, 400, [expected]])
    }
    expect(await list(s)).toEqual([])
    expect((await t.handle.pool.query('select count(*)::int n from app.theses where id = $1', [e.id])).rows[0].n).toBe(0)
  })

  it('TC-A-723 restoring into a deleted stock is 404 and creates no entry anywhere', async () => {
    const s = await stock('A723')
    const e = await make(s)
    const deleted = (await call(t.app, 'DELETE', `${path(s)}/${e.id}`)).json()
    expect((await call(t.app, 'DELETE', `/stocks/${s}`)).statusCode).toBe(204)
    const res = await call(t.app, 'POST', `${path(s)}/restore`, { entry: deleted })
    expect([res.statusCode, res.json().code]).toEqual([404, 'not_found'])
    expect((await t.handle.pool.query('select count(*)::int n from app.theses where id = $1', [e.id])).rows[0].n).toBe(0)
  })

  it('TC-A-724 two simultaneous restores of one entry give one 201, one 409 and one row', async () => {
    const s = await stock('A724')
    const deleted = (await call(t.app, 'DELETE', `${path(s)}/${(await make(s)).id}`)).json()
    const [one, two] = await Promise.all([
      call(t.app, 'POST', `${path(s)}/restore`, { entry: deleted }),
      call(t.app, 'POST', `${path(s)}/restore`, { entry: deleted }),
    ])
    expect([one.statusCode, two.statusCode].sort()).toEqual([201, 409])
    expect([one, two].find((r) => r.statusCode === 409)?.json().code).toBe('thesis_exists')
    expect(await list(s)).toEqual([deleted])
  })
})

describe('thesis API: stock delete, isolation and wiring', () => {
  it('TC-A-725 deleting a stock removes its entries and keeps the other stock entries', async () => {
    const [a, b] = [await stock('A725A'), await stock('A725B')]
    await make(a)
    await make(a, { date: '2026-02-02' })
    const keep = await make(b)
    expect((await call(t.app, 'DELETE', `/stocks/${a}`)).statusCode).toBe(204)
    expect((await call(t.app, 'GET', path(a))).statusCode).toBe(404)
    expect((await t.handle.pool.query('select count(*)::int n from app.theses where stock_id = $1', [a])).rows[0].n).toBe(0)
    expect(await list(b)).toEqual([keep])
  })

  it("TC-A-726 each user sees only their own entries and another user's stock is 404, not empty", async () => {
    const [su, sv] = [await stock('A726U'), await stock('A726V', V)]
    const mine = await make(su, { note: 'mine' })
    const theirs = (await call(appV, 'POST', path(sv), base({ note: 'theirs' }))).json()
    expect(await list(su)).toEqual([mine])
    expect((await call(appV, 'GET', path(sv))).json().items).toEqual([theirs])
    const cross = await call(t.app, 'GET', path(sv))
    expect([cross.statusCode, cross.json().code]).toEqual([404, 'not_found'])
  })

  it('TC-A-727 a stock that belongs to someone else answers exactly as one that does not exist', async () => {
    const sv = await stock('A727V', V)
    const theirs = (await call(appV, 'POST', path(sv), base())).json()
    const unknown = uuidv7()
    const run = async (target: string) => {
      const entryId = uuidv7()
      const res = [
        await call(t.app, 'GET', path(target)),
        await call(t.app, 'POST', path(target), base()),
        await call(t.app, 'PATCH', `${path(target)}/${entryId}`, { note: 'x' }),
        await call(t.app, 'DELETE', `${path(target)}/${entryId}`),
        await call(t.app, 'POST', `${path(target)}/restore`, { entry: { ...theirs, id: uuidv7(), stockId: target } }),
      ]
      return res.map((r) => {
        const { requestId: _r, ...problem } = r.json()
        return [r.statusCode, problem]
      })
    }
    expect(await run(sv)).toEqual(await run(unknown))
  })

  it('TC-A-728 without a database every thesis route is 503 db_unavailable', async () => {
    const bare = await buildApp({ config: loadConfig({ ...baseEnv }), logStream: { write() {} } })
    try {
      const id = uuidv7()
      const stockPath = `/stocks/${id}/theses`
      const res = await Promise.all([
        bare.inject({ method: 'GET', url: stockPath }),
        bare.inject({ method: 'POST', url: stockPath, payload: base() }),
        bare.inject({ method: 'PATCH', url: `${stockPath}/${id}`, payload: { note: 'x' } }),
        bare.inject({ method: 'DELETE', url: `${stockPath}/${id}` }),
        bare.inject({ method: 'POST', url: `${stockPath}/restore`, payload: { entry: {} } }),
      ])
      expect(res.map((r) => [r.statusCode, r.json().code])).toEqual(Array(5).fill([503, 'db_unavailable']))
    } finally {
      await bare.close()
    }
  })

  it('TC-A-729 the OpenAPI document lists the five operations, the Thesis fields and BackupV2', async () => {
    const doc = (await call(t.app, 'GET', '/openapi.json')).json()
    const resolve = (schema: Json): Json => (schema['$ref'] ? doc.components.schemas[String(schema['$ref']).split('/').pop() as string] : schema)
    const ops: [string, string][] = [
      ['/stocks/{stockId}/theses', 'get'],
      ['/stocks/{stockId}/theses', 'post'],
      ['/stocks/{stockId}/theses/{thesisId}', 'patch'],
      ['/stocks/{stockId}/theses/{thesisId}', 'delete'],
      ['/stocks/{stockId}/theses/restore', 'post'],
    ]
    for (const [p, m] of ops) expect(doc.paths[p][m].security, `${m} ${p}`).toEqual([{ bearerAuth: [] }])
    const thesis = resolve(doc.paths['/stocks/{stockId}/theses'].post.responses['201'].content['application/json'].schema)
    expect(Object.keys(thesis['properties']).sort()).toEqual(
      ['createdAt', 'date', 'id', 'invalidation', 'note', 'stockId', 'targetPrice', 'type', 'updatedAt'].sort(),
    )
    expect(resolve(thesis['properties']['type'])['enum']).toEqual(['buy', 'sell', 'update', 'review'])
    const backup = resolve(doc.paths['/exports/backup.json'].get.responses['200'].content['application/json'].schema)
    expect(Object.keys(backup['properties'])).toEqual(expect.arrayContaining(['theses', 'formatVersion']))
    const version = resolve(backup['properties']['formatVersion'])
    expect(version['const'] ?? version['enum']).toEqual(version['const'] === undefined ? [2] : 2)
  })

  it('TC-A-731 the list query can use the ordering index', async () => {
    const s = await stock('A731')
    await t.handle.pool.query(
      `insert into app.theses (user_id, stock_id, type, entry_date, note, created_at, updated_at)
       select $1, $2, 'review', date '2026-01-01' - g, repeat('n', 2000), now(), now() from generate_series(1, 200) g`,
      [U, s],
    )
    const client = await t.handle.pool.connect()
    try {
      await client.query('analyze app.theses')
      // 200 rows may be read by a sequential scan; what matters is that the index can serve the filter and the order.
      await client.query('set enable_seqscan = off')
      const { rows } = await client.query(
        `explain select id from app.theses where user_id = $1 and stock_id = $2 order by entry_date desc, created_at desc, id desc`,
        [U, s],
      )
      expect(rows.map((r) => r['QUERY PLAN']).join('\n')).toContain('theses_user_stock_order')
    } finally {
      await client.query('reset enable_seqscan')
      client.release()
    }
  })
})

describe('thesis API: privacy of requests', () => {
  it('TC-A-739 no thesis route contacts anything outside the test database', async () => {
    const outbound: string[] = []
    const record = (kind: string) => (...args: unknown[]) => {
      outbound.push(`${kind} ${String(args[0])}`)
      throw new Error(`outbound ${kind} blocked`)
    }
    const spies = [
      vi.spyOn(globalThis, 'fetch').mockImplementation(record('fetch') as never),
      vi.spyOn(http, 'request').mockImplementation(record('http.request') as never),
      vi.spyOn(http, 'get').mockImplementation(record('http.get') as never),
      vi.spyOn(https, 'request').mockImplementation(record('https.request') as never),
      vi.spyOn(https, 'get').mockImplementation(record('https.get') as never),
    ]
    try {
      const s = await stock('A739')
      const e = await make(s, { targetPrice: '1', invalidation: 'x' })
      const steps = [
        await call(t.app, 'GET', path(s)),
        await call(t.app, 'PATCH', `${path(s)}/${e.id}`, { note: 'changed' }),
        await call(t.app, 'DELETE', `${path(s)}/${e.id}`),
        await call(t.app, 'POST', `${path(s)}/restore`, { entry: e }),
        await call(t.app, 'GET', '/exports/backup.json'),
      ]
      expect(steps.map((r) => r.statusCode)).toEqual([200, 200, 200, 201, 200])
      expect(outbound).toEqual([])
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })

  it('TC-A-730 no response body of this file carries a user id key', () => {
    expect(bodies.length).toBeGreaterThan(40)
    const keys = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap(keys)
        : value !== null && typeof value === 'object'
          ? Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)])
          : []
    const offenders = bodies.filter((b) => {
      try {
        return keys(JSON.parse(b)).some((k) => /^user_?id$/i.test(k))
      } catch {
        return false
      }
    })
    expect(offenders).toEqual([])
  })
})

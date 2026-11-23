import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { seedList, seedMembership, seedStock } from '../../../test/seed.ts'
import * as repo from './stocks.repository.ts'

let t: TestApp
let app: FastifyInstance
const V = newUserId()
let appV: FastifyInstance

beforeAll(async () => {
  t = await buildTestApp()
  app = t.app
  appV = await t.appFor(V)
})
afterAll(() => t.cleanup())

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
const call = (a: FastifyInstance, method: Method, url: string, payload?: unknown) =>
  a.inject({ method, url, ...(payload !== undefined && { payload: payload as object }) })
const create = (body: object, a = app) => call(a, 'POST', '/stocks', body)
const nvda = { ticker: 'nvda', market: 'US', exchange: 'NASDAQ', name: 'NVIDIA', gicsSector: 'Information Technology', style: 'Growth' }
const count = async (sql: string, args: unknown[]) => Number((await t.handle.pool.query(sql, args)).rows[0].n)
const UNKNOWN_ID = '0192f0a0-0000-7000-8000-0000000000fe'

describe('POST /stocks', () => {
  it('TC-U-040 creates a US stock with lenses and a defaulted cycle', async () => {
    const res = await create(nvda)
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({
      ticker: 'NVDA',
      currency: 'USD',
      economicCycle: 'Sensitive',
      lensSources: { gicsSector: 'manual', style: 'manual', economicCycle: 'default' },
    })
    expect(Object.keys(body.lensSources).sort()).toEqual(['economicCycle', 'gicsSector', 'style'])
    expect(res.headers['location']).toBe(`/stocks/${body.id}`)
    expect((await call(app, 'GET', `/stocks/${body.id}`)).json()).toEqual(body)
  })

  it('TC-U-040 response shape: null for unset single values, [] for unset arrays', async () => {
    const res = await create({ ticker: 'MINI', market: 'US', exchange: 'NYSE', name: 'Minimal' })
    expect(res.json()).toEqual({
      id: expect.any(String),
      market: 'US',
      ticker: 'MINI',
      exchange: 'NYSE',
      currency: 'USD',
      name: 'Minimal',
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
      lensSources: {},
      listIds: [],
      holding: null,
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
      updatedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
    })
  })

  it('TC-U-040 an explicit cycle is manual and multi-value lenses are tracked', async () => {
    const res = await create({
      ticker: 'FULL',
      market: 'US',
      exchange: 'NYSE',
      name: 'Full',
      gicsSector: 'Utilities',
      economicCycle: 'Cyclical',
      themes: ['AI'],
      indexMembership: ['S&P 500'],
    })
    expect(res.json()).toMatchObject({ economicCycle: 'Cyclical', indexMembership: ['S&P 500'], themes: ['AI'] })
    expect(res.json().lensSources).toEqual({ gicsSector: 'manual', economicCycle: 'manual', themes: 'manual' })
  })

  it('TC-U-041 a duplicate market and ticker is refused with the existing id', async () => {
    const first = (await create({ ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', name: 'Apple' })).json()
    const res = await create({ ticker: 'aapl', market: 'US', exchange: 'NASDAQ', name: 'Apple Inc' })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ status: 409, code: 'stock_exists', existingStockId: first.id })
    expect(await count("select count(*) n from app.stocks where user_id = $1 and ticker = 'AAPL'", [t.userId])).toBe(1)
  })

  it('TC-U-042 the same ticker in another market is a different stock', async () => {
    expect((await create({ ticker: 'TRUE', market: 'US', exchange: 'NYSE', name: 'True Inc' })).statusCode).toBe(201)
    const th = await create({ ticker: 'TRUE', market: 'TH', exchange: 'SET', name: 'True Corporation' })
    expect(th.statusCode).toBe(201)
    expect(th.json()).toMatchObject({ currency: 'THB', market: 'TH' })
  })

  it('TC-U-048 a Thai name round-trips byte for byte', async () => {
    const name = 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม'
    const res = await create({ ticker: 'PTTEP', market: 'TH', exchange: 'SET', name, gicsSector: 'Energy', setIndustryGroup: 'Resources' })
    expect(res.statusCode).toBe(201)
    const got = (await call(app, 'GET', `/stocks/${res.json().id}`)).json().name
    expect(got).toBe(name)
    expect(Buffer.from(got).equals(Buffer.from(name))).toBe(true)
    expect((await t.handle.pool.query('select name from app.stocks where id = $1', [res.json().id])).rows[0].name).toBe(name)
  })

  it('TC-U-040 validation errors carry field paths and save nothing', async () => {
    const bad = await create({ ticker: 'BAD1', market: 'US', exchange: 'SET', name: 'Bad', valueChainPosition: 'Upstream' })
    expect(bad.statusCode).toBe(400)
    const body = bad.json()
    expect(body.code).toBe('validation_failed')
    expect(body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['exchange', 'valueChain'])
    const unknown = await create({ ticker: 'BAD2', market: 'US', exchange: 'NYSE', name: 'x', currency: 'THB' })
    expect(unknown.statusCode).toBe(400)
    expect(unknown.json().errors[0].path).toBe('currency')
    const badList = await create({ ticker: 'BAD3', market: 'US', exchange: 'NYSE', name: 'x', listIds: ['nope'] })
    expect(badList.statusCode).toBe(400)
    expect(badList.json().errors[0].path).toBe('listIds.0')
    expect(await count("select count(*) n from app.stocks where user_id = $1 and ticker like 'BAD%'", [t.userId])).toBe(0)
  })

  it('TC-U-040 a NUL character is a 400, not a 500', async () => {
    const res = await create({ ticker: 'NUL1', market: 'US', exchange: 'NYSE', name: 'a\u0000b' })
    expect(res.statusCode).toBe(400)
    expect(res.json().errors[0].path).toBe('name')
    const themes = await create({ ticker: 'NUL1', market: 'US', exchange: 'NYSE', name: 'ok', themes: ['x\u0000'] })
    expect(themes.statusCode).toBe(400)
  })

  it('TC-U-040 listIds add memberships in the same transaction', async () => {
    const l1 = await seedList(t.handle, t.userId, 'POST L1')
    const l2 = await seedList(t.handle, t.userId, 'POST L2')
    const res = await create({ ticker: 'INL', market: 'US', exchange: 'NYSE', name: 'In lists', listIds: [l1, l2, l1] })
    expect(res.statusCode).toBe(201)
    expect(res.json().listIds.sort()).toEqual([l1, l2].sort())
    expect(await count('select count(*) n from app.list_stocks where stock_id = $1', [res.json().id])).toBe(2)
  })

  it('TC-U-040 a foreign or unknown listId is 404 and saves nothing', async () => {
    const lv = await seedList(t.handle, V, 'V own list')
    const mine = await seedList(t.handle, t.userId, 'POST mine')
    for (const listIds of [[lv], [mine, lv], [UNKNOWN_ID]]) {
      const res = await create({ ticker: 'NOLIST', market: 'US', exchange: 'NYSE', name: 'x', listIds })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('not_found')
    }
    expect(await count("select count(*) n from app.stocks where ticker = 'NOLIST'", [])).toBe(0)
  })

  it('TC-A-122 parallel creates of one stock give one 201 and four 409', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => create({ ticker: 'RACE', market: 'US', exchange: 'NYSE', name: 'Race' })),
    )
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409, 409, 409])
    const winner = results.find((r) => r.statusCode === 201)?.json().id
    for (const r of results.filter((x) => x.statusCode === 409)) expect(r.json().existingStockId).toBe(winner)
  })
})

describe('GET /stocks', () => {
  it('TC-U-047 filters by list and orders by ticker', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    const [aapl = '', msft = '', pttep = ''] = await Promise.all(['AAPL', 'MSFT', 'PTTEP'].map((tk) => seedStock(t.handle, u, tk)))
    const l = await seedList(t.handle, u, 'TC-U-047')
    await seedMembership(t.handle, u, l, pttep)
    await seedMembership(t.handle, u, l, aapl)
    const all = (await call(a, 'GET', '/stocks')).json().items
    expect(all.map((s: { ticker: string }) => s.ticker)).toEqual(['AAPL', 'MSFT', 'PTTEP'])
    const filtered = (await call(a, 'GET', `/stocks?listId=${l}`)).json().items
    expect(filtered.map((s: { ticker: string }) => s.ticker)).toEqual(['AAPL', 'PTTEP'])
    for (const s of filtered) expect(s.listIds).toContain(l)
    expect(all.find((s: { id: string }) => s.id === msft).listIds).toEqual([])
    expect((await call(a, 'GET', `/stocks?listId=${UNKNOWN_ID}`)).statusCode).toBe(404)
    expect((await call(a, 'GET', '/stocks?listId=nope')).statusCode).toBe(400)
  })

  it('TC-U-047 a new user has no stocks', async () => {
    expect((await call(await t.appFor(newUserId()), 'GET', '/stocks')).json()).toEqual({ items: [] })
  })
})

describe('PATCH /stocks/{id}', () => {
  it('TC-U-043 market and ticker cannot be patched', async () => {
    const s = (await create({ ticker: 'MSFT', market: 'US', exchange: 'NASDAQ', name: 'Microsoft' })).json()
    for (const body of [{ ticker: 'MSFT2' }, { market: 'TH' }]) {
      const res = await call(app, 'PATCH', `/stocks/${s.id}`, body)
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('validation_failed')
    }
    expect((await call(app, 'GET', `/stocks/${s.id}`)).json()).toEqual(s)
  })

  it('TC-U-044 a manual cycle survives a sector change; a default cycle follows it', async () => {
    const s1 = (await create({ ticker: 'U441', market: 'US', exchange: 'NYSE', name: 'a', gicsSector: 'Utilities' })).json()
    const s2 = (await create({ ticker: 'U442', market: 'US', exchange: 'NYSE', name: 'b', gicsSector: 'Utilities', economicCycle: 'Cyclical' })).json()
    expect(s1).toMatchObject({ economicCycle: 'Defensive', lensSources: { economicCycle: 'default' } })
    const p1 = (await call(app, 'PATCH', `/stocks/${s1.id}`, { gicsSector: 'Energy' })).json()
    const p2 = (await call(app, 'PATCH', `/stocks/${s2.id}`, { gicsSector: 'Energy' })).json()
    expect(p1).toMatchObject({ gicsSector: 'Energy', economicCycle: 'Sensitive', lensSources: { economicCycle: 'default', gicsSector: 'manual' } })
    expect(p2).toMatchObject({ economicCycle: 'Cyclical', lensSources: { economicCycle: 'manual' } })
  })

  it('TC-U-044 clearing the sector drops a default cycle; clearing the cycle falls back to the default', async () => {
    const s = (await create({ ticker: 'U443', market: 'US', exchange: 'NYSE', name: 'a', gicsSector: 'Utilities', economicCycle: 'Cyclical' })).json()
    const back = (await call(app, 'PATCH', `/stocks/${s.id}`, { economicCycle: null })).json()
    expect(back).toMatchObject({ economicCycle: 'Defensive', lensSources: { economicCycle: 'default' } })
    const gone = (await call(app, 'PATCH', `/stocks/${s.id}`, { gicsSector: null })).json()
    expect(gone.economicCycle).toBeNull()
    expect(gone.lensSources).toEqual({})
  })

  it('TC-U-045 null clears a lens and removes its source; omitted fields are untouched', async () => {
    const s = (await create({ ticker: 'U45', market: 'US', exchange: 'NYSE', name: 'a', moat: 'Brand', style: 'Value', themes: ['AI'] })).json()
    const res = (await call(app, 'PATCH', `/stocks/${s.id}`, { moat: null, themes: [] })).json()
    expect(res).toMatchObject({ moat: null, style: 'Value', themes: [] })
    expect('moat' in res.lensSources).toBe(false)
    expect('themes' in res.lensSources).toBe(false)
    expect(res.lensSources.style).toBe('manual')
    expect(res.updatedAt >= s.updatedAt).toBe(true)
    expect(res.createdAt).toBe(s.createdAt)
  })

  it('TC-U-045 a patched lens becomes manual', async () => {
    const s = (await create({ ticker: 'U451', market: 'US', exchange: 'NYSE', name: 'a' })).json()
    const res = (await call(app, 'PATCH', `/stocks/${s.id}`, { size: 'Large', name: 'Renamed' })).json()
    expect(res).toMatchObject({ name: 'Renamed', size: 'Large', lensSources: { size: 'manual' } })
  })

  it('TC-U-045 cross-field rules are checked against the stored stock', async () => {
    const th = (await create({ ticker: 'XF1', market: 'TH', exchange: 'SET', name: 'a', gicsSector: 'Energy', setIndustryGroup: 'Resources' })).json()
    const a = await call(app, 'PATCH', `/stocks/${th.id}`, { setIndustryGroup: null })
    expect(a.statusCode).toBe(400)
    expect(a.json().errors[0].path).toBe('setIndustryGroup')
    const b = await call(app, 'PATCH', `/stocks/${th.id}`, { exchange: 'NYSE' })
    expect(b.statusCode).toBe(400)
    expect(b.json().errors[0].path).toBe('exchange')
    const c = await call(app, 'PATCH', `/stocks/${th.id}`, { exchange: 'mai', indexMembership: ['SET50'] })
    expect(c.statusCode).toBe(200)
    expect((await call(app, 'GET', `/stocks/${th.id}`)).json()).toMatchObject({ exchange: 'mai', setIndustryGroup: 'Resources' })
    const us = (await create({ ticker: 'XF2', market: 'US', exchange: 'NYSE', name: 'a', valueChain: 'Chips', valueChainPosition: 'Upstream' })).json()
    const d = await call(app, 'PATCH', `/stocks/${us.id}`, { valueChain: null })
    expect(d.statusCode).toBe(400)
    expect(d.json().errors[0].path).toBe('valueChain')
    expect((await call(app, 'PATCH', `/stocks/${us.id}`, { name: 'a\u0000' })).statusCode).toBe(400)
    expect((await call(app, 'PATCH', `/stocks/${us.id}`, { lensSources: {} })).statusCode).toBe(400)
  })

  it('TC-U-045 an empty patch is a no-op that returns the stock', async () => {
    const s = (await create({ ticker: 'EMPTY', market: 'US', exchange: 'NYSE', name: 'a', style: 'Value' })).json()
    const res = await call(app, 'PATCH', `/stocks/${s.id}`, {})
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ...s, updatedAt: expect.any(String) })
  })
})

describe('DELETE /stocks/{id}', () => {
  it('TC-U-046 delete removes the stock from every list', async () => {
    const s = (await create({ ticker: 'DEL', market: 'US', exchange: 'NYSE', name: 'a' })).json()
    const l1 = await seedList(t.handle, t.userId, 'DEL L1')
    const l2 = await seedList(t.handle, t.userId, 'DEL L2')
    await seedMembership(t.handle, t.userId, l1, s.id)
    await seedMembership(t.handle, t.userId, l2, s.id)
    const counts = async () => (await call(app, 'GET', '/lists')).json().items.filter((l: { id: string }) => [l1, l2].includes(l.id)).map((l: { stockCount: number }) => l.stockCount)
    expect(await counts()).toEqual([1, 1])
    expect((await call(app, 'DELETE', `/stocks/${s.id}`)).statusCode).toBe(204)
    expect(await counts()).toEqual([0, 0])
    expect((await call(app, 'GET', `/stocks/${s.id}`)).statusCode).toBe(404)
    expect((await call(app, 'DELETE', `/stocks/${s.id}`)).statusCode).toBe(404)
  })
})

describe('isolation and errors', () => {
  it('TC-A-102 two-user proof for stocks', async () => {
    const su = (await create({ ...nvda, ticker: 'A102' })).json()
    const lu = await seedList(t.handle, t.userId, 'LU A102')
    await seedMembership(t.handle, t.userId, lu, su.id)
    const before = (await call(app, 'GET', `/stocks/${su.id}`)).json()
    const av = (await create({ ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', name: 'Apple' }, appV)).json()

    const mine = (await call(appV, 'GET', '/stocks')).json().items.map((s: { id: string }) => s.id)
    expect(mine).toEqual([av.id])
    const never = await call(appV, 'GET', `/stocks/${UNKNOWN_ID}`)
    const strip = (r: Awaited<ReturnType<typeof call>>) => ({ ...r.json(), requestId: undefined, detail: undefined })
    for (const [method, payload] of [['GET'], ['PATCH', { name: 'Hacked' }], ['DELETE']] as [Method, object?][]) {
      const res = await call(appV, method, `/stocks/${su.id}`, payload)
      expect(res.statusCode).toBe(404)
      expect(strip(res)).toEqual(strip(never))
    }
    expect((await call(appV, 'GET', `/stocks?listId=${lu}`)).statusCode).toBe(404)
    const foreign = await create({ ticker: 'V1', market: 'US', exchange: 'NYSE', name: 'x', listIds: [lu] }, appV)
    expect(foreign.statusCode).toBe(404)
    expect(await count("select count(*) n from app.stocks where user_id = $1 and ticker = 'V1'", [V])).toBe(0)
    const own = await create({ ...nvda, ticker: 'A102' }, appV)
    expect(own.statusCode).toBe(201)
    expect(own.json().id).not.toBe(su.id)
    expect((await call(app, 'GET', `/stocks/${su.id}`)).json()).toEqual(before)
  })

  it('TC-A-105 the owner comes from the token, never from the body', async () => {
    const base = { ticker: 'A105', market: 'US', exchange: 'NYSE', name: 'x' }
    for (const extra of [{ userId: V }, { user_id: V }, { lensSources: { economicCycle: 'auto' } }, { id: UNKNOWN_ID }]) {
      const res = await create({ ...base, ...extra })
      expect(res.statusCode).toBe(400)
    }
    const res = await t.app.inject({ method: 'POST', url: '/stocks', payload: base, headers: { 'x-user-id': V } })
    expect(res.statusCode).toBe(201)
    expect((await t.handle.pool.query('select user_id from app.stocks where id = $1', [res.json().id])).rows[0].user_id).toBe(t.userId)
    expect(await count('select count(*) n from app.stocks where user_id = $1', [V])).toBe(
      (await call(appV, 'GET', '/stocks')).json().items.length,
    )
  })

  it('TC-A-123 stock errors are RFC 7807 with a stable code and request id', async () => {
    await create({ ticker: 'E123', market: 'US', exchange: 'NYSE', name: 'x' })
    const cases: [Awaited<ReturnType<typeof create>>, number, string][] = [
      [await create({ ticker: '', market: 'US' }), 400, 'validation_failed'],
      [await call(app, 'GET', `/stocks/${UNKNOWN_ID}`), 404, 'not_found'],
      [await call(app, 'GET', '/stocks/not-a-uuid'), 400, 'validation_failed'],
      [await create({ ticker: 'e123', market: 'US', exchange: 'NYSE', name: 'x' }), 409, 'stock_exists'],
    ]
    for (const [res, status, code] of cases) {
      expect(res.headers['content-type']).toContain('application/problem+json')
      expect(res.json()).toMatchObject({ status, code, requestId: res.headers['x-request-id'] })
      expect(res.body).not.toMatch(/stocks_user_market_ticker|insert into|duplicate key/i)
      expect('existingStockId' in res.json()).toBe(code === 'stock_exists')
    }
  })

  it('TC-A-124 (stocks part) all five routes are in the OpenAPI spec with bearerAuth', async () => {
    const spec = (await app.inject('/openapi.json')).json()
    const routes: [string, string][] = [
      ['/stocks', 'get'],
      ['/stocks', 'post'],
      ['/stocks/{id}', 'get'],
      ['/stocks/{id}', 'patch'],
      ['/stocks/{id}', 'delete'],
    ]
    for (const [path, method] of routes) {
      const op = spec.paths[path]?.[method]
      expect(op, `${method} ${path}`).toBeDefined()
      expect(op.security).toEqual([{ bearerAuth: [] }])
      expect(Object.keys(op.responses).length).toBeGreaterThan(1)
    }
    expect(spec.paths['/stocks'].post.requestBody).toBeDefined()
    expect(spec.paths['/stocks/{id}'].patch.requestBody).toBeDefined()
    expect(Object.keys(spec.paths['/stocks'].post.responses)).toEqual(expect.arrayContaining(['201', '400', '404', '409']))
    const ok = spec.paths['/stocks/{id}'].get.responses['200'].content['application/json'].schema
    expect(Object.keys(ok.properties)).toEqual(
      expect.arrayContaining(['id', 'market', 'ticker', 'currency', 'lensSources', 'listIds', 'gicsSector', 'themes', 'createdAt']),
    )
    expect(ok.properties.gicsSector.anyOf ?? ok.properties.gicsSector.type).toBeDefined()
    expect(ok.properties.themes.type).toBe('array')
  })
})

describe('repository (for the import module)', () => {
  it('TC-U-041 (repository) findByMarketTickers is user-scoped; insertMany skips existing pairs', async () => {
    const u = newUserId()
    const row = (ticker: string, market: 'US' | 'TH' = 'US') => ({
      id: crypto.randomUUID(),
      market,
      ticker,
      exchange: market === 'US' ? 'NYSE' : 'SET',
      currency: market === 'US' ? 'USD' : 'THB',
      name: ticker,
    })
    try {
      const first = await repo.insertMany(t.handle.db, u, [row('R1'), row('R2'), row('R2')])
      expect(first.map((r) => r.ticker).sort()).toEqual(['R1', 'R2'])
      const again = await repo.insertMany(t.handle.db, u, [row('R1'), row('R3'), row('R1', 'TH')])
      expect(again.map((r) => `${r.market}/${r.ticker}`).sort()).toEqual(['TH/R1', 'US/R3'])
      const found = await repo.findByMarketTickers(t.handle.db, u, [
        { market: 'US', ticker: 'R1' },
        { market: 'TH', ticker: 'R2' },
        { market: 'US', ticker: 'R3' },
      ])
      expect(found.map((r) => `${r.market}/${r.ticker}`).sort()).toEqual(['US/R1', 'US/R3'])
      expect(await repo.findByMarketTickers(t.handle.db, V, [{ market: 'US', ticker: 'R1' }])).toEqual([])
      expect(await repo.findByMarketTickers(t.handle.db, u, [])).toEqual([])
      expect(await repo.insertMany(t.handle.db, u, [])).toEqual([])
      const id = found.find((r) => r.ticker === 'R1')?.id ?? ''
      expect(await repo.updateStock(t.handle.db, V, id, { name: 'x' })).toBeUndefined()
      expect((await repo.updateStock(t.handle.db, u, id, { name: 'Changed' }))?.name).toBe('Changed')
    } finally {
      await t.handle.pool.query('delete from app.stocks where user_id = $1', [u])
    }
  })
})

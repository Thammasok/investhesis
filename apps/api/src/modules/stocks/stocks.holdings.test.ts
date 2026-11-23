import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { csv } from '../../../test/fixtures/imports/build.ts'
import { filePart, multipart } from '../../../test/multipart.ts'
import { seedList, seedMembership, seedStock } from '../../../test/seed.ts'
import { REDACT_PATHS } from '../../lib/logger.ts'

const logs: string[] = []
const capture = { write: (line: string) => void logs.push(line) }

let t: TestApp
let app: FastifyInstance
const V = newUserId()
let appV: FastifyInstance

beforeAll(async () => {
  t = await buildTestApp(newUserId(), { logStream: capture })
  app = t.app
  appV = await t.appFor(V)
  await t.handle.pool.query('alter table app.holdings drop constraint if exists hc_probe')
  await t.handle.pool.query('alter table app.holdings add constraint hc_probe check (average_cost is distinct from 7777.7777) not valid')
})
afterAll(async () => {
  await t.handle.pool.query('alter table app.holdings drop constraint if exists hc_probe')
  await t.cleanup()
})

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
const call = (a: FastifyInstance, method: Method, url: string, payload?: unknown) =>
  a.inject({ method, url, ...(payload !== undefined && { payload: payload as object }) })
const base = (ticker: string, extra: object = {}) => ({ ticker, market: 'US', exchange: 'NASDAQ', name: `${ticker} Inc`, ...extra })
const th = (ticker: string, extra: object = {}) => ({ ticker, market: 'TH', exchange: 'SET', name: `${ticker} Plc`, ...extra })
const create = (body: object, a = app) => call(a, 'POST', '/stocks', body)
const rows = async (sql: string, args: unknown[] = []) => (await t.handle.pool.query(sql, args)).rows
const count = async (sql: string, args: unknown[] = []) => Number((await rows(sql, args))[0].n)
const holdingRows = (userId: string) => count('select count(*) n from app.holdings where user_id = $1', [userId])
const UNKNOWN_ID = '0192f0a0-0000-7000-8000-0000000000fe'

describe('POST /stocks with holding', () => {
  it('TC-U-430 creates a held stock in one call', async () => {
    const list = await seedList(t.handle, t.userId, 'L430')
    const res = await create(base('NVDA', { listIds: [list], holding: { shares: '120.5', averageCost: '412.33' } }))
    expect(res.statusCode).toBe(201)
    expect(res.json().holding).toEqual({ shares: '120.5000', averageCost: '412.3300', costCurrency: 'USD' })
    expect(res.json().listIds).toEqual([list])
  })

  it('TC-U-431 a bad holding saves nothing', async () => {
    const before = await count('select count(*) n from app.stocks where user_id = $1', [t.userId])
    const res = await create(base('BAD431', { holding: { shares: '0' } }))
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('validation_failed')
    expect(res.json().errors.map((e: { path: string }) => e.path)).toEqual(['holding.shares'])
    expect(await count('select count(*) n from app.stocks where user_id = $1', [t.userId])).toBe(before)
  })

  it('TC-A-408 holding omitted, null and {}', async () => {
    const [a, b, c] = [
      (await create(base('H408A'))).json(),
      (await create(base('H408B', { holding: null }))).json(),
      (await create(base('H408C', { holding: {} }))).json(),
    ]
    expect([a.holding, b.holding]).toEqual([null, null])
    expect(c.holding).toEqual({ shares: null, averageCost: null, costCurrency: 'USD' })
    expect(await count('select count(*) n from app.holdings where stock_id = any($1)', [[a.id, b.id, c.id]])).toBe(1)
  })

  it('TC-A-406 cost currency defaults to the stock currency', async () => {
    const cases: [object, string][] = [
      [base('C1', { holding: {} }), 'USD'],
      [th('C2', { holding: {} }), 'THB'],
      [th('C3', { holding: { costCurrency: 'USD' } }), 'USD'],
      [base('C4', { holding: { costCurrency: 'THB' } }), 'THB'],
    ]
    for (const [body, want] of cases) expect((await create(body)).json().holding.costCurrency).toBe(want)
    for (const bad of ['EUR', 'usd', null]) {
      const res = await create(base('C5', { holding: { costCurrency: bad } }))
      expect(res.statusCode).toBe(400)
      expect(res.json().errors[0].path).toBe('holding.costCurrency')
    }
  })

  it('TC-A-405 decimals stay exact strings from the database to the JSON', async () => {
    const cases: [string, string, string, string][] = [
      ['0.0001', '0', '0.0001', '0.0000'],
      ['99999999999999.9999', '99999999999999.9999', '99999999999999.9999', '99999999999999.9999'],
      ['120.50', '412.3', '120.5000', '412.3000'],
      ['0.1000', '0.2000', '0.1000', '0.2000'],
    ]
    for (const [i, [shares, averageCost, s, c]] of cases.entries()) {
      const res = await create(base(`D${i}`, { holding: { shares, averageCost } }))
      expect(res.payload).toContain(`"shares":"${s}"`)
      expect(res.payload).toContain(`"averageCost":"${c}"`)
      const listed = (await call(app, 'GET', '/stocks')).payload
      expect(listed).toContain(`"shares":"${s}"`)
      expect(listed).not.toMatch(/"(shares|averageCost)":\d/)
    }
  })

  it('TC-A-407 holding validation table', async () => {
    const bad: [unknown, string][] = [
      [{ shares: '0' }, 'holding.shares'],
      [{ shares: '0.0000' }, 'holding.shares'],
      [{ shares: '100000000000000' }, 'holding.shares'],
      [{ shares: '1.23456' }, 'holding.shares'],
      [{ shares: 10 }, 'holding.shares'],
      [{ shares: '1e3' }, 'holding.shares'],
      [{ shares: ' 1' }, 'holding.shares'],
      [{ shares: '' }, 'holding.shares'],
      [{ shares: '.5' }, 'holding.shares'],
      [{ averageCost: '-0.0001' }, 'holding.averageCost'],
      [{ averageCost: 1.5 }, 'holding.averageCost'],
      [{ averageCost: '1.23456' }, 'holding.averageCost'],
      [{ price: '1' }, 'holding.price'],
      ['yes', 'holding'],
      [[], 'holding'],
    ]
    const before = await count('select count(*) n from app.stocks where user_id = $1', [t.userId])
    for (const [holding, path] of bad) {
      const res = await create(base('V407', { holding }))
      expect(res.statusCode).toBe(400)
      expect(res.json().errors[0].path).toBe(path)
      expect(res.json().requestId).toBeTruthy()
    }
    expect(await count('select count(*) n from app.stocks where user_id = $1', [t.userId])).toBe(before)
    expect((await create(base('V407', { holding: { averageCost: '0' } }))).statusCode).toBe(201)
  })

  it('TC-A-403 the owner never comes from the body', async () => {
    const mine = (await create(base('O403'))).json()
    const first = await create(base('O4031', { holding: { shares: '1', userId: V, stockId: mine.id } }))
    expect(first.statusCode).toBe(400)
    expect(first.json().errors.map((e: { path: string }) => e.path).sort()).toEqual(['holding.stockId', 'holding.userId'])
    const second = await call(app, 'PATCH', `/stocks/${mine.id}`, { holding: { shares: '1', user_id: V } })
    expect(second.json().errors[0].path).toBe('holding.user_id')
    const third = await create(base('O4033', { userId: V, holding: { shares: '1' } }))
    expect(third.statusCode).toBe(400)
    expect(third.json().errors[0].path).toBe('userId')
    const header = await app.inject({ method: 'PATCH', url: `/stocks/${mine.id}`, headers: { 'x-user-id': V }, payload: { holding: { shares: '1' } } })
    expect(header.statusCode).toBe(200)
    expect(await holdingRows(V)).toBe(0)
  })

  it('TC-A-409 a create with a holding is atomic', async () => {
    const lv = await seedList(t.handle, V, 'LV409')
    const foreign = await create(base('ATOM', { listIds: [lv], holding: { shares: '5', averageCost: '1' } }))
    expect(foreign.statusCode).toBe(404)
    expect(await count("select count(*) n from app.stocks where user_id = $1 and ticker = 'ATOM'", [t.userId])).toBe(0)

    const probe = await create(base('ATOM', { holding: { shares: '5', averageCost: '7777.7777' } }))
    expect(probe.statusCode).toBe(500)
    expect(probe.payload).not.toContain('7777')
    expect(await count("select count(*) n from app.stocks where user_id = $1 and ticker = 'ATOM'", [t.userId])).toBe(0)

    const aapl = (await create(base('AAPL409'))).json()
    const dup = await create(base('AAPL409', { holding: { shares: '3' } }))
    expect(dup.statusCode).toBe(409)
    expect(dup.json().existingStockId).toBe(aapl.id)
    expect(await count('select count(*) n from app.holdings where stock_id = $1', [aapl.id])).toBe(0)
  })
})

describe('PATCH /stocks/{id} with holding', () => {
  it('TC-U-432 and TC-A-410 holding is replace, null deletes, omitted keeps', async () => {
    const s = (await create(th('S432'))).json()
    const patch = (body: object) => call(app, 'PATCH', `/stocks/${s.id}`, body)
    expect((await patch({ holding: { shares: '10', averageCost: '5', costCurrency: 'USD' } })).json().holding).toEqual({ shares: '10.0000', averageCost: '5.0000', costCurrency: 'USD' })
    expect((await patch({ holding: { shares: '20' } })).json().holding).toEqual({ shares: '20.0000', averageCost: null, costCurrency: 'THB' })
    const renamed = (await patch({ name: 'Renamed' })).json()
    expect([renamed.name, renamed.holding]).toEqual(['Renamed', { shares: '20.0000', averageCost: null, costCurrency: 'THB' }])
    expect((await patch({ holding: {} })).json().holding).toEqual({ shares: null, averageCost: null, costCurrency: 'THB' })
    const twice = [(await patch({ holding: { shares: '30', averageCost: '1' } })).json(), (await patch({ holding: { shares: '30', averageCost: '1' } })).json()]
    expect(twice[0].holding).toEqual(twice[1].holding)
    expect(await count('select count(*) n from app.holdings where stock_id = $1', [s.id])).toBe(1)
    expect((await patch({ holding: null })).json().holding).toBeNull()
    expect(await count('select count(*) n from app.holdings where stock_id = $1', [s.id])).toBe(0)
    const again = await patch({ holding: null })
    expect([again.statusCode, again.json().holding]).toEqual([200, null])
    const both = (await patch({ style: 'Value', holding: { shares: '1' } })).json()
    expect([both.style, both.holding.shares]).toEqual(['Value', '1.0000'])
  })

  it('TC-U-433 and TC-A-411 holding cannot sneak into StockPatch and writes are atomic', async () => {
    const s = (await create(base('S433', { holding: { shares: '10', averageCost: '5' } }))).json()
    const patch = (body: object) => call(app, 'PATCH', `/stocks/${s.id}`, body)
    const sneaky = await patch({ holding: { shares: '1' }, ticker: 'Y' })
    expect(sneaky.statusCode).toBe(400)
    expect(sneaky.json().errors[0].path).toBe('ticker')
    const bad = await patch({ name: 'New', holding: { shares: '0' } })
    expect(bad.json().errors[0].path).toBe('holding.shares')
    const only = (await patch({ holding: { shares: '1' } })).json()
    expect([only.name, only.lensSources, only.holding.shares]).toEqual([s.name, s.lensSources, '1.0000'])
    expect((await patch({})).statusCode).toBe(200)
    const probe = await patch({ name: 'New', holding: { shares: '9', averageCost: '7777.7777' } })
    expect(probe.statusCode).toBe(500)
    const now = (await call(app, 'GET', `/stocks/${s.id}`)).json()
    expect([now.name, now.holding.shares]).toEqual([s.name, '1.0000'])
  })

  it('TC-A-420 concurrent holding writes leave one consistent row', async () => {
    const s = (await create(base('S420'))).json()
    const bodies = [...Array.from({ length: 10 }, (_, i) => ({ holding: { shares: String(i + 1) } })), ...Array.from({ length: 3 }, () => ({ holding: null }))]
    const results = await Promise.all(bodies.map((b) => call(app, 'PATCH', `/stocks/${s.id}`, b)))
    expect(results.map((r) => r.statusCode)).toEqual(bodies.map(() => 200))
    expect(await count('select count(*) n from app.holdings where stock_id = $1', [s.id])).toBeLessThanOrEqual(1)
  })
})

describe('isolation', () => {
  it('TC-U-435 and TC-A-401 another user cannot read, set or clear a holding', async () => {
    const s = (await create(base('S435', { holding: { shares: '7351.2468', averageCost: '9182.7364' } }))).json()
    const pttep = (await create(th('PTTEP435'))).json()
    const mine = (await create(base('AAPL435', { holding: { shares: '1', averageCost: '1' } }), appV)).json()
    const never = await call(appV, 'GET', `/stocks/${UNKNOWN_ID}`)
    const strip = (r: Awaited<ReturnType<typeof call>>) => ({ ...r.json(), requestId: undefined, detail: undefined })
    for (const [method, url, payload] of [
      ['GET', `/stocks/${s.id}`],
      ['PATCH', `/stocks/${s.id}`, { holding: { shares: '1' } }],
      ['PATCH', `/stocks/${s.id}`, { holding: null }],
      ['PATCH', `/stocks/${pttep.id}`, { holding: {} }],
    ] as [Method, string, object?][]) {
      const res = await call(appV, method, url, payload)
      expect(res.statusCode).toBe(404)
      expect(strip(res)).toEqual(strip(never))
    }
    const list = (await call(appV, 'GET', '/stocks')).json().items
    expect(list.map((x: { id: string }) => x.id)).toEqual([mine.id])
    const lu = await seedList(t.handle, t.userId, 'LU435')
    const viaList = await create(base('S435', { listIds: [lu], holding: { shares: '5' } }), appV)
    expect(viaList.statusCode).toBe(404)
    const own = await create(base('S435', { holding: { shares: '5', averageCost: '2' } }), appV)
    expect(own.statusCode).toBe(201)
    expect(own.json().holding).toMatchObject({ shares: '5.0000', averageCost: '2.0000' })
    const after = (await call(app, 'GET', `/stocks/${s.id}`)).json()
    expect(after.holding).toEqual({ shares: '7351.2468', averageCost: '9182.7364', costCurrency: 'USD' })
    expect((await call(app, 'GET', `/stocks/${pttep.id}`)).json().holding).toBeNull()
    expect((await rows('select user_id from app.holdings where stock_id = any($1)', [[s.id, mine.id, own.json().id]])).map((r) => r.user_id).sort()).toEqual([t.userId, V, V].sort())
  })
})

describe('reads and lifecycle', () => {
  it('TC-A-404 and TC-A-414 every read carries the right holding, once', async () => {
    const list = await seedList(t.handle, t.userId, 'L404')
    const ids: string[] = []
    for (let i = 0; i < 12; i++) {
      const s = (await create(base(`R${String(i).padStart(2, '0')}`, i % 3 === 0 ? { holding: { shares: `${i}.0001` } } : {}))).json()
      await seedMembership(t.handle, t.userId, list, s.id)
      ids.push(s.id)
    }
    const all = (await call(app, 'GET', '/stocks')).json().items as { id: string; ticker: string; holding: { shares: string } | null }[]
    const inList = (await call(app, 'GET', `/stocks?listId=${list}`)).json().items as typeof all
    expect(inList).toHaveLength(12)
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)
    for (const s of inList) {
      const i = Number(s.ticker.slice(1))
      expect(s.holding).toEqual(i % 3 === 0 ? { shares: `${i}.0001`, averageCost: null, costCurrency: 'USD' } : null)
      expect('holding' in s).toBe(true)
    }
  })

  it('TC-A-412 holdings are independent of lists and cascade with the stock', async () => {
    const s = (await create(base('S412', { holding: { shares: '4', averageCost: '2' } }))).json()
    const [l, m] = [await seedList(t.handle, t.userId, 'L412'), await seedList(t.handle, t.userId, 'M412')]
    await seedMembership(t.handle, t.userId, l, s.id)
    await seedMembership(t.handle, t.userId, m, s.id)
    const holding = () => call(app, 'GET', `/stocks/${s.id}`).then((r) => r.json().holding)
    const original = await holding()
    await call(app, 'DELETE', `/lists/${l}/stocks/${s.id}`)
    expect(await holding()).toEqual(original)
    await call(app, 'POST', `/lists/${l}/stocks`, { stockId: s.id })
    await call(app, 'DELETE', `/lists/${m}`)
    await call(app, 'PATCH', `/stocks/${s.id}`, { style: 'Growth' })
    expect(await holding()).toEqual(original)
    expect((await call(app, 'DELETE', `/stocks/${s.id}`)).statusCode).toBe(204)
    expect(await count('select count(*) n from app.holdings where stock_id = $1', [s.id])).toBe(0)
    expect((await create(base('S412'))).json().holding).toBeNull()
  })

  it('TC-U-434 and TC-A-413 an import update keeps the holding', async () => {
    const aapl = (await create(base('AAPL', { name: 'Apple', holding: { shares: '10', averageCost: '150' } }))).json()
    const file = csv(['ticker', 'market', 'exchange', 'name', 'style'], [['AAPL', 'US', 'NASDAQ', 'Apple', 'Value'], ['NEWIMP', 'US', 'NASDAQ', 'New']])
    const before = await holdingRows(t.userId)
    for (const duplicateMode of ['skip', 'update']) {
      const res = await app.inject({
        method: 'POST',
        url: '/imports',
        ...multipart([{ name: 'duplicateMode', value: duplicateMode }, { name: 'newListName', value: `imp-${duplicateMode}` }, filePart(file, 'h.csv')]),
      })
      expect(res.statusCode).toBe(200)
    }
    const got = (await call(app, 'GET', `/stocks/${aapl.id}`)).json()
    expect(got.style).toBe('Value')
    expect(got.holding).toEqual({ shares: '10.0000', averageCost: '150.0000', costCurrency: 'USD' })
    expect(await holdingRows(t.userId)).toBe(before)
    expect((await rows("select 1 from app.stocks s join app.holdings h on h.stock_id = s.id where s.user_id = $1 and s.ticker = 'NEWIMP'", [t.userId])).length).toBe(0)
  })
})

describe('privacy in logs', () => {
  const sentinels = ['7351.2468', '9182.7364', '36.482917', '36.4829171', '7777.7777']

  it('TC-A-422 no holding value reaches a log line', async () => {
    logs.length = 0
    const created = await create(base('LOG422', { holding: { shares: '7351.2468', averageCost: '9182.7364' } }))
    const id = created.json().id
    const responses = [
      created,
      await call(app, 'PATCH', `/stocks/${id}`, { holding: { shares: '7351.2468' } }),
      await call(app, 'PATCH', `/stocks/${id}`, { holding: { shares: '7351.2468', averageCost: '1.23456' } }),
      await create(base('LOG422B', { listIds: [await seedList(t.handle, V, 'LV422')], holding: { shares: '7351.2468' } })),
      await call(app, 'GET', '/stocks'),
    ]
    expect(responses.map((r) => r.statusCode)).toEqual([201, 200, 400, 404, 200])
    const text = logs.join('\n')
    for (const s of sentinels.slice(0, 2)) expect(text).not.toContain(s)
    for (const r of responses.slice(2, 4)) for (const s of sentinels) expect(r.payload).not.toContain(s)
    expect(logs.filter((l) => l.includes('"statusCode"')).length).toBeGreaterThanOrEqual(responses.length)
  })

  it('TC-A-423 a logged database error has no row values', async () => {
    logs.length = 0
    const stock = (await create(base('LOG423'))).json()
    const posted = await create(base('LOG423B', { holding: { shares: '7351.2468', averageCost: '7777.7777' } }))
    const patched = await call(app, 'PATCH', `/stocks/${stock.id}`, { holding: { shares: '7351.2468', averageCost: '7777.7777' } })
    expect([posted.statusCode, patched.statusCode]).toEqual([500, 500])
    for (const r of [posted, patched]) {
      expect(r.json().code).toBe('internal')
      expect(r.payload).not.toMatch(/7777|7351/)
    }
    const errors = logs.map((l) => JSON.parse(l)).filter((l) => l.msg === 'request failed')
    expect(errors).toHaveLength(2)
    for (const line of errors) {
      expect(line.err).toMatchObject({ code: '23514', constraint: 'hc_probe', table: 'holdings' })
      expect(line.err.message).toEqual(expect.any(String))
      expect(JSON.stringify(line)).not.toMatch(/Failing row|7777|7351/)
      expect(line.err).not.toHaveProperty('detail')
      expect(line.err).not.toHaveProperty('where')
    }
  })

  it('TC-A-424 redaction lists the wire names and drops the stale one', () => {
    for (const k of ['averageCost', 'usdThbRate', 'holding', 'shares']) expect(REDACT_PATHS).toContain(k)
    expect(REDACT_PATHS.some((p) => p.includes('costBasis'))).toBe(false)
  })
})

describe('OpenAPI', () => {
  it('TC-A-426 documents holding on Stock and on the request bodies', async () => {
    const spec = (await app.inject('/openapi.json')).json()
    const text = JSON.stringify(spec)
    const post = spec.paths['/stocks'].post.requestBody.content['application/json'].schema
    const patch = spec.paths['/stocks/{id}'].patch.requestBody.content['application/json'].schema
    expect(JSON.stringify(post)).toContain('costCurrency')
    expect(JSON.stringify(patch)).toContain('costCurrency')
    const ok = JSON.stringify(spec.paths['/stocks/{id}'].get.responses['200'])
    expect(ok).toContain('holding')
    expect(ok).toContain('averageCost')
    expect(text).not.toMatch(/"(shares|averageCost)":\{"type":"number"/)
  })
})

describe('seeded stock without a holding', () => {
  it('reads as null', async () => {
    const id = await seedStock(t.handle, t.userId, 'SEED1')
    expect((await call(app, 'GET', `/stocks/${id}`)).json().holding).toBeNull()
  })
})

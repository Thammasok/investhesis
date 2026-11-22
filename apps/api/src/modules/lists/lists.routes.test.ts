import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { seedList, seedMembership, seedStock } from '../../../test/seed.ts'

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

const call = (a: FastifyInstance, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  a.inject({ method, url, ...(payload !== undefined && { payload: payload as object }) })
const create = (name: unknown, a = app) => call(a, 'POST', '/lists', { name })
const count = async (sql: string, args: unknown[]) => Number((await t.handle.pool.query(sql, args)).rows[0].n)

describe('POST /lists', () => {
  it('TC-U-030 creates a list with a trimmed name', async () => {
    const res = await create('  Core holdings  ')
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({ name: 'Core holdings', stockCount: 0 })
    expect(res.headers['location']).toBe(`/lists/${body.id}`)
    expect((await call(app, 'GET', `/lists/${body.id}`)).json()).toEqual(body)
  })

  it('TC-U-031 refuses a duplicate name ignoring case, on create and rename', async () => {
    await create('Dup keep')
    const other = (await create('Dup other')).json()
    const c = await create('DUP KEEP')
    expect(c.statusCode).toBe(409)
    expect(c.json()).toMatchObject({ code: 'list_name_taken', status: 409 })
    const p = await call(app, 'PATCH', `/lists/${other.id}`, { name: 'dup keep' })
    expect(p.statusCode).toBe(409)
    expect(p.json().code).toBe('list_name_taken')
  })

  it('TC-U-032 enforces name length bounds', async () => {
    const results = []
    for (const name of ['', '   ', 'a'.repeat(60), 'a'.repeat(61)]) results.push((await create(name)).statusCode)
    expect(results).toEqual([400, 400, 201, 400])
  })
})

describe('membership', () => {
  it('TC-U-033 adding a stock twice is 201 then 409 already_in_list, count stays 1', async () => {
    const list = await seedList(t.handle, t.userId, 'TC-U-033')
    const stock = await seedStock(t.handle, t.userId, 'U033')
    const first = await call(app, 'POST', `/lists/${list}/stocks`, { stockId: stock })
    expect(first.statusCode).toBe(201)
    expect(first.json()).toMatchObject({ listId: list, stockId: stock })
    expect(typeof first.json().addedAt).toBe('string')
    const second = await call(app, 'POST', `/lists/${list}/stocks`, { stockId: stock })
    expect(second.statusCode).toBe(409)
    expect(second.json().code).toBe('already_in_list')
    expect((await call(app, 'GET', `/lists/${list}`)).json().stockCount).toBe(1)
  })

  it('TC-U-034 deleting a list keeps its stocks', async () => {
    const list = await seedList(t.handle, t.userId, 'TC-U-034')
    const s1 = await seedStock(t.handle, t.userId, 'U034A')
    const s2 = await seedStock(t.handle, t.userId, 'U034B')
    await seedMembership(t.handle, t.userId, list, s1)
    await seedMembership(t.handle, t.userId, list, s2)
    expect((await call(app, 'DELETE', `/lists/${list}`)).statusCode).toBe(204)
    expect(await count('select count(*) n from app.stocks where id = any($1)', [[s1, s2]])).toBe(2)
    expect(await count('select count(*) n from app.list_stocks where list_id = $1', [list])).toBe(0)
    expect((await call(app, 'GET', `/lists/${list}`)).statusCode).toBe(404)
  })
})

describe('isolation', () => {
  it('TC-U-035 another user\'s ids are invisible', async () => {
    const lu = await seedList(t.handle, t.userId, 'TC-U-035')
    const su = await seedStock(t.handle, t.userId, 'U035')
    await seedMembership(t.handle, t.userId, lu, su)
    const lv = await seedList(t.handle, V, 'TC-U-035 V')
    const calls = await Promise.all([
      call(appV, 'GET', `/lists/${lu}`),
      call(appV, 'PATCH', `/lists/${lu}`, { name: 'Hacked' }),
      call(appV, 'DELETE', `/lists/${lu}`),
      call(appV, 'POST', `/lists/${lu}/stocks`, { stockId: await seedStock(t.handle, V, 'U035V') }),
      call(appV, 'POST', `/lists/${lv}/stocks`, { stockId: su }),
    ])
    for (const res of calls) {
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('not_found')
    }
    expect((await call(app, 'GET', `/lists/${lu}`)).json()).toMatchObject({ name: 'TC-U-035', stockCount: 1 })
    expect(await count('select count(*) n from app.list_stocks where list_id = $1', [lv])).toBe(0)
  })

  it('TC-A-103 two-user proof for lists and memberships', async () => {
    const lu = await seedList(t.handle, t.userId, 'Core holdings A103')
    const su = await seedStock(t.handle, t.userId, 'A103U')
    await seedMembership(t.handle, t.userId, lu, su)
    const lv = await seedList(t.handle, V, 'LV A103')
    const av = await seedStock(t.handle, V, 'A103V')

    const mine = (await call(appV, 'GET', '/lists')).json().items.map((l: { id: string }) => l.id)
    expect(mine).toContain(lv)
    expect(mine).not.toContain(lu)
    for (const res of [
      await call(appV, 'GET', `/lists/${lu}`),
      await call(appV, 'PATCH', `/lists/${lu}`, { name: 'x' }),
      await call(appV, 'DELETE', `/lists/${lu}`),
      await call(appV, 'POST', `/lists/${lu}/stocks`, { stockId: av }),
      await call(appV, 'POST', `/lists/${lv}/stocks`, { stockId: su }),
      await call(appV, 'DELETE', `/lists/${lu}/stocks/${su}`),
    ])
      expect(res.statusCode).toBe(404)

    expect((await create('core holdings a103', appV)).statusCode).toBe(201)
    expect((await call(app, 'GET', `/lists/${lu}`)).json()).toMatchObject({ name: 'Core holdings A103', stockCount: 1 })
    await expect(
      t.handle.pool.query('insert into app.list_stocks (list_id, stock_id, user_id) values ($1,$2,$3)', [lv, su, V]),
    ).rejects.toMatchObject({ code: '23503' })
  })
})

describe('ordering and counts', () => {
  it('TC-U-036 lists are ordered by name with counts', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    const watching = (await create('Watching', a)).json()
    const core = (await create('Core holdings', a)).json()
    const stocks = await Promise.all(['O1', 'O2'].map((tk) => seedStock(t.handle, u, tk)))
    await call(a, 'POST', `/lists/${core.id}/stocks`, { stockId: stocks[0] })
    await call(a, 'POST', `/lists/${core.id}/stocks`, { stockId: stocks[1] })
    await call(a, 'POST', `/lists/${watching.id}/stocks`, { stockId: stocks[0] })
    const items = (await call(a, 'GET', '/lists')).json().items
    expect(items.map((i: { name: string; stockCount: number }) => [i.name, i.stockCount])).toEqual([
      ['Core holdings', 2],
      ['Watching', 1],
    ])
  })

  it('a new user has no lists', async () => {
    const a = await t.appFor(newUserId())
    expect((await call(a, 'GET', '/lists')).json()).toEqual({ items: [] })
  })
})

describe('name edge cases', () => {
  it('TC-A-120 Thai, 60-char, inner-space, rename and NUL cases', async () => {
    const u = await t.appFor(newUserId())
    const thai = 'หุ้นหลัก'
    const long = 'ก'.repeat(60)
    expect((await create(thai, u)).json().name).toBe(thai)
    expect((await create(long, u)).json().name).toBe(long)
    expect((await create('Core  holdings', u)).json().name).toBe('Core  holdings')
    const core = (await create('Core Rename', u)).json()
    const other = (await create('Other', u)).json()
    const patch = (id: string, body: unknown) => call(u, 'PATCH', `/lists/${id}`, body)
    expect((await patch(core.id, { name: 'core rename' })).statusCode).toBe(200)
    expect((await patch(core.id, { name: 'core rename' })).json().name).toBe('core rename')
    expect((await patch(other.id, { name: 'CORE RENAME' })).json().code).toBe('list_name_taken')
    expect((await patch(other.id, { name: 'a'.repeat(60) })).statusCode).toBe(200)
    for (const bad of [{ name: 'a'.repeat(61) }, { name: '' }, { name: '   ' }, {}, { name: 123 }, { name: 'a\u0000b' }])
      expect((await patch(other.id, bad)).statusCode).toBe(400)
    for (const bad of [{ name: 123 }, { name: 'a\u0000b' }]) expect((await create(bad.name, u)).statusCode).toBe(400)
  })

  it('a rename updates updatedAt and keeps createdAt', async () => {
    const l = (await create('Stamp')).json()
    await new Promise((r) => setTimeout(r, 5))
    const renamed = (await call(app, 'PATCH', `/lists/${l.id}`, { name: 'Stamp 2' })).json()
    expect(renamed.createdAt).toBe(l.createdAt)
    expect(renamed.updatedAt > l.updatedAt).toBe(true)
  })
})

describe('membership edge cases', () => {
  it('TC-A-121 validation, counts and removal sequence', async () => {
    const list = (await create('A121')).json().id as string
    const add = (body: unknown) => call(app, 'POST', `/lists/${list}/stocks`, body)
    const countNow = async () => (await call(app, 'GET', `/lists/${list}`)).json().stockCount
    const [s1, s2, s3, gone] = await Promise.all(['A121A', 'A121B', 'A121C', 'A121D'].map((x) => seedStock(t.handle, t.userId, x)))
    await t.handle.pool.query('delete from app.stocks where id = $1', [gone])

    expect((await add({})).statusCode).toBe(400)
    expect((await add({ stockId: 'x' })).statusCode).toBe(400)
    expect((await add({ stockId: '0192f0a0-0000-7000-8000-0000000000ff' })).statusCode).toBe(404)
    expect((await add({ stockId: gone })).statusCode).toBe(404)
    expect(await countNow()).toBe(0)

    await add({ stockId: s1 })
    await add({ stockId: s2 })
    expect(await countNow()).toBe(2)
    const del = (s: string | undefined) => call(app, 'DELETE', `/lists/${list}/stocks/${s}`)
    expect((await del(s3)).statusCode).toBe(404)
    expect((await del(s1)).statusCode).toBe(204)
    expect(await countNow()).toBe(1)
    expect((await del(s1)).statusCode).toBe(404)
    expect((await add({ stockId: s1 })).statusCode).toBe(201)
    expect(await countNow()).toBe(2)
    await t.handle.pool.query('delete from app.stocks where id = $1', [s2])
    expect(await countNow()).toBe(1)
    expect((await call(app, 'DELETE', `/lists/${list}`)).statusCode).toBe(204)
    expect(await count('select count(*) n from app.stocks where id = $1', [s1])).toBe(1)
    expect((await del(s1)).statusCode).toBe(404)
  })

  it('malformed ids in the path are 400', async () => {
    expect((await call(app, 'GET', '/lists/nope')).statusCode).toBe(400)
  })
})

describe('concurrency', () => {
  it('TC-A-122 parallel writes give one winner and no 5xx', async () => {
    const u = await t.appFor(newUserId())
    const names = ['Race', 'RACE', 'race', 'rAcE', 'Race ']
    const created = await Promise.all(names.map((n) => create(n, u)))
    expect(created.map((r) => r.statusCode).sort()).toEqual([201, 409, 409, 409, 409].sort())
    const list = created.find((r) => r.statusCode === 201)?.json().id as string
    const user = (await call(u, 'GET', '/lists')).json().items.length
    expect(user).toBe(1)

    const stock = await seedStock(t.handle, (await t.handle.pool.query('select user_id from app.lists where id = $1', [list])).rows[0].user_id, 'RACE1')
    const added = await Promise.all(Array.from({ length: 5 }, () => call(u, 'POST', `/lists/${list}/stocks`, { stockId: stock })))
    expect(added.map((r) => r.statusCode).sort()).toEqual([201, 409, 409, 409, 409])
    expect(added.filter((r) => r.statusCode === 409).every((r) => r.json().code === 'already_in_list')).toBe(true)
  })
})

describe('errors and spec', () => {
  it('TC-A-123 list errors are RFC 7807 with a stable code and request id', async () => {
    await create('Err one')
    const cases: [Awaited<ReturnType<typeof create>>, number, string][] = [
      [await create(''), 400, 'validation_failed'],
      [await call(app, 'GET', '/lists/0192f0a0-0000-7000-8000-0000000000fe'), 404, 'not_found'],
      [await create('err one'), 409, 'list_name_taken'],
    ]
    const list = (await create('Err two')).json().id
    const stock = await seedStock(t.handle, t.userId, 'ERR2')
    await call(app, 'POST', `/lists/${list}/stocks`, { stockId: stock })
    cases.push([await call(app, 'POST', `/lists/${list}/stocks`, { stockId: stock }), 409, 'already_in_list'])
    for (const [res, status, code] of cases) {
      expect(res.headers['content-type']).toContain('application/problem+json')
      const body = res.json()
      expect(body).toMatchObject({ status, code, requestId: res.headers['x-request-id'] })
      expect(typeof body.type).toBe('string')
      expect(typeof body.title).toBe('string')
      expect(res.body).not.toMatch(/lists_user_name_ci|list_stocks_pkey|insert into/i)
    }
    expect(cases[0]?.[0].json().errors[0].path).toBe('name')
  })

  it('TC-A-124 (lists part) all seven routes are in the OpenAPI spec with bearerAuth', async () => {
    const spec = (await app.inject('/openapi.json')).json()
    const routes: [string, string][] = [
      ['/lists', 'get'],
      ['/lists', 'post'],
      ['/lists/{id}', 'get'],
      ['/lists/{id}', 'patch'],
      ['/lists/{id}', 'delete'],
      ['/lists/{id}/stocks', 'post'],
      ['/lists/{id}/stocks/{stockId}', 'delete'],
    ]
    for (const [path, method] of routes) {
      const op = spec.paths[path]?.[method]
      expect(op, `${method} ${path}`).toBeDefined()
      expect(op.security).toEqual([{ bearerAuth: [] }])
      expect(Object.keys(op.responses).length).toBeGreaterThan(1)
    }
    expect(spec.paths['/lists'].post.requestBody).toBeDefined()
    expect(Object.keys(spec.paths['/lists/{id}/stocks'].post.responses)).toEqual(expect.arrayContaining(['201', '404', '409']))
  })
})

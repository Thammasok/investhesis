import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.ts'
import { loadConfig } from '../../config/env.ts'
import { baseEnv } from '../../../test/env.ts'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'

let t: TestApp
let app: FastifyInstance

beforeAll(async () => {
  t = await buildTestApp()
  app = t.app
})
afterAll(() => t.cleanup())

const get = (a: FastifyInstance = app) => a.inject({ method: 'GET', url: '/settings' })
const patch = (payload: unknown, a: FastifyInstance = app) =>
  a.inject({ method: 'PATCH', url: '/settings', payload: payload as object })
const rows = async (id: string) =>
  Number((await t.handle.pool.query('select count(*) n from app.user_settings where user_id = $1', [id])).rows[0].n)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('settings', () => {
  it('TC-U-440 and TC-A-415 answers the defaults without writing a row', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    for (let i = 0; i < 3; i++) {
      const res = await get(a)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null, language: null })
    }
    expect(await rows(u)).toBe(0)
  })

  it('TC-U-441 and TC-A-416 upserts and patches partially, with the exact rate text', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    const first = await patch({ usdThbRate: '36.25' }, a)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ concentrationThreshold: 40, usdThbRate: '36.250000' })
    expect(new Date(first.json().usdThbRateUpdatedAt).toISOString()).toBe(first.json().usdThbRateUpdatedAt)
    const second = await patch({ concentrationThreshold: 35 }, a)
    expect(second.json()).toEqual({ ...first.json(), concentrationThreshold: 35 })
    expect((await get(a)).json()).toEqual(second.json())
    expect(await rows(u)).toBe(1)
    for (const [sent, back] of [['36', '36.000000'], ['0.000001', '0.000001'], ['999999999999.999999', '999999999999.999999']]) {
      expect((await patch({ usdThbRate: sent }, a)).json().usdThbRate).toBe(back)
    }
    const both = await patch({ concentrationThreshold: 100, usdThbRate: '36.123457' }, a)
    expect(both.json()).toMatchObject({ concentrationThreshold: 100, usdThbRate: '36.123457' })
    expect((await get(a)).json()).toEqual(both.json())
  })

  it('TC-U-442 clearing the rate clears its date', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    await patch({ usdThbRate: '36.25' }, a)
    const res = await patch({ usdThbRate: null }, a)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null, language: null })
  })

  it('TC-A-418 the rate date moves on every rate save, not on other changes', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    const d1 = (await patch({ usdThbRate: '36.25' }, a)).json().usdThbRateUpdatedAt
    await sleep(20)
    expect((await patch({ concentrationThreshold: 30 }, a)).json().usdThbRateUpdatedAt).toBe(d1)
    await sleep(20)
    const d2 = (await patch({ usdThbRate: '36.25' }, a)).json().usdThbRateUpdatedAt
    expect(Date.parse(d2)).toBeGreaterThan(Date.parse(d1))
    expect((await patch({ usdThbRate: null }, a)).json().usdThbRateUpdatedAt).toBeNull()
    await sleep(20)
    const d3 = (await patch({ usdThbRate: '37' }, a)).json().usdThbRateUpdatedAt
    expect(Date.parse(d3)).toBeGreaterThan(Date.parse(d2))
  })

  it('TC-U-443 and TC-A-417 refuses invalid values with the field path and changes nothing', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    const bad: [unknown, string][] = [
      [{ concentrationThreshold: 0 }, 'concentrationThreshold'],
      [{ concentrationThreshold: 101 }, 'concentrationThreshold'],
      [{ concentrationThreshold: 40.5 }, 'concentrationThreshold'],
      [{ concentrationThreshold: '40' }, 'concentrationThreshold'],
      [{ concentrationThreshold: null }, 'concentrationThreshold'],
      [{ usdThbRate: 36.25 }, 'usdThbRate'],
      [{ concentrationThreshold: -5 }, 'concentrationThreshold'],
      [{ usdThbRate: '0' }, 'usdThbRate'],
      [{ usdThbRate: '0.000000' }, 'usdThbRate'],
      [{ usdThbRate: '0.0000001' }, 'usdThbRate'],
      [{ usdThbRate: '-36' }, 'usdThbRate'],
      [{ usdThbRate: '1.1234567' }, 'usdThbRate'],
      [{ usdThbRate: '1000000000000' }, 'usdThbRate'],
      [{ usdThbRate: '36,25' }, 'usdThbRate'],
      [{ usdThbRate: ' 36' }, 'usdThbRate'],
      [{ usdThbRate: '' }, 'usdThbRate'],
      [{ theme: 'dark' }, 'theme'],
      [{ userId: u, concentrationThreshold: 10 }, 'userId'],
      [[], ''],
    ]
    for (const [body, path] of bad) {
      const res = await patch(body, a)
      expect([res.statusCode, JSON.stringify(body)]).toEqual([400, JSON.stringify(body)])
      const json = res.json()
      expect(json.code).toBe('validation_failed')
      expect(json.requestId).toBeTruthy()
      expect(json.errors.map((e: { path: string }) => e.path)).toContain(path)
      // The message names the limit and never echoes a long typed value back.
      const typed = Object.values(body as object).filter((v): v is string => typeof v === 'string' && v.length >= 6)
      for (const value of typed) expect(JSON.stringify(json.errors)).not.toContain(value)
    }
    expect(await rows(u)).toBe(0)
  })

  it('TC-A-417 accepts the limits and a cleared rate, and a 400 leaves the saved settings alone', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    await patch({ concentrationThreshold: 55, usdThbRate: '36.25' }, a)
    const before = (await get(a)).json()
    for (const body of [{ concentrationThreshold: 0 }, { usdThbRate: '1.1234567' }, { theme: 'dark' }, { concentrationThreshold: 101, usdThbRate: '40' }]) {
      expect((await patch(body, a)).statusCode).toBe(400)
      expect((await get(a)).json()).toEqual(before)
    }
    expect((await patch({ concentrationThreshold: 1 }, a)).json().concentrationThreshold).toBe(1)
    expect((await patch({ concentrationThreshold: 100 }, a)).json().concentrationThreshold).toBe(100)
    expect((await patch({ usdThbRate: '0.000001' }, a)).json().usdThbRate).toBe('0.000001')
    expect((await patch({ usdThbRate: null }, a)).json()).toMatchObject({ usdThbRate: null, usdThbRateUpdatedAt: null })
  })

  it('accepts the limits, including 1e2', async () => {
    const a = await t.appFor(newUserId())
    for (const body of ['{"concentrationThreshold":1}', '{"concentrationThreshold":100}', '{"concentrationThreshold":1e2}']) {
      const res = await a.inject({ method: 'PATCH', url: '/settings', headers: { 'content-type': 'application/json' }, payload: body })
      expect(res.statusCode).toBe(200)
    }
  })

  it('G-7 an empty body is 200, changes nothing and creates no row', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    const res = await patch({}, a)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null, language: null })
    expect(await rows(u)).toBe(0)
    await patch({ concentrationThreshold: 20 }, a)
    expect((await patch({}, a)).json().concentrationThreshold).toBe(20)
  })

  it('TC-A-419 the first save is safe under concurrency', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    const bodies = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ concentrationThreshold: n }))
    bodies.push({ usdThbRate: '30' } as never, { usdThbRate: '31' } as never)
    const results = await Promise.all(bodies.map((b) => patch(b, a)))
    expect(results.map((r) => r.statusCode)).toEqual(bodies.map(() => 200))
    expect(await rows(u)).toBe(1)
    const stored = (await t.handle.pool.query('select concentration_threshold c, usd_thb_rate r from app.user_settings where user_id = $1', [u])).rows[0]
    expect((await get(a)).json()).toMatchObject({ concentrationThreshold: stored.c, usdThbRate: stored.r })
    // Both stored values are valid and come from the requests (a rate row exists only if a rate request won).
    expect(bodies.some((b) => 'concentrationThreshold' in b && b.concentrationThreshold === stored.c) || stored.c === 40).toBe(true)
    expect([null, '30.000000', '31.000000']).toContain(stored.r)
  })

  it('TC-A-419 a second wave of writes on the existing row still answers 200 and keeps one row', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    await patch({ concentrationThreshold: 50 }, a)
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => patch({ concentrationThreshold: i + 10, usdThbRate: String(30 + i) }, a)))
    expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(200))
    expect(await rows(u)).toBe(1)
  })

  it('TC-A-420 p95 of 50 sequential PATCH /settings is under 500 ms (informational for NFR-002)', async () => {
    const a = await t.appFor(newUserId())
    const times: number[] = []
    for (let i = 0; i < 50; i++) {
      const start = performance.now()
      const res = await patch({ concentrationThreshold: (i % 99) + 1, usdThbRate: `${30 + (i % 10)}.25` }, a)
      times.push(performance.now() - start)
      expect(res.statusCode).toBe(200)
    }
    const sorted = [...times].sort((x, y) => x - y)
    const at = (i: number) => sorted[i] ?? Infinity
    const p95 = at(Math.ceil(0.95 * sorted.length) - 1)
    console.log(`NFR-002 PATCH settings: min ${at(0).toFixed(1)} ms, median ${at(24).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${at(49).toFixed(1)} ms`)
    expect(p95).toBeLessThan(500)
  })

  it('TC-A-402 two-user proof: settings', async () => {
    const U = newUserId()
    const V = newUserId()
    const aU = await t.appFor(U)
    await patch({ concentrationThreshold: 25, usdThbRate: '36.482917' }, aU)
    const uDate = (await get(aU)).json().usdThbRateUpdatedAt
    const v = await t.appFor(V)
    expect((await get(v)).json()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null, language: null })
    expect(await rows(V)).toBe(0)
    expect((await patch({ concentrationThreshold: 90 }, v)).json()).toMatchObject({ concentrationThreshold: 90, usdThbRate: null })
    const total = Number((await t.handle.pool.query('select count(*) n from app.user_settings where user_id = any($1)', [[U, V]])).rows[0].n)
    expect(total).toBe(2)
    expect((await get(v)).json()).toEqual({ concentrationThreshold: 90, usdThbRate: null, usdThbRateUpdatedAt: null, language: null })
    expect((await get(aU)).json()).toEqual({ concentrationThreshold: 25, usdThbRate: '36.482917', usdThbRateUpdatedAt: uDate, language: null })
    const sneaky = await patch({ userId: U, concentrationThreshold: 10 }, v)
    expect(sneaky.statusCode).toBe(400)
    expect(sneaky.json().errors.map((e: { path: string }) => e.path)).toContain('userId')
    expect((await get(aU)).json().concentrationThreshold).toBe(25)
    expect((await get(v)).json().concentrationThreshold).toBe(90)
    const owners = (await t.handle.pool.query('select user_id from app.user_settings where user_id = any($1)', [[U, V]])).rows.map((r) => r.user_id)
    expect(owners.sort()).toEqual([U, V].sort())
  })
})

describe('settings contract', () => {
  it('needs a bearer token and is in the OpenAPI spec with bearerAuth', async () => {
    const config = loadConfig({ ...baseEnv, AUTH_MODE: 'mock' })
    const open = await buildApp({
      config,
      resolveIdentity: async () => {
        const { AppError } = await import('../../lib/app-error.ts')
        throw new AppError({ status: 401, code: 'unauthenticated' })
      },
      logStream: { write() {} },
    })
    for (const method of ['GET', 'PATCH'] as const) {
      const res = await open.inject({ method, url: '/settings', ...(method === 'PATCH' && { payload: {} }) })
      expect(res.statusCode).toBe(401)
    }
    const spec = (await open.inject({ method: 'GET', url: '/openapi.json' })).json()
    for (const m of ['get', 'patch']) {
      expect(spec.paths['/settings'][m]).toBeDefined()
      expect(JSON.stringify(spec.paths['/settings'][m].security ?? spec.security)).toContain('bearerAuth')
    }
    await open.close()
  })
})

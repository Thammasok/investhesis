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
  it('TC-U-440 answers the defaults without writing a row', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    for (let i = 0; i < 3; i++) {
      const res = await get(a)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null })
    }
    expect(await rows(u)).toBe(0)
  })

  it('TC-U-441 upserts and patches partially, with the exact rate text', async () => {
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
    expect(res.json()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null })
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

  it('TC-U-443 refuses invalid values with the field path and changes nothing', async () => {
    const u = newUserId()
    const a = await t.appFor(u)
    const bad: [unknown, string][] = [
      [{ concentrationThreshold: 0 }, 'concentrationThreshold'],
      [{ concentrationThreshold: 101 }, 'concentrationThreshold'],
      [{ concentrationThreshold: 40.5 }, 'concentrationThreshold'],
      [{ concentrationThreshold: '40' }, 'concentrationThreshold'],
      [{ concentrationThreshold: null }, 'concentrationThreshold'],
      [{ usdThbRate: 36.25 }, 'usdThbRate'],
      [{ usdThbRate: '0' }, 'usdThbRate'],
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
    }
    expect(await rows(u)).toBe(0)
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
    expect(res.json()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null })
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
  })

  it('two users keep independent settings', async () => {
    const U = newUserId()
    const aU = await t.appFor(U)
    await patch({ concentrationThreshold: 25, usdThbRate: '36.482917' }, aU)
    const v = await t.appFor(newUserId())
    expect((await get(v)).json()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null })
    expect((await patch({ concentrationThreshold: 90 }, v)).json()).toMatchObject({ concentrationThreshold: 90, usdThbRate: null })
    expect((await get(aU)).json()).toMatchObject({ concentrationThreshold: 25, usdThbRate: '36.482917' })
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

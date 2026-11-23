import http from 'node:http'
import https from 'node:https'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.ts'
import { supabaseIdentityResolver } from '../../auth/supabase-identity-resolver.ts'
import { loadConfig } from '../../config/env.ts'
import { createDb, type DbHandle } from '../../db/client.ts'
import { bearer, makeKeys, signTestToken, supabaseEnv, type TestKeys } from '../../../test/auth.ts'
import { testDatabaseUrl } from '../../../test/db.ts'

let app: FastifyInstance
let handle: DbHandle
let keys: TestKeys
const logs: string[] = []
const SUB = '0192f0a0-0000-7000-8000-0000000004aa'
const SUB_SETTINGS = '0192f0a0-0000-7000-8000-0000000004bb'
const ID = '0192f0a0-0000-7000-8000-0000000004cc'

beforeAll(async () => {
  keys = await makeKeys()
  const config = loadConfig({ ...supabaseEnv, DATABASE_URL: testDatabaseUrl, LOG_LEVEL: 'trace' })
  handle = createDb(config)
  app = await buildApp({
    config,
    db: { ping: handle.ping, db: handle.db },
    resolveIdentity: supabaseIdentityResolver({ issuer: config.supabaseAuth?.issuer ?? '', audience: 'authenticated', keys: keys.keys }),
    logStream: { write: (line: string) => void logs.push(line) },
  })
})
afterAll(async () => {
  await handle.pool.query('delete from app.stocks where user_id = any($1)', [[SUB, SUB_SETTINGS]])
  await handle.pool.query('delete from app.user_settings where user_id = any($1)', [[SUB, SUB_SETTINGS]])
  await app.close()
  await handle.close()
})

const counts = async () =>
  (
    await handle.pool.query(
      "select (select count(*) from app.stocks where name = 'TC-A-400 should not exist') s, (select count(*) from app.holdings h join app.stocks s on s.id = h.stock_id where s.name = 'TC-A-400 should not exist') h, (select count(*) from app.user_settings where concentration_threshold = 77) u",
    )
  ).rows[0] as Record<string, string>

const heldBody = { ticker: 'A400', market: 'US', exchange: 'NASDAQ', name: 'TC-A-400 should not exist', holding: { shares: '1', averageCost: '2' } }
const rows: [string, string, unknown?][] = [
  ['GET', '/stocks'],
  ['GET', `/stocks/${ID}`],
  ['POST', '/stocks', heldBody],
  ['PATCH', `/stocks/${ID}`, { holding: { shares: '1' } }],
  ['GET', '/settings'],
  ['PATCH', '/settings', { concentrationThreshold: 77 }],
  ['DELETE', `/stocks/${ID}`],
]

describe('TC-A-400 every new or changed route needs an identity', () => {
  it.each(rows)('%s %s answers 401 with no token, a wrong signature and an expired token', async (method, url, payload) => {
    const other = await makeKeys('other-key')
    const tokens = [undefined, bearer(await signTestToken(other, {}, { kid: keys.kid })), bearer(await signTestToken(keys, { exp: Math.floor(Date.now() / 1000) - 3600, iat: Math.floor(Date.now() / 1000) - 7200 }))]
    const before = await counts()
    for (const headers of tokens) {
      const res = await app.inject({ method: method as 'GET', url, ...(headers && { headers }), ...(payload !== undefined && { payload: payload as object }) })
      expect(res.statusCode).toBe(401)
      expect(res.headers['www-authenticate']).toBe('Bearer')
      expect(res.headers['content-type']).toContain('application/problem+json')
      expect(res.json().code).toBe('unauthenticated')
    }
    expect(await counts()).toEqual(before)
  })
})

describe('TC-A-422 (settings and 401 part) no rate or amount reaches a log line', () => {
  it('keeps the sentinels out of every log line and response body', async () => {
    logs.length = 0
    const headers = bearer(await signTestToken(keys, { sub: SUB_SETTINGS }))
    const bad = bearer('not.a.jwt')
    const sentinels = ['7351.2468', '9182.7364', '36.482917', '36.4829171']
    const stock = { ticker: 'LOG422S', market: 'US', exchange: 'NASDAQ', name: 'Log', holding: { shares: '7351.2468', averageCost: '9182.7364' } }
    const responses = [
      await app.inject({ method: 'PATCH', url: '/settings', headers, payload: { usdThbRate: '36.482917' } }),
      await app.inject({ method: 'PATCH', url: '/settings', headers, payload: { usdThbRate: '36.4829171' } }),
      await app.inject({ method: 'PATCH', url: '/settings', headers: bad, payload: { usdThbRate: '36.482917' } }),
      await app.inject({ method: 'POST', url: '/stocks', headers: bad, payload: stock }),
      await app.inject({ method: 'GET', url: '/settings', headers }),
    ]
    expect(responses.map((r) => r.statusCode)).toEqual([200, 400, 401, 401, 200])
    const text = logs.join('\n')
    for (const s of sentinels) expect(text).not.toContain(s)
    expect(text).not.toMatch(/Bearer [A-Za-z0-9_-]{10,}/)
    for (const r of responses.slice(1, 4)) for (const s of sentinels) expect(r.payload).not.toContain(s)
    const requestLines = logs.map((l) => JSON.parse(l)).filter((l) => l.res?.statusCode !== undefined || l.statusCode !== undefined)
    expect(requestLines.length).toBeGreaterThanOrEqual(responses.length)
  })
})

describe('TC-A-425 no third party is contacted while holdings and settings are used', () => {
  it('makes no outbound HTTP request across the whole sequence', async () => {
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
      const headers = bearer(await signTestToken(keys, { sub: SUB }))
      const create = await app.inject({ method: 'POST', url: '/stocks', headers, payload: { ticker: 'NET425', market: 'US', exchange: 'NASDAQ', name: 'Net', holding: { shares: '3', averageCost: '4' } } })
      expect(create.statusCode).toBe(201)
      const id = create.json().id
      const steps = [
        await app.inject({ method: 'PATCH', url: `/stocks/${id}`, headers, payload: { holding: { shares: '5' } } }),
        await app.inject({ method: 'PATCH', url: `/stocks/${id}`, headers, payload: { holding: null } }),
        await app.inject({ method: 'GET', url: '/stocks', headers }),
        await app.inject({ method: 'PATCH', url: '/settings', headers, payload: { usdThbRate: '36.25' } }),
        await app.inject({ method: 'PATCH', url: '/settings', headers, payload: { usdThbRate: null } }),
        await app.inject({ method: 'GET', url: '/openapi.json' }),
      ]
      expect(steps.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200, 200])
      expect(outbound).toEqual([])
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})

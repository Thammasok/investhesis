import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.ts'
import { supabaseIdentityResolver } from '../../auth/supabase-identity-resolver.ts'
import { loadConfig } from '../../config/env.ts'
import { createDb, type DbHandle } from '../../db/client.ts'
import { bearer, makeKeys, signTestToken, supabaseEnv, type TestKeys } from '../../../test/auth.ts'
import { baseEnv } from '../../../test/env.ts'
import { testDatabaseUrl } from '../../../test/db.ts'

let app: FastifyInstance
let handle: DbHandle
let keys: TestKeys
const logs: string[] = []
const SUB = '0192f0a0-0000-7000-8000-0000000005aa'
const ROUTES = ['/exports/backup.json', '/exports/backup.csv']

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
  await handle.pool.query('delete from app.stocks where user_id = $1', [SUB])
  await handle.pool.query('delete from app.user_settings where user_id = $1', [SUB])
  await app.close()
  await handle.close()
})

describe('TC-U-544 authentication and database errors', () => {
  it.each(ROUTES)('%s answers 401 with no token, a wrong signature and an expired token', async (url) => {
    const other = await makeKeys('other-key')
    const now = Math.floor(Date.now() / 1000)
    const tokens = [
      undefined,
      bearer(await signTestToken(other, {}, { kid: keys.kid })),
      bearer(await signTestToken(keys, { exp: now - 3600, iat: now - 7200 })),
    ]
    for (const headers of tokens) {
      const res = await app.inject({ method: 'GET', url, ...(headers && { headers }) })
      expect(res.statusCode).toBe(401)
      expect(res.headers['www-authenticate']).toBe('Bearer')
      expect(res.headers['content-type']).toContain('application/problem+json')
      expect(res.json().code).toBe('unauthenticated')
    }
  })

  it.each(ROUTES)('%s answers 503 db_unavailable when the app has no database', async (url) => {
    const bare = await buildApp({
      config: loadConfig(baseEnv),
      resolveIdentity: async () => ({ userId: SUB, email: undefined, displayName: undefined }),
      logStream: { write() {} },
    })
    const res = await bare.inject({ method: 'GET', url })
    await bare.close()
    expect(res.statusCode).toBe(503)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json().code).toBe('db_unavailable')
  })
})

describe('TC-A-509 no amount, rate or body reaches a log line', () => {
  it('keeps the sentinels and the stock text out of every log line', async () => {
    logs.length = 0
    const headers = bearer(await signTestToken(keys, { sub: SUB }))
    const sentinels = ['7654321.1234', '0.7777', '34.123456', 'SENTINEL-NAME-31']
    const setup = [
      await app.inject({ method: 'POST', url: '/stocks', headers, payload: { ticker: 'LOG509', market: 'US', exchange: 'NASDAQ', name: 'SENTINEL-NAME-31', holding: { shares: '7654321.1234', averageCost: '0.7777' } } }),
      await app.inject({ method: 'PATCH', url: '/settings', headers, payload: { usdThbRate: '34.123456' } }),
    ]
    expect(setup.map((r) => r.statusCode)).toEqual([201, 200])
    logs.length = 0
    const responses = await Promise.all(ROUTES.map((url) => app.inject({ method: 'GET', url, headers })))
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200])
    // The response bodies do carry the sentinels (it is the user's own backup)...
    for (const s of sentinels) expect(responses.map((r) => r.payload).join('\n')).toContain(s)
    // ...and the log lines carry none of them
    const text = logs.join('\n')
    expect(text).toContain('/exports/backup.json')
    for (const s of sentinels) expect(text).not.toContain(s)
    expect(text).not.toMatch(/Bearer [A-Za-z0-9_-]{10,}/)
  })
})

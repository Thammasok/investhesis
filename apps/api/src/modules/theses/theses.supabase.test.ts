import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.ts'
import { supabaseIdentityResolver } from '../../auth/supabase-identity-resolver.ts'
import { loadConfig } from '../../config/env.ts'
import { createDb, type DbHandle } from '../../db/client.ts'
import { bearer, makeKeys, signTestToken, supabaseEnv, type TestKeys } from '../../../test/auth.ts'
import { testDatabaseUrl } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'

let app: FastifyInstance
let handle: DbHandle
let keys: TestKeys
const logs: string[] = []
const SUB = '0192f0a0-0000-7000-8000-0000000007aa'
const ID = '0192f0a0-0000-7000-8000-0000000007cc'

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
  await app.close()
  await handle.close()
})

const entry = { type: 'buy', date: '2026-01-10', note: 'TC-A-7xx must not exist' }
const rows: [string, string, unknown?][] = [
  ['GET', `/stocks/${ID}/theses`],
  ['POST', `/stocks/${ID}/theses`, entry],
  ['PATCH', `/stocks/${ID}/theses/${ID}`, { note: 'x' }],
  ['DELETE', `/stocks/${ID}/theses/${ID}`],
  ['POST', `/stocks/${ID}/theses/restore`, { entry: { ...entry, id: ID, stockId: ID } }],
]

describe('thesis routes need an identity', () => {
  it.each(rows)('TC-U-750 %s %s answers 401 without a token and with a bad one', async (method, url, payload) => {
    for (const headers of [undefined, bearer('not.a.jwt'), bearer(await signTestToken(keys, { aud: 'anon' }))]) {
      const res = await app.inject({ method: method as 'GET', url, ...(headers && { headers }), ...(payload !== undefined && { payload: payload as object }) })
      expect(res.statusCode).toBe(401)
      expect(res.headers['www-authenticate']).toBe('Bearer')
      expect(res.json().code).toBe('unauthenticated')
    }
    const { rows: found } = await handle.pool.query("select count(*)::int n from app.theses where note = 'TC-A-7xx must not exist'")
    expect(found[0].n).toBe(0)
  })

  it('TC-U-751 a valid token scopes by its subject and no sentinel reaches a log line', async () => {
    const stockId = await seedStock(handle, SUB, 'TL751')
    const headers = bearer(await signTestToken(keys, { sub: SUB }))
    const sentinels = ['SENTINEL-NOTE-751', 'SENTINEL-INV-751', '987654.3210']
    logs.length = 0
    const body = { ...entry, note: sentinels[0], invalidation: sentinels[1], targetPrice: sentinels[2] }
    const created = await app.inject({ method: 'POST', url: `/stocks/${stockId}/theses`, headers, payload: body })
    const patched = await app.inject({ method: 'PATCH', url: `/stocks/${stockId}/theses/${created.json().id}`, headers, payload: { note: `${sentinels[0]}!` } })
    const bad = await app.inject({ method: 'POST', url: `/stocks/${stockId}/theses`, headers: bearer('not.a.jwt'), payload: body })
    expect([created.statusCode, patched.statusCode, bad.statusCode]).toEqual([201, 200, 401])
    expect((await handle.pool.query('select user_id from app.theses where id = $1', [created.json().id])).rows[0].user_id).toBe(SUB)
    const text = logs.join('\n')
    for (const s of sentinels) expect(text).not.toContain(s)
    expect(text).not.toMatch(/Bearer [A-Za-z0-9_-]{10,}/)
  })
})

describe('thesis routes refuse bad sessions', () => {
  it.each(rows)('TC-A-741 %s %s answers 401 for an anon-audience token and for an expired one, and changes nothing', async (method, url, payload) => {
    const past = Math.floor(Date.now() / 1000) - 600
    const tokens = [await signTestToken(keys, { aud: 'anon' }), await signTestToken(keys, { iat: past - 3600, exp: past })]
    const count = async () => (await handle.pool.query('select count(*)::int n from app.theses where user_id = $1', [SUB])).rows[0].n
    const before = await count()
    for (const token of tokens) {
      const res = await app.inject({ method: method as 'GET', url, headers: bearer(token), ...(payload !== undefined && { payload: payload as object }) })
      expect(res.statusCode).toBe(401)
      expect(res.headers['www-authenticate']).toBe('Bearer')
      expect(res.headers['content-type']).toContain('application/problem+json')
      expect(res.json().code).toBe('unauthenticated')
    }
    expect(await count()).toBe(before)
  })
})


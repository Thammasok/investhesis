import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.ts'
import { supabaseIdentityResolver } from '../../auth/supabase-identity-resolver.ts'
import { loadConfig } from '../../config/env.ts'
import { createDb, type DbHandle } from '../../db/client.ts'
import { bearer, makeKeys, signTestToken, supabaseEnv, type TestKeys } from '../../../test/auth.ts'
import { testDatabaseUrl } from '../../../test/db.ts'

let app: FastifyInstance
let handle: DbHandle
let keys: TestKeys
const quiet = { write() {} }
const ID = '0192f0a0-0000-7000-8000-0000000000aa'
const SUB = '0192f0a0-0000-7000-8000-0000000000cc'

beforeAll(async () => {
  keys = await makeKeys()
  const config = loadConfig({ ...supabaseEnv, DATABASE_URL: testDatabaseUrl })
  handle = createDb(config)
  app = await buildApp({
    config,
    db: { ping: handle.ping, db: handle.db },
    resolveIdentity: supabaseIdentityResolver({ issuer: config.supabaseAuth?.issuer ?? '', audience: 'authenticated', keys: keys.keys }),
    logStream: quiet,
  })
})
afterAll(async () => {
  await handle.pool.query('delete from app.stocks where user_id = $1', [SUB])
  await app.close()
  await handle.close()
})

const rows: [string, string, unknown?][] = [
  ['GET', '/stocks'],
  ['POST', '/stocks', { ticker: 'A101', market: 'US', exchange: 'NYSE', name: 'TC-A-101 should not exist' }],
  ['GET', `/stocks/${ID}`],
  ['PATCH', `/stocks/${ID}`, { name: 'x' }],
  ['DELETE', `/stocks/${ID}`],
]

describe('TC-A-101 (stocks part) every stock route needs an identity', () => {
  it.each(rows)('%s %s answers 401 without a token and with a bad one', async (method, url, payload) => {
    for (const headers of [undefined, bearer('not.a.jwt'), bearer(await signTestToken(keys, { aud: 'anon' }))]) {
      const res = await app.inject({ method: method as 'GET', url, ...(headers && { headers }), ...(payload !== undefined && { payload: payload as object }) })
      expect(res.statusCode).toBe(401)
      expect(res.headers['www-authenticate']).toBe('Bearer')
      expect(res.headers['content-type']).toContain('application/problem+json')
      expect(res.json().code).toBe('unauthenticated')
    }
  })

  it('wrote nothing', async () => {
    const { rows: found } = await handle.pool.query("select count(*)::int n from app.stocks where name = 'TC-A-101 should not exist'")
    expect(found[0].n).toBe(0)
  })

  it('a valid token works end to end and scopes by its subject', async () => {
    const headers = bearer(await signTestToken(keys, { sub: SUB }))
    const res = await app.inject({ method: 'POST', url: '/stocks', payload: { ticker: 'TOK', market: 'US', exchange: 'NYSE', name: 'Via token' }, headers })
    expect(res.statusCode).toBe(201)
    expect((await handle.pool.query('select user_id from app.stocks where id = $1', [res.json().id])).rows[0].user_id).toBe(SUB)
    expect((await app.inject({ method: 'GET', url: '/stocks', headers })).json().items).toHaveLength(1)
  })
})

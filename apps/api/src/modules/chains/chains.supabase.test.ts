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

beforeAll(async () => {
  keys = await makeKeys()
  const config = loadConfig({ ...supabaseEnv, DATABASE_URL: testDatabaseUrl })
  handle = createDb(config)
  app = await buildApp({
    config,
    db: { ping: handle.ping, db: handle.db },
    resolveIdentity: supabaseIdentityResolver({ issuer: config.supabaseAuth?.issuer ?? '', audience: 'authenticated', keys: keys.keys }),
    logStream: { write() {} },
  })
})
afterAll(async () => {
  await app.close()
  await handle.close()
})

describe('chains routes need an identity', () => {
  it('TC-U-921 POST /chains/rename answers 401 without a token and with a bad one', async () => {
    for (const headers of [undefined, bearer('not.a.jwt'), bearer(await signTestToken(keys, { aud: 'anon' }))]) {
      const res = await app.inject({ method: 'POST', url: '/chains/rename', ...(headers && { headers }), payload: { from: 'A', to: 'B' } })
      expect(res.statusCode).toBe(401)
      expect(res.headers['www-authenticate']).toBe('Bearer')
      expect(res.json().code).toBe('unauthenticated')
    }
  })
})

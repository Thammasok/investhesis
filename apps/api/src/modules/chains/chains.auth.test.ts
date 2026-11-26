import type { FastifyInstance } from 'fastify'
import { errors, type JWTVerifyGetKey } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.ts'
import { supabaseIdentityResolver } from '../../auth/supabase-identity-resolver.ts'
import { loadConfig } from '../../config/env.ts'
import { createDb, type DbHandle } from '../../db/client.ts'
import { bearer, capturingStream, makeKeys, signTestToken, supabaseEnv, USER_U, type TestKeys } from '../../../test/auth.ts'
import { seedChain } from '../../../test/chains.ts'
import { testDatabaseUrl } from '../../../test/db.ts'

let handle: DbHandle
let keys: TestKeys
let other: TestKeys
const cap = capturingStream()
const config = () => loadConfig({ ...supabaseEnv, DATABASE_URL: testDatabaseUrl, LOG_LEVEL: 'trace' })
const apps: FastifyInstance[] = []

async function start(getKey: JWTVerifyGetKey): Promise<FastifyInstance> {
  const c = config()
  const app = await buildApp({
    config: c,
    db: { ping: handle.ping, db: handle.db },
    resolveIdentity: supabaseIdentityResolver({ issuer: c.supabaseAuth?.issuer ?? '', audience: 'authenticated', keys: getKey }),
    logStream: cap.stream,
  })
  apps.push(app)
  return app
}

beforeAll(async () => {
  keys = await makeKeys()
  other = await makeKeys('unknown-key')
  handle = createDb(config())
})
afterAll(async () => {
  await handle.pool.query('delete from app.stocks where user_id = $1', [USER_U])
  for (const a of apps) await a.close()
  await handle.close()
})

describe('POST /chains/rename authentication', () => {
  it('TC-A-901 every bad credential is 401 unauthenticated, logs only the reason, and changes nothing', async () => {
    const app = await start(keys.keys)
    const id = await seedChain(handle, USER_U, 'AU901', 'A')
    const past = Math.floor(Date.now() / 1000) - 600
    const credentials: [string, Record<string, string> | undefined][] = [
      ['no header', undefined],
      ['Basic scheme', { authorization: 'Basic eDp4' }],
      ['garbage bearer', bearer('not.a.jwt')],
      ['expired token', bearer(await signTestToken(keys, { iat: past - 3600, exp: past }))],
      ['wrong audience', bearer(await signTestToken(keys, { aud: 'somebody-else' }))],
      ['anon role', bearer(await signTestToken(keys, { aud: 'anon', role: 'anon' }))],
      ['unknown signing key', bearer(await signTestToken(other, {}, { kid: 'test-key' }))],
    ]
    for (const [label, headers] of credentials) {
      cap.lines.length = 0
      const res = await app.inject({ method: 'POST', url: '/chains/rename', ...(headers && { headers }), payload: { from: 'A', to: 'B' } })
      expect({ label, status: res.statusCode, www: res.headers['www-authenticate'], code: res.json().code, requestId: typeof res.json().requestId }).toEqual({
        label,
        status: 401,
        www: 'Bearer',
        code: 'unauthenticated',
        requestId: 'string',
      })
      expect(res.payload).not.toMatch(/expired|audience|signature|reason/i)
      expect(cap.lines.join('\n')).not.toMatch(/Bearer [A-Za-z0-9_-]{10,}/)
    }
    const { rows } = await handle.pool.query('select value_chain, updated_at from app.stocks where id = $1', [id])
    expect(rows[0].value_chain).toBe('A')
    expect(rows[0].updated_at.getFullYear()).toBe(2020)
  })

  it('TC-A-901 a JWKS outage with no cached key is 503 auth_unavailable with Retry-After 5', async () => {
    const unreachable: JWTVerifyGetKey = async () => {
      throw new errors.JWKSTimeout()
    }
    const app = await start(unreachable)
    const res = await app.inject({ method: 'POST', url: '/chains/rename', headers: bearer(await signTestToken(keys)), payload: { from: 'A', to: 'B' } })
    expect(res.statusCode).toBe(503)
    expect(res.headers['retry-after']).toBe('5')
    expect(res.json().code).toBe('auth_unavailable')
  })

  it('TC-A-901 a valid token renames only the rows of its own subject', async () => {
    const app = await start(keys.keys)
    const mine = await seedChain(handle, USER_U, 'AU902', 'Valid')
    const res = await app.inject({ method: 'POST', url: '/chains/rename', headers: bearer(await signTestToken(keys)), payload: { from: 'Valid', to: 'Renamed' } })
    expect(res.statusCode).toBe(200)
    expect((await handle.pool.query('select value_chain from app.stocks where id = $1', [mine])).rows[0].value_chain).toBe('Renamed')
  })
})

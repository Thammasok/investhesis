import { errors, exportSPKI, importJWK, type JWTVerifyGetKey } from 'jose'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.ts'
import { loadConfig } from '../../config/env.ts'
import { supabaseIdentityResolver } from '../../auth/supabase-identity-resolver.ts'
import {
  bearer,
  capturingStream,
  ISSUER,
  makeKeys,
  signHmac,
  signTestToken,
  signUnsecured,
  supabaseEnv,
  USER_U,
  USER_V,
  type TestKeys,
} from '../../../test/auth.ts'

let app: FastifyInstance
let keys: TestKeys
beforeAll(async () => {
  keys = await makeKeys()
})
afterEach(() => app?.close())

const quiet = { write() {} }

async function start(getKey: JWTVerifyGetKey = keys.keys, logStream: { write(s: string): void } = quiet) {
  const config = loadConfig(supabaseEnv)
  app = await buildApp({
    config,
    resolveIdentity: supabaseIdentityResolver({ issuer: config.supabaseAuth?.issuer ?? '', audience: 'authenticated', keys: getKey }),
    logStream,
  })
  return app
}

const me = (headers?: Record<string, string>, url = '/me') => app.inject({ method: 'GET', url, ...(headers && { headers }) })

describe('GET /me in supabase mode', () => {
  it('TC-U-006 a valid token resolves the identity', async () => {
    await start()
    const res = await me(bearer(await signTestToken(keys)))
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: USER_U, email: 'a@x.io', displayName: null })
  })

  it('G-1 a token without an email still resolves, with a null email', async () => {
    await start()
    const res = await me(bearer(await signTestToken(keys, { email: undefined })))
    expect(res.json()).toEqual({ id: USER_U, email: null, displayName: null })
  })

  it('TC-U-012 / TC-A-014 concurrent users never cross identities', async () => {
    await start()
    const tokens = await Promise.all([signTestToken(keys, { sub: USER_U }), signTestToken(keys, { sub: USER_V })])
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => me(bearer(tokens[i % 2] ?? '')).then((r) => [i % 2, r.json().id] as const)),
    )
    for (const [i, id] of results) expect(id).toBe(i === 0 ? USER_U : USER_V)
  })

  it('TC-A-007 identity is never taken from query or custom headers', async () => {
    await start()
    const res = await me(
      { ...bearer(await signTestToken(keys)), 'x-user-id': USER_V, 'x-forwarded-user': USER_V },
      `/me?userId=${USER_V}&user_id=${USER_V}`,
    )
    expect(res.json().id).toBe(USER_U)
  })

  it('TC-U-008 / TC-A-008 clock skew inside 30 s is accepted, beyond it is not', async () => {
    await start()
    const at = (s: number) => signTestToken(keys, { exp: Math.floor(Date.now() / 1000) + s })
    expect((await me(bearer(await at(-20)))).statusCode).toBe(200)
    expect((await me(bearer(await at(-29)))).statusCode).toBe(200)
    expect((await me(bearer(await at(-40)))).statusCode).toBe(401)
  })
})

describe('rejected tokens (TC-U-007, TC-A-004/005/006/009/012)', () => {
  const secret = new TextEncoder().encode('x'.repeat(48))
  const nowS = () => Math.floor(Date.now() / 1000)

  const cases: [string, () => Promise<Record<string, string> | undefined>][] = [
    ['no header', async () => undefined],
    ['Basic scheme', async () => ({ authorization: 'Basic abc' })],
    ['lowercase bearer with empty token', async () => ({ authorization: 'Bearer ' })],
    ['not a jwt', async () => bearer('not.a.jwt')],
    ['wrong signature key', async () => bearer(await signTestToken(await makeKeys('other'), {}, { kid: keys.kid }))],
    ['unknown kid', async () => bearer(await signTestToken(keys, {}, { kid: 'nope' }))],
    ['HS256 with a secret', async () => bearer(await signHmac(secret))],
    ['alg none', async () => bearer(signUnsecured())],
    ['wrong issuer', async () => bearer(await signTestToken(keys, { iss: 'https://evil.example/auth/v1' }))],
    ['wrong audience', async () => bearer(await signTestToken(keys, { aud: 'anon' }))],
    ['expired', async () => bearer(await signTestToken(keys, { exp: nowS() - 120 }))],
    ['no exp', async () => bearer(await signTestToken(keys, { exp: undefined }))],
    ['no sub', async () => bearer(await signTestToken(keys, { sub: undefined }))],
    ['not before in the future', async () => bearer(await signTestToken(keys, { nbf: nowS() + 600 }))],
    ['sub not a uuid', async () => bearer(await signTestToken(keys, { sub: 'admin' }))],
    ['role anon', async () => bearer(await signTestToken(keys, { role: 'anon' }))],
    ['anonymous user', async () => bearer(await signTestToken(keys, { is_anonymous: true }))],
    [
      'tampered payload',
      async () => {
        const [h, , s] = (await signTestToken(keys)).split('.')
        const payload = Buffer.from(JSON.stringify({ sub: USER_V, role: 'authenticated', aud: 'authenticated', iss: ISSUER, exp: nowS() + 3600 })).toString('base64url')
        return bearer(`${h}.${payload}.${s}`)
      },
    ],
    ['truncated signature', async () => bearer((await signTestToken(keys)).slice(0, -10))],
    ['extra segment', async () => bearer(`${await signTestToken(keys)}.extra`)],
  ]

  it.each(cases)('401 for %s, with the same body shape', async (_name, headers) => {
    await start()
    const res = await me(await headers())
    expect(res.statusCode).toBe(401)
    expect(res.headers['www-authenticate']).toBe('Bearer')
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json()
    expect(Object.keys(body).sort()).toEqual(['code', 'requestId', 'status', 'title', 'type'])
    expect(body).toMatchObject({ status: 401, code: 'unauthenticated', title: 'Unauthorized' })
    expect(body.requestId).toBe(res.headers['x-request-id'])
    const text = res.body
    for (const leak of ['eyJ', 'signature', 'issuer', 'audience', 'expired', USER_V, ' at ']) expect(text).not.toContain(leak)
  })

  it('TC-A-006 an HS256 token signed with the published public key as the secret is rejected', async () => {
    await start()
    const jwk = keys.jwks.keys[0]
    if (!jwk) throw new Error('no test key')
    const publicKey = await importJWK(jwk, 'ES256')
    const pem = await exportSPKI(publicKey as Parameters<typeof exportSPKI>[0])
    const forged = await signHmac(new TextEncoder().encode(pem), {}, keys.kid)
    const res = await me(bearer(forged))
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ code: 'unauthenticated' })
  })

  it('TC-A-009 tokens with a future nbf, no exp or no sub are all 401', async () => {
    await start()
    for (const claims of [{ nbf: nowS() + 600 }, { exp: undefined }, { sub: undefined }]) {
      const res = await me(bearer(await signTestToken(keys, claims)))
      expect({ claims, status: res.statusCode }).toEqual({ claims, status: 401 })
    }
  })

  it('all rejections share one body apart from requestId', async () => {
    await start()
    const bodies = new Set<string>()
    for (const [, headers] of cases) {
      const { requestId: _r, ...rest } = (await me(await headers())).json()
      bodies.add(JSON.stringify(rest))
    }
    expect(bodies.size).toBe(1)
  })
})

describe('JWKS failures (TC-U-009, TC-A-010, TC-A-012)', () => {
  const throwing = (err: unknown): JWTVerifyGetKey => async () => {
    throw err
  }

  it.each([
    ['JWKSTimeout', new errors.JWKSTimeout()],
    ['fetch failure', new TypeError('fetch failed')],
    ['bad JWKS response', new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response')],
  ])('503 auth_unavailable with Retry-After 5 on %s', async (_n, err) => {
    await start(throwing(err))
    const res = await me(bearer(await signTestToken(keys)))
    expect(res.statusCode).toBe(503)
    expect(res.headers['retry-after']).toBe('5')
    const body = res.json()
    expect(body.code).toBe('auth_unavailable')
    expect(Object.keys(body).sort()).toEqual(['code', 'requestId', 'status', 'title', 'type'])
  })

  it('JWKSNoMatchingKey is a 401, not a 503', async () => {
    await start(throwing(new errors.JWKSNoMatchingKey()))
    const res = await me(bearer(await signTestToken(keys)))
    expect(res.statusCode).toBe(401)
    expect(res.headers['retry-after']).toBeUndefined()
  })

  it('TC-A-005a an unknown kid asks the key set at most once', async () => {
    let calls = 0
    await start(async (...args) => {
      calls++
      return keys.keys(...args)
    })
    expect((await me(bearer(await signTestToken(keys, {}, { kid: 'nope' })))).statusCode).toBe(401)
    expect(calls).toBeLessThanOrEqual(1)
  })
})

describe('public paths and CORS preflight (TC-U-010)', () => {
  it.each([
    ['GET', '/health', 200],
    ['GET', '/openapi.json', 200],
    ['OPTIONS', '/me', 204],
  ])('%s %s needs no token', async (method, url, status) => {
    await start()
    const res = await app.inject({
      method: method as 'GET' | 'OPTIONS',
      url,
      headers: method === 'OPTIONS' ? { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' } : {},
    })
    expect(res.statusCode).toBe(status)
  })
})

describe('logging (TC-U-013, TC-A-013)', () => {
  it('a valid bearer token never reaches the logs and authorization is redacted', async () => {
    const log = capturingStream()
    await start(keys.keys, log.stream)
    const token = await signTestToken(keys)
    await me(bearer(token))
    const text = log.lines.join('')
    expect(text).not.toContain('eyJ')
    expect(text).not.toContain(token)
    expect(log.records().some((r) => r.req?.headers?.authorization === '[redacted]')).toBe(true)
  })

  it.each([
    ['expired', { exp: Math.floor(Date.now() / 1000) - 120 }],
    ['audience', { aud: 'anon' }],
  ])('a %s rejection is logged with its reason and no token', async (reason, claims) => {
    const log = capturingStream()
    await start(keys.keys, log.stream)
    await me(bearer(await signTestToken(keys, claims)))
    const text = log.lines.join('')
    expect(text).not.toContain('eyJ')
    const rejection = log.records().find((r) => r.reason !== undefined)
    expect(rejection?.reason).toBe(reason)
    expect(log.records().some((r) => r.req?.headers?.authorization === '[redacted]')).toBe(true)
  })
})

describe('OpenAPI (TC-A-015)', () => {
  it('declares bearerAuth on /me and not on public routes', async () => {
    await start()
    const spec = (await app.inject('/openapi.json')).json()
    expect(spec.components.securitySchemes.bearerAuth).toEqual({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    expect(spec.paths['/me'].get.security).toEqual([{ bearerAuth: [] }])
    expect(spec.paths['/health']?.get?.security).toBeUndefined()
    expect(spec.paths['/ready']?.get?.security).toBeUndefined()
  })
})

describe('mock mode (TC-A-001)', () => {
  it('ignores the header and serves the mock user', async () => {
    const { baseEnv, MOCK_USER_ID } = await import('../../../test/env.ts')
    app = await buildApp({ config: loadConfig(baseEnv), logStream: quiet })
    for (const headers of [undefined, bearer('garbage')]) {
      const res = await app.inject({ method: 'GET', url: '/me', ...(headers && { headers }) })
      expect(res.json().id).toBe(MOCK_USER_ID)
    }
  })
})

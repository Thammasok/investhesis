import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRemoteJWKSet } from 'jose'
import type { FastifyRequest } from 'fastify'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppError } from '../lib/app-error.ts'
import { bearer, ISSUER, makeKeys, signTestToken, USER_U, type TestKeys } from '../../test/auth.ts'
import { supabaseIdentityResolver } from './supabase-identity-resolver.ts'

let keys: TestKeys
beforeAll(async () => {
  keys = await makeKeys()
})
afterEach(() => vi.unstubAllGlobals())

const fakeReq = (headers: Record<string, string>) =>
  ({ headers, log: { warn() {}, info() {}, error() {} } }) as unknown as FastifyRequest

describe('supabaseIdentityResolver', () => {
  it('TC-A-016 p95 of 1,000 verifications against a cached key set is within 5 ms, with no network', async () => {
    const fetchSpy = vi.fn<() => never>(() => {
      throw new Error('network used')
    })
    vi.stubGlobal('fetch', fetchSpy)
    const resolve = supabaseIdentityResolver({ issuer: ISSUER, audience: 'authenticated', keys: keys.keys })
    const base = Math.floor(Date.now() / 1000) + 3600
    const tokens = await Promise.all(
      Array.from({ length: 1050 }, (_, i) => signTestToken(keys, { exp: base + i })),
    )
    for (const t of tokens.slice(0, 50)) await resolve(fakeReq(bearer(t)))

    const times: number[] = []
    for (const t of tokens.slice(50)) {
      const req = fakeReq(bearer(t))
      const start = performance.now()
      const identity = await resolve(req)
      times.push(performance.now() - start)
      expect(identity.userId).toBe(USER_U)
    }
    times.sort((a, b) => a - b)
    const p95 = times.at(Math.floor(times.length * 0.95) - 1)
    expect(times).toHaveLength(1000)
    expect(p95).toBeDefined()
    expect(p95 ?? Infinity).toBeLessThanOrEqual(5)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects with an AppError 401 carrying WWW-Authenticate', async () => {
    const resolve = supabaseIdentityResolver({ issuer: ISSUER, audience: 'authenticated', keys: keys.keys })
    const err = await resolve(fakeReq({})).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({ status: 401, code: 'unauthenticated', headers: { 'WWW-Authenticate': 'Bearer' } })
  })

  describe('TC-A-011 against a remote JWKS', () => {
    let server: Server | undefined
    const stop = (s: Server | undefined) => new Promise<void>((r) => (s?.listening ? s.close(() => r()) : r()))
    afterEach(() => stop(server))

    it('a cached key survives a JWKS outage, and the server is hit once', async () => {
      let hits = 0
      const srv = createServer((_req, res) => {
        hits++
        res.setHeader('content-type', 'application/json').end(JSON.stringify(keys.jwks))
      })
      server = srv
      await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
      const { port } = srv.address() as AddressInfo
      const resolve = supabaseIdentityResolver({
        issuer: ISSUER,
        audience: 'authenticated',
        keys: createRemoteJWKSet(new URL(`http://127.0.0.1:${port}/jwks`)),
      })
      expect((await resolve(fakeReq(bearer(await signTestToken(keys))))).userId).toBe(USER_U)
      await stop(srv)
      expect((await resolve(fakeReq(bearer(await signTestToken(keys))))).userId).toBe(USER_U)
      expect(hits).toBe(1)
    })

    it('an unreachable JWKS with an empty cache is a 503', async () => {
      const resolve = supabaseIdentityResolver({
        issuer: ISSUER,
        audience: 'authenticated',
        keys: createRemoteJWKSet(new URL('http://127.0.0.1:1/jwks'), { timeoutDuration: 500 }),
      })
      const err = await resolve(fakeReq(bearer(await signTestToken(keys)))).catch((e: unknown) => e)
      expect(err).toMatchObject({ status: 503, code: 'auth_unavailable', headers: { 'Retry-After': '5' } })
    })
  })

  it('TC-A-017 verification with a local key set makes no network call', async () => {
    const boom = vi.fn<() => never>(() => {
      throw new Error('network used')
    })
    vi.stubGlobal('fetch', boom)
    const resolve = supabaseIdentityResolver({ issuer: ISSUER, audience: 'authenticated', keys: keys.keys })
    await resolve(fakeReq(bearer(await signTestToken(keys))))
    expect(boom).not.toHaveBeenCalled()
  })
})

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.ts'
import { supabaseIdentityResolver } from '../../auth/supabase-identity-resolver.ts'
import { loadConfig } from '../../config/env.ts'
import { createDb, type DbHandle } from '../../db/client.ts'
import { bearer, makeKeys, signTestToken, supabaseEnv, type TestKeys } from '../../../test/auth.ts'
import { testDatabaseUrl } from '../../../test/db.ts'
import { F } from '../../../test/fixtures/imports/build.ts'
import { filePart, multipart } from '../../../test/multipart.ts'

let app: FastifyInstance
let handle: DbHandle
let keys: TestKeys
const quiet = { write() {} }

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
  await app.close()
  await handle.close()
})

const rows: [string, string][] = [
  ['GET', '/imports/template.csv'],
  ['GET', '/imports/template.xlsx'],
  ['POST', '/imports/preview'],
  ['POST', '/imports'],
]

describe('TC-A-101 (imports part, preview and confirm) every import route needs an identity', () => {
  it.each(rows)('%s %s answers 401 without a token and with a bad one, before reading the body', async (method, url) => {
    const body = method === 'POST' ? multipart([filePart(F.noBom(), 'a.csv')]) : undefined
    for (const auth of [{}, bearer('not.a.jwt'), bearer(await signTestToken(keys, { aud: 'anon' }))]) {
      const res = await app.inject({ method: method as 'GET', url, ...(body && { payload: body.payload }), headers: { ...body?.headers, ...auth } })
      expect(res.statusCode).toBe(401)
      expect(res.headers['www-authenticate']).toBe('Bearer')
      expect(res.headers['content-type']).toContain('application/problem+json')
      expect(res.json().code).toBe('unauthenticated')
    }
  })

  it('a valid token downloads the template and previews', async () => {
    const headers = bearer(await signTestToken(keys, { sub: '0192f0a0-0000-7000-8000-0000000000cc' }))
    const template = await app.inject({ method: 'GET', url: '/imports/template.csv', headers })
    expect(template.statusCode).toBe(200)
    const res = await app.inject({ method: 'POST', url: '/imports/preview', ...multipart([filePart(template.rawPayload, 't.csv')]), headers: { ...multipart([]).headers, ...headers } })
    expect(res.statusCode).toBe(200)
    expect(res.json().counts).toEqual({ new: 2, duplicate: 0, error: 0 })
  })
})

describe('TC-A-123 (imports part) file errors are RFC 7807 with stable codes', () => {
  it.each([
    ['file_too_large', 413, () => F.ofSize(1_048_577), 'a.csv'],
    ['file_unsupported', 415, () => F.reportTxt(), 'a.txt'],
    ['file_too_many_rows', 422, () => F.rows1001(), 'a.csv'],
    ['file_empty', 422, () => F.headerOnly(), 'a.csv'],
    ['file_missing_headers', 422, () => Buffer.from('ticker\nA\n'), 'a.csv'],
  ] as const)('%s', async (code, status, file, name) => {
    const headers = bearer(await signTestToken(keys))
    const res = await app.inject({ method: 'POST', url: '/imports/preview', ...multipart([filePart(file(), name)]), headers: { ...multipart([]).headers, ...headers } })
    expect(res.statusCode).toBe(status)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ code, status, type: expect.any(String), title: expect.any(String), requestId: expect.any(String) })
    expect(res.body).not.toMatch(/\bat .*\.ts|select |constraint/i)
  })

  it('file_missing', async () => {
    const headers = bearer(await signTestToken(keys))
    const res = await app.inject({ method: 'POST', url: '/imports/preview', ...multipart([]), headers: { ...multipart([]).headers, ...headers } })
    expect(res.json()).toMatchObject({ code: 'file_missing', status: 400 })
  })
})

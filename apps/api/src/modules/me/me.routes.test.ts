import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.ts'
import { loadConfig } from '../../config/env.ts'
import { baseEnv, MOCK_USER_ID } from '../../../test/env.ts'

let app: FastifyInstance
afterEach(() => app.close())

const quiet = { write() {} }

describe('GET /me', () => {
  it('returns the mock user from env', async () => {
    app = await buildApp({ config: loadConfig(baseEnv), logStream: quiet })
    const res = await app.inject('/me')
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.json()).toEqual({ id: MOCK_USER_ID, email: 'investor@example.com', displayName: 'Test Investor' })
  })

  it('returns nulls when the optional mock fields are unset', async () => {
    app = await buildApp({
      config: loadConfig({ ...baseEnv, MOCK_USER_EMAIL: '', MOCK_USER_NAME: '' }),
      logStream: quiet,
    })
    expect((await app.inject('/me')).json()).toEqual({ id: MOCK_USER_ID, email: null, displayName: null })
  })

  it('uses an injected resolver, so real auth can replace the mock', async () => {
    const other = '0192f0a0-0000-7000-8000-000000000002'
    app = await buildApp({
      config: loadConfig(baseEnv),
      resolveIdentity: async () => ({ userId: other, email: undefined, displayName: undefined }),
      logStream: quiet,
    })
    expect((await app.inject('/me')).json().id).toBe(other)
  })
})

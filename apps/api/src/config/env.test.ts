import { describe, expect, it } from 'vitest'
import { baseEnv, MOCK_USER_ID } from '../../test/env.ts'
import { ConfigError, loadConfig } from './env.ts'

const paths = (env: Record<string, string>) => {
  try {
    loadConfig(env)
    return []
  } catch (err) {
    if (err instanceof ConfigError) return err.issues.map((i) => i.path)
    throw err
  }
}

describe('loadConfig', () => {
  it('reads the mock user from env', () => {
    const config = loadConfig(baseEnv)
    expect(config.authMode).toBe('mock')
    expect(config.mockUser).toEqual({
      id: MOCK_USER_ID,
      email: 'investor@example.com',
      displayName: 'Test Investor',
    })
  })

  it('defaults to port 3000 and CORS from the web origin', () => {
    const config = loadConfig(baseEnv)
    expect(config.port).toBe(3000)
    expect(config.corsOrigins).toEqual(['http://localhost:5173'])
  })

  it('requires MOCK_USER_ID in mock mode', () => {
    expect(paths({ ...baseEnv, MOCK_USER_ID: '' })).toContain('MOCK_USER_ID')
  })

  it('rejects a MOCK_USER_ID that is not a UUID', () => {
    expect(paths({ ...baseEnv, MOCK_USER_ID: 'me' })).toContain('MOCK_USER_ID')
  })

  it('refuses mock auth in production', () => {
    expect(paths({ ...baseEnv, NODE_ENV: 'production' })).toContain('AUTH_MODE')
  })

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(paths({ ...baseEnv, DATABASE_URL: 'mysql://x@localhost/db' })).toContain('DATABASE_URL')
  })

  describe('supabase mode', () => {
    const sb = { ...baseEnv, AUTH_MODE: 'supabase', SUPABASE_URL: 'http://127.0.0.1:54321' }

    it('TC-U-011 requires SUPABASE_URL', () => {
      expect(paths({ ...sb, SUPABASE_URL: '' })).toContain('SUPABASE_URL')
    })

    it('derives issuer, JWKS URL and audience', () => {
      const config = loadConfig(sb)
      expect(config.authMode).toBe('supabase')
      expect(config.mockUser).toBeUndefined()
      expect(config.supabaseAuth).toEqual({
        issuer: 'http://127.0.0.1:54321/auth/v1',
        jwksUrl: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',
        audience: 'authenticated',
      })
    })

    it('does not need MOCK_USER_ID', () => {
      expect(paths({ ...sb, MOCK_USER_ID: '' })).toEqual([])
    })

    it('TC-U-011 defaults to supabase when AUTH_MODE is unset', () => {
      const { AUTH_MODE: _a, ...unset } = sb
      expect(loadConfig(unset).authMode).toBe('supabase')
      expect(paths({ ...baseEnv, AUTH_MODE: '' })).toContain('SUPABASE_URL')
    })

    it('TC-A-002 mock is allowed in development and test, refused in production', () => {
      expect(paths({ ...baseEnv, NODE_ENV: 'development' })).toEqual([])
      expect(paths({ ...baseEnv, NODE_ENV: 'test' })).toEqual([])
      expect(paths({ ...baseEnv, NODE_ENV: 'production' })).toContain('AUTH_MODE')
      expect(paths({ ...sb, NODE_ENV: 'production' })).toEqual([])
    })

    it('TC-A-003 rejects a malformed URL and strips a trailing slash', () => {
      expect(paths({ ...sb, SUPABASE_URL: 'not a url' })).toContain('SUPABASE_URL')
      expect(loadConfig({ ...sb, SUPABASE_URL: 'http://127.0.0.1:54321/' }).supabaseAuth?.issuer).toBe(
        'http://127.0.0.1:54321/auth/v1',
      )
    })

    it('rejects an unknown AUTH_MODE', () => {
      expect(paths({ ...sb, AUTH_MODE: 'basic' })).toContain('AUTH_MODE')
    })
  })
})

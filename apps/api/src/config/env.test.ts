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
})

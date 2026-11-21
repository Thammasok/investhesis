import { describe, expect, it } from 'vitest'
import { readConfig } from './config'

describe('readConfig', () => {
  it('defaults to supabase mode and names a missing URL', () => {
    expect(() => readConfig({})).toThrow('VITE_SUPABASE_URL')
  })

  it('names a missing publishable key', () => {
    expect(() => readConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })).toThrow('VITE_SUPABASE_PUBLISHABLE_KEY')
  })

  it('reads supabase settings', () => {
    expect(readConfig({ VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toEqual({
      authMode: 'supabase',
      supabaseUrl: 'http://x',
      supabasePublishableKey: 'k',
    })
  })

  it('mock mode needs no Supabase values', () => {
    expect(readConfig({ VITE_AUTH_MODE: 'mock' })).toEqual({ authMode: 'mock' })
  })

  it('rejects an unknown mode', () => {
    expect(() => readConfig({ VITE_AUTH_MODE: 'oauth' })).toThrow('VITE_AUTH_MODE')
  })
})

import { describe, expect, it } from 'vitest'
import { readConfig } from './config'

const URL_ = 'http://127.0.0.1:54321'

describe('readConfig (TC-C-002)', () => {
  it('TC-C-002: VITE_AUTH_MODE unset with both Supabase values means supabase mode', () => {
    expect(readConfig({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toEqual({
      authMode: 'supabase',
      supabaseUrl: URL_,
      supabasePublishableKey: 'k',
    })
  })

  it('TC-C-002: supabase mode without VITE_SUPABASE_URL names it', () => {
    expect(() => readConfig({ VITE_AUTH_MODE: 'supabase', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toThrow('VITE_SUPABASE_URL')
    expect(() => readConfig({})).toThrow('VITE_SUPABASE_URL')
  })

  it('TC-C-002: supabase mode without VITE_SUPABASE_PUBLISHABLE_KEY names it', () => {
    expect(() => readConfig({ VITE_AUTH_MODE: 'supabase', VITE_SUPABASE_URL: URL_ })).toThrow('VITE_SUPABASE_PUBLISHABLE_KEY')
  })

  it('TC-C-002: mock mode needs neither value', () => {
    expect(readConfig({ VITE_AUTH_MODE: 'mock' })).toEqual({ authMode: 'mock' })
  })

  it('treats blank values as unset and trims', () => {
    expect(() => readConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toThrow('VITE_SUPABASE_URL')
    expect(readConfig({ VITE_SUPABASE_URL: ` ${URL_} `, VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toMatchObject({ supabaseUrl: URL_ })
  })

  it('rejects an unknown mode', () => {
    expect(() => readConfig({ VITE_AUTH_MODE: 'oauth' })).toThrow('VITE_AUTH_MODE')
  })
})

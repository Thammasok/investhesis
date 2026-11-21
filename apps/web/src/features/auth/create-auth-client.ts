import type { WebConfig } from '@/config'
import type { AuthClient } from './auth-client'
import { createMockAuthClient } from './mock-auth-client'
import { createSupabaseAuthClient } from './supabase-auth-client'

export function createAuthClient(config: WebConfig): AuthClient {
  if (config.authMode === 'mock') return createMockAuthClient()
  return createSupabaseAuthClient({ url: config.supabaseUrl, publishableKey: config.supabasePublishableKey })
}

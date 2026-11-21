import type { AuthClient, AuthSession } from './auth-client'

const MOCK_SESSION: AuthSession = { accessToken: '', user: { id: 'mock-user', email: 'investor@example.com' } }
const ok = async () => ({ ok: true }) as const

/**
 * For `VITE_AUTH_MODE=mock` (the API in mock mode): always signed in, no token, and no guard ever
 * redirects. There is no session to end.
 */
export function createMockAuthClient(): AuthClient {
  return {
    mode: 'mock',
    getSession: async () => MOCK_SESSION,
    getAccessToken: async () => null,
    refresh: async () => MOCK_SESSION,
    signIn: ok,
    signUp: ok,
    resendConfirmation: ok,
    verifyEmailLink: ok,
    requestPasswordReset: ok,
    setNewPassword: ok,
    changePassword: ok,
    signOut: async () => {},
    onChange: () => () => {},
  }
}

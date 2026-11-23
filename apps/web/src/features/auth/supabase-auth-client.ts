import { createClient, type Session } from '@supabase/supabase-js'
import type { AuthClient, AuthEvent, AuthListener, AuthResult, AuthSession } from './auth-client'
import { mapSupabaseError } from './map-supabase-error'

export type SupabaseAuthOptions = { url: string; publishableKey: string; origin?: string }

function toSession(session: Session | null): AuthSession | null {
  if (!session) return null
  return { accessToken: session.access_token, user: { id: session.user.id, email: session.user.email ?? '' } }
}

const EVENTS: ReadonlySet<string> = new Set<AuthEvent>([
  'SIGNED_IN',
  'SIGNED_OUT',
  'TOKEN_REFRESHED',
  'PASSWORD_RECOVERY',
  'USER_UPDATED',
])

/**
 * The adapter over supabase-js, the only file that imports it (oxlint `no-restricted-imports`).
 * `detectSessionInUrl` stays off: `/auth/confirm` verifies email links itself (ADR-002).
 */
export function createSupabaseAuthClient({ url, publishableKey, origin = window.location.origin }: SupabaseAuthOptions): AuthClient {
  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  const auth = supabase.auth
  const listeners = new Set<AuthListener>()
  let signingOutHere = false

  auth.onAuthStateChange((event) => {
    if (!EVENTS.has(event) || listeners.size === 0) return
    if (event === 'SIGNED_OUT' && signingOutHere) return
    for (const listener of listeners) listener(event as AuthEvent)
  })

  async function run(call: () => Promise<{ error: unknown }>): Promise<AuthResult> {
    try {
      const { error } = await call()
      return error ? { ok: false, error: mapSupabaseError(error) } : { ok: true }
    } catch (error) {
      return { ok: false, error: mapSupabaseError(error) }
    }
  }

  async function getSession() {
    const { data } = await auth.getSession()
    return toSession(data.session)
  }

  return {
    mode: 'supabase',
    getSession,
    async getAccessToken() {
      return (await getSession())?.accessToken ?? null
    },
    async refresh() {
      const { data, error } = await auth.refreshSession()
      return error ? null : toSession(data.session)
    },
    signIn: (email, password) => run(() => auth.signInWithPassword({ email, password })),
    // Supabase's name for the confirmation-email resend type; it is not a registration call.
    resendConfirmation: (email) => run(() => auth.resend({ type: 'signup', email })),
    verifyEmailLink: (tokenHash, type) => run(() => auth.verifyOtp({ token_hash: tokenHash, type })),
    requestPasswordReset: (email) => run(() => auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm` })),
    setNewPassword: (password) => run(() => auth.updateUser({ password })),
    changePassword: (current, next) => run(() => auth.updateUser({ password: next, current_password: current })),
    async signOut() {
      signingOutHere = true
      try {
        await auth.signOut({ scope: 'local' })
      } finally {
        signingOutHere = false
      }
    },
    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

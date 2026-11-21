import type { AuthClient, AuthErrorCode, AuthEvent, AuthListener, AuthResult, AuthSession } from '@/features/auth/auth-client'

type FakeOptions = { session?: AuthSession | null; refreshResult?: AuthSession | null }

export function fakeSession(token = 'T1', email = 'investor@example.com'): AuthSession {
  return { accessToken: token, user: { id: 'user-1', email }, }
}

/**
 * In-memory `AuthClient` for tests: scripted errors, call counters and `emit()` to simulate a
 * change made elsewhere (another tab). Like the real adapter, its own `signOut()` emits nothing.
 */
export class FakeAuthClient implements AuthClient {
  readonly mode = 'supabase' as const
  session: AuthSession | null
  /** What `refresh()` yields; `null` simulates a failed refresh. */
  refreshResult: AuthSession | null
  /** The next call that returns a result fails with this code, once. */
  nextError: AuthErrorCode | null = null
  readonly calls = { refresh: 0, signOut: 0, signIn: 0 }
  private listeners = new Set<AuthListener>()

  constructor({ session = null, refreshResult }: FakeOptions = {}) {
    this.session = session
    this.refreshResult = refreshResult === undefined ? session : refreshResult
  }

  static signedIn(token = 'T1') {
    return new FakeAuthClient({ session: fakeSession(token) })
  }

  static signedOut() {
    return new FakeAuthClient()
  }

  emit(event: AuthEvent) {
    if (event === 'SIGNED_OUT') this.session = null
    for (const listener of this.listeners) listener(event)
  }

  private result(): AuthResult {
    const error = this.nextError
    this.nextError = null
    return error ? { ok: false, error } : { ok: true }
  }

  getSession = async () => this.session
  getAccessToken = async () => this.session?.accessToken ?? null
  refresh = async () => {
    this.calls.refresh += 1
    this.session = this.refreshResult
    return this.refreshResult
  }
  signIn = async (email: string) => {
    this.calls.signIn += 1
    const result = this.result()
    if (result.ok) this.session = fakeSession('T1', email)
    return result
  }
  signUp = async () => this.result()
  resendConfirmation = async () => this.result()
  verifyEmailLink = async () => this.result()
  requestPasswordReset = async () => this.result()
  setNewPassword = async () => this.result()
  changePassword = async () => this.result()
  signOut = async () => {
    this.calls.signOut += 1
    this.session = null
  }
  onChange = (listener: AuthListener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

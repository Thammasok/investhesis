import type {
  AuthClient,
  AuthErrorCode,
  AuthEvent,
  AuthListener,
  AuthResult,
  AuthSession,
  VerifyLinkType,
} from '@/features/auth/auth-client'

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
  /** Per-email scripted errors, kept across calls (unlike `nextError`). */
  errorsByEmail: Record<string, AuthErrorCode> = {}
  /** When set, `signIn` waits for it before answering (double-submit tests). */
  signInGate: Promise<void> | null = null
  /** Email links the fake accepts, by token hash. Any other hash gives `link_invalid`. */
  validLinks: Record<string, VerifyLinkType> = {}
  /** When set, `verifyEmailLink` waits for it before answering (pending-UI tests). */
  verifyGate: Promise<void> | null = null
  readonly calls = { refresh: 0, signOut: 0, signIn: 0, signUp: 0, resend: 0, verify: 0, reset: 0 }
  readonly args = {
    signIn: [] as Array<[string, string]>,
    signUp: [] as Array<[string, string]>,
    resend: [] as string[],
    reset: [] as string[],
    verify: [] as Array<[string, VerifyLinkType]>,
    setNewPassword: [] as string[],
    changePassword: [] as Array<[string, string]>,
  }
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

  private result(email?: string): AuthResult {
    const error = this.nextError ?? (email ? (this.errorsByEmail[email] ?? null) : null)
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
  signIn = async (email: string, password: string) => {
    this.calls.signIn += 1
    this.args.signIn.push([email, password])
    if (this.signInGate) await this.signInGate
    const result = this.result(email)
    if (result.ok) this.session = fakeSession('T1', email)
    return result
  }
  signUp = async (email: string, password: string) => {
    this.calls.signUp += 1
    this.args.signUp.push([email, password])
    return this.result(email)
  }
  resendConfirmation = async (email: string) => {
    this.calls.resend += 1
    this.args.resend.push(email)
    return this.result()
  }
  verifyEmailLink = async (tokenHash: string, type: VerifyLinkType) => {
    this.calls.verify += 1
    this.args.verify.push([tokenHash, type])
    if (this.verifyGate) await this.verifyGate
    if (this.validLinks[tokenHash] !== type) return { ok: false, error: 'link_invalid' } as const
    this.session = fakeSession('T1', 'investor@example.com')
    return this.result()
  }
  requestPasswordReset = async (email: string) => {
    this.calls.reset += 1
    this.args.reset.push(email)
    return this.result(email)
  }
  setNewPassword = async (password: string) => {
    this.args.setNewPassword.push(password)
    return this.result()
  }
  changePassword = async (current: string, next: string) => {
    this.args.changePassword.push([current, next])
    return this.result()
  }
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

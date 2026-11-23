/**
 * The only auth API pages and guards see. Methods return a result instead of throwing SDK
 * errors, so no vendor type leaks past the adapter (design.md, Components, Web).
 */

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'same_password'
  | 'wrong_current_password'
  | 'link_invalid'
  | 'rate_limited'
  | 'unavailable'
  | 'unknown'

export type AuthUser = { id: string; email: string }
export type AuthSession = { accessToken: string; user: AuthUser }

export type AuthResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: AuthErrorCode }

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'PASSWORD_RECOVERY' | 'USER_UPDATED'
export type AuthListener = (event: AuthEvent) => void

export type VerifyLinkType = 'email' | 'recovery'

export interface AuthClient {
  /** `mock`: the API runs as a fixed user, so there is no session, no token and no guard. */
  readonly mode: 'supabase' | 'mock'
  /** The current session; an expired access token is refreshed first. `null` when signed out. */
  getSession(): Promise<AuthSession | null>
  getAccessToken(): Promise<string | null>
  /** Forces a token refresh. `null` when it fails (the session is over). */
  refresh(): Promise<AuthSession | null>
  signIn(email: string, password: string): Promise<AuthResult>
  resendConfirmation(email: string): Promise<AuthResult>
  verifyEmailLink(tokenHash: string, type: VerifyLinkType): Promise<AuthResult>
  requestPasswordReset(email: string): Promise<AuthResult>
  setNewPassword(password: string): Promise<AuthResult>
  changePassword(current: string, next: string): Promise<AuthResult>
  signOut(): Promise<void>
  /**
   * Changes made elsewhere (another tab, a failed refresh). A sign-out started through this
   * client's own `signOut()` is not reported: the caller navigates itself.
   */
  onChange(listener: AuthListener): () => void
}

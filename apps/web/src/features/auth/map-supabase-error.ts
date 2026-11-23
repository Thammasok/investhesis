import type { AuthErrorCode } from './auth-client'

/** The parts of a supabase-js error we read; structural, so this file needs no SDK import. */
export type SupabaseErrorLike = { code?: string; status?: number; name?: string; message?: string }

const CODE_MAP: Record<string, AuthErrorCode> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  weak_password: 'weak_password',
  same_password: 'same_password',
  // Real codes from Supabase Auth (verified in T-001): wrong and missing current password.
  current_password_invalid: 'wrong_current_password',
  current_password_required: 'wrong_current_password',
  otp_expired: 'link_invalid',
  flow_state_expired: 'link_invalid',
  flow_state_not_found: 'link_invalid',
  bad_code_verifier: 'link_invalid',
  bad_jwt: 'link_invalid',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
}

export function mapSupabaseError(error: unknown): AuthErrorCode {
  if (typeof error === 'string') return /fetch|network/i.test(error) ? 'unavailable' : 'unknown'
  if (typeof error !== 'object' || error === null) return 'unknown'
  const e = error as SupabaseErrorLike

  if (e.code && e.code in CODE_MAP) return CODE_MAP[e.code]
  if (e.status === 429) return 'rate_limited'
  if (typeof e.status === 'number' && e.status >= 500) return 'unavailable'
  if (error instanceof TypeError || e.name === 'AuthRetryableFetchError' || e.status === 0) return 'unavailable'
  return 'unknown'
}

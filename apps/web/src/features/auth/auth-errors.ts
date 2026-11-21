import type { AuthErrorCode } from './auth-client'

/** User-facing copy per code (design.md, Error mapping). */
export const authErrorMessages: Record<AuthErrorCode, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Confirm your email first.',
  signup_not_allowed: 'Sign-up is invite-only. Ask the owner to add this email.',
  weak_password: 'Use 8 to 72 characters for your password.',
  same_password: "Choose a password you haven't used here.",
  wrong_current_password: 'Current password is incorrect.',
  link_invalid: 'This link has expired or was already used.',
  rate_limited: 'Too many attempts. Try again in a few minutes.',
  unavailable: "Can't reach the sign-in service. Try again.",
  unknown: 'Something went wrong. Try again.',
}

export function authErrorMessage(code: AuthErrorCode): string {
  return authErrorMessages[code]
}

import { i18n } from '@/i18n/i18n'
import type { AuthErrorCode } from './auth-client'

const CODES = [
  'invalid_credentials',
  'email_not_confirmed',
  'weak_password',
  'same_password',
  'wrong_current_password',
  'link_invalid',
  'rate_limited',
  'unavailable',
  'unknown',
] as const satisfies readonly AuthErrorCode[]

/**
 * User-facing copy per code (design.md, Error mapping), read from the catalogue in the language of the
 * moment: each entry is a getter, so the text follows a language switch.
 */
export const authErrorMessages = Object.defineProperties(
  {} as Record<AuthErrorCode, string>,
  Object.fromEntries(
    CODES.map((code) => [code, { enumerable: true, get: () => i18n.t(`auth.errors.${code}`) }]),
  ),
)

export function authErrorMessage(code: AuthErrorCode): string {
  return authErrorMessages[code]
}

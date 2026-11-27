import { i18n } from '@/i18n/i18n'

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

export type PasswordErrors = { password?: string; confirm?: string }

/**
 * The one rule set for every new-password field (reset and change; NFR-002). Checks run in
 * order and report the first failure per field; a mismatch is reported on the confirm field only
 * when the password itself is acceptable. Messages are in the language at the moment of the check.
 */
export function validateNewPassword(password: string, confirm: string): PasswordErrors {
  if (password === '') return { password: i18n.t('auth.rules.enter') }
  if (password.length < PASSWORD_MIN) return { password: i18n.t('auth.rules.tooShort') }
  if (password.length > PASSWORD_MAX) return { password: i18n.t('auth.rules.tooLong') }
  if (confirm !== password) return { confirm: i18n.t('auth.rules.mismatch') }
  return {}
}

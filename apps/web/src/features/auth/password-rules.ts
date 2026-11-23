export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

export type PasswordErrors = { password?: string; confirm?: string }

/**
 * The one rule set for every new-password field (reset and change; NFR-002). Checks run in
 * order and report the first failure per field; a mismatch is reported on the confirm field only
 * when the password itself is acceptable.
 */
export function validateNewPassword(password: string, confirm: string): PasswordErrors {
  if (password === '') return { password: 'Enter a password.' }
  if (password.length < PASSWORD_MIN) return { password: 'Use at least 8 characters.' }
  if (password.length > PASSWORD_MAX) return { password: 'Use 72 characters or fewer.' }
  if (confirm !== password) return { confirm: "Passwords don't match." }
  return {}
}

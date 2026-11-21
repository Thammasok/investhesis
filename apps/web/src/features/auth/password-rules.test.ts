import { describe, expect, it } from 'vitest'
import { validateNewPassword } from './password-rules'

describe('validateNewPassword', () => {
  const long = (n: number) => 'a'.repeat(n)

  it.each([
    ['', '', { password: 'Enter a password.' }],
    ['Abc1234', 'Abc1234', { password: 'Use at least 8 characters.' }],
    ['Abc12345', 'Abc12345', {}],
    [long(73), long(73), { password: 'Use 72 characters or fewer.' }],
    [long(72), long(72), {}],
    ['Abc12345', 'Abc12346', { confirm: "Passwords don't match." }],
  ])('TC-U-021: (%j, %j) gives %j', (password, confirm, expected) => {
    expect(validateNewPassword(password, confirm)).toEqual(expected)
  })
})

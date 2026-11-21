import { describe, expect, it } from 'vitest'
import { safeNext } from './safe-next'

describe('safeNext', () => {
  // TC-U-016
  it.each<[string | null, string]>([
    ['/lists', '/lists'],
    ['/stocks/1?x=2#y', '/stocks/1?x=2#y'],
    [null, '/stocks'],
    ['', '/stocks'],
    ['lists', '/stocks'],
    ['//evil.example', '/stocks'],
    ['/\\evil.example', '/stocks'],
    ['https://evil.example/', '/stocks'],
    ['javascript:alert(1)', '/stocks'],
    ['/auth/sign-in', '/stocks'],
    ['%2F%2Fevil.example', '/stocks'],
    ['/auth', '/stocks'],
    ['/auth?x=1', '/stocks'],
    ['/\t/evil.example', '/stocks'],
    ['/authors', '/authors'],
  ])('TC-U-016: safeNext(%j) is %j', (input, expected) => {
    expect(safeNext(input)).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'
import { detect } from './detect'

const storage = (value: string | null) => ({ getItem: () => value })
const throwing = { getItem: () => { throw new Error('blocked') } }

describe('detect', () => {
  it.each([
    ['th', ['en-US'], 'th'],
    [null, ['th-TH', 'en'], 'th'],
    [null, ['en-GB', 'th'], 'en'],
    [null, ['fr', 'th'], 'th'],
    [null, ['fr'], 'en'],
    ['bogus', ['th'], 'th'],
  ] as const)('TC-U-1025: saved %s with %j gives %s', (saved, languages, expected) => {
    expect(detect(storage(saved), languages)).toBe(expected)
  })

  it('TC-U-1025: a storage that throws falls back to the browser languages', () => {
    expect(detect(throwing, ['th'])).toBe('th')
  })
})

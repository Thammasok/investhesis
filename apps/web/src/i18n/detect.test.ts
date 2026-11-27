import { describe, expect, it } from 'vitest'
import { detect } from './detect'

const store = (value: string | null | 'throws') => ({
  getItem: () => {
    if (value === 'throws') throw new Error('blocked')
    return value
  },
})

describe('detect', () => {
  it.each([
    ['th', ['en-US'], 'th'],
    [null, ['th-TH', 'en'], 'th'],
    [null, ['en-GB', 'th'], 'en'],
    [null, ['fr', 'th'], 'th'],
    [null, ['fr'], 'en'],
    ['bogus', ['th'], 'th'],
    ['throws', ['th'], 'th'],
  ] as const)('TC-U-1025: saved %s with browser languages %j gives %s', (saved, languages, expected) => {
    expect(detect(store(saved), languages)).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'
import { getLanguage, setLanguage } from './language'

describe('test setup', () => {
  it('TC-U-1033: a test may switch to Thai', async () => {
    await setLanguage('th')
    expect(getLanguage()).toBe('th')
  })

  it('TC-U-1033: the next test starts in English with nothing saved', () => {
    expect(getLanguage()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem('investhesis.language')).toBeNull()
  })
})

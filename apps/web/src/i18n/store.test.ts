import { describe, expect, it, vi } from 'vitest'
import type { Catalogue } from './catalogue-types'
import { LANGUAGE_STORAGE_KEY } from './detect'
import { createI18nStore } from './store'

describe('language store', () => {
  it('TC-U-1026: setLanguage loads Thai once, sets html lang and storage, and notifies once', async () => {
    const loadThai = vi.fn(async () => ({}) as Catalogue)
    const store = createI18nStore(loadThai, () => localStorage)
    const listener = vi.fn()
    store.subscribe(listener)

    await store.setLanguage('th')
    await store.setLanguage('th')

    expect(loadThai).toHaveBeenCalledTimes(1)
    expect(document.documentElement.lang).toBe('th')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('th')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getLanguage()).toBe('th')
    store.reset()
  })

  it('TC-U-1026: init does not save the detected language, and a storage that throws does not stop a switch', async () => {
    const store = createI18nStore(async () => ({}) as Catalogue, () => ({
      setItem: () => {
        throw new Error('blocked')
      },
    }))
    await store.init('th')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
    await store.setLanguage('en')
    expect(store.getLanguage()).toBe('en')
  })

  it('TC-U-1026: a failed Thai load leaves the language as it was and can be tried again', async () => {
    const loadThai = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({} as Catalogue)
    const store = createI18nStore(loadThai, () => localStorage)
    await expect(store.setLanguage('th')).rejects.toThrow('offline')
    expect(store.getLanguage()).toBe('en')
    await store.setLanguage('th')
    expect(store.getLanguage()).toBe('th')
    store.reset()
  })
})

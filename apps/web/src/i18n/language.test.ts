import { describe, expect, it, vi } from 'vitest'
import { LANGUAGE_STORAGE_KEY } from './detect'
import { createI18n } from './i18n'
import { createLanguage } from './language'

const thai = { common: { stockCount_other: '{{count}} หุ้น' } }

function setup(loadThai = vi.fn(async () => ({ th: thai }))) {
  const instance = createI18n()
  const language = createLanguage(instance, loadThai, () => localStorage)
  return { instance, language, loadThai }
}

describe('language', () => {
  it('TC-U-1026: setLanguage loads Thai once, sets html lang and storage, and emits languageChanged once', async () => {
    const { instance, language, loadThai } = setup()
    const listener = vi.fn()
    instance.on('languageChanged', listener)

    await language.setLanguage('th')
    await language.setLanguage('th')

    expect(loadThai).toHaveBeenCalledTimes(1)
    expect(document.documentElement.lang).toBe('th')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('th')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(language.getLanguage()).toBe('th')
    language.reset()
  })

  it('TC-U-1026: init does not save the detected language, and a storage that throws does not stop a switch', async () => {
    const instance = createI18n()
    const language = createLanguage(instance, async () => ({ th: thai }), () => ({
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }))
    await language.init('th')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.lang).toBe('th')
    await language.setLanguage('en')
    expect(language.getLanguage()).toBe('en')
    language.reset()
  })

  it('TC-U-1026: a failed Thai load leaves the language as it was and can be tried again', async () => {
    const loadThai = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ th: thai })
    const { language } = setup(loadThai)
    await expect(language.setLanguage('th')).rejects.toThrow('offline')
    expect(language.getLanguage()).toBe('en')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
    await language.setLanguage('th')
    expect(language.getLanguage()).toBe('th')
    language.reset()
  })
})

describe('t', () => {
  it('TC-U-1027: interpolates, pluralises and falls back to English for a key Thai lacks', async () => {
    const { instance, language } = setup()
    const count = (n: number) => instance.t('common.stockCount', { count: n })
    expect([count(1), count(2)]).toEqual(['1 stock', '2 stocks'])

    await language.setLanguage('th')
    expect([count(1), count(2)]).toEqual(['1 หุ้น', '2 หุ้น'])
    // `common.notSet` is not in this Thai bundle: the English text comes back, not the key.
    expect(instance.t('common.notSet')).toBe('Not set')
    language.reset()
  })

  it('TC-U-1027: parameters are inserted as written, not as markup', () => {
    const { instance } = setup()
    expect(instance.t('errors.invalidField', { field: '<b>x</b> & y' })).toBe('<b>x</b> & y is not valid')
  })
})

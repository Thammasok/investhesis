import { describe, expect, it, vi } from 'vitest'
import { i18n } from './i18n'
import { LANGUAGE_STORAGE_KEY, getLanguage, setLanguage } from './language'

describe('setLanguage', () => {
  it('TC-U-1026: loads Thai once, sets html lang and storage, and emits languageChanged once', async () => {
    const listener = vi.fn()
    i18n.on('languageChanged', listener)
    await setLanguage('th')
    await setLanguage('th')
    i18n.off('languageChanged', listener)
    expect(getLanguage()).toBe('th')
    expect(document.documentElement.lang).toBe('th')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('th')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('TC-U-1026: the Thai catalogue chunk is imported once across calls', async () => {
    vi.resetModules()
    const factory = vi.fn(() => ({ th: { common: {} } }))
    vi.doMock('./catalogue/th/index', factory)
    const fresh = await import('./language')
    await fresh.setLanguage('th')
    await fresh.setLanguage('en')
    await fresh.setLanguage('th')
    expect(factory).toHaveBeenCalledTimes(1)
    vi.doUnmock('./catalogue/th/index')
  })

  it('TC-U-1027: t interpolates, pluralises and falls back to English', async () => {
    await setLanguage('en')
    expect(i18n.t('common.stockCount', { count: 1 })).toBe('1 stock')
    expect(i18n.t('common.stockCount', { count: 2 })).toBe('2 stocks')
    await setLanguage('th')
    expect(i18n.t('common.stockCount', { count: 1 })).toBe('1 หุ้น')
    expect(i18n.t('common.stockCount', { count: 2 })).toBe('2 หุ้น')
    i18n.addResourceBundle('en', 'translation', { onlyEnglish: 'Only English' }, true)
    expect(i18n.t('onlyEnglish' as never)).toBe('Only English')
  })
})

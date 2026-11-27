import { describe, expect, it } from 'vitest'
import { i18n } from './i18n'

describe('typed keys', () => {
  it('TC-U-1027: a key the English catalogue lacks does not type-check', () => {
    // @ts-expect-error `stocks.nope` is not in the English catalogue
    const missing = i18n.t('stocks.nope')
    expect(missing).toBe('stocks.nope')
    expect(i18n.t('nav.stocks')).toBe('Stocks')
  })
})

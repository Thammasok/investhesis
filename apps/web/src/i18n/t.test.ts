import { describe, expect, it } from 'vitest'
import { MESSAGES_TH } from '@investhesis/domain'
import { translateWith } from './t'

const tables = {
  en: { common: { stockCount: { one: '{count} stock', other: '{count} stocks' }, hello: 'Hello {name}', onlyEn: 'English only' } },
  th: { common: { stockCount: { other: '{count} หุ้น' }, hello: 'สวัสดี {name}' } },
}

describe('t', () => {
  it('TC-U-1027: interpolates, pluralises and falls back to English', () => {
    const out = [
      translateWith(tables, 'en', 'common.stockCount', { count: 1 }),
      translateWith(tables, 'en', 'common.stockCount', { count: 2 }),
      translateWith(tables, 'th', 'common.stockCount', { count: 1 }),
      translateWith(tables, 'th', 'common.stockCount', { count: 2 }),
    ]
    expect(out).toEqual(['1 stock', '2 stocks', '1 หุ้น', '2 หุ้น'])
    expect(translateWith(tables, 'th', 'common.onlyEn')).toBe('English only')
    expect(translateWith(tables, 'th', 'common.hello', { name: 'A' })).toBe('สวัสดี A')
  })

  it('TC-U-1027: a key neither language has comes back as the key; an unfilled placeholder stays', () => {
    expect(translateWith(tables, 'en', 'nope.key')).toBe('nope.key')
    expect(translateWith(tables, 'en', 'common.hello')).toBe('Hello {name}')
    expect(MESSAGES_TH.required).toBeTruthy()
  })
})

import { describe, expect, it } from 'vitest'
import { decimalForInput, formatMoney, formatShares, formatUnitMoney } from './number-format'

describe('number formatting from decimal strings', () => {
  it.each([
    ['120.5000', '120.5'],
    ['10.0000', '10'],
    ['0.0001', '0.0001'],
    ['1234567.0000', '1,234,567'],
    ['99999999999999.9999', '99,999,999,999,999.9999'],
  ])('TC-C-400: shares %s is %s', (text, expected) => {
    expect(formatShares(text)).toBe(expected)
  })

  it.each([
    ['412.3300', 'USD', '$412.33'],
    ['412.3000', 'USD', '$412.30'],
    ['5.0000', 'USD', '$5.00'],
    ['0.1234', 'USD', '$0.1234'],
    ['1234.5000', 'THB', '฿1,234.50'],
  ] as const)('TC-C-400: average cost %s %s is %s', (text, currency, expected) => {
    expect(formatUnitMoney(text, currency)).toBe(expected)
  })

  it.each([
    [12345678900n, 4, 'THB', '฿1,234,567.89'],
    [123456700n, 4, 'USD', '$12,345.67'],
    [0n, 4, 'THB', '฿0.00'],
    [10050n, 4, 'USD', '$1.01'],
    [1n, 4, 'USD', '$0.00'],
    [10n ** 18n, 4, 'THB', '฿100,000,000,000,000.00'],
  ] as const)('TC-C-400: money %s/%i %s is %s', (scaled, scale, currency, expected) => {
    expect(formatMoney(scaled, scale, currency)).toBe(expected)
  })

  it('TC-C-400: null and malformed input give null, never NaN', () => {
    expect(formatShares(null)).toBeNull()
    expect(formatShares('1e3')).toBeNull()
    expect(formatUnitMoney(null, 'USD')).toBeNull()
    expect(formatUnitMoney('abc', 'USD')).toBeNull()
  })

  it('TC-C-404: decimalForInput trims zeros and drops grouping', () => {
    expect(decimalForInput('120.5000')).toBe('120.5')
    expect(decimalForInput('412.3300')).toBe('412.33')
    expect(decimalForInput('10.0000')).toBe('10')
    expect(decimalForInput('1234567.5000')).toBe('1234567.5')
    expect(decimalForInput(null)).toBe('')
  })
})

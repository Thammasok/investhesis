import { describe, expect, it } from 'vitest'
import { atLeastPercent, formatDecimal, parseDecimal, percentOneDecimal } from './index.ts'

describe('decimal helpers', () => {
  it('TC-U-427: parseDecimal scales exactly and rejects malformed or too precise text', () => {
    expect(parseDecimal('0.1', 4)).toBe(1000n)
    expect(parseDecimal('12', 2)).toBe(1200n)
    expect(parseDecimal('1.23456', 4)).toBeNull()
    expect(parseDecimal('-1', 4)).toBeNull()
    expect(parseDecimal('abc', 4)).toBeNull()
    expect(parseDecimal('', 4)).toBeNull()
  })

  it('TC-U-427: formatDecimal pads, rounds half up and keeps the sign', () => {
    expect(formatDecimal(30n, 2)).toBe('0.30')
    expect(formatDecimal(5n, 0)).toBe('5')
    expect(formatDecimal(1005n, 3, 2)).toBe('1.01')
    expect(formatDecimal(1004n, 3, 2)).toBe('1.00')
    expect(formatDecimal(7n, 1, 3)).toBe('0.700')
    expect(formatDecimal(-1250n, 3, 2)).toBe('-1.25')
    expect(formatDecimal(-1n, 3, 2)).toBe('0.00')
    expect(formatDecimal(1234n, 2, 0)).toBe('12')
  })

  it('TC-U-424: percentOneDecimal rounds half up to one decimal', () => {
    expect(percentOneDecimal(3996n, 10000n)).toBe('40.0')
    expect(percentOneDecimal(2n, 3n)).toBe('66.7')
    expect(percentOneDecimal(1n, 8n)).toBe('12.5')
    expect(percentOneDecimal(1n, 16n)).toBe('6.3')
    expect(percentOneDecimal(0n, 5n)).toBe('0.0')
    expect(() => percentOneDecimal(1n, 0n)).toThrow(RangeError)
  })

  it('TC-U-425: atLeastPercent is exact at the boundary', () => {
    expect(atLeastPercent(2n, 5n, 40)).toBe(true)
    expect(atLeastPercent(3996n, 10000n, 40)).toBe(false)
    expect(atLeastPercent(0n, 0n, 40)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { formatDate, formatTimestamp } from './format-date'

describe('formatDate', () => {
  it.each([
    ['2026-11-27', '27 Nov 2026', '27 พ.ย. 2026'],
    ['2026-01-01', '1 Jan 2026', '1 ม.ค. 2026'],
    ['2024-02-29', '29 Feb 2024', '29 ก.พ. 2024'],
  ])('TC-U-1029: %s', (ymd, en, th) => {
    expect(formatDate(ymd, 'en')).toBe(en)
    expect(formatDate(ymd, 'th')).toBe(th)
  })

  it('TC-U-1029: text that is not a date is returned unchanged', () => {
    expect(formatDate('soon', 'th')).toBe('soon')
    expect(formatDate('2026-13-01', 'en')).toBe('2026-13-01')
  })

  it('TC-U-1030: formatTimestamp takes the browser-local date', () => {
    const before = process.env.TZ
    process.env.TZ = 'Asia/Bangkok'
    try {
      expect(formatTimestamp('2026-11-26T18:30:00Z', 'th')).toBe('27 พ.ย. 2026')
      expect(formatTimestamp('nope', 'th')).toBe('nope')
    } finally {
      if (before === undefined) delete process.env.TZ
      else process.env.TZ = before
    }
  })
})

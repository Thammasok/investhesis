import { afterEach, describe, expect, it } from 'vitest'
import { formatDate, formatTimestamp } from './format-date'

describe('formatDate', () => {
  it('TC-U-1029: uses CE years and Thai abbreviated months', () => {
    expect(['2026-11-27', '2026-01-01', '2024-02-29'].map((d) => formatDate(d, 'en'))).toEqual(['27 Nov 2026', '1 Jan 2026', '29 Feb 2024'])
    expect(['2026-11-27', '2026-01-01', '2024-02-29'].map((d) => formatDate(d, 'th'))).toEqual(['27 พ.ย. 2026', '1 ม.ค. 2026', '29 ก.พ. 2024'])
  })

  it('TC-U-1029: text that is not a date comes back unchanged', () => {
    expect(formatDate('soon', 'th')).toBe('soon')
    expect(formatDate('2026-13-01', 'en')).toBe('2026-13-01')
  })
})

describe('formatTimestamp', () => {
  const zone = process.env.TZ
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  })

  it('TC-U-1030: takes the browser-local date', () => {
    process.env.TZ = 'Asia/Bangkok'
    expect(formatTimestamp('2026-11-26T18:30:00Z', 'th')).toBe('27 พ.ย. 2026')
    process.env.TZ = 'America/Los_Angeles'
    expect(formatTimestamp('2026-11-26T18:30:00Z', 'en')).toBe('26 Nov 2026')
    expect(formatTimestamp('not a time', 'en')).toBe('not a time')
  })
})

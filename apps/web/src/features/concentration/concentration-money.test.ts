import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatRate, formatSavedDate, readView, settingsLine, viewSearch } from './concentration-model'

describe('concentration model', () => {
  it('TC-C-431: formats the rate, its date and the summary footer', () => {
    expect(formatRate('36.250000')).toBe('36.25')
    expect(formatRate('36.123457')).toBe('36.123457')
    expect(formatRate('40.000000')).toBe('40.00')
    expect(formatSavedDate('2026-11-23T10:00:00.000Z')).toMatch(/^2[34] Nov 2026$/)
    expect(settingsLine({ concentrationThreshold: 35, usdThbRate: null, usdThbRateUpdatedAt: null })).toBe(
      'Threshold 35% · No exchange rate saved',
    )
    expect(settingsLine({ concentrationThreshold: 40, usdThbRate: '36.250000', usdThbRateUpdatedAt: '2026-11-23T10:00:00.000Z' })).toMatch(
      /^Threshold 40% · 1 USD = 36\.25 THB, saved 2[34] Nov 2026$/,
    )
  })

  it('TC-C-422: readView defaults, canonical address and repeated params', () => {
    const view = readView(new URLSearchParams(''), [])
    expect(view).toMatchObject({ scope: 'all', measure: 'count', notes: [] })
    expect(view.lens.key).toBe('gicsSector')
    expect(viewSearch({ scope: 'all', lens: { key: 'style' }, measure: 'value' })).toBe('?scope=all&lens=style&measure=value')
    expect(readView(new URLSearchParams('lens=style&lens=moat'), []).notes).toHaveLength(1)
  })

  it('TC-C-435: no floating-point arithmetic on money in the concentration files', () => {
    const dir = join(process.cwd(), 'src/features/concentration')
    const files = [
      ...readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.')).map((f) => join(dir, f)),
      ...readdirSync(join(dir, 'components')).map((f) => join(dir, 'components', f)),
      join(process.cwd(), 'src/lib/number-format.ts'),
    ]
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/parseFloat|toFixed|Math\.round|Number\(/)
    }
  })
})

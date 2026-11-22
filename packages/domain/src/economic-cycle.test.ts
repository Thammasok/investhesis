import { describe, expect, it } from 'vitest'
import { CYCLE_BY_GICS, resolveEconomicCycle } from './economic-cycle.ts'
import { LENS_VALUES } from './vocabulary.ts'

const none = { economicCycle: null, source: null }

describe('resolveEconomicCycle', () => {
  it.each([
    ['a', { gicsSector: 'Utilities' }, { economicCycle: 'Defensive', source: 'default' }],
    [
      'b',
      { gicsSector: 'Energy', current: { economicCycle: 'Defensive', source: 'default' } },
      { economicCycle: 'Sensitive', source: 'default' },
    ],
    [
      'c',
      { gicsSector: 'Utilities', current: { economicCycle: 'Cyclical', source: 'manual' } },
      { economicCycle: 'Cyclical', source: 'manual' },
    ],
    [
      'd',
      { gicsSector: 'Energy', input: 'Cyclical', current: { economicCycle: 'Sensitive', source: 'default' } },
      { economicCycle: 'Cyclical', source: 'manual' },
    ],
    ['e', { gicsSector: 'Energy', input: null }, { economicCycle: 'Sensitive', source: 'default' }],
  ] as const)('TC-U-015: case (%s)', (_name, args, expected) => {
    expect(resolveEconomicCycle(args)).toEqual(expected)
  })

  it.each([
    ['f', { gicsSector: 'Utilities', input: 'Defensive' }, { economicCycle: 'Defensive', source: 'manual' }],
    ['g', { gicsSector: null, current: { economicCycle: 'Defensive', source: 'default' } }, none],
    [
      'h',
      { gicsSector: null, current: { economicCycle: 'Cyclical', source: 'manual' } },
      { economicCycle: 'Cyclical', source: 'manual' },
    ],
    ['i', { gicsSector: undefined }, none],
  ] as const)('TC-U-124: case (%s)', (_name, args, expected) => {
    expect(resolveEconomicCycle(args)).toEqual(expected)
  })

  it('TC-U-124: clearing a manual cycle falls back to the sector default', () => {
    expect(
      resolveEconomicCycle({
        gicsSector: 'Materials',
        input: null,
        current: { economicCycle: 'Defensive', source: 'manual' },
      }),
    ).toEqual({ economicCycle: 'Cyclical', source: 'default' })
  })

  it('TC-U-124: with a sector and no prior (k), every sector follows FR-005', () => {
    const counts = { Cyclical: 0, Sensitive: 0, Defensive: 0 }
    for (const gicsSector of LENS_VALUES.gicsSector) {
      const r = resolveEconomicCycle({ gicsSector })
      expect(r.source).toBe('default')
      if (r.economicCycle) counts[r.economicCycle] += 1
    }
    expect(counts).toEqual({ Cyclical: 4, Sensitive: 4, Defensive: 3 })
  })

  it('TC-U-016: every GICS sector maps to exactly one cycle as in FR-005', () => {
    expect(Object.keys(CYCLE_BY_GICS).sort()).toEqual([...LENS_VALUES.gicsSector].sort())
    const by = (cycle: string) =>
      Object.entries(CYCLE_BY_GICS)
        .filter(([, c]) => c === cycle)
        .map(([s]) => s)
        .sort()
    expect(by('Cyclical')).toEqual(['Consumer Discretionary', 'Financials', 'Materials', 'Real Estate'])
    expect(by('Sensitive')).toEqual(['Communication Services', 'Energy', 'Industrials', 'Information Technology'])
    expect(by('Defensive')).toEqual(['Consumer Staples', 'Health Care', 'Utilities'])
  })
})

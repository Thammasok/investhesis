import type { EconomicCycle, GicsSector } from './vocabulary.ts'

export const CYCLE_BY_GICS = {
  Materials: 'Cyclical',
  'Consumer Discretionary': 'Cyclical',
  Financials: 'Cyclical',
  'Real Estate': 'Cyclical',
  'Communication Services': 'Sensitive',
  Energy: 'Sensitive',
  Industrials: 'Sensitive',
  'Information Technology': 'Sensitive',
  'Consumer Staples': 'Defensive',
  'Health Care': 'Defensive',
  Utilities: 'Defensive',
} as const satisfies Record<GicsSector, EconomicCycle>

export type CycleSource = 'manual' | 'default'
export type ResolvedCycle = { economicCycle: EconomicCycle; source: CycleSource } | { economicCycle: null; source: null }

export type ResolveEconomicCycleArgs = {
  /** The sector the stock will have after this write. */
  gicsSector: GicsSector | null | undefined
  /** The cycle in the request: undefined = not sent, null = cleared. */
  input?: EconomicCycle | null | undefined
  /** What is stored now; leave out on create. */
  current?: { economicCycle: EconomicCycle | null; source: CycleSource | null | undefined } | null
}

/** FR-005, applied identically by create, update and import. */
export function resolveEconomicCycle({ gicsSector, input, current }: ResolveEconomicCycleArgs): ResolvedCycle {
  if (input) return { economicCycle: input, source: 'manual' }
  if (input === undefined && current?.economicCycle && current.source === 'manual') {
    return { economicCycle: current.economicCycle, source: 'manual' }
  }
  if (gicsSector) return { economicCycle: CYCLE_BY_GICS[gicsSector], source: 'default' }
  return { economicCycle: null, source: null }
}

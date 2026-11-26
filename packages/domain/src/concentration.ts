import { atLeastPercent, formatDecimal, parseDecimal, percentOneDecimal } from './decimal.ts'
import { foldText } from './fold-text.ts'
import { LENS_LABELS, NOT_SET_LABEL } from './messages.ts'

/** The part of a stock that grouping reads. Structural, so API rows and web rows both fit. */
export interface GroupableStock {
  id: string
  createdAt: string
  market: string
  gicsSector: string | null
  setIndustryGroup: string | null
  valueChain: string | null
  valueChainPosition: string | null
  size: string | null
  style: string | null
  economicCycle: string | null
  lynchType: string | null
  lifeCycle: string | null
  customers: readonly string[]
  revenueTypes: readonly string[]
  moat: string | null
  themes: readonly string[]
  volatility: string | null
  indexMembership: readonly string[]
  holding: { shares: string | null; averageCost: string | null; costCurrency: string } | null
}

type Pick = string | readonly string[] | null

export interface ConcentrationLens {
  key: keyof typeof LENS_LABELS
  label: string
  kind: 'single' | 'multi'
  /** Spellings that differ only in case or surrounding spaces form one group (ADR-006). */
  foldCase?: boolean
  get: (stock: GroupableStock) => Pick
}

const single = (key: ConcentrationLens['key'], get: (s: GroupableStock) => Pick): ConcentrationLens => ({
  key,
  label: LENS_LABELS[key],
  kind: 'single',
  get,
})
const multi = (key: ConcentrationLens['key'], get: (s: GroupableStock) => Pick): ConcentrationLens => ({
  key,
  label: LENS_LABELS[key],
  kind: 'multi',
  get,
})

/** The lenses of FR-006, in display order. */
export const CONCENTRATION_LENSES: readonly ConcentrationLens[] = [
  single('gicsSector', (s) => s.gicsSector),
  single('setIndustryGroup', (s) => s.setIndustryGroup),
  single('valueChainPosition', (s) => s.valueChainPosition),
  { ...single('valueChain', (s) => s.valueChain), foldCase: true },
  single('size', (s) => s.size),
  single('style', (s) => s.style),
  single('economicCycle', (s) => s.economicCycle),
  single('lynchType', (s) => s.lynchType),
  single('lifeCycle', (s) => s.lifeCycle),
  multi('customers', (s) => s.customers),
  multi('revenueTypes', (s) => s.revenueTypes),
  single('moat', (s) => s.moat),
  multi('themes', (s) => s.themes),
  single('volatility', (s) => s.volatility),
  single('market', (s) => s.market),
  multi('indexMembership', (s) => s.indexMembership),
]

export interface ConcentrationGroup {
  label: string
  notSet: boolean
  count: number
  countShare: string
  /** Value in THB, two decimals. */
  value: string
  /** Null when the total value is zero. */
  valueShare: string | null
  countFlag: boolean
  valueFlag: boolean
  stockIds: string[]
}

export interface ConcentrationResult {
  groups: ConcentrationGroup[]
  leftOut: { notHeld: string[]; noAmount: string[]; needsRate: string[] }
  multiValue: boolean
  /** Sum of valued stocks in THB, two decimals. */
  totalValue: string
}

export interface GroupConcentrationArgs {
  stocks: readonly GroupableStock[]
  lens: ConcentrationLens | ConcentrationLens['key']
  usdThbRate: string | null
  threshold: number
}

// shares (4) + cost (4) + rate (6)
export const VALUE_SCALE = 14
const RATE_SCALE = 6

export type ValueAtCost = { value: bigint } | { reason: 'not-held' | 'no-amount' | 'needs-rate' }

/** Shares x average cost in THB as a BigInt at VALUE_SCALE, or why the holding has no value. */
export function valueAtCost(holding: GroupableStock['holding'], usdThbRate: string | null): ValueAtCost {
  if (!holding) return { reason: 'not-held' }
  const shares = holding.shares === null ? null : parseDecimal(holding.shares, 4)
  const cost = holding.averageCost === null ? null : parseDecimal(holding.averageCost, 4)
  if (shares === null || cost === null) return { reason: 'no-amount' }
  const base = shares * cost
  if (holding.costCurrency === 'USD') {
    const rate = usdThbRate === null ? null : parseDecimal(usdThbRate, RATE_SCALE)
    if (rate === null || rate === 0n) return { reason: 'needs-rate' }
    return { value: base * rate }
  }
  return { value: base * 10n ** BigInt(RATE_SCALE) }
}

export function groupConcentration(args: GroupConcentrationArgs): ConcentrationResult {
  const lens =
    typeof args.lens === 'string' ? CONCENTRATION_LENSES.find((l) => l.key === args.lens) : args.lens
  if (!lens) throw new RangeError(`unknown lens ${String(args.lens)}`)

  const leftOut = { notHeld: [] as string[], noAmount: [] as string[], needsRate: [] as string[] }
  const values = new Map<string, bigint>()
  let totalValue = 0n

  for (const stock of args.stocks) {
    const result = valueAtCost(stock.holding, args.usdThbRate)
    if ('value' in result) {
      values.set(stock.id, result.value)
      totalValue += result.value
    } else if (result.reason === 'not-held') leftOut.notHeld.push(stock.id)
    else if (result.reason === 'no-amount') leftOut.noAmount.push(stock.id)
    else leftOut.needsRate.push(stock.id)
  }

  interface Bucket {
    label: string
    notSet: boolean
    ids: string[]
    value: bigint
    /** Oldest stock seen, whose spelling titles a folded group. */
    oldest?: { createdAt: string; id: string }
  }
  const buckets = new Map<string, Bucket>()
  let notSet: Bucket | undefined
  for (const stock of args.stocks) {
    const picked = lens.get(stock)
    const labels = picked === null ? [] : typeof picked === 'string' ? [picked] : [...new Set(picked)]
    const targets: Bucket[] = []
    if (labels.length === 0) {
      notSet ??= { label: NOT_SET_LABEL, notSet: true, ids: [], value: 0n }
      targets.push(notSet)
    } else {
      for (const raw of labels) {
        const label = lens.foldCase ? raw.trim() : raw
        const key = lens.foldCase ? foldText(label) : label
        let bucket = buckets.get(key)
        if (!bucket) {
          bucket = { label, notSet: false, ids: [], value: 0n }
          buckets.set(key, bucket)
        }
        if (lens.foldCase) {
          const o = bucket.oldest
          if (!o || stock.createdAt < o.createdAt || (stock.createdAt === o.createdAt && stock.id < o.id)) {
            bucket.oldest = { createdAt: stock.createdAt, id: stock.id }
            bucket.label = label
          }
        }
        targets.push(bucket)
      }
    }
    const value = values.get(stock.id) ?? 0n
    for (const bucket of targets) {
      bucket.ids.push(stock.id)
      bucket.value += value
    }
  }

  const ordered = [...buckets.values()].sort(
    (a, b) => b.ids.length - a.ids.length || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
  )
  if (notSet) ordered.push(notSet)

  const countTotal = BigInt(args.stocks.length)
  const groups = ordered.map((b): ConcentrationGroup => {
    const count = BigInt(b.ids.length)
    return {
      label: b.label,
      notSet: b.notSet,
      count: b.ids.length,
      countShare: percentOneDecimal(count, countTotal),
      value: formatDecimal(b.value, VALUE_SCALE, 2),
      valueShare: totalValue > 0n ? percentOneDecimal(b.value, totalValue) : null,
      countFlag: !b.notSet && atLeastPercent(count, countTotal, args.threshold),
      valueFlag: !b.notSet && atLeastPercent(b.value, totalValue, args.threshold),
      stockIds: b.ids,
    }
  })

  return {
    groups,
    leftOut,
    multiValue: lens.kind === 'multi',
    totalValue: formatDecimal(totalValue, VALUE_SCALE, 2),
  }
}

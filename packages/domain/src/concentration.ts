import { atLeastPercent, formatDecimal, parseDecimal, percentOneDecimal } from './decimal.ts'
import { LENS_LABELS, NOT_SET_LABEL } from './messages.ts'

/** The part of a stock that grouping reads. Structural, so API rows and web rows both fit. */
export interface GroupableStock {
  id: string
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
  single('valueChain', (s) => s.valueChain),
  single('valueChainPosition', (s) => s.valueChainPosition),
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
const VALUE_SCALE = 14
const RATE_SCALE = 6

export function groupConcentration(args: GroupConcentrationArgs): ConcentrationResult {
  const lens =
    typeof args.lens === 'string' ? CONCENTRATION_LENSES.find((l) => l.key === args.lens) : args.lens
  if (!lens) throw new RangeError(`unknown lens ${String(args.lens)}`)

  const rate = args.usdThbRate === null ? null : parseDecimal(args.usdThbRate, RATE_SCALE)
  const leftOut = { notHeld: [] as string[], noAmount: [] as string[], needsRate: [] as string[] }
  const values = new Map<string, bigint>()
  let totalValue = 0n

  for (const stock of args.stocks) {
    const h = stock.holding
    if (!h) {
      leftOut.notHeld.push(stock.id)
      continue
    }
    const shares = h.shares === null ? null : parseDecimal(h.shares, 4)
    const cost = h.averageCost === null ? null : parseDecimal(h.averageCost, 4)
    if (shares === null || cost === null) {
      leftOut.noAmount.push(stock.id)
      continue
    }
    const base = shares * cost
    let value: bigint
    if (h.costCurrency === 'USD') {
      if (rate === null || rate === 0n) {
        leftOut.needsRate.push(stock.id)
        continue
      }
      value = base * rate
    } else {
      value = base * 10n ** BigInt(RATE_SCALE)
    }
    values.set(stock.id, value)
    totalValue += value
  }

  interface Bucket {
    label: string
    notSet: boolean
    ids: string[]
    value: bigint
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
      for (const label of labels) {
        let bucket = buckets.get(label)
        if (!bucket) {
          bucket = { label, notSet: false, ids: [], value: 0n }
          buckets.set(label, bucket)
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

import { z } from 'zod'
import { VALUE_SCALE, valueAtCost } from './concentration.ts'
import type { GroupableStock } from './concentration.ts'
import { formatDecimal, percentOneDecimal } from './decimal.ts'
import { fields } from './fields.ts'
import { foldText } from './filters.ts'
import { rejectUnknownKeys } from './stock-schema.ts'

/** Chain names match when they differ only in case or surrounding spaces. */
export const chainKey = (name: string): string => foldText(name.trim())

export const CHAIN_AREAS = ['Upstream', 'Midstream', 'Downstream', 'Integrated', 'NoPosition'] as const
export type ChainArea = (typeof CHAIN_AREAS)[number]

export type ChainStockInput = GroupableStock & { ticker: string; name: string; createdAt: string }

export interface ChainAreaStock {
  id: string
  held: boolean
  value: string | null
}

export interface ChainAreaGroup {
  position: ChainArea
  stocks: ChainAreaStock[]
  count: number
  held: number
  /** THB, two decimals. */
  value: string
  /** Of the chain's value, one decimal; null when the chain value is 0. */
  valueShare: string | null
}

export interface Chain {
  key: string
  title: string
  spellings: string[]
  count: number
  held: number
  value: string
  leftOut: { noAmount: number; needsRate: number }
  areas: ChainAreaGroup[]
}

export interface ChainsResult {
  chains: Chain[]
  noChainIds: string[]
  needsRate: boolean
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const areaOf = (position: string | null): ChainArea =>
  position === 'Upstream' || position === 'Midstream' || position === 'Downstream' || position === 'Integrated'
    ? position
    : 'NoPosition'

interface Entry {
  stock: ChainStockInput
  value: bigint | null
  reason: 'not-held' | 'no-amount' | 'needs-rate' | null
}

export function groupChains(args: { stocks: readonly ChainStockInput[]; usdThbRate: string | null }): ChainsResult {
  const noChainIds: string[] = []
  const byKey = new Map<string, Entry[]>()
  let needsRate = false

  for (const stock of args.stocks) {
    const name = stock.valueChain?.trim()
    if (!name) {
      noChainIds.push(stock.id)
      continue
    }
    const result = valueAtCost(stock.holding, args.usdThbRate)
    if ('reason' in result && result.reason === 'needs-rate') needsRate = true
    const key = chainKey(name)
    const entries = byKey.get(key) ?? []
    entries.push({
      stock,
      value: 'value' in result ? result.value : null,
      reason: 'reason' in result ? result.reason : null,
    })
    byKey.set(key, entries)
  }

  const chains = [...byKey].map(([key, entries]): Chain => {
    const oldest = [...entries].sort(
      (a, b) => compare(a.stock.createdAt, b.stock.createdAt) || compare(a.stock.id, b.stock.id),
    )
    const spellings = [...new Set(oldest.map((e) => (e.stock.valueChain ?? '').trim()))]
    const chainValue = entries.reduce((sum, e) => sum + (e.value ?? 0n), 0n)

    const lanes: Record<ChainArea, Entry[]> = { Upstream: [], Midstream: [], Downstream: [], Integrated: [], NoPosition: [] }
    for (const e of entries) lanes[areaOf(e.stock.valueChainPosition)].push(e)

    const areas = CHAIN_AREAS.filter(
      (a) => a === 'Upstream' || a === 'Midstream' || a === 'Downstream' || lanes[a].length > 0,
    ).map((position): ChainAreaGroup => {
      const members = lanes[position]
      const tier = (e: Entry) => (e.value !== null ? 0 : e.stock.holding ? 1 : 2)
      members.sort(
        (a, b) =>
          tier(a) - tier(b) ||
          (a.value !== null && b.value !== null && a.value !== b.value ? (a.value > b.value ? -1 : 1) : 0) ||
          compare(a.stock.ticker, b.stock.ticker),
      )
      const areaValue = members.reduce((sum, e) => sum + (e.value ?? 0n), 0n)
      return {
        position,
        stocks: members.map((e) => ({
          id: e.stock.id,
          held: e.stock.holding !== null,
          value: e.value === null ? null : formatDecimal(e.value, VALUE_SCALE, 2),
        })),
        count: members.length,
        held: members.filter((e) => e.stock.holding !== null).length,
        value: formatDecimal(areaValue, VALUE_SCALE, 2),
        valueShare: chainValue > 0n ? percentOneDecimal(areaValue, chainValue) : null,
      }
    })

    const heldCount = entries.filter((e) => e.stock.holding !== null).length
    const missing = (reason: Entry['reason']) => entries.filter((e) => e.reason === reason).length

    return {
      key,
      title: spellings[0] ?? key,
      spellings,
      count: entries.length,
      held: heldCount,
      value: formatDecimal(chainValue, VALUE_SCALE, 2),
      leftOut: { noAmount: missing('no-amount'), needsRate: missing('needs-rate') },
      areas,
    }
  })

  chains.sort((a, b) => b.count - a.count || compare(a.title, b.title))
  return { chains, noChainIds, needsRate }
}

const renameShape = {
  from: fields.valueChain,
  to: fields.valueChain,
  merge: z.boolean().default(false),
}

/** `from` is a chain as the page saw it; `to` follows the value-chain name rules. */
export const ChainRename = z.looseObject(renameShape).superRefine((v, ctx) => {
  rejectUnknownKeys(v, Object.keys(renameShape), ctx)
})
export type ChainRename = z.output<typeof ChainRename>

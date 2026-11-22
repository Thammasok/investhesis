import { z } from 'zod'
import { MESSAGES } from './messages.ts'
import { ALL_EXCHANGES, ALL_INDEXES, LENS_VALUES, TICKER_PATTERN, charLength, normaliseTicker } from './vocabulary.ts'

export const oneOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { error: () => MESSAGES.oneOf(values) })

const lengthBetween = (min: number, max: number, message: string) => (s: string) => {
  const n = charLength(s)
  return n >= min && n <= max ? undefined : message
}

/** Trimmed text of 1..max characters (code points), checked after trimming. */
export const boundedText = (max: number, message: string) =>
  z
    .string({ error: () => MESSAGES.required })
    .transform((s) => s.trim())
    .check((ctx) => {
      const problem = lengthBetween(1, max, message)(ctx.value)
      if (problem) ctx.issues.push({ code: 'custom', message: problem, input: ctx.value })
    })

export const dedupeCaseInsensitive = (items: readonly string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(item)
    }
  }
  return out
}

const dedupe = <T>(items: readonly T[]): T[] => [...new Set(items)]

export const fields = {
  ticker: z
    .string({ error: () => MESSAGES.required })
    .transform(normaliseTicker)
    .refine((s) => TICKER_PATTERN.test(s), { error: MESSAGES.tickerFormat }),
  market: oneOf(['US', 'TH']),
  exchange: oneOf(ALL_EXCHANGES),
  name: boundedText(200, MESSAGES.nameLength),
  indexMembership: z.array(oneOf(ALL_INDEXES)).transform(dedupe),
  gicsSector: oneOf(LENS_VALUES.gicsSector),
  setIndustryGroup: oneOf(LENS_VALUES.setIndustryGroup),
  valueChain: boundedText(60, MESSAGES.valueChainLength),
  valueChainPosition: oneOf(LENS_VALUES.valueChainPosition),
  size: oneOf(LENS_VALUES.size),
  style: oneOf(LENS_VALUES.style),
  economicCycle: oneOf(LENS_VALUES.economicCycle),
  lynchType: oneOf(LENS_VALUES.lynchType),
  lifeCycle: oneOf(LENS_VALUES.lifeCycle),
  customers: z.array(oneOf(LENS_VALUES.customers)).transform(dedupe),
  revenueTypes: z.array(oneOf(LENS_VALUES.revenueTypes)).transform(dedupe),
  moat: oneOf(LENS_VALUES.moat),
  themes: z
    .array(boundedText(40, MESSAGES.themeLength))
    .transform(dedupeCaseInsensitive)
    .refine((themes) => themes.length <= 20, { error: MESSAGES.themesMax }),
  volatility: oneOf(LENS_VALUES.volatility),
}

/** Fields that hold one value and may be cleared (set to null). */
export const CLEARABLE_SINGLE = [
  'gicsSector',
  'setIndustryGroup',
  'valueChain',
  'valueChainPosition',
  'size',
  'style',
  'economicCycle',
  'lynchType',
  'lifeCycle',
  'moat',
  'volatility',
] as const

/** Fields that hold a list; an empty list means not set. */
export const LIST_FIELDS = ['indexMembership', 'customers', 'revenueTypes', 'themes'] as const

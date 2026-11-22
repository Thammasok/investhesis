import { z } from 'zod'
import { fields } from './fields.ts'
import { MESSAGES } from './messages.ts'
import { CURRENCY_BY_MARKET, EXCHANGES_BY_MARKET, INDEXES_BY_MARKET } from './vocabulary.ts'

const nullable = <T extends z.ZodType>(schema: T) => schema.nullish().default(null)

const inputShape = {
  ticker: fields.ticker,
  market: fields.market,
  exchange: fields.exchange,
  name: fields.name,
  indexMembership: fields.indexMembership.default([]),
  gicsSector: nullable(fields.gicsSector),
  setIndustryGroup: nullable(fields.setIndustryGroup),
  valueChain: nullable(fields.valueChain),
  valueChainPosition: nullable(fields.valueChainPosition),
  size: nullable(fields.size),
  style: nullable(fields.style),
  economicCycle: nullable(fields.economicCycle),
  lynchType: nullable(fields.lynchType),
  lifeCycle: nullable(fields.lifeCycle),
  customers: fields.customers.default([]),
  revenueTypes: fields.revenueTypes.default([]),
  moat: nullable(fields.moat),
  themes: fields.themes.default([]),
  volatility: nullable(fields.volatility),
}

const patchShape = {
  name: fields.name.optional(),
  exchange: fields.exchange.optional(),
  indexMembership: fields.indexMembership.optional(),
  gicsSector: fields.gicsSector.nullish(),
  setIndustryGroup: fields.setIndustryGroup.nullish(),
  valueChain: fields.valueChain.nullish(),
  valueChainPosition: fields.valueChainPosition.nullish(),
  size: fields.size.nullish(),
  style: fields.style.nullish(),
  economicCycle: fields.economicCycle.nullish(),
  lynchType: fields.lynchType.nullish(),
  lifeCycle: fields.lifeCycle.nullish(),
  customers: fields.customers.optional(),
  revenueTypes: fields.revenueTypes.optional(),
  moat: fields.moat.nullish(),
  themes: fields.themes.optional(),
  volatility: fields.volatility.nullish(),
}

/** Rejects any key outside the shape; the issue path is the key itself. */
function rejectUnknownKeys(value: Record<string, unknown>, known: readonly string[], ctx: z.RefinementCtx) {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) ctx.addIssue({ code: 'custom', path: [key], message: MESSAGES.unknownField })
  }
}

export const StockInput = z
  .looseObject(inputShape)
  .superRefine((v, ctx) => {
    rejectUnknownKeys(v, Object.keys(inputShape), ctx)

    const exchanges: readonly string[] = EXCHANGES_BY_MARKET[v.market]
    if (!exchanges.includes(v.exchange)) {
      ctx.addIssue({ code: 'custom', path: ['exchange'], message: MESSAGES.exchangeForMarket(v.market, exchanges) })
    }

    const indexes: readonly string[] = INDEXES_BY_MARKET[v.market]
    if (v.indexMembership.some((i) => !indexes.includes(i))) {
      ctx.addIssue({
        code: 'custom',
        path: ['indexMembership'],
        message: MESSAGES.indexForMarket(v.market, indexes),
      })
    }

    if (v.market === 'TH') {
      if (v.setIndustryGroup && !v.gicsSector) {
        ctx.addIssue({ code: 'custom', path: ['gicsSector'], message: MESSAGES.thNeedsGics })
      }
      if (v.gicsSector && !v.setIndustryGroup) {
        ctx.addIssue({ code: 'custom', path: ['setIndustryGroup'], message: MESSAGES.thNeedsSetGroup })
      }
    } else if (v.setIndustryGroup) {
      ctx.addIssue({ code: 'custom', path: ['setIndustryGroup'], message: MESSAGES.usNoSetGroup })
    }

    if (v.valueChainPosition && v.valueChainPosition !== 'None' && !v.valueChain) {
      ctx.addIssue({ code: 'custom', path: ['valueChain'], message: MESSAGES.chainNeedsName })
    }
  })
  .transform((v) => ({
    ticker: v.ticker,
    market: v.market,
    exchange: v.exchange,
    currency: CURRENCY_BY_MARKET[v.market],
    name: v.name,
    indexMembership: v.indexMembership,
    gicsSector: v.gicsSector,
    setIndustryGroup: v.setIndustryGroup,
    valueChain: v.valueChain,
    valueChainPosition: v.valueChainPosition,
    size: v.size,
    style: v.style,
    economicCycle: v.economicCycle,
    lynchType: v.lynchType,
    lifeCycle: v.lifeCycle,
    customers: v.customers,
    revenueTypes: v.revenueTypes,
    moat: v.moat,
    themes: v.themes,
    volatility: v.volatility,
  }))
export type StockInput = z.output<typeof StockInput>

/**
 * Partial update. Absent = unchanged, null = cleared. Market, ticker, id and lensSources are
 * unknown keys here and are rejected. Cross-field rules need the stored stock, so the API
 * re-checks the merged result.
 */
export const StockPatch = z.looseObject(patchShape).superRefine((v, ctx) => {
  rejectUnknownKeys(v, Object.keys(patchShape), ctx)
})
export type StockPatch = z.output<typeof StockPatch>

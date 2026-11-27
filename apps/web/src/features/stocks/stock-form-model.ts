import { CURRENCY_BY_MARKET, HoldingInput, MESSAGES, issueText, resolveEconomicCycle, StockInput, type GicsSector } from '@investhesis/domain'
import { decimalForInput } from '@/lib/number-format'
import type { Holding, Stock } from './types'

/** Form state. Text and single-choice fields use `''` for "not set"; the rest are lists. */
export type FormValues = {
  market: '' | 'US' | 'TH'
  ticker: string
  exchange: string
  name: string
  indexMembership: string[]
  gicsSector: string
  setIndustryGroup: string
  /** `''` means "no manual choice": the sector default shows, if there is one. */
  economicCycle: string
  size: string
  style: string
  volatility: string
  lynchType: string
  lifeCycle: string
  moat: string
  valueChain: string
  valueChainPosition: string
  customers: string[]
  revenueTypes: string[]
  themes: string[]
  listIds: string[]
  /** The "I hold this stock" box. */
  held: boolean
  /** Typed text, `''` while empty (held, amount unknown). Sent as strings, never parsed to numbers. */
  holdingShares: string
  holdingAverageCost: string
  /** `''` until the investor picks one; then the cost currency follows the market (`costCurrencyOf`). */
  costCurrency: '' | 'USD' | 'THB'
}

export type FieldName = Exclude<keyof FormValues, 'listIds' | 'held' | 'costCurrency'>

/** DOM order of the form: the first invalid field in this order gets focus. */
export const FIELD_ORDER: readonly FieldName[] = [
  'market',
  'ticker',
  'exchange',
  'name',
  'indexMembership',
  'gicsSector',
  'setIndustryGroup',
  'economicCycle',
  'size',
  'style',
  'volatility',
  'lynchType',
  'lifeCycle',
  'moat',
  'valueChain',
  'valueChainPosition',
  'customers',
  'revenueTypes',
  'themes',
  'holdingShares',
  'holdingAverageCost',
]

export const FIELD_LABELS: Record<FieldName, string> = {
  market: 'Market',
  ticker: 'Ticker',
  exchange: 'Exchange',
  name: 'Company name',
  indexMembership: 'Index membership',
  gicsSector: 'Sector',
  setIndustryGroup: 'SET industry group',
  economicCycle: 'Economic cycle',
  size: 'Size',
  style: 'Style',
  volatility: 'Volatility',
  lynchType: 'Peter Lynch type',
  lifeCycle: 'Life cycle',
  moat: 'Moat',
  valueChain: 'Value chain',
  valueChainPosition: 'Position',
  customers: 'Customers',
  revenueTypes: 'Revenue types',
  themes: 'Themes',
  holdingShares: 'Shares',
  holdingAverageCost: 'Average cost',
}

export type FieldErrors = Partial<Record<FieldName, string>>

export const emptyValues = (): FormValues => ({
  market: '',
  ticker: '',
  exchange: '',
  name: '',
  indexMembership: [],
  gicsSector: '',
  setIndustryGroup: '',
  economicCycle: '',
  size: '',
  style: '',
  volatility: '',
  lynchType: '',
  lifeCycle: '',
  moat: '',
  valueChain: '',
  valueChainPosition: '',
  customers: [],
  revenueTypes: [],
  themes: [],
  listIds: [],
  held: false,
  holdingShares: '',
  holdingAverageCost: '',
  costCurrency: '',
})

/** True while the stored cycle is the sector's default rather than the user's choice. */
const cycleIsDefault = (stock: Stock) => stock.lensSources.economicCycle === 'default'

export function valuesFromStock(stock: Stock): FormValues {
  return {
    market: stock.market,
    ticker: stock.ticker,
    exchange: stock.exchange,
    name: stock.name,
    indexMembership: stock.indexMembership,
    gicsSector: stock.gicsSector ?? '',
    setIndustryGroup: stock.setIndustryGroup ?? '',
    economicCycle: cycleIsDefault(stock) ? '' : (stock.economicCycle ?? ''),
    size: stock.size ?? '',
    style: stock.style ?? '',
    volatility: stock.volatility ?? '',
    lynchType: stock.lynchType ?? '',
    lifeCycle: stock.lifeCycle ?? '',
    moat: stock.moat ?? '',
    valueChain: stock.valueChain ?? '',
    valueChainPosition: stock.valueChainPosition ?? '',
    customers: stock.customers,
    revenueTypes: stock.revenueTypes,
    themes: stock.themes,
    listIds: [],
    held: stock.holding !== null,
    holdingShares: decimalForInput(stock.holding?.shares ?? null),
    holdingAverageCost: decimalForInput(stock.holding?.averageCost ?? null),
    costCurrency: stock.holding?.costCurrency ?? '',
  }
}

/** The cost currency in effect: the investor's pick, else the trading currency of the market (USD before a market is chosen). */
export function costCurrencyOf(values: Pick<FormValues, 'costCurrency' | 'market'>): 'USD' | 'THB' {
  return values.costCurrency || (values.market ? CURRENCY_BY_MARKET[values.market] : 'USD')
}

/** The holding the form describes, trimmed; empty fields are `null` ("held, amount unknown"). */
function holdingCandidate(v: FormValues) {
  return {
    shares: v.holdingShares.trim() || null,
    averageCost: v.holdingAverageCost.trim() || null,
    costCurrency: costCurrencyOf(v),
  }
}

/** The cycle the select shows when nothing is chosen: the sector default, or none. */
export function defaultCycle(gicsSector: string): string {
  if (!gicsSector) return ''
  return resolveEconomicCycle({ gicsSector: gicsSector as GicsSector }).economicCycle ?? ''
}

const blankToUndefined = (s: string) => (s.trim() === '' ? undefined : s)
const orNull = (s: string) => (s === '' ? null : s)

/** What `StockInput` is asked to check: blank required fields are `undefined` so they read "is required". */
function candidate(v: FormValues) {
  return {
    market: blankToUndefined(v.market),
    ticker: blankToUndefined(v.ticker),
    exchange: blankToUndefined(v.exchange),
    name: blankToUndefined(v.name),
    indexMembership: v.indexMembership,
    gicsSector: orNull(v.gicsSector),
    setIndustryGroup: orNull(v.setIndustryGroup),
    economicCycle: orNull(v.economicCycle),
    size: orNull(v.size),
    style: orNull(v.style),
    volatility: orNull(v.volatility),
    lynchType: orNull(v.lynchType),
    lifeCycle: orNull(v.lifeCycle),
    moat: orNull(v.moat),
    valueChain: blankToUndefined(v.valueChain) ?? null,
    valueChainPosition: orNull(v.valueChainPosition),
    customers: v.customers,
    revenueTypes: v.revenueTypes,
    themes: v.themes,
  }
}

/** API and schema names of the holding's parts, to the form's field names. */
const HOLDING_FIELD: Record<string, FieldName | undefined> = { shares: 'holdingShares', averageCost: 'holdingAverageCost' }

const isField = (key: unknown): key is FieldName => typeof key === 'string' && (FIELD_ORDER as readonly string[]).includes(key)

export const describeProblem = (field: FieldName, message: string) => `${FIELD_LABELS[field]} ${message}`

/** `holding` is `null` while the box is unticked. */
export type Checked = { ok: true; input: StockInput; holding: Holding | null } | { ok: false; errors: FieldErrors }

/** Validates the whole form with the domain schema. In edit mode this is the stored stock merged with the edits (market and ticker come from the stock). */
export function checkValues(values: FormValues): Checked {
  const result = StockInput.safeParse(candidate(values))
  const held = values.held ? HoldingInput.safeParse(holdingCandidate(values)) : null
  if (result.success && (!held || held.success)) {
    return { ok: true, input: result.data, holding: held?.success ? { shares: held.data.shares ?? null, averageCost: held.data.averageCost ?? null, costCurrency: held.data.costCurrency ?? costCurrencyOf(values) } : null }
  }
  const errors: FieldErrors = {}
  for (const issue of result.error?.issues ?? []) {
    const key = issue.path[0]
    if (isField(key) && !errors[key]) errors[key] = describeProblem(key, issueText(issue.message))
  }
  for (const issue of held?.error?.issues ?? []) {
    const key = HOLDING_FIELD[String(issue.path[0])]
    if (key && !errors[key]) errors[key] = describeProblem(key, issueText(issue.message))
  }
  // A blank choice reads "is required", not the enum's "must be one of".
  for (const key of ['market', 'exchange'] as const) {
    if (errors[key] && !values[key]) errors[key] = describeProblem(key, MESSAGES.required)
  }
  return { ok: false, errors }
}

export const firstInvalid = (errors: FieldErrors): FieldName | undefined => FIELD_ORDER.find((f) => errors[f])

/** The POST body: the validated input without `currency`, unset values left out, plus the ticked lists. */
export function createBody(input: StockInput, values: FormValues, economicCycleChosen: boolean, holding: Holding | null = null): Record<string, unknown> {
  const { currency: _currency, ...rest } = input
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) if (value !== null) body[key] = value
  // A default shown in the select is never sent: the API derives it from the sector.
  if (!economicCycleChosen) delete body.economicCycle
  body.listIds = values.listIds
  if (holding) body.holding = holding
  return body
}

const PATCHABLE = [
  'name',
  'exchange',
  'indexMembership',
  'gicsSector',
  'setIndustryGroup',
  'valueChain',
  'valueChainPosition',
  'size',
  'style',
  'lynchType',
  'lifeCycle',
  'customers',
  'revenueTypes',
  'moat',
  'themes',
  'volatility',
] as const

/** A stored holding in the shape the form produces, so the two compare. */
const holdingForInput = (h: Holding): Holding => ({
  shares: decimalForInput(h.shares) || null,
  averageCost: decimalForInput(h.averageCost) || null,
  costCurrency: h.costCurrency,
})

/** The PATCH body: only what differs from the stored stock, `null` for a cleared field. `{}` means nothing changed. */
export function patchBody(input: StockInput, values: FormValues, stock: Stock, holding: Holding | null = null): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of PATCHABLE) {
    const next = input[key]
    const before = stock[key]
    if (JSON.stringify(next) !== JSON.stringify(before ?? null)) patch[key] = next
  }
  const manualBefore = !cycleIsDefault(stock) && stock.economicCycle !== null
  if (values.economicCycle) {
    if (!(manualBefore && stock.economicCycle === values.economicCycle)) patch.economicCycle = values.economicCycle
  } else if (manualBefore) {
    patch.economicCycle = null
  }
  // The API replaces the whole holding, so a change sends all of it; unticking sends null.
  if (!holding) {
    if (stock.holding) patch.holding = null
  } else if (!stock.holding || JSON.stringify(holding) !== JSON.stringify(holdingForInput(stock.holding))) {
    patch.holding = holding
  }
  return patch
}

/** Splits a server problem's `errors[]` into field messages and the rest (shown in the form alert). */
export function splitServerErrors(problems: { path: string; message: string }[]): { fields: FieldErrors; rest: string[] } {
  const fields: FieldErrors = {}
  const rest: string[] = []
  for (const { path, message } of problems) {
    const [head, part] = path.split('.')
    const key = head === 'holding' ? HOLDING_FIELD[part ?? ''] : head
    if (isField(key)) {
      if (!fields[key]) fields[key] = describeProblem(key, message)
    } else rest.push(`${path || 'Request'} ${message}`)
  }
  return { fields, rest }
}

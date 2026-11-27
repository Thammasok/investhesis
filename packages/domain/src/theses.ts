import { z } from 'zod'
import { oneOf } from './fields.ts'
import { MESSAGES } from './messages.ts'
import { rejectUnknownKeys } from './stock-schema.ts'
import { charLength } from './vocabulary.ts'

export const THESIS_TYPES = ['buy', 'sell', 'update', 'review'] as const
export type ThesisType = (typeof THESIS_TYPES)[number]

export const THESIS_TYPE_LABELS: Record<ThesisType, string> = {
  buy: 'Buy',
  sell: 'Sell',
  update: 'Update',
  review: 'Review',
}

export const THESIS_NOTE_MAX = 10_000
export const THESIS_INVALIDATION_MAX = 2_000

const TARGET_PRICE_PATTERN = /^\d{1,14}(\.\d{1,4})?$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const LATEST_OFFSET_MS = 14 * 60 * 60 * 1000

/** The latest calendar date anywhere on Earth (UTC+14) at `now`, as YYYY-MM-DD. */
export function latestThesisDate(now: Date): string {
  return new Date(now.getTime() + LATEST_OFFSET_MS).toISOString().slice(0, 10)
}

const isRealDate = (s: string): boolean => {
  const m = DATE_PATTERN.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

const normaliseText = (s: string) => s.replaceAll('\r\n', '\n').trim()

const note = z
  .string({ error: () => MESSAGES.required })
  .transform(normaliseText)
  .check((ctx) => {
    const n = charLength(ctx.value)
    if (n < 1 || n > THESIS_NOTE_MAX) {
      ctx.issues.push({ code: 'custom', message: MESSAGES.thesisNoteLength, input: ctx.value })
    }
  })

const invalidation = z
  .string({ error: () => MESSAGES.required })
  .transform(normaliseText)
  .check((ctx) => {
    if (charLength(ctx.value) > THESIS_INVALIDATION_MAX) {
      ctx.issues.push({ code: 'custom', message: MESSAGES.thesisInvalidationLength, input: ctx.value })
    }
  })
  .transform((s) => (s === '' ? null : s))
  .nullish()
  .transform((v) => (v === undefined ? undefined : (v ?? null)))

const targetPrice = z
  .string({ error: () => MESSAGES.decimalString })
  .refine((s) => s === '' || (TARGET_PRICE_PATTERN.test(s) && /[1-9]/.test(s)), {
    error: MESSAGES.thesisTargetPriceFormat,
  })
  .transform((s) => (s === '' ? null : s))
  .nullish()
  .transform((v) => (v === undefined ? undefined : (v ?? null)))

const dateField = (today: string) =>
  z
    .string({ error: () => MESSAGES.required })
    .refine(isRealDate, { error: MESSAGES.thesisDateFormat })
    .refine((s) => !isRealDate(s) || s <= today, { error: MESSAGES.thesisDateFuture })

const shape = (today: string) => ({
  type: oneOf(THESIS_TYPES),
  date: dateField(today),
  note,
  targetPrice,
  invalidation,
})
const KNOWN = ['type', 'date', 'note', 'targetPrice', 'invalidation']

export interface ThesisSchemaArgs {
  /** The latest date an entry may carry, YYYY-MM-DD. The domain never reads the clock. */
  today: string
}

/** One new entry. Unknown keys fail with the key as the path. */
export function thesisInput({ today }: ThesisSchemaArgs) {
  const { type, date, note: n, targetPrice: t, invalidation: i } = shape(today)
  return z
    .looseObject({ type, date, note: n, targetPrice: t, invalidation: i })
    .superRefine((v, ctx) => rejectUnknownKeys(v, KNOWN, ctx))
}
export type ThesisInput = z.output<ReturnType<typeof thesisInput>>

/** Every field optional; `targetPrice: null` and `invalidation: null` clear; `{}` changes nothing. */
export function thesisPatch({ today }: ThesisSchemaArgs) {
  const { type, date, note: n, targetPrice: t, invalidation: i } = shape(today)
  return z
    .looseObject({ type: type.optional(), date: date.optional(), note: n.optional(), targetPrice: t, invalidation: i })
    .superRefine((v, ctx) => rejectUnknownKeys(v, KNOWN, ctx))
}
export type ThesisPatch = z.output<ReturnType<typeof thesisPatch>>

/** A stored entry as the API returns it and the backup holds it. */
export interface Thesis {
  id: string
  stockId: string
  type: ThesisType
  date: string
  note: string
  targetPrice: string | null
  invalidation: string | null
  createdAt: string
  updatedAt: string
}

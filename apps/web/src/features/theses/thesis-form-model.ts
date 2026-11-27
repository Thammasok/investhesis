import { THESIS_TYPES, formatRule, issueRule, parseDecimal, thesisInput, type ThesisInput } from '@investhesis/domain'
import { i18n } from '@/i18n/i18n'
import { getLanguage } from '@/i18n/language'
import { decimalForInput } from '@/lib/number-format'
import type { ThesisField } from './thesis-actions'
import type { Thesis } from './types'

export type FormValues = {
  type: string
  date: string
  note: string
  targetPrice: string
  invalidation: string
}
export type FieldErrors = Partial<Record<ThesisField, string>>

export const FIELD_ORDER: readonly ThesisField[] = ['type', 'date', 'note', 'targetPrice', 'invalidation']

/** The browser's calendar day as `YYYY-MM-DD`. The API only refuses dates after UTC+14, so this is the strict bound. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export const emptyValues = (today: string): FormValues => ({ type: '', date: today, note: '', targetPrice: '', invalidation: '' })

export const valuesOf = (entry: Thesis): FormValues => ({
  type: entry.type,
  date: entry.date,
  note: entry.note,
  targetPrice: decimalForInput(entry.targetPrice),
  invalidation: entry.invalidation ?? '',
})

const isField = (key: unknown): key is ThesisField => FIELD_ORDER.includes(key as ThesisField)

export type Checked = { ok: true; input: ThesisInput } | { ok: false; errors: FieldErrors }

/** Validates with the domain schema. Whitespace around the target price is dropped first (the domain does not trim it). */
export function checkValues(values: FormValues, today: string): Checked {
  const result = thesisInput({ today }).safeParse({
    type: values.type === '' ? undefined : values.type,
    date: values.date,
    note: values.note,
    targetPrice: values.targetPrice.trim() || null,
    invalidation: values.invalidation,
  })
  if (result.success) return { ok: true, input: result.data }
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0]
    if (!isField(key) || errors[key]) continue
    const { rule, params } = issueRule(issue.message)
    errors[key] =
      key === 'date' && rule === 'thesisDateFuture'
        ? i18n.t('theses.errors.dateFuture')
        : `${i18n.t(`theses.fields.${key}`)} ${formatRule(rule, params, getLanguage())}`
  }
  // A blank choice reads "is required", not the enum's "must be one of".
  if (errors.type && values.type === '') errors.type = `${i18n.t('theses.fields.type')} ${formatRule('required', undefined, getLanguage())}`
  if (errors.date && values.date === '') errors.date = `${i18n.t('theses.fields.date')} ${formatRule('required', undefined, getLanguage())}`
  return { ok: false, errors }
}

export const firstInvalid = (errors: FieldErrors): ThesisField | undefined => FIELD_ORDER.find((f) => errors[f])

/** POST body: optional values that are not set are left out. */
export function createBody(input: ThesisInput): Record<string, string> {
  return {
    type: input.type,
    date: input.date,
    note: input.note,
    ...(input.targetPrice ? { targetPrice: input.targetPrice } : {}),
    ...(input.invalidation ? { invalidation: input.invalidation } : {}),
  }
}

const sameDecimal = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : parseDecimal(a, 4) === parseDecimal(b, 4)

/** PATCH body: only the fields that differ from the stored entry; `null` clears an optional one. Empty = nothing to save. */
export function patchBody(input: ThesisInput, entry: Thesis): Record<string, string | null> {
  const target = input.targetPrice ?? null
  const invalidation = input.invalidation ?? null
  return {
    ...(input.type !== entry.type ? { type: input.type } : {}),
    ...(input.date !== entry.date ? { date: input.date } : {}),
    ...(input.note !== entry.note ? { note: input.note } : {}),
    ...(!sameDecimal(target, entry.targetPrice) ? { targetPrice: target } : {}),
    ...(invalidation !== entry.invalidation ? { invalidation } : {}),
  }
}

export { THESIS_TYPES }

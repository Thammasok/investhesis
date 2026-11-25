import { ApiError, type ApiClient } from '@/lib/api-client'
import type { Thesis } from './types'

export type ThesisIntent = 'add-thesis' | 'edit-thesis'
export type ThesisField = 'type' | 'date' | 'note' | 'targetPrice' | 'invalidation'

export type ThesisActionResult =
  | { intent: ThesisIntent; ok: true; thesis: Thesis }
  | {
      intent: ThesisIntent
      ok: false
      /** For the form `Alert` when no field can carry it. */
      message: string
      /** Problems the server pointed at a field. */
      errors?: { field: ThesisField; message: string }[]
      /** The stock (or, when editing, the entry) is gone: nothing more can be saved here. */
      gone?: boolean
    }

export const isThesisIntent = (value: string): value is ThesisIntent => value === 'add-thesis' || value === 'edit-thesis'

const FIELD_LABEL: Record<ThesisField, string> = {
  type: 'Type',
  date: 'The date',
  note: 'Thesis',
  targetPrice: 'Target price',
  invalidation: 'Invalidation conditions',
}
const FIELDS = Object.keys(FIELD_LABEL) as ThesisField[]

export const SAVE_FAILED = "Couldn't save the entry. Try again."
export const STOCK_GONE = 'This stock no longer exists.'
export const ENTRY_GONE = 'This entry or stock no longer exists.'

const text = (form: FormData, key: string) => String(form.get(key) ?? '')

/**
 * POSTs a new entry or PATCHes the changed fields of one. The dialog sends the JSON body as `payload`, so the
 * action stays a thin pass-through: the server validates again and its field errors come back by field.
 */
export async function changeThesis(api: ApiClient, stockId: string, intent: ThesisIntent, form: FormData): Promise<ThesisActionResult> {
  const base = `/stocks/${encodeURIComponent(stockId)}/theses`
  let body: unknown
  try {
    body = JSON.parse(text(form, 'payload'))
  } catch {
    return { intent, ok: false, message: SAVE_FAILED }
  }
  try {
    const thesis =
      intent === 'add-thesis'
        ? await api.post<Thesis>(base, { body })
        : await api.patch<Thesis>(`${base}/${encodeURIComponent(text(form, 'thesisId'))}`, { body })
    return { intent, ok: true, thesis }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 401) throw error
    // Adding can only miss the stock; editing cannot tell the entry from the stock (the API says not_found for both).
    if (error.status === 404) return { intent, ok: false, gone: true, message: intent === 'add-thesis' ? STOCK_GONE : ENTRY_GONE }
    if (error.status === 400) {
      const errors = error.errors.flatMap((e) => {
        const field = FIELDS.find((f) => f === e.path)
        return field ? [{ field, message: `${FIELD_LABEL[field]} ${e.message}` }] : []
      })
      if (errors.length > 0) return { intent, ok: false, errors, message: SAVE_FAILED }
    }
    return { intent, ok: false, message: SAVE_FAILED }
  }
}

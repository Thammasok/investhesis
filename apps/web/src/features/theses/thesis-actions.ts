import { ApiError, type ApiClient } from '@/lib/api-client'
import type { Thesis } from './types'

export type ThesisIntent = 'add-thesis' | 'edit-thesis' | 'delete-thesis' | 'restore-thesis'
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

export const isThesisIntent = (value: string): value is ThesisIntent =>
  value === 'add-thesis' || value === 'edit-thesis' || value === 'delete-thesis' || value === 'restore-thesis'

const FIELD_LABEL: Record<ThesisField, string> = {
  type: 'Type',
  date: 'The date',
  note: 'Thesis',
  targetPrice: 'Target price',
  invalidation: 'Invalidation conditions',
}
const FIELDS = Object.keys(FIELD_LABEL) as ThesisField[]

export const SAVE_FAILED = "Couldn't save the entry. Try again."
export const DELETE_FAILED = "Couldn't delete the entry."
export const RESTORE_FAILED = "Couldn't restore the entry."
export const STOCK_GONE = 'This stock no longer exists.'
export const ENTRY_GONE = 'This entry or stock no longer exists.'

const text = (form: FormData, key: string) => String(form.get(key) ?? '')

/**
 * POSTs a new entry or PATCHes the changed fields of one. The dialog sends the JSON body as `payload`, so the
 * action stays a thin pass-through: the server validates again and its field errors come back by field.
 */
export async function changeThesis(api: ApiClient, stockId: string, intent: ThesisIntent, form: FormData): Promise<ThesisActionResult> {
  const base = `/stocks/${encodeURIComponent(stockId)}/theses`
  const failed = intent === 'delete-thesis' ? DELETE_FAILED : intent === 'restore-thesis' ? RESTORE_FAILED : SAVE_FAILED
  let body: unknown
  if (intent !== 'delete-thesis') {
    try {
      body = JSON.parse(text(form, 'payload'))
    } catch {
      return { intent, ok: false, message: failed }
    }
  }
  const entryPath = `${base}/${encodeURIComponent(text(form, 'thesisId'))}`
  try {
    const thesis =
      intent === 'add-thesis'
        ? await api.post<Thesis>(base, { body })
        : intent === 'edit-thesis'
          ? await api.patch<Thesis>(entryPath, { body })
          : intent === 'delete-thesis'
            ? await api.delete<Thesis>(entryPath)
            : await api.post<Thesis>(`${base}/restore`, { body })
    return { intent, ok: true, thesis }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 401) throw error
    // Adding can only miss the stock; the other intents cannot tell the entry from the stock (the API says not_found for both).
    if (error.status === 404) return { intent, ok: false, gone: true, message: intent === 'add-thesis' ? STOCK_GONE : ENTRY_GONE }
    if (error.status === 400 && (intent === 'add-thesis' || intent === 'edit-thesis')) {
      const errors = error.errors.flatMap((e) => {
        const field = FIELDS.find((f) => f === e.path)
        return field ? [{ field, message: `${FIELD_LABEL[field]} ${e.message}` }] : []
      })
      if (errors.length > 0) return { intent, ok: false, errors, message: failed }
    }
    return { intent, ok: false, message: failed }
  }
}

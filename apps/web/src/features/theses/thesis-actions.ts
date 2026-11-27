import { formatRule, MESSAGE_KEYS, type MessageKey } from '@investhesis/domain'
import { i18n } from '@/i18n/i18n'
import { getLanguage } from '@/i18n/language'
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

const FIELDS: ThesisField[] = ['type', 'date', 'note', 'targetPrice', 'invalidation']
const isRule = (value: string): value is MessageKey => (MESSAGE_KEYS as readonly string[]).includes(value)

/** A field's problem in the current language: its name plus the rule's text; an answer without a rule keeps the API's English. */
function fieldProblem(field: ThesisField, e: { message: string; rule?: string; params?: Record<string, unknown> }): string {
  const label = i18n.t(`theses.serverFields.${field}`)
  if (e.rule === undefined || e.rule === 'invalid' || !isRule(e.rule)) return `${label} ${e.message}`
  return `${label} ${formatRule(e.rule, e.params, getLanguage())}`
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '')

/**
 * POSTs a new entry or PATCHes the changed fields of one. The dialog sends the JSON body as `payload`, so the
 * action stays a thin pass-through: the server validates again and its field errors come back by field.
 */
export async function changeThesis(api: ApiClient, stockId: string, intent: ThesisIntent, form: FormData): Promise<ThesisActionResult> {
  const base = `/stocks/${encodeURIComponent(stockId)}/theses`
  const failed = i18n.t(
    intent === 'delete-thesis' ? 'theses.errors.deleteFailed' : intent === 'restore-thesis' ? 'theses.errors.restoreFailed' : 'theses.errors.saveFailed',
  )
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
    if (error.status === 404) return { intent, ok: false, gone: true, message: i18n.t(intent === 'add-thesis' ? 'theses.errors.stockGone' : 'theses.errors.entryGone') }
    if (error.status === 400 && (intent === 'add-thesis' || intent === 'edit-thesis')) {
      const errors = error.errors.flatMap((e) => {
        const field = FIELDS.find((f) => f === e.path)
        return field ? [{ field, message: fieldProblem(field, e) }] : []
      })
      if (errors.length > 0) return { intent, ok: false, errors, message: failed }
    }
    return { intent, ok: false, message: failed }
  }
}

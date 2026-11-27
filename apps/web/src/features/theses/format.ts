import { THESIS_TYPE_LABELS_EN, THESIS_TYPE_LABELS_TH, type Language } from '@investhesis/domain'
import { formatDate, formatTimestamp } from '@/i18n/format-date'
import { i18n } from '@/i18n/i18n'
import { getLanguage } from '@/i18n/language'
import type { Thesis, ThesisType } from './types'

/** The label of an entry type (glossary: Buy ซื้อ, Sell ขาย, Update อัปเดต, Review ทบทวน). The stored value stays `buy` and so on. */
export const typeLabel = (type: ThesisType, lang: Language = getLanguage()): string =>
  (lang === 'th' ? THESIS_TYPE_LABELS_TH : THESIS_TYPE_LABELS_EN)[type]

/** `"2026-11-20"` to `20 Nov 2026` / `20 พ.ย. 2026`. Read from the text, never through a `Date`, so no time zone can move the day. */
export function formatEntryDate(date: string, lang: Language = getLanguage()): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDate(date, lang) : date
}

/** The calendar day of an instant in the browser's time zone, as `5 Oct 2026`. */
export function formatEditedDate(iso: string, lang: Language = getLanguage()): string {
  return formatTimestamp(iso, lang)
}

/** FR-004: an entry is edited once its last change is later than its creation. */
export const isEdited = (entry: Pick<Thesis, 'createdAt' | 'updatedAt'>): boolean =>
  Date.parse(entry.updatedAt) > Date.parse(entry.createdAt)

export const NOTE_CLAMP_LINES = 8
export const NOTE_CLAMP_CHARS = 600

/** The Show more rule is on the text, not on measured height, so it behaves the same in every browser and test. */
export const needsClamp = (note: string): boolean =>
  note.split('\n').length > NOTE_CLAMP_LINES || [...note].length > NOTE_CLAMP_CHARS

export const entryCount = (count: number): string => i18n.t('theses.section.count', { count, n: count.toLocaleString('en-US') })

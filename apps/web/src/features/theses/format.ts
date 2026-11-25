import type { Thesis } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `"2026-11-20"` to `20 Nov 2026`. Read from the text, never through a `Date`, so no time zone can move the day. */
export function formatEntryDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`
}

/** The calendar day of an instant in the browser's time zone, as `5 Oct 2026`. */
export function formatEditedDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''} ${d.getFullYear()}`
}

/** FR-004: an entry is edited once its last change is later than its creation. */
export const isEdited = (entry: Pick<Thesis, 'createdAt' | 'updatedAt'>): boolean =>
  Date.parse(entry.updatedAt) > Date.parse(entry.createdAt)

export const NOTE_CLAMP_LINES = 8
export const NOTE_CLAMP_CHARS = 600

/** The Show more rule is on the text, not on measured height, so it behaves the same in every browser and test. */
export const needsClamp = (note: string): boolean =>
  note.split('\n').length > NOTE_CLAMP_LINES || [...note].length > NOTE_CLAMP_CHARS

export const entryCount = (n: number): string => `${n.toLocaleString('en-US')} ${n === 1 ? 'entry' : 'entries'}`

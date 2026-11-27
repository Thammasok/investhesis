import type { Language } from '@investhesis/domain'

const MONTHS: Record<Language, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
}

/**
 * `YYYY-MM-DD` as `27 Nov 2026` / `27 พ.ย. 2026`, from the text and fixed month tables: never through
 * a `Date` (no zone shift) and never `Intl` with `th`, whose default calendar is Buddhist (ADR-005).
 * Text that is not a date is returned unchanged.
 */
export function formatDate(ymd: string, lang: Language): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  const month = match ? MONTHS[lang][Number(match[2]) - 1] : undefined
  if (!match || !month) return ymd
  return `${Number(match[3])} ${month} ${Number(match[1])}`
}

/** The browser-local calendar date of an ISO time, formatted like `formatDate`. */
export function formatTimestamp(iso: string, lang: Language): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return formatDate(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, lang)
}

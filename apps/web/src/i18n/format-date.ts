import type { Language } from '@investhesis/domain'

const MONTHS: Record<Language, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
}

/**
 * "27 Nov 2026" / "27 พ.ย. 2026" from `YYYY-MM-DD` text. Never through a `Date` (no zone shift) and
 * never through `Intl` with `th`, whose default calendar is Buddhist (the year stays CE, ADR-005).
 * Text that is not a date comes back unchanged.
 */
export function formatDate(ymd: string, lang: Language): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return ymd
  const month = MONTHS[lang][Number(match[2]) - 1]
  if (!month) return ymd
  return `${Number(match[3])} ${month} ${match[1]}`
}

/** The browser-local calendar date of an ISO time, formatted as `formatDate`. */
export function formatTimestamp(iso: string, lang: Language): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return formatDate(`${String(at.getFullYear()).padStart(4, '0')}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, lang)
}

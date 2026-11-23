import { formatDecimal, parseDecimal } from '@investhesis/domain'

/** The API sends shares, costs and rates with at most this many decimal places. */
const API_SCALE = 4

const SYMBOL = { USD: '$', THB: '฿' } as const
export type CostCurrency = keyof typeof SYMBOL

/** `1234567` to `1,234,567`, on the digit string so no number conversion happens. */
const group = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Fixed-point text to grouped text, trailing zeros trimmed down to `minPlaces`. */
function trimmed(text: string, minPlaces: number): string {
  const [whole = '0', fraction = ''] = text.split('.')
  let f = fraction
  while (f.length > minPlaces && f.endsWith('0')) f = f.slice(0, -1)
  return f === '' ? group(whole) : `${group(whole)}.${f}`
}

/** `"120.5000"` to `120.5`; `null` when the text is missing or not a decimal. Shares carry no minimum decimals. */
export function formatShares(text: string | null): string | null {
  if (text === null) return null
  const scaled = parseDecimal(text, API_SCALE)
  return scaled === null ? null : trimmed(formatDecimal(scaled, API_SCALE), 0)
}

/** `"412.3300"` to `$412.33`; at least two decimals, up to four (`$0.1234`). */
export function formatUnitMoney(text: string | null, currency: CostCurrency): string | null {
  if (text === null) return null
  const scaled = parseDecimal(text, API_SCALE)
  return scaled === null ? null : `${SYMBOL[currency]}${trimmed(formatDecimal(scaled, API_SCALE), 2)}`
}

/** A scaled integer as money with exactly two decimals, half up (`฿1,234,567.89`). */
export function formatMoney(scaled: bigint, scale: number, currency: CostCurrency): string {
  const text = formatDecimal(scaled < 0n ? -scaled : scaled, scale, 2)
  return `${scaled < 0n ? '-' : ''}${SYMBOL[currency]}${group(text.split('.')[0] ?? '0')}.${text.split('.')[1]}`
}

/** Canonical short text of a stored decimal for an input: `"412.3300"` to `412.33`, `"10.0000"` to `10`; `''` for `null`. */
export function decimalForInput(text: string | null): string {
  if (text === null) return ''
  const scaled = parseDecimal(text, API_SCALE)
  return scaled === null ? text : trimmed(formatDecimal(scaled, API_SCALE), 0).replaceAll(',', '')
}

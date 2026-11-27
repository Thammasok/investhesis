import { MARKET_LABELS, type Language } from '@investhesis/domain'
import { i18n } from '@/i18n/i18n'
import { getLanguage } from '@/i18n/language'
import type { Stock } from './types'

const NOUN_KEYS = { stock: 'stocks.count.stock', list: 'stocks.count.list', row: 'stocks.count.row' } as const

/** `1 stock`, `2 stocks`, `1,248 rows`, `12 หุ้น`: the count with its noun, in the current language. */
export function countLabel(count: number, noun: string, lang: Language = getLanguage()): string {
  const key = NOUN_KEYS[noun as keyof typeof NOUN_KEYS]
  if (!key) return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`
  return i18n.t(key, { count, n: count.toLocaleString('en-US'), lng: lang })
}

/** `US · NASDAQ · USD · S&P 500, Nasdaq-100`; the index part is left out when there is none. Markets read `สหรัฐฯ` / `ไทย` in Thai. */
export function identityLine(
  stock: Pick<Stock, 'market' | 'exchange' | 'currency' | 'indexMembership'>,
  lang: Language = getLanguage(),
): string {
  const parts: string[] = [MARKET_LABELS[lang][stock.market], stock.exchange, stock.currency]
  if (stock.indexMembership.length > 0) parts.push(stock.indexMembership.join(', '))
  return parts.join(' · ')
}

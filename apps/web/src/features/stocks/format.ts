import type { Stock } from './types'

/** `1 stock`, `2 stocks`, `1,248 rows`: the count with the noun in the right number. */
export function countLabel(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`
}

/** `US · NASDAQ · USD · S&P 500, Nasdaq-100`; the index part is left out when there is none. */
export function identityLine(stock: Pick<Stock, 'market' | 'exchange' | 'currency' | 'indexMembership'>): string {
  const parts: string[] = [stock.market, stock.exchange, stock.currency]
  if (stock.indexMembership.length > 0) parts.push(stock.indexMembership.join(', '))
  return parts.join(' · ')
}

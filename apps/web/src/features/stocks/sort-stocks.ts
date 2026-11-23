import { parseDecimal } from '@investhesis/domain'
import type { Stock } from './types'

export const SORTABLE_COLUMNS = ['ticker', 'name', 'market', 'sector', 'held'] as const
export type SortColumn = (typeof SORTABLE_COLUMNS)[number]
export type SortDirection = 'asc' | 'desc'

// Case-insensitive; Thai sorts after Latin by the root collation, the same on every machine.
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

function keyOf(stock: Stock, column: SortColumn): string | null {
  switch (column) {
    case 'ticker':
      return stock.ticker
    case 'name':
      return stock.name
    case 'market':
      return stock.market
    case 'sector':
      return stock.gicsSector
    case 'held':
      return null // sorted by heldRank in sortStocks
  }
}

/** Not held < held without shares < held with shares (exact, by scaled integer; a shares value is at least 0.0001). */
function heldRank(stock: Stock): bigint {
  const holding = stock.holding
  if (!holding) return -2n
  const shares = holding.shares === null ? null : parseDecimal(holding.shares, 4)
  return shares ?? -1n
}

const tieBreak = (a: Stock, b: Stock) => collator.compare(a.ticker, b.ticker) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * A sorted copy. Equal keys fall back to the ticker, then the id, so the order is stable. A stock with
 * no value for the column goes last in both directions.
 */
export function sortStocks(stocks: readonly Stock[], column: SortColumn, direction: SortDirection): Stock[] {
  const sign = direction === 'asc' ? 1 : -1
  if (column === 'held') {
    // Descending is the natural reading: held first, most shares first; ties by ticker either way.
    return [...stocks].sort((a, b) => {
      const ra = heldRank(a)
      const rb = heldRank(b)
      return (ra === rb ? 0 : (ra < rb ? -1 : 1) * sign) || tieBreak(a, b)
    })
  }
  return [...stocks].sort((a, b) => {
    const ka = keyOf(a, column)
    const kb = keyOf(b, column)
    if (ka === null && kb === null) return tieBreak(a, b)
    if (ka === null) return 1
    if (kb === null) return -1
    return sign * collator.compare(ka, kb) || tieBreak(a, b)
  })
}

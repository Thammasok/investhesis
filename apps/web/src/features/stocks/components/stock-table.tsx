import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatShares } from '@/lib/number-format'
import { cn } from '@/lib/utils'
import { sortStocks, type SortColumn, type SortState } from '../sort-stocks'
import type { ListSummary, Stock } from '../types'

const COLUMN_LABEL: Record<SortColumn, string> = { ticker: 'Ticker', name: 'Name', market: 'Market', sector: 'Sector', held: 'Held' }

type StockTableProps = {
  stocks: readonly Stock[]
  /** The sort the page keeps (in the address); the table only shows it and reports clicks. */
  sort: SortState
  onSort: (column: SortColumn) => void
  /** Every list of the user, to turn a stock's `listIds` into names. Needed with `showLists`. */
  lists?: readonly Pick<ListSummary, 'id' | 'name'>[]
  /** The Lists column; the list detail page leaves it out. Default true. */
  showLists?: boolean
  /** A trailing column with this control for each row (e.g. a remove button); a click in it never opens the stock. */
  renderRowAction?: (stock: Stock) => ReactNode
  caption?: string
}

/** The Lists cell: up to two list badges, then `+N`; a dash with a screen-reader label when none. */
function ListBadges({ names }: { names: string[] }) {
  if (names.length === 0) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">no lists</span>
      </>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {names.slice(0, 2).map((name, i) => (
        <Badge key={`${name}-${i}`} variant="secondary" className="max-w-32 truncate" title={name}>
          {name}
        </Badge>
      ))}
      {names.length > 2 ? <span className="text-xs">+{names.length - 2}</span> : null}
    </span>
  )
}

/** The Held cell: a badge and the shares when known; a dash with a screen-reader label when not held. */
function HeldCell({ stock }: { stock: Stock }) {
  if (!stock.holding) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not held</span>
      </span>
    )
  }
  const shares = formatShares(stock.holding.shares)
  return (
    <span className="flex items-center gap-1.5">
      <Badge variant="secondary">Held</Badge>
      {shares ? <span className="tabular-nums text-muted-foreground">{shares}</span> : null}
    </span>
  )
}

function SortHead({
  column,
  sort,
  onSort,
  className,
}: {
  column: SortColumn
  sort: SortState
  onSort: (column: SortColumn) => void
  className?: string
}) {
  const active = sort.column === column
  const Icon = !active ? ArrowUpDownIcon : sort.direction === 'asc' ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('bg-background', className)}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-8"
        aria-label={`Sort by ${COLUMN_LABEL[column]}`}
        onClick={() => onSort(column)}
      >
        {COLUMN_LABEL[column]}
        <Icon className="size-3.5" aria-hidden="true" />
      </Button>
    </TableHead>
  )
}

/**
 * Sortable table of stocks, shared by the Stocks page and the list detail page. Sorting is
 * client-side but the sort itself is controlled by the page (it lives in the address); a row opens
 * the stock (the ticker link is the keyboard path).
 */
export function StockTable({ stocks, sort, onSort, lists = [], showLists = true, renderRowAction, caption }: StockTableProps) {
  const navigate = useNavigate()
  const sorted = useMemo(() => sortStocks(stocks, sort.column, sort.direction), [stocks, sort])
  const listNames = useMemo(() => new Map(lists.map((l) => [l.id, l.name])), [lists])

  return (
    <div className="rounded-lg border">
      <Table className="text-sm">
        <TableCaption className="sr-only">
          {caption ?? 'Saved stocks'}, sorted by {COLUMN_LABEL[sort.column]} {sort.direction === 'asc' ? 'ascending' : 'descending'}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <SortHead column="ticker" sort={sort} onSort={onSort} className="sticky left-0" />
            <SortHead column="name" sort={sort} onSort={onSort} />
            <SortHead column="market" sort={sort} onSort={onSort} />
            <TableHead className="bg-background">Exchange</TableHead>
            <SortHead column="sector" sort={sort} onSort={onSort} />
            <SortHead column="held" sort={sort} onSort={onSort} />
            <TableHead className="bg-background">Size</TableHead>
            <TableHead className="bg-background">Style</TableHead>
            {showLists ? <TableHead className="bg-background">Lists</TableHead> : null}
            {renderRowAction ? (
              <TableHead className="bg-background">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((stock) => (
            <TableRow
              key={stock.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/stocks/${stock.id}`)}
            >
              <TableCell className="sticky left-0 bg-background font-medium tabular-nums">
                <Link
                  to={`/stocks/${stock.id}`}
                  className="underline-offset-4 hover:underline focus-visible:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {stock.ticker}
                </Link>
              </TableCell>
              <TableCell>{stock.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono">
                  {stock.market}
                </Badge>
              </TableCell>
              <TableCell>{stock.exchange}</TableCell>
              <TableCell>
                {stock.gicsSector ?? '—'}
                {stock.market === 'TH' && stock.setIndustryGroup ? (
                  <span className="block text-muted-foreground">{stock.setIndustryGroup}</span>
                ) : null}
              </TableCell>
              <TableCell>
                <HeldCell stock={stock} />
              </TableCell>
              <TableCell>{stock.size ?? '—'}</TableCell>
              <TableCell>{stock.style ?? '—'}</TableCell>
              {showLists ? (
                <TableCell>
                  <ListBadges names={stock.listIds.flatMap((id) => listNames.get(id) ?? [])} />
                </TableCell>
              ) : null}
              {renderRowAction ? (
                <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                  {renderRowAction(stock)}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

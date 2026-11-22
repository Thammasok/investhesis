import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { sortStocks, type SortColumn, type SortDirection } from '../sort-stocks'
import type { ListSummary, Stock } from '../types'

const COLUMN_LABEL: Record<SortColumn, string> = { ticker: 'Ticker', name: 'Name', market: 'Market', sector: 'Sector' }

type StockTableProps = {
  stocks: readonly Stock[]
  /** Every list of the user, to turn a stock's `listIds` into names. */
  lists: readonly Pick<ListSummary, 'id' | 'name'>[]
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

function SortHead({
  column,
  sort,
  onSort,
  className,
}: {
  column: SortColumn
  sort: { column: SortColumn; direction: SortDirection }
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
 * client-side and kept here; a row opens the stock (the ticker link is the keyboard path).
 */
export function StockTable({ stocks, lists }: StockTableProps) {
  const navigate = useNavigate()
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: 'ticker',
    direction: 'asc',
  })
  const sorted = useMemo(() => sortStocks(stocks, sort.column, sort.direction), [stocks, sort])
  const listNames = useMemo(() => new Map(lists.map((l) => [l.id, l.name])), [lists])

  const onSort = (column: SortColumn) =>
    setSort((s) =>
      s.column === column ? { column, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { column, direction: 'asc' },
    )

  return (
    <div className="rounded-lg border">
      <Table className="text-sm">
        <TableCaption className="sr-only">
          Saved stocks, sorted by {COLUMN_LABEL[sort.column]} {sort.direction === 'asc' ? 'ascending' : 'descending'}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <SortHead column="ticker" sort={sort} onSort={onSort} className="sticky left-0" />
            <SortHead column="name" sort={sort} onSort={onSort} />
            <SortHead column="market" sort={sort} onSort={onSort} />
            <TableHead className="bg-background">Exchange</TableHead>
            <SortHead column="sector" sort={sort} onSort={onSort} />
            <TableHead className="bg-background">Size</TableHead>
            <TableHead className="bg-background">Style</TableHead>
            <TableHead className="bg-background">Lists</TableHead>
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
              <TableCell>{stock.size ?? '—'}</TableCell>
              <TableCell>{stock.style ?? '—'}</TableCell>
              <TableCell>
                <ListBadges names={stock.listIds.flatMap((id) => listNames.get(id) ?? [])} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

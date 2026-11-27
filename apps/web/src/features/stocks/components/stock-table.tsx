import { MARKET_LABELS } from '@investhesis/domain'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatShares } from '@/lib/number-format'
import { cn } from '@/lib/utils'
import { sortStocks, type SortColumn, type SortState } from '../sort-stocks'
import type { ListSummary, Stock } from '../types'
import { useLanguage } from '../use-language'
import { LensText } from './lens-text'

const COLUMN_KEY = {
  ticker: 'stocks.table.ticker',
  name: 'stocks.table.name',
  market: 'stocks.table.market',
  sector: 'stocks.table.sector',
  held: 'stocks.table.held',
} as const satisfies Record<SortColumn, string>

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
  const { t } = useTranslation()
  if (names.length === 0) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('stocks.table.noLists')}</span>
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
  const { t } = useTranslation()
  if (!stock.holding) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('holdings.notHeld')}</span>
      </span>
    )
  }
  const shares = formatShares(stock.holding.shares)
  return (
    <span className="flex items-center gap-1.5">
      <Badge variant="secondary" className="whitespace-nowrap">{t('holdings.held')}</Badge>
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
  const { t } = useTranslation()
  const active = sort.column === column
  const label = t(COLUMN_KEY[column])
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
        aria-label={t('stocks.table.sortBy', { column: label })}
        onClick={() => onSort(column)}
      >
        {label}
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
  const { t } = useTranslation()
  const lang = useLanguage()
  const navigate = useNavigate()
  const sorted = useMemo(() => sortStocks(stocks, sort.column, sort.direction, lang), [stocks, sort, lang])
  const listNames = useMemo(() => new Map(lists.map((l) => [l.id, l.name])), [lists])

  return (
    <div className="rounded-lg border">
      <Table className="text-sm">
        <TableCaption className="sr-only">
          {t('stocks.table.captionSorted', {
            caption: caption ?? t('stocks.table.caption'),
            column: t(COLUMN_KEY[sort.column]),
            direction: sort.direction === 'asc' ? t('stocks.table.ascending') : t('stocks.table.descending'),
          })}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <SortHead column="ticker" sort={sort} onSort={onSort} className="sticky left-0" />
            <SortHead column="name" sort={sort} onSort={onSort} />
            <SortHead column="market" sort={sort} onSort={onSort} />
            <TableHead className="bg-background">{t('stocks.table.exchange')}</TableHead>
            <SortHead column="sector" sort={sort} onSort={onSort} />
            <SortHead column="held" sort={sort} onSort={onSort} />
            <TableHead className="bg-background">{t('stocks.table.size')}</TableHead>
            <TableHead className="bg-background">{t('stocks.table.style')}</TableHead>
            {showLists ? <TableHead className="bg-background">{t('stocks.table.lists')}</TableHead> : null}
            {renderRowAction ? (
              <TableHead className="bg-background">
                <span className="sr-only">{t('stocks.table.actions')}</span>
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
                <Badge variant="outline" className="font-mono whitespace-nowrap" title={lang === 'th' ? stock.market : undefined}>
                  {MARKET_LABELS[lang][stock.market]}
                </Badge>
              </TableCell>
              <TableCell>{stock.exchange}</TableCell>
              <TableCell>
                {stock.gicsSector ? <LensText lens="gicsSector" value={stock.gicsSector} /> : '—'}
                {stock.market === 'TH' && stock.setIndustryGroup ? (
                  <span className="block text-muted-foreground">
                    <LensText lens="setIndustryGroup" value={stock.setIndustryGroup} />
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <HeldCell stock={stock} />
              </TableCell>
              <TableCell>{stock.size ? <LensText lens="size" value={stock.size} /> : '—'}</TableCell>
              <TableCell>{stock.style ? <LensText lens="style" value={stock.style} /> : '—'}</TableCell>
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

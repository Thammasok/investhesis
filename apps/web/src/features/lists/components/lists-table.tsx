import { ArrowUpIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ListSummary } from '@/features/stocks/types'
import { ListRowActions } from './list-row-actions'

/** The user's lists by name, each with its stock count and a row menu. */
export function ListsTable({ lists }: { lists: readonly ListSummary[] }) {
  const { t } = useTranslation()
  const sorted = [...lists].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="rounded-lg border">
      <Table className="text-sm">
        <TableCaption className="sr-only">{t('lists.table.caption')}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead aria-sort="ascending" className="bg-background">
              <span className="inline-flex items-center gap-1">
                {t('lists.table.name')}
                <ArrowUpIcon className="size-3.5" aria-hidden="true" />
              </span>
            </TableHead>
            <TableHead className="bg-background text-right">{t('lists.table.stocks')}</TableHead>
            <TableHead className="w-12 bg-background">
              <span className="sr-only">{t('lists.table.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((list) => (
            <TableRow key={list.id}>
              <TableCell className="font-medium whitespace-normal break-words">
                <Link to={`/lists/${list.id}`} className="underline-offset-4 hover:underline focus-visible:underline">
                  {list.name}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{list.stockCount}</TableCell>
              <TableCell className="text-right">
                <ListRowActions list={list} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

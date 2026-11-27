import { useTranslation } from 'react-i18next'
import { ImportIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useLoaderData } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AddStockPicker } from '@/features/lists/components/add-stock-picker'
import { DeleteListDialog } from '@/features/lists/components/delete-list-dialog'
import { ListNameDialog } from '@/features/lists/components/list-name-dialog'
import type { ListPageData } from '@/features/lists/lists-data'
import { useMembership } from '@/features/lists/use-membership'
import { ExportMenu } from '@/features/exports/export-menu'
import { sortStocks } from '@/features/stocks/sort-stocks'
import { SeeConcentration } from '@/features/concentration/components/see-concentration'
import { AddressNotes } from '@/features/stock-filters/address-notes'
import { FilterToolbar } from '@/features/stock-filters/filter-toolbar'
import { SEARCH_ID } from '@/features/stock-filters/filter-toolbar-model'
import { NoMatches } from '@/features/stock-filters/no-matches'
import { useStockFilters } from '@/features/stock-filters/use-stock-filters'
import { StockTable } from '@/features/stocks/components/stock-table'

export function Component() {
  const { t } = useTranslation()
  const { list, members, candidates, lists } = useLoaderData() as ListPageData
  const membership = useMembership(list.name)
  const filters = useStockFilters(members)
  // What the table shows, in the order it shows it: the rows the Export menu writes.
  const ordered = useMemo(
    () => sortStocks(filters.shown, filters.sort.column, filters.sort.direction),
    [filters.shown, filters.sort],
  )
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const renameRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  // Where focus goes back to: the visible Rename button, or the ⋯ button when the menu opened the dialog.
  const returnRef = useRef<HTMLElement | null>(null)
  const open = (kind: 'rename' | 'delete', from: React.RefObject<HTMLElement | null>) => {
    returnRef.current = from.current
    setDialog(kind)
  }
  const empty = members.length === 0
  const importLink = (
    <Button variant="outline" className="w-full sm:w-auto" asChild>
      <Link to={`/import-export/import?listId=${encodeURIComponent(list.id)}`}>
        <ImportIcon aria-hidden="true" />
        {t('lists.page.importInto')}
      </Link>
    </Button>
  )
  const picker = (
    <AddStockPicker
      candidates={candidates}
      noStocks={members.length + candidates.length === 0}
      onPick={membership.add}
      disabled={membership.busy}
      className="w-full sm:w-auto"
    />
  )

  return (
    <section className="space-y-6">
      <PageHeader
        title={list.name}
        description={t('lists.stockCount', { count: list.stockCount, n: list.stockCount.toLocaleString('en-US') })}
        actions={
          <>
            {empty ? null : (
              <>
                {picker}
                {importLink}
              </>
            )}
            <Button
              ref={renameRef}
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => open('rename', renameRef)}
            >
              <PencilIcon aria-hidden="true" />
              {t('common.rename')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={moreRef} variant="ghost" size="icon" aria-label={t('lists.page.moreActions')} className="ml-auto sm:ml-0">
                  <MoreHorizontalIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="sm:hidden" onSelect={() => open('rename', moreRef)}>
                  <PencilIcon aria-hidden="true" />
                  {t('common.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => open('delete', moreRef)}>
                  <Trash2Icon aria-hidden="true" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {empty ? (
        <Card className="items-center gap-3 py-12 text-center">
          <h2 className="font-heading text-lg font-semibold">{t('lists.page.emptyTitle')}</h2>
          <div className="flex w-full flex-wrap items-center justify-center gap-2 px-6">
            {picker}
            <span className="text-sm">{t('lists.page.or')}</span>
            {importLink}
          </div>
        </Card>
      ) : (
        <>
          <AddressNotes notes={filters.notes} />
          <FilterToolbar
            filters={filters}
            actions={<ExportMenu stocks={ordered} lists={lists} listName={list.name} />}
            trailing={<SeeConcentration scope={list.id} filters={filters.state} />}
          />
          {filters.shown.length === 0 ? (
            <NoMatches
              onClearAll={() => {
                filters.clearFilters(true)
                document.getElementById(SEARCH_ID)?.focus()
              }}
            />
          ) : (
            <StockTable
              stocks={filters.shown}
              sort={filters.sort}
              onSort={filters.toggleSort}
              showLists={false}
              caption={t('lists.page.caption', { name: list.name })}
              renderRowAction={(stock) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('lists.page.remove', { ticker: stock.ticker, name: list.name })}
                  disabled={membership.busy}
                  onClick={() => membership.remove(stock)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              )}
            />
          )}
        </>
      )}
      <ListNameDialog
        mode="rename"
        list={list}
        open={dialog === 'rename'}
        onOpenChange={(next) => !next && setDialog(null)}
        returnFocusTo={returnRef}
      />
      <DeleteListDialog
        list={list}
        open={dialog === 'delete'}
        onOpenChange={(next) => !next && setDialog(null)}
        returnFocusTo={returnRef}
      />
    </section>
  )
}

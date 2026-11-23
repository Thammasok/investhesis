import { ImportIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useRef, useState } from 'react'
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
import { StockTable } from '@/features/stocks/components/stock-table'
import { countLabel } from '@/features/stocks/format'

export function Component() {
  const { list, members, candidates } = useLoaderData() as ListPageData
  const membership = useMembership(list.name)
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
        Import into it
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
        description={countLabel(list.stockCount, 'stock')}
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
              Rename
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={moreRef} variant="ghost" size="icon" aria-label="More actions" className="ml-auto sm:ml-0">
                  <MoreHorizontalIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="sm:hidden" onSelect={() => open('rename', moreRef)}>
                  <PencilIcon aria-hidden="true" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => open('delete', moreRef)}>
                  <Trash2Icon aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {empty ? (
        <Card className="items-center gap-3 py-12 text-center">
          <h2 className="font-heading text-lg font-semibold">This list is empty.</h2>
          <div className="flex w-full flex-wrap items-center justify-center gap-2 px-6">
            {picker}
            <span className="text-sm">or</span>
            {importLink}
          </div>
        </Card>
      ) : (
        <StockTable
          stocks={members}
          showLists={false}
          caption={`Stocks in ${list.name}`}
          renderRowAction={(stock) => (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${stock.ticker} from ${list.name}`}
              disabled={membership.busy}
              onClick={() => membership.remove(stock)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          )}
        />
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

import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useLoaderData, useRouteLoaderData } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ClassificationCard } from '@/features/stocks/components/classification-card'
import { DeleteStockDialog } from '@/features/stocks/components/delete-stock-dialog'
import { StockListsCard } from '@/features/stocks/components/stock-lists-card'
import { identityLine } from '@/features/stocks/format'
import type { StockDetailData } from '@/features/stocks/stocks-data'
import type { Stock } from '@/features/stocks/types'
import { STOCK_ROUTE_ID } from '@/routers/route-ids'

export function Component() {
  // The `:id` route loads the stock (it also gives the breadcrumb its ticker); this page loads the lists.
  const stock = useRouteLoaderData(STOCK_ROUTE_ID) as Stock
  const { lists } = useLoaderData() as StockDetailData
  const [confirmOpen, setConfirmOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)

  return (
    <section className="space-y-6">
      <PageHeader
        title={stock.ticker}
        heading={
          <>
            <span className="tabular-nums">{stock.ticker}</span>{' '}
            <span className="font-normal break-words">{stock.name}</span>
          </>
        }
        description={identityLine(stock)}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/stocks/${stock.id}/edit`}>
                <PencilIcon aria-hidden="true" />
                Edit
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={moreRef} variant="ghost" size="icon" aria-label="More actions">
                  <MoreHorizontalIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
                  <Trash2Icon aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <ClassificationCard stock={stock} className="lg:col-span-2" />
        <StockListsCard stock={stock} lists={lists} />
      </div>
      <DeleteStockDialog stock={stock} open={confirmOpen} onOpenChange={setConfirmOpen} returnFocusTo={moreRef} />
    </section>
  )
}

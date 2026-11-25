import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link, useLoaderData, useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ClassificationCard } from '@/features/stocks/components/classification-card'
import { DeleteStockDialog } from '@/features/stocks/components/delete-stock-dialog'
import { HoldingCard } from '@/features/stocks/components/holding-card'
import { StockListsCard } from '@/features/stocks/components/stock-lists-card'
import { identityLine } from '@/features/stocks/format'
import type { StockDetailData } from '@/features/stocks/stocks-data'
import type { Stock } from '@/features/stocks/types'
import { ThesisDialog, type ThesisSaved } from '@/features/theses/components/thesis-dialog'
import { ThesisLog, type FocusRequest } from '@/features/theses/components/thesis-section'
import { formatEntryDate } from '@/features/theses/format'
import type { Thesis } from '@/features/theses/types'
import { THESIS_TYPE_LABELS } from '@investhesis/domain'
import { STOCK_ROUTE_ID } from '@/routers/route-ids'

export function Component() {
  // The `:id` route loads the stock (it also gives the breadcrumb its ticker); this page loads the lists.
  const stock = useRouteLoaderData(STOCK_ROUTE_ID) as Stock
  const { lists, theses } = useLoaderData() as StockDetailData
  const [confirmOpen, setConfirmOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const [thesisOpen, setThesisOpen] = useState(false)
  const [thesisMode, setThesisMode] = useState<{ mode: 'add' } | { mode: 'edit'; entry: Thesis }>({ mode: 'add' })
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const returnFocusToSaved = useRef(false)
  const opener = useRef<HTMLElement | null>(null)
  const clearFocusRequest = useCallback(() => setFocusRequest(null), [])

  const openThesis = (next: typeof thesisMode, from: HTMLElement) => {
    // Radix would return focus to the element focused when the dialog mounted, which is the autofocused radio.
    opener.current = from
    returnFocusToSaved.current = false
    setThesisMode(next)
    setThesisOpen(true)
  }
  const saved = (result: ThesisSaved) => {
    if (result.kind === 'unchanged') toast('No changes to save')
    else {
      toast.success(result.kind === 'added' ? 'Entry added' : 'Entry updated')
      // The opener may be replaced when the list is re-read, so the section places focus once it shows the entry.
      returnFocusToSaved.current = true
      setFocusRequest({
        id: result.thesis.id,
        target: result.kind === 'added' ? 'add' : 'edit',
        updatedAt: result.thesis.updatedAt,
      })
    }
    setThesisOpen(false)
  }

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
        <div className="flex flex-col gap-6">
          <HoldingCard stock={stock} />
          <StockListsCard stock={stock} lists={lists} />
        </div>
      </div>
      <ThesisLog
        theses={theses}
        currency={stock.currency}
        addRef={addRef}
        onAdd={(event) => openThesis({ mode: 'add' }, event.currentTarget)}
        focusRequest={focusRequest}
        onFocusDone={clearFocusRequest}
        renderActions={(entry) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-thesis-edit={entry.id}
            aria-label={`Edit ${THESIS_TYPE_LABELS[entry.type]} entry of ${formatEntryDate(entry.date)}`}
            onClick={(event) => openThesis({ mode: 'edit', entry }, event.currentTarget)}
          >
            <PencilIcon aria-hidden="true" />
            Edit
          </Button>
        )}
      />
      <ThesisDialog
        mode={thesisMode.mode}
        entry={thesisMode.mode === 'edit' ? thesisMode.entry : undefined}
        stock={stock}
        open={thesisOpen}
        onOpenChange={setThesisOpen}
        onSaved={saved}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (!returnFocusToSaved.current) opener.current?.focus()
        }}
      />
      <DeleteStockDialog stock={stock} open={confirmOpen} onOpenChange={setConfirmOpen} returnFocusTo={moreRef} />
    </section>
  )
}

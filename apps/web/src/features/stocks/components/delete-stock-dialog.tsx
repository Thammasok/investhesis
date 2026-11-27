import { Loader2Icon } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SOLID_DESTRUCTIVE_LIGHT } from '@/lib/solid-destructive'
import { countLabel } from '../format'
import type { DetailActionResult } from '../stocks-data'
import type { Stock } from '../types'

type DeleteStockDialogProps = {
  stock: Stock
  /** Entries of the stock's thesis log once loaded; `null` while loading or after a failed read. */
  thesisCount: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Focus returns here when the dialog closes (the menu button that opened it). */
  returnFocusTo: React.RefObject<HTMLElement | null>
}

/** Confirms deleting a stock; focus starts on Cancel. Success redirects to /stocks from the action. */
export function DeleteStockDialog({ stock, thesisCount, open, onOpenChange, returnFocusTo }: DeleteStockDialogProps) {
  const { t } = useTranslation()
  const fetcher = useFetcher<DetailActionResult>()
  const submitted = useRef(false)
  const pending = fetcher.state !== 'idle'
  const failure = fetcher.data && !fetcher.data.ok && fetcher.data.intent === 'delete' ? fetcher.data.message : null
  const lists = stock.listIds.length

  const confirm = (event: React.MouseEvent) => {
    // Keep the dialog open until the action answers, and never send two requests.
    event.preventDefault()
    if (submitted.current) return
    submitted.current = true
    void Promise.resolve(fetcher.submit({ intent: 'delete', ticker: stock.ticker }, { method: 'post' })).finally(() => {
      submitted.current = false
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusTo.current?.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('stocks.delete.title', { ticker: stock.ticker })}</AlertDialogTitle>
          <AlertDialogDescription>
            {lists > 0 ? t('stocks.delete.removedFromLists', { lists: countLabel(lists, 'list') }) : ''}
            {thesisSentence(thesisCount, t)}
            {t('stocks.delete.cantUndo')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <Alert variant="destructive">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className={SOLID_DESTRUCTIVE_LIGHT}
            disabled={pending}
            onClick={confirm}
          >
            {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {pending ? t('stocks.delete.deleting') : t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The thesis log goes with the stock: say so with the count when it is known, generically when it is not. */
function thesisSentence(count: number | null, t: ReturnType<typeof useTranslation>['t']): string {
  if (count === null) return t('stocks.delete.thesesUnknown')
  if (count === 0) return ''
  return t('stocks.delete.thesesKnown', { count })
}

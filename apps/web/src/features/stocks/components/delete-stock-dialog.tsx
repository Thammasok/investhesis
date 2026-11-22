import { Loader2Icon } from 'lucide-react'
import { useRef } from 'react'
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
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Focus returns here when the dialog closes (the menu button that opened it). */
  returnFocusTo: React.RefObject<HTMLElement | null>
}

/** Confirms deleting a stock; focus starts on Cancel. Success redirects to /stocks from the action. */
export function DeleteStockDialog({ stock, open, onOpenChange, returnFocusTo }: DeleteStockDialogProps) {
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
          <AlertDialogTitle>Delete {stock.ticker}?</AlertDialogTitle>
          <AlertDialogDescription>
            {lists > 0 ? `It will be removed from ${countLabel(lists, 'list')}. ` : ''}This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <Alert variant="destructive">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className={SOLID_DESTRUCTIVE_LIGHT}
            disabled={pending}
            onClick={confirm}
          >
            {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {pending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

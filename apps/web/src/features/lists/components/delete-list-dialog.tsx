import { Loader2Icon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { SOLID_DESTRUCTIVE_LIGHT } from '@/lib/solid-destructive'
import { staysSaved } from '../list-name'
import type { ListActionResult } from '../lists-data'

type DeleteListDialogProps = {
  list: { id: string; name: string; stockCount: number }
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Focus returns here when the dialog closes (the menu button that opened it). */
  returnFocusTo: React.RefObject<HTMLElement | null>
}

/** Confirms deleting a list; focus starts on Cancel. On `/lists/:id` the action redirects to `/lists`. */
export function DeleteListDialog({ list, open, onOpenChange, returnFocusTo }: DeleteListDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusTo.current?.focus()
        }}
      >
        <Body list={list} onDone={() => onOpenChange(false)} />
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Body({ list, onDone }: { list: DeleteListDialogProps['list']; onDone: () => void }) {
  const { t } = useTranslation()
  const fetcher = useFetcher<ListActionResult>()
  const sending = useRef(false)
  const handled = useRef<unknown>(null)
  const pending = fetcher.state !== 'idle'
  const result = fetcher.data?.intent === 'delete' ? fetcher.data : undefined

  useEffect(() => {
    if (!result || handled.current === result) return
    handled.current = result
    sending.current = false
    if (result.ok) onDone()
  })

  const confirm = (event: React.MouseEvent) => {
    // Keep the dialog open until the action answers, and never send two requests.
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    void fetcher.submit({ intent: 'delete', listId: list.id, listName: list.name }, { method: 'post' })
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('lists.deleteDialog.title', { name: list.name })}</AlertDialogTitle>
        <AlertDialogDescription>{staysSaved(list.stockCount)}</AlertDialogDescription>
      </AlertDialogHeader>
      {result && !result.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" className={SOLID_DESTRUCTIVE_LIGHT} disabled={pending} onClick={confirm}>
          {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {pending ? t('lists.deleteDialog.deleting') : t('common.delete')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

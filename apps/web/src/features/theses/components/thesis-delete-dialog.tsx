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
import { formatEntryDate, typeLabel } from '../format'
import type { ThesisActionResult } from '../thesis-actions'
import type { Thesis } from '../types'

type ThesisDeleteDialogProps = {
  entry: Thesis | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once, with the entry the server deleted (the page offers Undo with it). */
  onDeleted: (deleted: Thesis) => void
  onCloseAutoFocus: (event: Event) => void
}

/** Confirms deleting one entry; focus starts on Cancel. The form mounts with the dialog, so each opening starts clean. */
export function ThesisDeleteDialog({ entry, open, onOpenChange, onDeleted, onCloseAutoFocus }: ThesisDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {entry ? <DeleteForm entry={entry} onDeleted={onDeleted} /> : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteForm({ entry, onDeleted }: { entry: Thesis; onDeleted: (deleted: Thesis) => void }) {
  const { t } = useTranslation()
  const fetcher = useFetcher<ThesisActionResult>()
  const sending = useRef(false)
  const handled = useRef<unknown>(null)
  const pending = fetcher.state !== 'idle'
  const result = fetcher.data
  const failure = result && !result.ok ? result.message : null

  useEffect(() => {
    if (!result || handled.current === result) return
    handled.current = result
    sending.current = false
    if (result.ok) onDeleted(result.thesis)
  })

  const confirm = (event: React.MouseEvent) => {
    // Keep the dialog open until the action answers, and never send two requests.
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    void Promise.resolve(fetcher.submit({ intent: 'delete-thesis', thesisId: entry.id }, { method: 'post' })).catch(() => {
      sending.current = false
    })
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('theses.deleteDialog.title')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('theses.deleteDialog.body', { type: typeLabel(entry.type), date: formatEntryDate(entry.date) })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {failure ? (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" className={SOLID_DESTRUCTIVE_LIGHT} aria-disabled={pending} onClick={confirm}>
          {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {pending ? t('theses.deleteDialog.deleting') : t('common.delete')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

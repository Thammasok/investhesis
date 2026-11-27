import { PencilIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import { THESIS_TYPE_LABELS } from '@investhesis/domain'
import { Button } from '@/components/ui/button'
import { formatEntryDate } from '../format'
import { RESTORE_FAILED, type ThesisActionResult } from '../thesis-actions'
import type { Thesis } from '../types'
import { ThesisDeleteDialog } from './thesis-delete-dialog'
import { ThesisDialog, type ThesisSaved } from './thesis-dialog'
import { ThesisLog, type FocusRequest } from './thesis-section'

export const UNDO_MS = 5000

type Props = {
  stock: { ticker: string; currency: 'USD' | 'THB' }
  /** The loader's unawaited read of the entries. */
  theses: Promise<Thesis[]>
  /** The number of entries once they have loaded, `null` while loading or after a failure (for the stock delete wording). */
  onCount: (count: number | null) => void
}

/** The Thesis section with its add, edit and delete dialogs, and Undo for a delete. */
export function ThesisPanel({ stock, theses, onCount }: Props) {
  const addRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Where focus goes when a dialog closes without a save. The list is re-read after any action, which remounts its
  // buttons, so the opener is found again by its attribute (or the Add ref) rather than kept as a node.
  const opener = useRef<string | 'add'>('add')
  const skipReturn = useRef(false)
  const handledRestore = useRef<unknown>(null)
  const restoreFetcher = useFetcher<ThesisActionResult>()
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; mode: 'add' } | { open: boolean; mode: 'edit'; entry: Thesis }>({ open: false, mode: 'add' })
  const [deleting, setDeleting] = useState<{ open: boolean; entry: Thesis | null }>({ open: false, entry: null })
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const clearFocusRequest = useCallback(() => setFocusRequest(null), [])

  // The stock delete dialog names the entries: keep the last count, and fall back to `null` when a read fails.
  useEffect(() => {
    let current = true
    theses.then(
      (entries) => current && onCount(entries.length),
      () => current && onCount(null),
    )
    return () => {
      current = false
    }
  }, [theses, onCount])

  useEffect(() => {
    const result = restoreFetcher.data
    if (!result || handledRestore.current === result) return
    handledRestore.current = result
    if (result.ok) toast.success('Entry restored')
    else toast.error(RESTORE_FAILED)
  }, [restoreFetcher.data])

  const openFrom = (from: string | 'add') => {
    // Radix would return focus to the element focused when the dialog mounted, which can be an autofocused control.
    opener.current = from
    skipReturn.current = false
  }
  const returnFocus = (event: Event) => {
    event.preventDefault()
    if (skipReturn.current) return
    const target = opener.current === 'add' ? addRef.current : document.querySelector<HTMLElement>(opener.current)
    target?.focus()
  }

  const saved = (result: ThesisSaved) => {
    if (result.kind === 'unchanged') toast('No changes to save')
    else {
      toast.success(result.kind === 'added' ? 'Entry added' : 'Entry updated')
      // The opener may be replaced when the list is re-read, so the section places focus once it shows the entry.
      skipReturn.current = true
      setFocusRequest({
        id: result.thesis.id,
        target: result.kind === 'added' ? 'add' : 'edit',
        updatedAt: result.thesis.updatedAt,
      })
    }
    setEntryDialog((d) => ({ ...d, open: false }))
  }

  const deleted = (entry: Thesis) => {
    skipReturn.current = true
    // The Delete button is gone with its entry, so focus moves to the Thesis heading once the list is re-read.
    setFocusRequest({ id: entry.id, target: 'heading' })
    setDeleting((d) => ({ ...d, open: false }))
    toast('Entry deleted', {
      duration: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () =>
          restoreFetcher.submit({ intent: 'restore-thesis', thesisId: '', payload: JSON.stringify({ entry }) }, { method: 'post' }),
      },
    })
  }

  return (
    <>
      <ThesisLog
        theses={theses}
        currency={stock.currency}
        addRef={addRef}
        headingRef={headingRef}
        onAdd={() => {
          openFrom('add')
          setEntryDialog({ open: true, mode: 'add' })
        }}
        focusRequest={focusRequest}
        onFocusDone={clearFocusRequest}
        renderActions={(entry) => {
          const name = `${THESIS_TYPE_LABELS[entry.type]} entry of ${formatEntryDate(entry.date)}`
          return (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-thesis-edit={entry.id}
                aria-label={`Edit ${name}`}
                onClick={() => {
                  openFrom(`[data-thesis-edit="${CSS.escape(entry.id)}"]`)
                  setEntryDialog({ open: true, mode: 'edit', entry })
                }}
              >
                <PencilIcon aria-hidden="true" />
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-thesis-delete={entry.id}
                aria-label={`Delete ${name}`}
                onClick={() => {
                  openFrom(`[data-thesis-delete="${CSS.escape(entry.id)}"]`)
                  setDeleting({ open: true, entry })
                }}
              >
                <Trash2Icon aria-hidden="true" />
                Delete
              </Button>
            </>
          )
        }}
      />
      <ThesisDialog
        mode={entryDialog.mode}
        entry={entryDialog.mode === 'edit' ? entryDialog.entry : undefined}
        stock={stock}
        open={entryDialog.open}
        onOpenChange={(open) => setEntryDialog((d) => ({ ...d, open }))}
        onSaved={saved}
        onCloseAutoFocus={returnFocus}
      />
      <ThesisDeleteDialog
        entry={deleting.entry}
        open={deleting.open}
        onOpenChange={(open) => setDeleting((d) => ({ ...d, open }))}
        onDeleted={deleted}
        onCloseAutoFocus={returnFocus}
      />
    </>
  )
}

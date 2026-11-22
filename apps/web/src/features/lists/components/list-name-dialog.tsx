import { Loader2Icon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFetcher } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { checkListName, LIST_NAME_MAX } from '../list-name'
import type { ListActionResult } from '../lists-data'

type ListNameDialogProps = {
  /** `create`, or `rename` for `list`. */
  mode: 'create' | 'rename'
  list?: { id: string; name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Focus returns here when the dialog closes (the button that opened it, even when a menu did). */
  returnFocusTo: React.RefObject<HTMLElement | null>
}

/** New list / Rename list. The form mounts with the dialog, so every opening starts clean. */
export function ListNameDialog({ mode, list, open, onOpenChange, returnFocusTo }: ListNameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusTo.current?.focus()
        }}
      >
        <NameForm mode={mode} list={list} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function NameForm({ mode, list, onDone }: { mode: 'create' | 'rename'; list?: { id: string; name: string }; onDone: () => void }) {
  const fetcher = useFetcher<ListActionResult>()
  const inputRef = useRef<HTMLInputElement>(null)
  const sending = useRef(false)
  const handled = useRef<unknown>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const pending = fetcher.state !== 'idle'
  const result = fetcher.data && fetcher.data.intent === mode ? fetcher.data : undefined
  const serverField = result && !result.ok && 'field' in result && result.field === 'name' ? result.message : null
  const formError = result && !result.ok && !serverField ? result.message : null
  const fieldError = clientError ?? serverField

  useEffect(() => {
    if (!result || handled.current === result) return
    handled.current = result
    sending.current = false
    if (result.ok) onDone()
    else if ('field' in result && result.field === 'name') inputRef.current?.focus()
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending.current) return
    const value = String(new FormData(event.currentTarget).get('name') ?? '')
    const checked = checkListName(value)
    if (!checked.ok) {
      setClientError(checked.message)
      inputRef.current?.focus()
      return
    }
    setClientError(null)
    if (mode === 'rename' && checked.name === list?.name) return onDone()
    sending.current = true
    void fetcher.submit({ intent: mode, listId: list?.id ?? '', name: checked.name }, { method: 'post' })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{mode === 'create' ? 'New list' : 'Rename list'}</DialogTitle>
      </DialogHeader>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={fieldError ? true : undefined}>
        <FieldLabel htmlFor="list-name">Name</FieldLabel>
        <Input
          id="list-name"
          name="name"
          ref={inputRef}
          autoFocus
          autoComplete="off"
          maxLength={LIST_NAME_MAX}
          defaultValue={mode === 'rename' ? list?.name : ''}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? 'list-name-error' : undefined}
          onChange={() => setClientError(null)}
        />
        {fieldError ? <FieldError id="list-name-error">{fieldError}</FieldError> : null}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {mode === 'create' ? (pending ? 'Creating…' : 'Create') : pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}

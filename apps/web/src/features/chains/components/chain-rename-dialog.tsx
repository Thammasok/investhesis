import { Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { countLabel } from '@/features/stocks/format'
import type { ChainsActionResult } from '../chains-data'
import { decideRename, RENAME_NAME_ERROR, type RenameTarget } from '../chains-model'

export const CHAIN_NAME_MAX = 60

export type RenameSaved = Extract<ChainsActionResult, { ok: true }>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The chain being renamed; kept while the dialog closes so its content does not change under the animation. */
  chain: RenameTarget | null
  /** Every chain of the investor by key, counted over all their stocks (not the view), to know a merge before sending. */
  all: ReadonlyMap<string, RenameTarget>
  /** Focus returns here on cancel. After a save the page moves focus itself, so it clears this first. */
  returnFocusTo: React.RefObject<HTMLElement | null>
  onSaved: (result: RenameSaved) => void
}

type Step = { kind: 'name' } | { kind: 'merge'; to: string; other: RenameTarget } | { kind: 'gone' }
type Problem = { message: string; field: boolean }

/** Rename chain, with the merge confirmation as a second step. The form mounts with the dialog, so every opening starts clean. */
export function ChainRenameDialog({ open, onOpenChange, chain, all, returnFocusTo, onSaved }: Props) {
  // A request in flight keeps the dialog open: closing would unmount the fetcher and drop its answer.
  const busyRef = useRef(false)
  return (
    <Dialog open={open} onOpenChange={(next) => (next || !busyRef.current) && onOpenChange(next)}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusTo.current?.focus()
        }}
      >
        {chain ? (
          <RenameForm
            chain={chain}
            all={all}
            busyRef={busyRef}
            onClose={() => onOpenChange(false)}
            onSaved={(result) => {
              onSaved(result)
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({
  chain,
  all,
  busyRef,
  onClose,
  onSaved,
}: {
  chain: RenameTarget
  all: ReadonlyMap<string, RenameTarget>
  busyRef: React.RefObject<boolean>
  onClose: () => void
  onSaved: (result: RenameSaved) => void
}) {
  const fetcher = useFetcher<ChainsActionResult>()
  const inputRef = useRef<HTMLInputElement>(null)
  const mergeTitleRef = useRef<HTMLHeadingElement>(null)
  const handled = useRef<unknown>(null)
  const returning = useRef(false)
  const [to, setTo] = useState(chain.title)
  const [step, setStep] = useState<Step>({ kind: 'name' })
  const [problem, setProblem] = useState<Problem | null>(null)
  const pending = fetcher.state !== 'idle'
  const result = fetcher.data

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    if (step.kind === 'merge') mergeTitleRef.current?.focus()
    else if (step.kind === 'name' && returning.current) {
      returning.current = false
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [step.kind])

  // Derived from the action result during render (not in an effect): the step and the problem text.
  const [seen, setSeen] = useState<ChainsActionResult | undefined>(undefined)
  if (result && result !== seen) {
    setSeen(result)
    if (!result.ok) {
      if ('needsMerge' in result) {
        setProblem(null)
        setStep({ kind: 'merge', to: to.trim(), other: { key: '', title: result.needsMerge.name, count: result.needsMerge.count } })
      } else if ('gone' in result) {
        setProblem(null)
        setStep({ kind: 'gone' })
      } else {
        const toError = result.errors?.find((e) => e.path === 'to')
        setProblem({ message: toError?.message ?? result.message, field: toError !== undefined })
      }
    }
  }

  // Side effects only: release the busy flag, report a save, move focus to a field with an error.
  useEffect(() => {
    if (!result || handled.current === result) return
    handled.current = result
    busyRef.current = false
    if (result.ok) return onSaved(result)
    if ('needsMerge' in result || 'gone' in result) return
    if (result.errors?.some((e) => e.path === 'to')) inputRef.current?.focus()
  })

  const send = (name: string, merge: boolean, total: number) => {
    busyRef.current = true
    setProblem(null)
    void fetcher.submit({ intent: 'rename-chain', from: chain.title, to: name, merge, total }, { method: 'post', encType: 'application/json' })
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busyRef.current) return
    if (step.kind === 'merge') return send(step.to, true, chain.count + step.other.count)
    const decision = decideRename(to, chain, all)
    if (decision.kind === 'invalid') {
      setProblem({ message: RENAME_NAME_ERROR, field: true })
      return inputRef.current?.focus()
    }
    if (decision.kind === 'unchanged') {
      toast('No changes to save')
      return onClose()
    }
    if (decision.kind === 'merge') {
      setProblem(null)
      return setStep({ kind: 'merge', to: decision.to, other: decision.other })
    }
    send(decision.to, false, chain.count)
  }

  const back = () => {
    setProblem(null)
    setStep({ kind: 'name' })
    returning.current = true
  }

  const spinner = pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null

  if (step.kind === 'gone')
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Rename chain</DialogTitle>
          <DialogDescription className="sr-only">This chain was changed elsewhere.</DialogDescription>
        </DialogHeader>
        <Alert variant="destructive">
          <TriangleAlertIcon className="text-destructive" aria-hidden="true" />
          <AlertTitle className="text-foreground">This chain no longer exists.</AlertTitle>
          <AlertDescription className="text-foreground">It may have been renamed elsewhere.</AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" onClick={onClose} autoFocus>
            Close
          </Button>
        </DialogFooter>
      </div>
    )

  const formAlert = problem && !problem.field ? problem.message : null
  const fieldError = problem?.field ? problem.message : null
  const alert = formAlert ? (
    <Alert variant="destructive">
      <TriangleAlertIcon className="text-destructive" aria-hidden="true" />
      <AlertDescription className="text-foreground">{formAlert}</AlertDescription>
    </Alert>
  ) : null

  if (step.kind === 'merge')
    return (
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle ref={mergeTitleRef} tabIndex={-1} className="outline-none">
            {`Merge into "${step.other.title}"?`}
          </DialogTitle>
          <DialogDescription>
            {`"${chain.title}" (${countLabel(chain.count, 'stock')}) and "${step.other.title}" (${countLabel(step.other.count, 'stock')}) will become one chain named "${step.to}". This can't be split again automatically.`}
          </DialogDescription>
        </DialogHeader>
        {alert}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={back} disabled={pending}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            {spinner}
            {`Merge ${countLabel(chain.count + step.other.count, 'stock')}`}
          </Button>
        </DialogFooter>
      </form>
    )

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Rename chain</DialogTitle>
        <DialogDescription>
          {`Changes the name on ${countLabel(chain.count, 'stock')}, including any outside this view.`}
        </DialogDescription>
      </DialogHeader>
      {alert}
      <Field data-invalid={fieldError ? true : undefined}>
        <FieldLabel htmlFor="chain-name">Chain name</FieldLabel>
        <Input
          id="chain-name"
          ref={inputRef}
          value={to}
          autoComplete="off"
          readOnly={pending}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? 'chain-name-error' : undefined}
          onChange={(e) => {
            // The limit counts code points (60 emoji fit), like the domain rule, so it is cut here, not by maxLength.
            setTo(Array.from(e.target.value).slice(0, CHAIN_NAME_MAX).join(''))
            setProblem(null)
          }}
        />
        {fieldError ? <FieldError id="chain-name-error">{fieldError}</FieldError> : null}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {spinner}
          Rename
        </Button>
      </DialogFooter>
    </form>
  )
}

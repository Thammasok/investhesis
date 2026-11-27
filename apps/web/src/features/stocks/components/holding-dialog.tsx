import { Loader2Icon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFetcher } from 'react-router'
import { HoldingInput, issueText } from '@investhesis/domain'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { decimalForInput } from '@/lib/number-format'
import { describeProblem } from '../stock-form-model'
import type { HoldingActionResult } from '../stocks-data'
import type { Holding, Stock } from '../types'

type Errors = { shares?: string; averageCost?: string }
const FIELD_LABEL = { shares: 'holdingShares', averageCost: 'holdingAverageCost' } as const

type HoldingDialogProps = {
  stock: Stock
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once with each successful save or stop, with the holding the dialog opened on (the page may already have revalidated). */
  onDone: (result: Extract<HoldingActionResult, { ok: true }>, previous: Holding | null) => void
  /** Focus goes here on close, except after Stop holding (the card decides). */
  onCloseAutoFocus: (event: Event) => void
}

/** Mark as held / Edit the holding. The form mounts with the dialog, so every opening starts from the stored values. */
export function HoldingDialog({ stock, open, onOpenChange, onDone, onCloseAutoFocus }: HoldingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <HoldingForm stock={stock} onDone={onDone} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function HoldingForm({
  stock,
  onDone,
  onCancel,
}: {
  stock: Stock
  onDone: HoldingDialogProps['onDone']
  onCancel: () => void
}) {
  const fetcher = useFetcher<HoldingActionResult>()
  const sending = useRef(false)
  const handled = useRef<unknown>(null)
  const sharesRef = useRef<HTMLInputElement>(null)
  const costRef = useRef<HTMLInputElement>(null)
  // What the dialog opened on: the page revalidates behind it after a save, so `stock.holding` moves.
  const [held] = useState(stock.holding)
  const [shares, setShares] = useState(decimalForInput(held?.shares ?? null))
  const [averageCost, setAverageCost] = useState(decimalForInput(held?.averageCost ?? null))
  const [currency, setCurrency] = useState<'USD' | 'THB'>(held?.costCurrency ?? stock.currency)
  const [clientErrors, setClientErrors] = useState<Errors>({})
  const pending = fetcher.state !== 'idle'
  const result = fetcher.data
  const serverField = result && !result.ok && result.field ? { [result.field]: result.message } : {}
  const errors: Errors = { ...serverField, ...clientErrors }
  const alert = result && !result.ok && !result.field ? result.message : null

  useEffect(() => {
    if (!result || handled.current === result) return
    handled.current = result
    sending.current = false
    if (result.ok) onDone(result, held)
    else if (result.field) (result.field === 'shares' ? sharesRef : costRef).current?.focus()
  })

  const send = (fields: Record<string, string>) => {
    if (sending.current) return
    sending.current = true
    void Promise.resolve(fetcher.submit({ ...fields, ticker: stock.ticker }, { method: 'post' })).catch(() => {
      sending.current = false
    })
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const parsed = HoldingInput.safeParse({
      shares: shares.trim() || null,
      averageCost: averageCost.trim() || null,
      costCurrency: currency,
    })
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if ((key === 'shares' || key === 'averageCost') && !next[key]) next[key] = describeProblem(FIELD_LABEL[key], issueText(issue.message))
      }
      setClientErrors(next)
      ;(next.shares ? sharesRef : costRef).current?.focus()
      return
    }
    setClientErrors({})
    send({ intent: 'set-holding', shares: shares.trim(), averageCost: averageCost.trim(), costCurrency: currency })
  }

  const clear = (key: keyof Errors) => setClientErrors(({ [key]: _gone, ...rest }) => rest)

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>Holding · {stock.ticker}</DialogTitle>
      </DialogHeader>
      {alert ? (
        <Alert variant="destructive">
          <AlertDescription>{alert}</AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={errors.shares ? true : undefined}>
        <FieldLabel htmlFor="holding-shares">Shares (optional)</FieldLabel>
        <Input
          id="holding-shares"
          ref={sharesRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          value={shares}
          disabled={pending}
          onChange={(e) => {
            setShares(e.target.value)
            clear('shares')
          }}
          className="tabular-nums"
          aria-invalid={errors.shares ? true : undefined}
          aria-describedby={errors.shares ? 'holding-shares-error' : undefined}
        />
        {errors.shares ? <FieldError id="holding-shares-error">{errors.shares}</FieldError> : null}
      </Field>
      <Field data-invalid={errors.averageCost ? true : undefined}>
        <FieldLabel htmlFor="holding-average-cost">Average cost per share (optional)</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <span aria-hidden="true">{currency === 'THB' ? '฿' : '$'}</span>
          </InputGroupAddon>
          <InputGroupInput
            id="holding-average-cost"
            ref={costRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={averageCost}
            disabled={pending}
            onChange={(e) => {
              setAverageCost(e.target.value)
              clear('averageCost')
            }}
            className="tabular-nums"
            aria-invalid={errors.averageCost ? true : undefined}
            aria-describedby={errors.averageCost ? 'holding-average-cost-error' : undefined}
          />
        </InputGroup>
        {errors.averageCost ? <FieldError id="holding-average-cost-error">{errors.averageCost}</FieldError> : null}
      </Field>
      <FieldSet>
        <FieldLegend variant="label" id="holding-currency-legend">
          Cost currency
        </FieldLegend>
        <RadioGroup
          value={currency}
          onValueChange={(next) => setCurrency(next as 'USD' | 'THB')}
          aria-labelledby="holding-currency-legend"
          disabled={pending}
          className="flex gap-4"
        >
          {(['USD', 'THB'] as const).map((c) => (
            <Field key={c} orientation="horizontal" className="w-auto">
              <RadioGroupItem value={c} id={`holding-currency-${c}`} />
              <FieldLabel htmlFor={`holding-currency-${c}`} className="font-normal">
                {c}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>
      <DialogFooter className="gap-2">
        {held ? (
          <Button
            type="button"
            variant="ghost"
            className="sm:mr-auto"
            disabled={pending}
            onClick={() => send({ intent: 'clear-holding' })}
          >
            Stop holding
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

import { Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher } from 'react-router'
import { THESIS_NOTE_MAX, THESIS_INVALIDATION_MAX, THESIS_TYPES } from '@investhesis/domain'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { typeLabel } from '../format'
import type { ThesisActionResult, ThesisField } from '../thesis-actions'
import {
  checkValues,
  createBody,
  emptyValues,
  firstInvalid,
  localToday,
  patchBody,
  valuesOf,
  type FieldErrors,
  type FormValues,
} from '../thesis-form-model'
import type { Thesis, ThesisType } from '../types'

export type ThesisSaved = { kind: 'added' | 'updated'; thesis: Thesis } | { kind: 'unchanged' }

type ThesisDialogProps = {
  mode: 'add' | 'edit'
  stock: { ticker: string; currency: 'USD' | 'THB' }
  /** The entry being edited. */
  entry?: Thesis | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once per successful save, or with `unchanged` when an edit changed nothing (no request is sent). */
  onSaved: (saved: ThesisSaved) => void
  /** Focus goes here on close; the page decides after a save, because the opener may be replaced. */
  onCloseAutoFocus: (event: Event) => void
}

/** Add or edit one entry. The form mounts with the dialog, so every opening starts from the stored values. */
export function ThesisDialog({ mode, stock, entry, open, onOpenChange, onSaved, onCloseAutoFocus }: ThesisDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
        <ThesisForm mode={mode} stock={stock} entry={entry} onSaved={onSaved} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

const count = (s: string) => [...s].length

function Counter({ id, value, max }: { id: string; value: string; max: number }) {
  const { t } = useTranslation()
  const n = count(value)
  return (
    <p id={id} aria-live="off" className={cn('text-right text-xs tabular-nums text-muted-foreground', n > max && 'font-medium text-foreground')}>
      {t('theses.dialog.counter', { n: n.toLocaleString('en-US'), max: max.toLocaleString('en-US') })}
    </p>
  )
}

function ThesisForm({
  mode,
  stock,
  entry,
  onSaved,
  onCancel,
}: Pick<ThesisDialogProps, 'mode' | 'stock' | 'entry' | 'onSaved'> & { onCancel: () => void }) {
  const { t } = useTranslation()
  const fetcher = useFetcher<ThesisActionResult>()
  const formRef = useRef<HTMLFormElement>(null)
  const sending = useRef(false)
  const handled = useRef<unknown>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const targetPriceRef = useRef<HTMLInputElement>(null)
  const invalidationRef = useRef<HTMLTextAreaElement>(null)
  // Fixed while the dialog is open, so the date limit does not move at midnight under the investor's hands.
  const [today] = useState(() => localToday())
  const [original] = useState(entry)
  const [values, setValues] = useState<FormValues>(() => (original ? valuesOf(original) : emptyValues(today)))
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const pending = fetcher.state !== 'idle'
  const result = fetcher.data
  const serverErrors: FieldErrors = {}
  if (result && !result.ok) for (const e of result.errors ?? []) serverErrors[e.field] ??= e.message
  const errors: FieldErrors = { ...serverErrors, ...clientErrors }
  const alert = result && !result.ok && !result.errors ? result.message : null
  const gone = result && !result.ok && result.gone === true

  function focusField(field: ThesisField) {
    // The radio group has no single input: focus the checked radio, or the first one.
    if (field === 'type') formRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], [role="radio"]')?.focus()
    else if (field === 'date') dateRef.current?.focus()
    else if (field === 'note') noteRef.current?.focus()
    else if (field === 'targetPrice') targetPriceRef.current?.focus()
    else invalidationRef.current?.focus()
  }

  useEffect(() => {
    if (!result || handled.current === result) return
    handled.current = result
    sending.current = false
    if (result.ok) onSaved({ kind: result.intent === 'add-thesis' ? 'added' : 'updated', thesis: result.thesis })
    else if (result.errors?.length) {
      const first = firstInvalid(Object.fromEntries(result.errors.map((e) => [e.field, e.message])))
      if (first) focusField(first)
    }
  })

  const set = (key: keyof FormValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }))
    setClientErrors(({ [key]: _gone, ...rest }) => rest)
  }

  const submit = () => {
    if (pending || sending.current) return
    const checked = checkValues(values, today)
    if (!checked.ok) {
      setClientErrors(checked.errors)
      const first = firstInvalid(checked.errors)
      if (first) focusField(first)
      return
    }
    setClientErrors({})
    if (mode === 'edit' && original) {
      const body = patchBody(checked.input, original)
      if (Object.keys(body).length === 0) {
        onSaved({ kind: 'unchanged' })
        return
      }
      send('edit-thesis', body, original.id)
    } else send('add-thesis', createBody(checked.input))
  }

  const send = (intent: string, body: unknown, thesisId = '') => {
    sending.current = true
    void Promise.resolve(
      fetcher.submit({ intent, thesisId, payload: JSON.stringify(body) }, { method: 'post' }),
    ).catch(() => {
      sending.current = false
    })
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submit()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      submit()
    }
  }

  const label = mode === 'add' ? t('theses.dialog.addTitle') : t('theses.dialog.editTitle')
  const prefix = stock.currency === 'THB' ? '฿' : '$'
  const checkedType = values.type || undefined

  return (
    <form ref={formRef} onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>
          {t('theses.dialog.titleWith', { title: label, ticker: stock.ticker })}
        </DialogTitle>
        <DialogDescription className="sr-only">{t('theses.dialog.description')}</DialogDescription>
      </DialogHeader>
      {alert ? (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{alert}</span>
            {gone ? (
              <Link to="/stocks" className="underline underline-offset-4">
                {t('theses.dialog.backToStocks')}
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldSet data-invalid={errors.type ? true : undefined}>
        <FieldLegend variant="label" id="thesis-type-legend">
          {t('theses.dialog.type')}
        </FieldLegend>
        <RadioGroup
          value={values.type}
          onValueChange={(next) => set('type', next)}
          aria-labelledby="thesis-type-legend"
          aria-invalid={errors.type ? true : undefined}
          aria-describedby={errors.type ? 'thesis-type-error' : undefined}
          disabled={pending}
          className="flex flex-wrap gap-x-4 gap-y-2"
        >
          {THESIS_TYPES.map((type: ThesisType, i) => (
            <Field key={type} orientation="horizontal" className="w-auto">
              <RadioGroupItem
                value={type}
                id={`thesis-type-${type}`}
                autoFocus={checkedType ? checkedType === type : i === 0}
              />
              <FieldLabel htmlFor={`thesis-type-${type}`} className="font-normal">
                {typeLabel(type)}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
        {errors.type ? <FieldError id="thesis-type-error">{errors.type}</FieldError> : null}
      </FieldSet>

      <Field data-invalid={errors.date ? true : undefined}>
        <FieldLabel htmlFor="thesis-date">{t('theses.dialog.date')}</FieldLabel>
        <Input
          id="thesis-date"
          ref={dateRef}
          type="date"
          max={today}
          value={values.date}
          disabled={pending}
          onChange={(e) => set('date', e.target.value)}
          className="w-44 tabular-nums"
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? 'thesis-date-error' : undefined}
        />
        {errors.date ? <FieldError id="thesis-date-error">{errors.date}</FieldError> : null}
      </Field>

      <Field data-invalid={errors.note ? true : undefined}>
        <FieldLabel htmlFor="thesis-note">{t('theses.dialog.note')}</FieldLabel>
        <Textarea
          id="thesis-note"
          ref={noteRef}
          value={values.note}
          disabled={pending}
          onChange={(e) => set('note', e.target.value)}
          className="min-h-40"
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={`thesis-note-count${errors.note ? ' thesis-note-error' : ''}`}
        />
        <Counter id="thesis-note-count" value={values.note.trim()} max={THESIS_NOTE_MAX} />
        {errors.note ? <FieldError id="thesis-note-error">{errors.note}</FieldError> : null}
      </Field>

      <Field data-invalid={errors.targetPrice ? true : undefined}>
        <FieldLabel htmlFor="thesis-target-price">{t('theses.dialog.targetPrice')}</FieldLabel>
        <InputGroup className="w-48">
          <InputGroupAddon>
            <span aria-hidden="true">{prefix}</span>
          </InputGroupAddon>
          <InputGroupInput
            id="thesis-target-price"
            ref={targetPriceRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={values.targetPrice}
            disabled={pending}
            onChange={(e) => set('targetPrice', e.target.value)}
            className="tabular-nums"
            aria-invalid={errors.targetPrice ? true : undefined}
            aria-describedby={errors.targetPrice ? 'thesis-target-price-error' : undefined}
          />
        </InputGroup>
        {errors.targetPrice ? <FieldError id="thesis-target-price-error">{errors.targetPrice}</FieldError> : null}
      </Field>

      <Field data-invalid={errors.invalidation ? true : undefined}>
        <FieldLabel htmlFor="thesis-invalidation">{t('theses.dialog.invalidation')}</FieldLabel>
        <Textarea
          id="thesis-invalidation"
          ref={invalidationRef}
          value={values.invalidation}
          disabled={pending}
          placeholder={t('theses.dialog.invalidationPlaceholder')}
          onChange={(e) => set('invalidation', e.target.value)}
          className="min-h-24"
          aria-invalid={errors.invalidation ? true : undefined}
          aria-describedby={`thesis-invalidation-count${errors.invalidation ? ' thesis-invalidation-error' : ''}`}
        />
        <Counter id="thesis-invalidation-count" value={values.invalidation.trim()} max={THESIS_INVALIDATION_MAX} />
        {errors.invalidation ? <FieldError id="thesis-invalidation-error">{errors.invalidation}</FieldError> : null}
      </Field>

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" aria-disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {mode === 'add' ? t('theses.dialog.addEntry') : t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}

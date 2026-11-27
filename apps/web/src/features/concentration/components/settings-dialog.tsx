import { Loader2Icon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import { parseDecimal, SettingsPatch } from '@investhesis/domain'
import { describeIssue } from '@/i18n/describe-issue'
import { getLanguage } from '@/i18n/language'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import type { ConcentrationActionResult, SettingsChange } from '../concentration-data'
import { formatRate, formatSavedDate, type Settings } from '../concentration-model'

export type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  /** Where focus starts: Threshold from the header button, Rate from Set rate. */
  initialFocus: 'threshold' | 'rate'
  /** The button that opened it, so focus can go back (the Set rate button may be gone after a save). */
  returnFocusTo?: React.RefObject<HTMLElement | null>
}

type Errors = { threshold?: string; rate?: string }

const sameRate = (a: string, b: string) => {
  const x = parseDecimal(a, 6)
  return x !== null && x === parseDecimal(b, 6)
}

/** Threshold and USD to THB rate. The form mounts with the dialog, so every opening starts from the saved values. */
export function ConcentrationSettingsDialog({ open, onOpenChange, settings, initialFocus, returnFocusTo }: SettingsDialogProps) {
  const thresholdRef = useRef<HTMLInputElement>(null)
  const rateRef = useRef<HTMLInputElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(initialFocus === 'rate' ? rateRef : thresholdRef).current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.current) return
          event.preventDefault()
          returnFocusTo.current.focus()
        }}
      >
        <SettingsForm
          settings={settings}
          thresholdRef={thresholdRef}
          rateRef={rateRef}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function SettingsForm({
  settings,
  thresholdRef,
  rateRef,
  onDone,
  onCancel,
}: {
  settings: Settings
  thresholdRef: React.RefObject<HTMLInputElement | null>
  rateRef: React.RefObject<HTMLInputElement | null>
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const ids = useId()
  const fetcher = useFetcher<ConcentrationActionResult>()
  const sending = useRef(false)
  const handled = useRef<unknown>(null)
  // What the dialog opened on: the page revalidates behind it after a save, so `settings` moves.
  const [saved] = useState(settings)
  const [threshold, setThreshold] = useState(String(saved.concentrationThreshold))
  const [rate, setRate] = useState(saved.usdThbRate === null ? '' : formatRate(saved.usdThbRate))
  const [clientErrors, setClientErrors] = useState<Errors>({})
  const pending = fetcher.state !== 'idle'
  const result = fetcher.data
  const failed = result && !result.ok ? result : null
  const serverErrors: Errors = {}
  for (const e of failed?.errors ?? []) {
    // A server error with a rule is worded in the current language; an older answer keeps its own text.
    const text = e.rule === undefined ? e.message : describeIssue(e, getLanguage())
    if (e.path === 'concentrationThreshold') serverErrors.threshold ??= text
    else if (e.path === 'usdThbRate') serverErrors.rate ??= text
  }
  const errors: Errors = { ...serverErrors, ...clientErrors }
  const alert = failed && !failed.errors?.length ? failed.message : null

  useEffect(() => {
    if (!result || handled.current === result) return
    handled.current = result
    sending.current = false
    if (result.ok) onDone()
    else if (serverErrors.threshold) thresholdRef.current?.focus()
    else if (serverErrors.rate) rateRef.current?.focus()
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending || sending.current) return
    const typedThreshold = threshold.trim()
    const typedRate = rate.trim()
    const candidate: Record<string, unknown> = {}
    const next: Errors = {}
    if (!/^\d+$/.test(typedThreshold)) next.threshold = t('concentration.settings.thresholdError')
    else candidate.concentrationThreshold = parseInt(typedThreshold, 10)
    if (typedRate) candidate.usdThbRate = typedRate
    const parsed = SettingsPatch.safeParse(candidate)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'concentrationThreshold') next.threshold ??= t('concentration.settings.thresholdError')
        if (issue.path[0] === 'usdThbRate') next.rate ??= t('concentration.settings.rateError')
      }
    }
    if (next.threshold || next.rate) {
      setClientErrors(next)
      ;(next.threshold ? thresholdRef : rateRef).current?.focus()
      return
    }
    setClientErrors({})

    const patch: SettingsChange = {}
    if (candidate.concentrationThreshold !== saved.concentrationThreshold)
      patch.concentrationThreshold = candidate.concentrationThreshold as number
    if (typedRate === '') {
      if (saved.usdThbRate !== null) patch.usdThbRate = null
    } else if (saved.usdThbRate === null || !sameRate(typedRate, saved.usdThbRate)) {
      patch.usdThbRate = typedRate
    }
    if (Object.keys(patch).length === 0) {
      toast(t('concentration.settings.noChanges'))
      onDone()
      return
    }
    sending.current = true
    void Promise.resolve(
      fetcher.submit({ intent: 'save-settings', patch }, { method: 'post', encType: 'application/json' }),
    ).catch(() => {
      sending.current = false
    })
  }

  const clear = (key: keyof Errors) => setClientErrors(({ [key]: _gone, ...rest }) => rest)
  const rateHelp =
    saved.usdThbRate !== null && rate.trim() !== ''
      ? saved.usdThbRateUpdatedAt
        ? t('concentration.settings.rateHelpSaved', { date: formatSavedDate(saved.usdThbRateUpdatedAt) })
        : t('concentration.settings.rateHelp')
      : t('concentration.settings.noRateHelp')
  const rateErrorId = `${ids}-rate-error`
  const rateHelpId = `${ids}-rate-help`

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t('concentration.settings.title')}</DialogTitle>
      </DialogHeader>
      {alert ? (
        <Alert variant="destructive">
          <AlertDescription>{alert}</AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={errors.threshold ? true : undefined}>
        <FieldLabel htmlFor={`${ids}-threshold`}>{t('concentration.settings.threshold')}</FieldLabel>
        <InputGroup className="w-28">
          <InputGroupInput
            id={`${ids}-threshold`}
            ref={thresholdRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={threshold}
            disabled={pending}
            onChange={(e) => {
              setThreshold(e.target.value)
              clear('threshold')
            }}
            className="tabular-nums"
            aria-invalid={errors.threshold ? true : undefined}
            aria-describedby={`${ids}-threshold-help${errors.threshold ? ` ${ids}-threshold-error` : ''}`}
          />
          <InputGroupAddon align="inline-end">
            <span aria-hidden="true">%</span>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription id={`${ids}-threshold-help`}>{t('concentration.settings.thresholdHelp')}</FieldDescription>
        {errors.threshold ? <FieldError id={`${ids}-threshold-error`}>{errors.threshold}</FieldError> : null}
      </Field>
      <Field data-invalid={errors.rate ? true : undefined}>
        <div className="flex items-center gap-2">
          <span id={`${ids}-rate-prefix`} className="text-sm">
            {t('concentration.settings.ratePrefix')}
          </span>
          <InputGroup className="w-40">
            <InputGroupInput
              id={`${ids}-rate`}
              ref={rateRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label={t('concentration.settings.rateLabel')}
              value={rate}
              disabled={pending}
              onChange={(e) => {
                setRate(e.target.value)
                clear('rate')
              }}
              className="tabular-nums"
              aria-invalid={errors.rate ? true : undefined}
              aria-describedby={`${rateHelpId}${errors.rate ? ` ${rateErrorId}` : ''}`}
            />
            <InputGroupAddon align="inline-end">
              <span aria-hidden="true">{'THB'}</span>
            </InputGroupAddon>
          </InputGroup>
        </div>
        <FieldDescription id={rateHelpId}>{rateHelp}</FieldDescription>
        {errors.rate ? <FieldError id={rateErrorId}>{errors.rate}</FieldError> : null}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || rate === ''}
            onClick={() => {
              setRate('')
              clear('rate')
              rateRef.current?.focus()
            }}
          >
            {t('concentration.settings.clearRate')}
          </Button>
        </div>
      </Field>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {t('concentration.settings.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}

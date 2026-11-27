import { CircleCheckIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { groupText, settingsLine, type Plan, type Settings } from '../concentration-model'

/** The flagged-groups summary. `role="status"`, not an alert: a regroup that changes the flags is announced politely. */
export function FlagSummary({ plan, settings, lensKey }: { plan: Plan; settings: Settings; lensKey: string }) {
  const { t } = useTranslation()
  const by = plan.measure === 'value' ? t('concentration.summary.byValue') : t('concentration.summary.byCount')
  const threshold = settings.concentrationThreshold
  const n = plan.flagged.length
  return (
    <Alert role="status">
      {n === 0 ? <CircleCheckIcon aria-hidden="true" /> : <TriangleAlertIcon aria-hidden="true" className="text-destructive" />}
      <AlertTitle>
        {n === 0
          ? t('concentration.summary.none', { threshold, by })
          : t('concentration.summary.flagged', { count: n, threshold, by })}
      </AlertTitle>
      <AlertDescription>
        {n > 0 ? (
          <ul>
            {plan.flagged.map((g) => (
              <li key={g.label}>{`${groupText(lensKey, g)} — ${plan.measure === 'value' ? g.valueShare : g.countShare}%`}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-muted-foreground">{settingsLine(settings)}</p>
      </AlertDescription>
    </Alert>
  )
}

/** One note per correction made to the address. */
export function FallbackNotes({ notes }: { notes: readonly string[] }) {
  return notes.map((note) => (
    <Alert key={note} role="status">
      <InfoIcon aria-hidden="true" />
      <AlertDescription>{note}</AlertDescription>
    </Alert>
  ))
}

import { CircleCheckIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { settingsLine, type Plan, type Settings } from '../concentration-model'

/** The flagged-groups summary. `role="status"`, not an alert: a regroup that changes the flags is announced politely. */
export function FlagSummary({ plan, settings }: { plan: Plan; settings: Settings }) {
  const by = plan.measure === 'value' ? 'value at cost' : 'the stocks'
  const threshold = settings.concentrationThreshold
  const n = plan.flagged.length
  return (
    <Alert role="status">
      {n === 0 ? <CircleCheckIcon aria-hidden="true" /> : <TriangleAlertIcon aria-hidden="true" className="text-destructive" />}
      <AlertTitle>
        {n === 0 ? `No group at ${threshold}% or more of ${by}` : `${n} ${n === 1 ? 'group' : 'groups'} at ${threshold}% or more of ${by}`}
      </AlertTitle>
      <AlertDescription>
        {n > 0 ? (
          <ul>
            {plan.flagged.map((g) => (
              <li key={g.label}>{`${g.label} — ${plan.measure === 'value' ? g.valueShare : g.countShare}%`}</li>
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

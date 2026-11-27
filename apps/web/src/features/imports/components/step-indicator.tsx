import { cn } from '@/lib/utils'

export type WizardStep = 'file' | 'review' | 'done'

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'file', label: 'File' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]

/** The three-step indicator; the current step carries `aria-current="step"`. */
export function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <ol aria-label="Import steps" className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
      {STEPS.map((step, index) => {
        const active = step.id === current
        return (
          <li
            key={step.id}
            aria-current={active ? 'step' : undefined}
            className={cn("flex items-center gap-2 not-first:before:content-['–']", active ? 'font-medium text-foreground' : 'text-muted-foreground')}
          >
            <span aria-hidden="true" className="tabular-nums">
              {index + 1}
            </span>
            <span>{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

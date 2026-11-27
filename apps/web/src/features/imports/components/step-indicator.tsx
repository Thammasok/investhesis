import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export type WizardStep = 'file' | 'review' | 'done'

const STEPS: WizardStep[] = ['file', 'review', 'done']

/** The three-step indicator; the current step carries `aria-current="step"`. */
export function StepIndicator({ current }: { current: WizardStep }) {
  const { t } = useTranslation()
  return (
    <ol aria-label={t('imports.stepsLabel')} className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
      {STEPS.map((step, index) => {
        const active = step === current
        return (
          <li
            key={step}
            aria-current={active ? 'step' : undefined}
            className={cn("flex items-center gap-2 not-first:before:content-['–']", active ? 'font-medium text-foreground' : 'text-muted-foreground')}
          >
            <span aria-hidden="true" className="tabular-nums">
              {index + 1}
            </span>
            <span>{t(`imports.steps.${step}`)}</span>
          </li>
        )
      })}
    </ol>
  )
}

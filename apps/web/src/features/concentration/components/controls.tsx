import { CONCENTRATION_LENSES } from '@investhesis/domain'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ListSummary, Stock } from '@/features/stocks/types'
import { lensName, type Measure, type Plan, type View } from '../concentration-model'
import { ScopeSelect } from '@/features/stock-filters/scope-select'

type Props = {
  view: View
  plan: Plan
  stocks: readonly Stock[]
  lists: readonly ListSummary[]
  onChange: (next: { scope?: string; lensKey?: string; measure?: Measure }) => void
  onSetRate: () => void
}

/** Scope, Group by and Measure (ux-design.md §Concentration). Changing one navigates with `replace`; focus stays put. */
export function Controls({ view, plan, stocks, lists, onChange, onSetRate }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-end gap-4">
      <ScopeSelect scope={view.scope} stocks={stocks} lists={lists} onChange={(scope) => onChange({ scope })} />
      <Field className="w-full sm:w-56">
        <FieldLabel htmlFor="concentration-lens">{t('concentration.controls.groupBy')}</FieldLabel>
        <Select value={view.lens.key} onValueChange={(lensKey) => onChange({ lensKey })}>
          <SelectTrigger id="concentration-lens" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONCENTRATION_LENSES.map((lens) => (
              <SelectItem key={lens.key} value={lens.key}>
                {lensName(lens)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <FieldSet className="w-full gap-2">
        <FieldLegend variant="label" className="mb-0">
          {t('concentration.controls.measure')}
        </FieldLegend>
        <RadioGroup
          value={plan.measure}
          onValueChange={(measure) => onChange({ measure: measure as Measure })}
          className="flex w-full gap-4"
          aria-describedby={plan.value.available ? undefined : 'concentration-measure-reason'}
        >
          <Field orientation="horizontal" className="w-auto">
            <RadioGroupItem value="count" id="concentration-measure-count" />
            <FieldLabel htmlFor="concentration-measure-count">{t('concentration.controls.count')}</FieldLabel>
          </Field>
          <Field orientation="horizontal" className="w-auto" data-disabled={!plan.value.available}>
            <RadioGroupItem value="value" id="concentration-measure-value" disabled={!plan.value.available} />
            <FieldLabel htmlFor="concentration-measure-value">{t('concentration.controls.value')}</FieldLabel>
          </Field>
        </RadioGroup>
        {plan.value.available ? null : (
          <FieldDescription id="concentration-measure-reason">
            {plan.value.reason === 'needs-rate' ? (
              <>
                {t('concentration.controls.needsRate')}{' '}
                <Button variant="link" size="sm" className="h-auto p-0" onClick={onSetRate}>
                  {t('concentration.controls.setRate')}
                </Button>
              </>
            ) : (
              <>
                {t('concentration.controls.noAmount')}{' '}
                <Link to="/stocks" className="underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {t('concentration.controls.markHoldings')}
                </Link>
              </>
            )}
          </FieldDescription>
        )}
      </FieldSet>
    </div>
  )
}

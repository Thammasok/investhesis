import { CONCENTRATION_LENSES } from '@investhesis/domain'
import { Link } from 'react-router'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ListSummary, Stock } from '@/features/stocks/types'
import type { Measure, Plan, View } from '../concentration-model'
import { stocksInScope } from '../concentration-model'

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
  const held = stocks.filter((s) => s.holding !== null).length
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Field className="w-full sm:w-56">
        <FieldLabel htmlFor="concentration-scope">Scope</FieldLabel>
        <Select value={view.scope} onValueChange={(scope) => onChange({ scope })}>
          <SelectTrigger id="concentration-scope" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stocks ({stocks.length})</SelectItem>
            <SelectItem value="held">Held stocks ({held})</SelectItem>
            {lists.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Lists</SelectLabel>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name} ({stocksInScope(stocks, list.id).length})
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
      </Field>
      <Field className="w-full sm:w-56">
        <FieldLabel htmlFor="concentration-lens">Group by</FieldLabel>
        <Select value={view.lens.key} onValueChange={(lensKey) => onChange({ lensKey })}>
          <SelectTrigger id="concentration-lens" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONCENTRATION_LENSES.map((lens) => (
              <SelectItem key={lens.key} value={lens.key}>
                {lens.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <FieldSet className="w-full gap-2">
        <FieldLegend variant="label" className="mb-0">
          Measure
        </FieldLegend>
        <RadioGroup
          value={plan.measure}
          onValueChange={(measure) => onChange({ measure: measure as Measure })}
          className="flex w-full gap-4"
          aria-describedby={plan.value.available ? undefined : 'concentration-measure-reason'}
        >
          <Field orientation="horizontal" className="w-auto">
            <RadioGroupItem value="count" id="concentration-measure-count" />
            <FieldLabel htmlFor="concentration-measure-count">Count</FieldLabel>
          </Field>
          <Field orientation="horizontal" className="w-auto" data-disabled={!plan.value.available}>
            <RadioGroupItem value="value" id="concentration-measure-value" disabled={!plan.value.available} />
            <FieldLabel htmlFor="concentration-measure-value">Value at cost</FieldLabel>
          </Field>
        </RadioGroup>
        {plan.value.available ? null : (
          <FieldDescription id="concentration-measure-reason">
            {plan.value.reason === 'needs-rate' ? (
              <>
                USD holdings in this scope need an exchange rate. Save a rate to see value at cost.{' '}
                <Button variant="link" size="sm" className="h-auto p-0" onClick={onSetRate}>
                  Set rate
                </Button>
              </>
            ) : (
              <>
                No held stock in this scope has shares and cost.{' '}
                <Link to="/stocks" className="underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  Mark holdings on a stock's page.
                </Link>
              </>
            )}
          </FieldDescription>
        )}
      </FieldSet>
    </div>
  )
}

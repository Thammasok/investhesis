import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ListSummary, Stock } from '@/features/stocks/types'
import { stocksInScope } from './scope'

type Props = {
  scope: string
  stocks: readonly Stock[]
  lists: readonly ListSummary[]
  onChange: (scope: string) => void
  /** Id of the trigger, so a page can label or test it. */
  id?: string
}

/** The Scope select: All, Held and a Lists group, each with its count. Shared by `/concentration` and `/chains`. */
export function ScopeSelect({ scope, stocks, lists, onChange, id = 'concentration-scope' }: Props) {
  const held = stocks.filter((s) => s.holding !== null).length
  return (
    <Field className="w-full sm:w-56">
      <FieldLabel htmlFor={id}>Scope</FieldLabel>
      <Select value={scope} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
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
  )
}

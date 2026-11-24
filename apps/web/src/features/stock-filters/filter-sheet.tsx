import { ChevronRightIcon, ListFilterIcon } from 'lucide-react'
import { useId, useState, useSyncExternalStore } from 'react'
import {
  STOCK_FILTERS,
  type FilterKey,
  type FilterOption,
  type StockFilter,
} from '@investhesis/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { countLabel } from '@/features/stocks/format'
import { valueLabel } from './filter-labels'
import type { StockFilters } from './use-stock-filters'

const FIND_FROM = 8
const BELOW_SM = '(max-width: 639px)'
const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(BELOW_SM)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}
/** The sheet is a bottom sheet below `sm` and a side sheet from `sm` (ux-design.md: Filter sheet). */
const useBelowSm = () => useSyncExternalStore(subscribe, () => window.matchMedia(BELOW_SM).matches, () => false)

type SectionProps = {
  filter: StockFilter
  options: readonly FilterOption[]
  picked: ReadonlySet<string | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggle: (value: string | null) => void
}

function FilterSection({ filter, options, picked, open, onOpenChange, onToggle }: SectionProps) {
  const base = useId()
  const [find, setFind] = useState('')
  const hasFind = options.filter((o) => o.value !== null).length > FIND_FROM
  const needle = find.trim().toLocaleLowerCase('en')
  // Picked options always stay visible; "Not set" is not searched.
  const matches = (o: FilterOption) => o.value !== null && (o.value as string).toLocaleLowerCase('en').includes(needle)
  const visible = options.filter((o) => needle === '' || o.value === null || picked.has(o.value) || matches(o))
  const noMatch = needle !== '' && !options.some(matches)

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border-b last:border-b-0">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between px-0 hover:bg-transparent">
          <span>
            {filter.label}
            {picked.size > 0 ? <span className="ml-1 tabular-nums">({picked.size})</span> : null}
          </span>
          <ChevronRightIcon
            className="size-4 transition-transform data-[state=open]:rotate-90 motion-reduce:transition-none"
            data-state={open ? 'open' : 'closed'}
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <fieldset className="space-y-0.5 pb-3">
          <legend className="sr-only">{filter.label}</legend>
          {hasFind ? (
            <Input
              type="search"
              className="mb-2 h-8"
              aria-label={`Find in ${filter.label}`}
              placeholder="Find"
              value={find}
              onChange={(event) => setFind(event.target.value)}
            />
          ) : null}
          {visible.map((option, i) => {
            const id = `${base}-${i}`
            const text = valueLabel(filter.key, option.value)
            return (
              <div key={option.value ?? '__not_set__'} className="flex items-center gap-2 py-1.5">
                <Checkbox
                  id={id}
                  checked={picked.has(option.value)}
                  onCheckedChange={() => onToggle(option.value)}
                />
                <Label htmlFor={id} className="flex flex-1 cursor-pointer items-center gap-2 font-normal">
                  <span className={cn(option.value === null && 'italic')}>{text}</span>
                  <span
                    aria-hidden="true"
                    className={cn('ml-auto tabular-nums', option.count === 0 && 'text-muted-foreground')}
                  >
                    {option.count}
                  </span>
                  <span className="sr-only">, {countLabel(option.count, 'stock')}</span>
                </Label>
              </div>
            )
          })}
          {noMatch ? <p className="py-1 text-sm text-muted-foreground">No match</p> : null}
        </fieldset>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** The filter panel: a sheet with one section per filter, picks applied at once (ux-design.md: Filter sheet). */
export function FilterSheet({ filters, countText }: { filters: StockFilters; countText: string }) {
  const [open, setOpen] = useState(false)
  const bottom = useBelowSm()
  const active = filters.activeCount

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="flex-1 sm:flex-none"
          aria-label={active > 0 ? `Filters, ${active} active` : 'Filters'}
        >
          <ListFilterIcon aria-hidden="true" />
          <span aria-hidden={active > 0 ? 'true' : undefined}>Filters</span>
          {active > 0 ? (
            <Badge variant="secondary" aria-hidden="true" className="tabular-nums">
              {active}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side={bottom ? 'bottom' : 'right'} className={cn('gap-0 p-0', bottom && 'max-h-[85svh]')}>
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription aria-live="polite" className="tabular-nums">
            {countText}
          </SheetDescription>
        </SheetHeader>
        {open ? <SheetBody filters={filters} /> : null}
        <SheetFooter className="flex-row justify-between border-t">
          <Button variant="ghost" disabled={active === 0} onClick={() => filters.clearFilters()}>
            Clear all
          </Button>
          <SheetClose asChild>
            <Button className="tabular-nums">Show {countLabel(filters.shown.length, 'stock')}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** Mounted per opening, so the first open sections are decided from what is active then. */
function SheetBody({ filters }: { filters: StockFilters }) {
  const [openKeys, setOpenKeys] = useState<ReadonlySet<FilterKey>>(
    () =>
      new Set<FilterKey>([
        'market',
        'held',
        ...STOCK_FILTERS.filter((f) => (filters.state.picks.get(f.key)?.size ?? 0) > 0).map((f) => f.key),
      ]),
  )
  const toggleOpen = (key: FilterKey, next: boolean) =>
    setOpenKeys((prev) => {
      const out = new Set(prev)
      if (next) out.add(key)
      else out.delete(key)
      return out
    })

  return (
    <div className="flex-1 overflow-y-auto px-4">
      {STOCK_FILTERS.map((filter) => {
        const picked = filters.state.picks.get(filter.key) ?? new Set<string | null>()
        return (
          <FilterSection
            key={filter.key}
            filter={filter}
            options={filters.options[filter.key]}
            picked={picked}
            open={openKeys.has(filter.key)}
            onOpenChange={(next) => toggleOpen(filter.key, next)}
            onToggle={(value) => {
              const next = new Set(picked)
              if (next.has(value)) next.delete(value)
              else next.add(value)
              filters.setPicks(filter.key, next)
            }}
          />
        )
      })}
    </div>
  )
}

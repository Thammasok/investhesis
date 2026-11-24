import { SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { FilterSheet } from './filter-sheet'
import { activeFilters } from './filter-labels'
import { SEARCH_ID, resultText } from './filter-toolbar-model'
import type { StockFilters } from './use-stock-filters'

type FilterToolbarProps = {
  filters: StockFilters
  /** Words after the count, e.g. " in scope" on the concentration page. */
  countSuffix?: string
  /** Right of Filters on the toolbar row (the Export menu). */
  actions?: ReactNode
  /** Right end of the result line (See concentration). */
  trailing?: ReactNode
}

/**
 * Search, the Filters sheet and the result line (count, active filters, Clear all) shared by the
 * stocks table pages and the concentration page (ux-design.md: Filter toolbar).
 */
export function FilterToolbar({ filters, countSuffix = '', actions, trailing }: FilterToolbarProps) {
  const { state, setQuery, setPicks, clearFilters } = filters
  const searchRef = useRef<HTMLInputElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)

  // The box keeps its own text, because the address trims it (a typed trailing space must survive)
  // and lags a keystroke behind. `sent` holds what was written since the address last matched the box,
  // so an echo of an earlier keystroke never overwrites newer text; anything else (Back, a link, Clear
  // all) is an outside change and replaces the text.
  const [text, setText] = useState(state.q)
  const textRef = useRef(text)
  useLayoutEffect(() => {
    textRef.current = text
  })
  const sent = useRef(new Set<string>())
  useEffect(() => {
    if (state.q === textRef.current.trim()) sent.current.clear()
    else if (!sent.current.has(state.q)) {
      sent.current.clear()
      setText(state.q)
    }
  }, [state.q])

  const type = (value: string) => {
    setText(value)
    sent.current.add(value.trim())
    setQuery(value)
  }
  const badges = activeFilters(state)
  const searchText = state.q.trim()
  const anyActive = searchText !== '' || badges.length > 0

  // After a removal, focus the badge now at that place, or the search box when none is left. The address
  // changes a moment after the click, so wait until the number of badges has actually changed.
  const focusAfter = useRef<{ index: number; before: number } | null>(null)
  useLayoutEffect(() => {
    const pending = focusAfter.current
    if (!pending) return
    const buttons = lineRef.current?.querySelectorAll<HTMLButtonElement>('[data-remove]') ?? []
    if (buttons.length === pending.before) return
    focusAfter.current = null
    ;(buttons[Math.min(pending.index, buttons.length - 1)] ?? searchRef.current)?.focus()
  })

  const remove = (index: number, run: () => void) => {
    focusAfter.current = { index, before: lineRef.current?.querySelectorAll('[data-remove]').length ?? 0 }
    run()
  }
  const clearAll = () => {
    focusAfter.current = null
    setText('')
    sent.current.clear()
    clearFilters(true)
    searchRef.current?.focus()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-80">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            id={SEARCH_ID}
            type="search"
            aria-label="Search stocks"
            placeholder="Search ticker, name or theme"
            value={text}
            onChange={(event) => type(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && text !== '') {
                event.preventDefault()
                type('')
              }
            }}
          />
          {text !== '' ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => {
                type('')
                searchRef.current?.focus()
              }}>
                <XIcon aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <div className="flex w-full gap-2 sm:contents">
          <FilterSheet filters={filters} countText={resultText(filters, countSuffix)} />
          {actions ? <div className="flex-1 sm:ml-auto sm:flex-none [&>*]:w-full sm:[&>*]:w-auto">{actions}</div> : null}
        </div>
      </div>

      <div ref={lineRef} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <p role="status" aria-live="polite" className="font-medium tabular-nums">
          {resultText(filters, countSuffix)}
        </p>
        {searchText !== '' ? (
          <ActiveBadge
            text={`Search: ${searchText}`}
            removeLabel={`Remove search: ${searchText}`}
            onRemove={() => remove(0, () => type(''))}
          />
        ) : null}
        {badges.map((badge, i) => (
          <ActiveBadge
            key={badge.key}
            text={badge.text}
            removeLabel={`Remove filter ${badge.text}`}
            onRemove={() => remove(i + (searchText !== '' ? 1 : 0), () => setPicks(badge.key, null))}
          />
        ))}
        {anyActive ? (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={clearAll}>
            Clear all
          </Button>
        ) : null}
        {trailing ? <div className="sm:ml-auto">{trailing}</div> : null}
      </div>
    </div>
  )
}

function ActiveBadge({ text, removeLabel, onRemove }: { text: string; removeLabel: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="max-w-64 gap-1 pr-0.5" title={text}>
      <span className="truncate">{text}</span>
      <button
        type="button"
        data-remove=""
        aria-label={removeLabel}
        onClick={onRemove}
        className="rounded-sm p-0.5 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <XIcon className="size-3" aria-hidden="true" />
      </button>
    </Badge>
  )
}

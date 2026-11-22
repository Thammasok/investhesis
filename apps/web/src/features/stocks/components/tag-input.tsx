import { XIcon } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const THEMES_MAX = 20
export const THEME_MAX_LENGTH = 40

type TagInputProps = {
  id: string
  /** The list's accessible name (`Themes`). */
  label: string
  value: string[]
  onChange: (next: string[]) => void
  invalid?: boolean
  describedBy?: string
  /** `data-field` hook so the form can focus the first invalid control. */
  dataField?: string
}

/**
 * Free-text tags (each at most 40 characters, held by the input's `maxLength`) (ux-design.md §Add stock): Enter or `,` adds, Backspace in an empty input removes the
 * last tag, duplicates (case-insensitive) are ignored. Enter never reaches the form, and a key pressed
 * while an IME composes is left alone.
 */
export function TagInput({ id, label, value, onChange, invalid, describedBy, dataField }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const full = value.length >= THEMES_MAX

  const commit = () => {
    const text = draft.trim()
    if (!text) return
    if (!value.some((tag) => tag.toLowerCase() === text.toLowerCase())) onChange([...value, text])
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const hintId = `${id}-hint`
  const hint = full ? `${THEMES_MAX} themes max` : null
  const describedIds = [describedBy, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined

  return (
    <div>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/50',
          invalid && 'border-destructive',
        )}
      >
        {value.length > 0 ? (
          <ul aria-label={label} className="contents">
            {value.map((tag) => (
              <li key={tag} className="contents">
                <Badge variant="secondary" className="gap-0.5 pr-0.5">
                  {tag}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove theme ${tag}`}
                    onClick={() => onChange(value.filter((t) => t !== tag))}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          id={id}
          data-field={dataField}
          aria-label="Add theme"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedIds}
          autoComplete="off"
          maxLength={THEME_MAX_LENGTH}
          disabled={full}
          value={draft}
          placeholder={value.length === 0 ? 'Type and press Enter' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className="min-w-32 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

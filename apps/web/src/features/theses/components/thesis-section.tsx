import { Loader2Icon, PlusIcon, TriangleAlertIcon } from 'lucide-react'
import { Suspense, useEffect, useId, useState } from 'react'
import { Await, useAsyncError, useRevalidator } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { entryCount } from '../format'
import type { Thesis } from '../types'
import { ThesisEntryCard } from './thesis-entry-card'

type Shell = {
  /** Entries loaded (shows the count and Add entry); `null` while loading or failed. */
  count: number | null
  onAdd?: (() => void) | undefined
  addRef?: React.Ref<HTMLButtonElement> | undefined
  headingRef?: React.Ref<HTMLHeadingElement> | undefined
  /** A function gets the heading's id, to name a list by the section heading. */
  children: React.ReactNode | ((titleId: string) => React.ReactNode)
}

/** The card around every state, so the heading stays put while the entries load. */
function ThesisCard({ count, onAdd, addRef, headingRef, children }: Shell) {
  const titleId = useId()
  const countId = useId()
  // The count and Add entry show once there is something to count; the empty state has its own button.
  const loaded = count !== null && count > 0
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-x-2">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} aria-describedby={loaded ? countId : undefined}>
            Thesis
          </h2>
          {!loaded ? null : (
            <span id={countId} className="text-sm font-normal text-muted-foreground">
              {entryCount(count ?? 0)}
            </span>
          )}
        </CardTitle>
        {loaded ? (
          <CardAction>
            <Button ref={addRef} type="button" variant="outline" size="sm" onClick={onAdd}>
              <PlusIcon aria-hidden="true" />
              Add entry
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">{typeof children === 'function' ? children(titleId) : children}</CardContent>
    </Card>
  )
}

export function ThesisSkeleton() {
  return (
    <ThesisCard count={null}>
      <div aria-busy="true" className="space-y-3">
        <span className="sr-only">Loading thesis entries</span>
        <Skeleton className="h-4 w-[30%] motion-reduce:animate-none" />
        <Skeleton className="h-4 w-[90%] motion-reduce:animate-none" />
        <Skeleton className="h-4 w-[60%] motion-reduce:animate-none" />
      </div>
    </ThesisCard>
  )
}

/** The entries failed to load: the rest of the page keeps working, and Retry re-runs the loaders. */
export function ThesisLoadError() {
  const revalidator = useRevalidator()
  // Read the failure so it counts as handled; the section never shows its text (it may name a server).
  useAsyncError()
  const retrying = revalidator.state !== 'idle'
  return (
    <ThesisCard count={null}>
      <Alert>
        <TriangleAlertIcon aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>Couldn&apos;t load the thesis entries.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-disabled={retrying}
            onClick={() => {
              if (!retrying) void revalidator.revalidate()
            }}
          >
            {retrying ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </ThesisCard>
  )
}

export type ThesisSectionProps = {
  entries: readonly Thesis[]
  currency: 'USD' | 'THB'
  /** Opens the add dialog (T-006); the section only places the buttons. */
  onAdd?: () => void
  addRef?: React.Ref<HTMLButtonElement>
  headingRef?: React.Ref<HTMLHeadingElement>
  /** Edit and Delete buttons of one entry (T-006, T-007). */
  renderActions?: (entry: Thesis) => React.ReactNode
  /**
   * After a save, focus returns to the opener once the saved entry is on screen: the list is re-read, the
   * section remounts, and the opener of the old list is gone. `edit` also waits for the new `updatedAt`.
   */
  focusRequest?: FocusRequest | null
  onFocusDone?: () => void
}

export type FocusRequest = { id: string; target: 'add' | 'edit'; updatedAt: string } | { id: string; target: 'heading' }

/** The loaded section: the entries, newest first as the API sorts them, or the empty state. */
export function ThesisSection({ entries, currency, onAdd, addRef, headingRef, renderActions, focusRequest, onFocusDone }: ThesisSectionProps) {
  useEffect(() => {
    if (!focusRequest) return
    const saved = entries.find((e) => e.id === focusRequest.id)
    if (focusRequest.target === 'heading') {
      // A delete: wait until the re-read list no longer has the entry, then land on the heading (its button is gone).
      if (saved) return
      ;(headingRef as React.RefObject<HTMLHeadingElement | null> | undefined)?.current?.focus()
      onFocusDone?.()
      return
    }
    if (!saved || (focusRequest.target === 'edit' && saved.updatedAt !== focusRequest.updatedAt)) return
    const button =
      focusRequest.target === 'edit'
        ? document.querySelector<HTMLElement>(`[data-thesis-edit="${CSS.escape(focusRequest.id)}"]`)
        : (addRef as React.RefObject<HTMLButtonElement | null> | undefined)?.current
    button?.focus()
    onFocusDone?.()
  }, [entries, focusRequest, addRef, headingRef, onFocusDone])
  return (
    <ThesisCard count={entries.length} onAdd={onAdd} addRef={addRef} headingRef={headingRef}>
      {(titleId) => (
        <>
      <p className="text-xs text-muted-foreground">Your own reasoning, not advice.</p>
      {entries.length === 0 ? (
        <div className="py-8 text-center">
          <h3 className="font-medium">No thesis yet</h3>
          <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
            Write down why you hold or watch this stock, so you can check it later.
          </p>
          <Button ref={addRef} type="button" size="sm" className="mt-4" onClick={onAdd}>
            <PlusIcon aria-hidden="true" />
            Add first entry
          </Button>
        </div>
      ) : (
        <ol aria-labelledby={titleId}>
          {entries.map((entry, i) => (
            <li key={entry.id}>
              {i > 0 ? <Separator className="my-4" /> : null}
              <ThesisEntryCard entry={entry} currency={currency} actions={renderActions?.(entry)} />
            </li>
          ))}
        </ol>
      )}
        </>
      )}
    </ThesisCard>
  )
}

type ThesisLogProps = Omit<ThesisSectionProps, 'entries'> & {
  /** The loader's unawaited `GET /stocks/:id/theses` (design.md ADR-004). */
  theses: Promise<Thesis[]>
}

// `Await` keeps a rejection until it remounts, so each read gets its own key: Retry must show the new answer.
const readIds = new WeakMap<Promise<unknown>, number>()
let nextReadId = 0
const readId = (read: Promise<unknown>): number => {
  let id = readIds.get(read)
  if (id === undefined) readIds.set(read, (id = nextReadId++))
  return id
}

/** Hands the resolved list up, so the next re-read can keep showing it. */
function Remember({ entries, onResolved, children }: { entries: Thesis[]; onResolved: (entries: Thesis[]) => void; children: React.ReactNode }) {
  useEffect(() => onResolved(entries), [entries, onResolved])
  return children
}

/**
 * Streams the entries in: the skeleton shows only until the first answer. After a save or a delete the
 * router re-reads, and the last list stays on screen until the new one arrives (no skeleton flash).
 * A failure shows the section error, never the route error page.
 */
export function ThesisLog({ theses, ...section }: ThesisLogProps) {
  const [last, setLast] = useState<readonly Thesis[] | null>(null)
  return (
    <Suspense fallback={last ? <ThesisSection entries={last} {...section} /> : <ThesisSkeleton />}>
      <Await key={readId(theses)} resolve={theses} errorElement={<ThesisLoadError />}>
        {(entries: Thesis[]) => (
          <Remember entries={entries} onResolved={setLast}>
            <ThesisSection entries={entries} {...section} />
          </Remember>
        )}
      </Await>
    </Suspense>
  )
}

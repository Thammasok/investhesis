import { useEffect, useRef, type ReactNode } from 'react'

type PageHeaderProps = {
  /** Plain text: the tab title (`<title> · Investhesis`) and, unless `heading` is given, the h1. */
  title: string
  heading?: ReactNode
  description?: ReactNode
  /** Buttons on the right; below `sm` they wrap under the title. */
  actions?: ReactNode
}

/**
 * Page header of ux-design.md §Shared patterns. Sets the tab title and focuses the h1 so a route
 * change is announced to screen readers.
 */
export function PageHeader({ title, heading, description, actions }: PageHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${title} · Investhesis`
    headingRef.current?.focus()
  }, [title])

  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none">
          {heading ?? title}
        </h1>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div> : null}
    </header>
  )
}

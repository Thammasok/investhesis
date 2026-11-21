import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The centred h1 and lead of every auth page. It sets `document.title` and takes focus on mount,
 * so a screen reader announces the new page after a client-side navigation.
 */
export function AuthHeading({
  title,
  docTitle = title,
  children,
}: {
  title: string
  /** The tab title when it differs from the heading. */
  docTitle?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${docTitle} · Investhesis`
    ref.current?.focus()
  }, [docTitle])

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <h1 ref={ref} tabIndex={-1} className="text-2xl font-bold outline-none">
        {title}
      </h1>
      {children ? <p className="text-sm text-balance text-muted-foreground">{children}</p> : null}
    </div>
  )
}

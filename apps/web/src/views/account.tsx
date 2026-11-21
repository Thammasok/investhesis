import { useEffect, useRef } from 'react'
import { useCurrentUser } from '@/features/auth/current-user'
import { ChangePasswordForm } from '@/features/auth/components/change-password-form'

export function Component() {
  const user = useCurrentUser()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = 'Account · Investhesis'
    headingRef.current?.focus()
  }, [])

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none">
          Account
        </h1>
        {user ? <p className="text-sm text-muted-foreground">Signed in as {user.email}</p> : null}
      </div>
      <ChangePasswordForm />
    </section>
  )
}

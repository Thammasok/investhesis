import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/current-user'
import { ChangePasswordForm } from '@/features/auth/components/change-password-form'

export function Component() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const headingRef = useRef<HTMLHeadingElement>(null)

  const title = t('nav.account')
  useEffect(() => {
    document.title = `${title} · Investhesis`
    headingRef.current?.focus()
  }, [title])

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none">
          {title}
        </h1>
        {user ? <p className="text-sm text-muted-foreground">Signed in as {user.email}</p> : null}
      </div>
      <ChangePasswordForm />
    </section>
  )
}

import { useState, type FormEvent } from 'react'
import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAuthClient } from '../auth-client-context'
import type { AuthErrorCode } from '../auth-client'
import { authErrorMessage } from '../auth-errors'
import type { LinkType } from '../loaders'
import { AuthHeading } from './auth-heading'
import { Spinner } from './spinner'

function StatusIcon() {
  return (
    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
      <TriangleAlertIcon aria-hidden="true" className="size-6" />
    </div>
  )
}

export function LinkExpiredPanel({ type, signedIn }: { type: LinkType; signedIn: boolean }) {
  const { t } = useTranslation()
  const expiryNote = t('auth.linkExpired.expiryNote')
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const [error, setError] = useState<AuthErrorCode | null>(null)
  const [sending, setSending] = useState(false)

  if (signedIn) {
    return (
      <div className="flex flex-col gap-6">
        <StatusIcon />
        <AuthHeading title={t('auth.linkExpired.alreadySignedIn')} docTitle={t('auth.linkExpired.docTitle')}>
          {expiryNote}
        </AuthHeading>
        <Button asChild>
          <Link to="/stocks">{t('auth.linkExpired.goToStocks')}</Link>
        </Button>
      </div>
    )
  }

  async function send(kind: 'confirmation' | 'reset', email: string) {
    if (sending) return
    setSending(true)
    setError(null)
    const result =
      kind === 'confirmation' ? await authClient.resendConfirmation(email) : await authClient.requestPasswordReset(email)
    setSending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (kind === 'confirmation') void navigate('/auth/check-email', { state: { email, justSent: true } })
    else void navigate('/auth/forgot-password', { state: { email, sent: true } })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '')
    // The single button follows the link type; the unknown type has two buttons that submit themselves.
    if (type !== 'unknown') void send(type === 'email' ? 'confirmation' : 'reset', email)
  }

  const emailOf = (button: HTMLButtonElement) =>
    String(new FormData(button.form ?? undefined).get('email') ?? '')

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <StatusIcon />
      <FieldGroup>
        <AuthHeading title={t('auth.linkExpired.heading')} docTitle={t('auth.linkExpired.docTitle')}>
          {expiryNote}
        </AuthHeading>
        {error ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription className="text-destructive">{authErrorMessage(error)}</AlertDescription>
          </Alert>
        ) : null}
        <Field>
          <FieldLabel htmlFor="email">{t('auth.email')}</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('auth.emailPlaceholder')}
            required
            className="bg-background"
          />
        </Field>
        <Field>
          {type === 'unknown' ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                onClick={(event) => {
                  const form = event.currentTarget.form
                  if (form?.reportValidity()) void send('confirmation', emailOf(event.currentTarget))
                }}
              >
                {t('auth.linkExpired.resendConfirmation')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                onClick={(event) => {
                  const form = event.currentTarget.form
                  if (form?.reportValidity()) void send('reset', emailOf(event.currentTarget))
                }}
              >
                {t('auth.linkExpired.resetPassword')}
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={sending} aria-busy={sending}>
              {sending ? <Spinner /> : null}
              {t('auth.linkExpired.sendNew')}
            </Button>
          )}
        </Field>
      </FieldGroup>
      <p className="text-center text-sm">
        <Link to="/auth/sign-in" className="underline underline-offset-4 hover:text-primary">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </form>
  )
}

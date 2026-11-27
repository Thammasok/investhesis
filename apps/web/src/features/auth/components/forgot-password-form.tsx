import { useRef, useState, type FormEvent } from 'react'
import { CircleAlertIcon, MailIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAuthClient } from '../auth-client-context'
import type { AuthErrorCode } from '../auth-client'
import { authErrorMessage } from '../auth-errors'
import { useCooldown } from '../use-cooldown'
import { withNext } from '../with-next'
import { AuthHeading } from './auth-heading'
import { Spinner } from './spinner'

type ForgotPasswordFormProps = {
  /** From router state (sign-in's field); never the URL. */
  initialEmail: string
  /** A reset link was just requested elsewhere (Link expired), so show the sent state. */
  initiallySent: boolean
  next: string | null
}

/**
 * Requests a reset link. Whatever the email, success shows the same sent state (FR-011); only
 * `rate_limited` and `unavailable` (and unexpected failures) show an error.
 */
export function ForgotPasswordForm({ initialEmail, initiallySent, next }: ForgotPasswordFormProps) {
  const { t } = useTranslation()
  const authClient = useAuthClient()
  const cooldown = useCooldown(initiallySent && initialEmail ? 60 : 0)
  const [sentTo, setSentTo] = useState<string | null>(initiallySent && initialEmail ? initialEmail : null)
  const [error, setError] = useState<AuthErrorCode | null>(null)
  const [sending, setSending] = useState(false)
  const busy = useRef(false)

  async function request(email: string) {
    if (busy.current) return
    busy.current = true
    setSending(true)
    setError(null)
    const result = await authClient.requestPasswordReset(email)
    busy.current = false
    setSending(false)
    if (result.ok) {
      setSentTo(email)
      cooldown.start()
    } else {
      setError(result.error)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void request(String(new FormData(event.currentTarget).get('email') ?? ''))
  }

  const alert = error ? (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription className="text-destructive">{authErrorMessage(error)}</AlertDescription>
    </Alert>
  ) : null

  const backToSignIn = (
    <p className="text-center text-sm">
      <Link to={withNext('/auth/sign-in', next)} className="underline underline-offset-4 hover:text-primary">
        {t('auth.backToSignIn')}
      </Link>
    </p>
  )

  if (sentTo) {
    return (
      <div className="flex flex-col gap-6">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <MailIcon aria-hidden="true" className="size-6" />
        </div>
        <AuthHeading title={t('auth.forgot.sentHeading')}>{t('auth.forgot.sentBody', { email: sentTo })}</AuthHeading>
        {alert}
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.forgot.noMail')}{' '}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={cooldown.remaining > 0 || sending}
            onClick={() => void request(sentTo)}
          >
            {cooldown.remaining > 0 ? t('auth.resendIn', { seconds: cooldown.remaining }) : t('auth.resendEmail')}
          </Button>
        </p>
        {backToSignIn}
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <FieldGroup>
        <AuthHeading title={t('auth.forgot.heading')} docTitle={t('auth.forgot.docTitle')}>
          {t('auth.forgot.lead')}
        </AuthHeading>
        {alert}
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
            defaultValue={initialEmail}
            required
            className="bg-background"
          />
        </Field>
        <Field>
          <Button type="submit" disabled={sending} aria-busy={sending}>
            {sending ? <Spinner /> : null}
            {sending ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
          </Button>
        </Field>
      </FieldGroup>
      {backToSignIn}
    </form>
  )
}

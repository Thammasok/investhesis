import { useState, type FormEvent } from 'react'
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
import { AuthHeading } from './auth-heading'

type CheckEmailPanelProps = {
  /** From router state; absent after a reload, when the page asks for it instead. */
  email: string | null
  /** The email was sent a moment ago, so resending starts on cooldown. */
  justSent: boolean
}

export function CheckEmailPanel({ email, justSent }: CheckEmailPanelProps) {
  const { t } = useTranslation()
  const authClient = useAuthClient()
  const cooldown = useCooldown(justSent ? 60 : 0)
  const [sentAgain, setSentAgain] = useState(false)
  const [error, setError] = useState<AuthErrorCode | null>(null)
  const [sending, setSending] = useState(false)

  async function resend(address: string) {
    if (sending || cooldown.remaining > 0) return
    setSending(true)
    setError(null)
    setSentAgain(false)
    const result = await authClient.resendConfirmation(address)
    setSending(false)
    if (result.ok) {
      setSentAgain(true)
      cooldown.start()
    } else {
      setError(result.error)
    }
  }

  const label = cooldown.remaining > 0 ? t('auth.resendIn', { seconds: cooldown.remaining }) : t('auth.resendEmail')

  function handleFieldSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void resend(String(new FormData(event.currentTarget).get('email') ?? ''))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <MailIcon aria-hidden="true" className="size-6" />
      </div>
      <AuthHeading title={t('auth.checkEmail.heading')}>
        {email ? t('auth.checkEmail.sentTo', { email }) : t('auth.checkEmail.askEmail')}
      </AuthHeading>
      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription className="text-destructive">{authErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}
      <div role="status" className="text-center text-sm text-muted-foreground empty:hidden">
        {sentAgain ? t('auth.checkEmail.sentAgain') : null}
      </div>
      {email ? (
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.checkEmail.noMail')}{' '}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={cooldown.remaining > 0 || sending}
            onClick={() => void resend(email)}
          >
            {label}
          </Button>
        </p>
      ) : (
        <form onSubmit={handleFieldSubmit}>
          <FieldGroup>
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
              <Button type="submit" disabled={cooldown.remaining > 0 || sending}>
                {label}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      )}
      <p className="text-center text-sm">
        <Link to="/auth/sign-in" className="underline underline-offset-4 hover:text-primary">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </div>
  )
}

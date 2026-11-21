import { useRef, useState, type ComponentProps, type FormEvent } from 'react'
import { CircleAlertIcon, InfoIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuthClient } from '../auth-client-context'
import type { AuthErrorCode } from '../auth-client'
import { authErrorMessage } from '../auth-errors'
import { safeNext } from '../safe-next'
import { withNext } from '../with-next'
import { AuthHeading } from './auth-heading'
import { PasswordInput } from './password-input'
import { Spinner } from './spinner'

type SignInFormProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
  /** The raw `next` query value; `safeNext` decides where it leads. */
  next: string | null
  /** Why the visitor was sent here, from router state. */
  reason?: 'session_ended'
}

export function SignInForm({ className, next, reason, ...props }: SignInFormProps) {
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const [error, setError] = useState<AuthErrorCode | null>(null)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Typed so far, handed to Forgot password through router state (never the URL).
  const [typedEmail, setTypedEmail] = useState('')
  const busy = useRef(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Always stop the native submit, so a password can never end up in the URL.
    event.preventDefault()
    if (busy.current) return
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')

    busy.current = true
    setSubmitting(true)
    setError(null)
    const result = await authClient.signIn(email, password)
    busy.current = false
    setSubmitting(false)

    if (result.ok) {
      void navigate(safeNext(next), { replace: true })
      return
    }
    setError(result.error)
    if (result.error === 'email_not_confirmed') setUnconfirmedEmail(email)
    if (result.error === 'invalid_credentials') {
      if (passwordRef.current) passwordRef.current.value = ''
      passwordRef.current?.focus()
    } else {
      // The alert is rendered by the next commit; focus it then.
      queueMicrotask(() => alertRef.current?.focus())
    }
  }

  async function resend() {
    const result = await authClient.resendConfirmation(unconfirmedEmail)
    if (result.ok) {
      void navigate('/auth/check-email', { state: { email: unconfirmedEmail, justSent: true } })
    } else {
      setError(result.error)
      queueMicrotask(() => alertRef.current?.focus())
    }
  }

  return (
    <form className={cn('flex flex-col gap-6', className)} onSubmit={handleSubmit} {...props}>
      <FieldGroup>
        <AuthHeading title="Sign in to your account" docTitle="Sign in">Enter your email and password</AuthHeading>
        {reason === 'session_ended' ? (
          <Alert role="status">
            <InfoIcon aria-hidden="true" />
            <AlertDescription>Your session has ended. Sign in again.</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" ref={alertRef} tabIndex={-1} className="outline-none">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription className="text-destructive">
              {error === 'email_not_confirmed' ? (
                <>
                  Confirm your email first. We sent a link to {unconfirmedEmail}.{' '}
                  <Button type="button" variant="link" className="h-auto p-0" onClick={() => void resend()}>
                    Resend
                  </Button>
                </>
              ) : (
                authErrorMessage(error)
              )}
            </AlertDescription>
          </Alert>
        ) : null}
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            required
            className="bg-background"
            onChange={(event) => setTypedEmail(event.target.value)}
          />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              to={withNext('/auth/forgot-password', next)}
              state={typedEmail ? { email: typedEmail } : undefined}
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            ref={passwordRef}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field>
          <Button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? <Spinner /> : null}
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
          <FieldDescription className="text-center">
            Don&apos;t have an account?{' '}
            <Link to={withNext('/auth/sign-up', next)} className="underline underline-offset-4 hover:text-primary">
              Sign up
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}

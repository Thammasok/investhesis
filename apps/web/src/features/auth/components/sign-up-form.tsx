import { useRef, useState, type ComponentProps, type FormEvent } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuthClient } from '../auth-client-context'
import type { AuthErrorCode } from '../auth-client'
import { authErrorMessage } from '../auth-errors'
import { validateNewPassword, type PasswordErrors } from '../password-rules'
import { withNext } from '../with-next'
import { AuthHeading } from './auth-heading'
import { PasswordInput } from './password-input'
import { Spinner } from './spinner'

type SignUpFormProps = Omit<ComponentProps<'form'>, 'onSubmit'> & { next: string | null }

export function SignUpForm({ className, next, ...props }: SignUpFormProps) {
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<PasswordErrors>({})
  const [formError, setFormError] = useState<AuthErrorCode | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const busy = useRef(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    const confirm = String(data.get('confirm') ?? '')

    setFormError(null)
    const invalid = validateNewPassword(password, confirm)
    setErrors(invalid)
    if (invalid.password || invalid.confirm) {
      // Focus after the error state is committed, so the field already reads as invalid.
      queueMicrotask(() => (invalid.password ? passwordRef : confirmRef).current?.focus())
      return
    }

    busy.current = true
    setSubmitting(true)
    const result = await authClient.signUp(email, password)
    busy.current = false
    setSubmitting(false)

    // An already-registered email is reported as success by the adapter (FR-003).
    if (result.ok) {
      void navigate('/auth/check-email', { state: { email, justSent: true } })
      return
    }
    if (result.error === 'weak_password') {
      setErrors({ password: authErrorMessage('weak_password') })
      queueMicrotask(() => passwordRef.current?.focus())
      return
    }
    setFormError(result.error)
    queueMicrotask(() => (result.error === 'signup_not_allowed' ? emailRef : alertRef).current?.focus())
  }

  return (
    <form className={cn('flex flex-col gap-6', className)} onSubmit={handleSubmit} {...props}>
      <FieldGroup>
        <AuthHeading title="Create your account" docTitle="Sign up">Enter your email and choose a password</AuthHeading>
        {formError ? (
          <Alert variant="destructive" ref={alertRef} tabIndex={-1} className="outline-none">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription className="text-destructive">{authErrorMessage(formError)}</AlertDescription>
          </Alert>
        ) : null}
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            required
            className="bg-background"
          />
        </Field>
        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            ref={passwordRef}
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'password-error password-hint' : 'password-hint'}
          />
          <FieldDescription id="password-hint">At least 8 characters.</FieldDescription>
          {errors.password ? <FieldError id="password-error">{errors.password}</FieldError> : null}
        </Field>
        <Field data-invalid={errors.confirm ? true : undefined}>
          <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
          <PasswordInput
            id="confirm"
            name="confirm"
            ref={confirmRef}
            autoComplete="new-password"
            aria-invalid={errors.confirm ? true : undefined}
            aria-describedby={errors.confirm ? 'confirm-error' : undefined}
          />
          {errors.confirm ? <FieldError id="confirm-error">{errors.confirm}</FieldError> : null}
        </Field>
        <Field>
          <Button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? <Spinner /> : null}
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
          <FieldDescription className="text-center">
            Already have an account?{' '}
            <Link to={withNext('/auth/sign-in', next)} className="underline underline-offset-4 hover:text-primary">
              Sign in
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}

import { useRef, useState, type FormEvent } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useAuthClient } from '../auth-client-context'
import type { AuthErrorCode } from '../auth-client'
import { authErrorMessage } from '../auth-errors'
import { LINK_EXPIRED_PATH } from '../loaders'
import { validateNewPassword, type PasswordErrors } from '../password-rules'
import { AuthHeading } from './auth-heading'
import { PasswordInput } from './password-input'
import { Spinner } from './spinner'

/** Set a new password while holding a recovery session. There is no way back to sign-in: leaving keeps the session. */
export function NewPasswordForm({ email }: { email: string }) {
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<PasswordErrors>({})
  const [formError, setFormError] = useState<AuthErrorCode | null>(null)
  const [expired, setExpired] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const busy = useRef(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const confirm = String(data.get('confirm') ?? '')

    setFormError(null)
    const invalid = validateNewPassword(password, confirm)
    setErrors(invalid)
    if (invalid.password || invalid.confirm) {
      queueMicrotask(() => (invalid.password ? passwordRef : confirmRef).current?.focus())
      return
    }

    busy.current = true
    setSubmitting(true)
    const result = await authClient.setNewPassword(password)
    busy.current = false
    setSubmitting(false)

    if (result.ok) {
      toast.success("Password updated. You're signed in.")
      void navigate('/stocks', { replace: true })
      return
    }
    if (result.error === 'link_invalid') {
      setExpired(true)
      return
    }
    if (result.error === 'same_password' || result.error === 'weak_password') {
      setErrors({ password: authErrorMessage(result.error) })
      queueMicrotask(() => passwordRef.current?.focus())
      return
    }
    setFormError(result.error)
  }

  if (expired) return <Navigate to={LINK_EXPIRED_PATH} replace state={{ type: 'recovery' }} />

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <FieldGroup>
        <AuthHeading title="Choose a new password" docTitle="New password">
          For {email}
        </AuthHeading>
        {formError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription className="text-destructive">{authErrorMessage(formError)}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
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
          <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
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
            {submitting ? 'Saving…' : 'Save password'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}

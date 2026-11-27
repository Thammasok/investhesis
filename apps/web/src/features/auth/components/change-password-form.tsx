import { useId, useRef, useState, type FormEvent } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useAuthClient } from '../auth-client-context'
import type { AuthErrorCode } from '../auth-client'
import { authErrorMessage } from '../auth-errors'
import { validateNewPassword, type PasswordErrors } from '../password-rules'
import { PasswordInput } from './password-input'
import { Spinner } from './spinner'

type FieldErrors = PasswordErrors & { current?: string }

/** Change password for the signed-in user (FR-013), in a card on the Account page. */
export function ChangePasswordForm() {
  const authClient = useAuthClient()
  const titleId = useId()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<AuthErrorCode | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const busy = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const currentRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  // Focus after the error state is committed, so the field already reads as invalid.
  const focusLater = (ref: { current: HTMLInputElement | null }) => queueMicrotask(() => ref.current?.focus())

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const data = new FormData(event.currentTarget)
    const current = String(data.get('current') ?? '')
    const password = String(data.get('password') ?? '')
    const confirm = String(data.get('confirm') ?? '')

    setFormError(null)
    const invalid = validateNewPassword(password, confirm)
    setErrors(invalid)
    if (invalid.password || invalid.confirm) {
      focusLater(invalid.password ? passwordRef : confirmRef)
      return
    }

    busy.current = true
    setSubmitting(true)
    const result = await authClient.changePassword(current, password)
    busy.current = false
    // Commit now: the inputs are disabled while submitting and can only be focused once enabled.
    flushSync(() => setSubmitting(false))

    if (result.ok) {
      formRef.current?.reset()
      toast.success('Password changed.')
      focusLater(currentRef)
      return
    }
    if (result.error === 'wrong_current_password') {
      setErrors({ current: authErrorMessage(result.error) })
      if (currentRef.current) currentRef.current.value = ''
      focusLater(currentRef)
    } else if (result.error === 'same_password' || result.error === 'weak_password') {
      setErrors({ password: authErrorMessage(result.error) })
      focusLater(passwordRef)
    } else {
      setFormError(result.error)
    }
  }

  return (
    <Card className="max-w-lg">
      <form ref={formRef} aria-labelledby={titleId} onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle id={titleId}>Change password</CardTitle>
          <CardDescription>Use at least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent className="mt-6">
          <FieldGroup>
            {formError ? (
              <Alert variant="destructive">
                <CircleAlertIcon aria-hidden="true" />
                <AlertDescription className="text-destructive">{authErrorMessage(formError)}</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={errors.current ? true : undefined}>
              <FieldLabel htmlFor="current">Current password</FieldLabel>
              <PasswordInput
                id="current"
                name="current"
                ref={currentRef}
                autoComplete="current-password"
                required
                disabled={submitting}
                aria-invalid={errors.current ? true : undefined}
                aria-describedby={errors.current ? 'current-error' : undefined}
              />
              {errors.current ? <FieldError id="current-error">{errors.current}</FieldError> : null}
            </Field>
            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <PasswordInput
                id="password"
                name="password"
                ref={passwordRef}
                autoComplete="new-password"
                disabled={submitting}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
              {errors.password ? <FieldError id="password-error">{errors.password}</FieldError> : null}
            </Field>
            <Field data-invalid={errors.confirm ? true : undefined}>
              <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
              <PasswordInput
                id="confirm"
                name="confirm"
                ref={confirmRef}
                autoComplete="new-password"
                disabled={submitting}
                aria-invalid={errors.confirm ? true : undefined}
                aria-describedby={errors.confirm ? 'confirm-error' : undefined}
              />
              {errors.confirm ? <FieldError id="confirm-error">{errors.confirm}</FieldError> : null}
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 justify-end">
          <Button type="submit" className="w-full sm:w-auto" disabled={submitting} aria-busy={submitting}>
            {submitting ? <Spinner /> : null}
            {submitting ? 'Saving…' : 'Change password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

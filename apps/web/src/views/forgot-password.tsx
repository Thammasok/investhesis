import { useLocation, useSearchParams } from 'react-router'
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form'

type ForgotState = { email?: unknown; sent?: unknown } | null

export function Component() {
  const [params] = useSearchParams()
  const state = useLocation().state as ForgotState
  const email = typeof state?.email === 'string' ? state.email : ''
  return <ForgotPasswordForm initialEmail={email} initiallySent={state?.sent === true} next={params.get('next')} />
}

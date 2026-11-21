import { Navigate, useLoaderData } from 'react-router'
import { NewPasswordForm } from '@/features/auth/components/new-password-form'
import { LINK_EXPIRED_PATH, type ResetPasswordData } from '@/features/auth/loaders'

export function Component() {
  const { email } = useLoaderData() as ResetPasswordData
  if (email === null) return <Navigate to={LINK_EXPIRED_PATH} replace state={{ type: 'recovery' }} />
  return <NewPasswordForm email={email} />
}

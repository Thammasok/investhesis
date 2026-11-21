import { useLocation, useSearchParams } from 'react-router'
import { SignInForm } from '@/features/auth/components/sign-in-form'
import type { SignInState } from '@/features/auth/guards'

export function Component() {
  const [params] = useSearchParams()
  const state = useLocation().state as SignInState | null
  return <SignInForm next={params.get('next')} reason={state?.reason} />
}

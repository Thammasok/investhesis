import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { SignInForm } from '@/features/auth/components/sign-in-form'

export function Component() {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Sign in · Investhesis'
  }, [])

  // v1 runs every API request as the mock user (AUTH_MODE=mock), so signing in only enters the
  // app. Swap this for the real sign-in call once auth exists.
  return <SignInForm onSignIn={() => navigate('/stocks', { replace: true })} />
}

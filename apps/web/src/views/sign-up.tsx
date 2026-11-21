import { useSearchParams } from 'react-router'
import { SignUpForm } from '@/features/auth/components/sign-up-form'

export function Component() {
  const [params] = useSearchParams()
  return <SignUpForm next={params.get('next')} />
}

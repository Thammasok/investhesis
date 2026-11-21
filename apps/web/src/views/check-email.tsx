import { useLocation } from 'react-router'
import { CheckEmailPanel } from '@/features/auth/components/check-email-panel'

type CheckEmailState = { email?: unknown; justSent?: unknown } | null

export function Component() {
  const state = useLocation().state as CheckEmailState
  const email = typeof state?.email === 'string' && state.email !== '' ? state.email : null
  return <CheckEmailPanel email={email} justSent={state?.justSent === true} />
}

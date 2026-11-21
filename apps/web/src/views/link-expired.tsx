import { useLoaderData, useLocation } from 'react-router'
import { LinkExpiredPanel } from '@/features/auth/components/link-expired-panel'
import { readLinkType, type LinkExpiredData } from '@/features/auth/loaders'

export function Component() {
  const { signedIn } = useLoaderData() as LinkExpiredData
  const state = useLocation().state as { type?: unknown } | null
  return <LinkExpiredPanel type={readLinkType(state?.type)} signedIn={signedIn} />
}

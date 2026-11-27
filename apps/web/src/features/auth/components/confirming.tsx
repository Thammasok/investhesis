import { Loader2Icon } from 'lucide-react'
import { Navigate, useLoaderData, useSearchParams } from 'react-router'
import { LINK_EXPIRED_PATH, readLinkType, type ConfirmFailure } from '../loaders'
import { AuthHeading } from './auth-heading'

/** The route's pending UI while the confirm loader verifies the link. */
export function ConfirmingScreen() {
  const [params] = useSearchParams()
  const recovery = params.get('type') === 'recovery'
  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <Loader2Icon aria-hidden="true" className="size-6 animate-spin motion-reduce:animate-none" />
      </div>
      <AuthHeading title={recovery ? 'Checking your link…' : 'Confirming your email…'} docTitle="Confirming" />
    </div>
  )
}

/** Only reached when verification failed; success redirects from the loader. */
export function ConfirmFailed() {
  const data = useLoaderData() as ConfirmFailure
  return <Navigate to={LINK_EXPIRED_PATH} replace state={{ type: readLinkType(data.expired) }} />
}

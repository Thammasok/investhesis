import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api-client'

/** Shown when a route fails to load or render, e.g. a lazy chunk that can't be fetched. */
export function RouteError() {
  const error = useRouteError()
  const notFound = (isRouteErrorResponse(error) && error.status === 404) || (error instanceof ApiError && error.status === 404)
  const message = notFound
    ? "We couldn't find that page or item. It may have been deleted."
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : 'Something went wrong while loading this page.'

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16" role="alert">
      <h1 className="font-heading text-2xl font-semibold">{notFound ? 'Not found' : 'Something went wrong'}</h1>
      <p className="text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="outline" asChild>
          <Link to="/stocks">Go to stocks</Link>
        </Button>
      </div>
    </main>
  )
}

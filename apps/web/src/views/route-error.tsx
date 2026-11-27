import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, Link, useLocation, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api-client'

/** Shown when a route fails to load or render, e.g. a lazy chunk that can't be fetched. */
export function RouteError() {
  const { t } = useTranslation()
  const error = useRouteError()
  // The way back is the section the failed page belongs to.
  const inLists = /^\/lists(\/|$)/.test(useLocation().pathname)
  const notFound = (isRouteErrorResponse(error) && error.status === 404) || (error instanceof ApiError && error.status === 404)
  const message = notFound
    ? t('shell.routeNotFoundBody')
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : t('shell.routeErrorBody')

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16" role="alert">
      <h1 className="font-heading text-2xl font-semibold">{notFound ? t('shell.routeNotFoundTitle') : t('shell.routeErrorTitle')}</h1>
      <p className="text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>{t('shell.reload')}</Button>
        <Button variant="outline" asChild>
          {inLists ? <Link to="/lists">{t('shell.goToLists')}</Link> : <Link to="/stocks">{t('shell.goToStocks')}</Link>}
        </Button>
      </div>
    </main>
  )
}

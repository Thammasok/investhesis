import { createBrowserRouter, redirect, type DataRouter, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { PageSkeleton } from '@/components/page-skeleton'
import { AuthLayout } from '@/components/layout/auth-layout'
import type { AuthClient } from '@/features/auth/auth-client'
import { AuthClientProvider } from '@/features/auth/auth-client-provider'
import { loadCurrentUser } from '@/features/auth/current-user'
import { createGuards, sessionEndedHandler } from '@/features/auth/guards'
import { createAuthLoaders } from '@/features/auth/loaders'
import { chainsRoute } from '@/features/chains/chains-routes'
import { concentrationRoute } from '@/features/concentration/concentration-routes'
import { importExportRoute } from '@/features/imports/imports-routes'
import { listsRoutes } from '@/features/lists/lists-routes'
import { stocksRoutes } from '@/features/stocks/stocks-routes'
import { createApiClient, type ApiClient } from '@/lib/api-client'
import { ConfirmFailed, ConfirmingScreen } from '@/features/auth/components/confirming'
import { RouteError } from '@/views/route-error'
import type { RouteHandle } from './route-handle'
import { APP_ROUTE_ID } from './route-ids'

/**
 * The route table. Each page lives in `src/views/` and exports `Component`, so `lazy` makes
 * every page its own chunk. `handle.crumb` labels a route in the header breadcrumb.
 */
export function createRoutes(
  authClient: AuthClient,
  { apiClient = createApiClient({ authClient, onSessionEnded: () => {} }) }: { apiClient?: ApiClient } = {},
): RouteObject[] {
  const { requireSession, redirectIfSignedIn } = createGuards(authClient)
  const authLoaders = createAuthLoaders(authClient)
  // The pages under /auth read the client from context; the layout route supplies it.
  const AuthShell = () => (
    <AuthClientProvider client={authClient}>
      <AuthLayout />
    </AuthClientProvider>
  )
  // The signed-in area reads the client too (sign out, change password).
  const AppShell = () => (
    <AuthClientProvider client={authClient}>
      <AppLayout />
    </AuthClientProvider>
  )
  return [
    {
      // Sign-in pages, outside the signed-in area so its future guard never applies to them.
      path: '/auth',
      Component: AuthShell,
      ErrorBoundary: RouteError,
      children: [
        { index: true, loader: () => redirect('/auth/sign-in') },
        { path: 'sign-in', loader: redirectIfSignedIn, lazy: () => import('@/views/sign-in') },
        { path: 'check-email', lazy: () => import('@/views/check-email') },
        // Email-link pages are not guest pages: a recovery link makes a signed-in session.
        {
          path: 'confirm',
          loader: authLoaders.confirm,
          HydrateFallback: ConfirmingScreen,
          Component: ConfirmFailed,
        },
        { path: 'link-expired', loader: authLoaders.linkExpired, lazy: () => import('@/views/link-expired') },
        { path: 'forgot-password', loader: redirectIfSignedIn, lazy: () => import('@/views/forgot-password') },
        { path: 'reset-password', loader: authLoaders.resetPassword, lazy: () => import('@/views/reset-password') },
        // Any other /auth path (including the retired registration page) is not-found, signed in or out,
        // instead of falling through to the signed-in area's guard.
        { path: '*', lazy: () => import('@/views/not-found') },
      ],
    },
    {
      id: APP_ROUTE_ID,
      // Middleware, not a loader: matched loaders run in parallel, so only middleware stops a child
      // loader from calling the API before the visitor is known to be signed in.
      middleware: [requireSession],
      loader: () => loadCurrentUser(apiClient, authClient),
      // The menu's email changes only with the session, so a navigation within one page (a regroup on
      // /concentration changes only the query) does not read /me again; forms and page changes still do.
      shouldRevalidate: ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) =>
        !formMethod && currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate,
      Component: AppShell,
      // The first paint, while this loader and the page's own run in parallel (ux-design.md: Loading).
      HydrateFallback: PageSkeleton,
      ErrorBoundary: RouteError,
      children: [
        { index: true, loader: () => redirect('/stocks') },
        stocksRoutes(apiClient),
        {
          path: 'account',
          handle: { crumb: 'Account' } satisfies RouteHandle,
          lazy: () => import('@/views/account'),
        },
        concentrationRoute(apiClient),
        chainsRoute(apiClient),
        listsRoutes(apiClient),
        importExportRoute(apiClient),
        {
          path: '*',
          handle: { crumb: 'Not found' } satisfies RouteHandle,
          lazy: () => import('@/views/not-found'),
        },
      ],
    },
  ]
}

export function createAppRouter(authClient: AuthClient) {
  // A session that ends mid-request (second 401) sends the visitor to sign-in; the router exists
  // only after the routes, so the client reaches it through this binding.
  let router: DataRouter | undefined
  const apiClient = createApiClient({
    authClient,
    onSessionEnded: (path) => (router ? sessionEndedHandler(router)(path) : undefined),
  })
  router = createBrowserRouter(createRoutes(authClient, { apiClient }))
  return router
}

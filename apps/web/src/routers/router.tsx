import { createBrowserRouter, redirect, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { AuthLayout } from '@/components/layout/auth-layout'
import type { AuthClient } from '@/features/auth/auth-client'
import { AuthClientProvider } from '@/features/auth/auth-client-provider'
import { createGuards } from '@/features/auth/guards'
import { createAuthLoaders } from '@/features/auth/loaders'
import { ConfirmFailed, ConfirmingScreen } from '@/features/auth/components/confirming'
import { RouteError } from '@/views/route-error'
import type { RouteHandle } from './route-handle'

/** Route id of the signed-in area. Its middleware is the sign-in guard. */
export const APP_ROUTE_ID = 'app'

/**
 * The route table. Each page lives in `src/views/` and exports `Component`, so `lazy` makes
 * every page its own chunk. `handle.crumb` labels a route in the header breadcrumb.
 */
export function createRoutes(authClient: AuthClient): RouteObject[] {
  const { requireSession, redirectIfSignedIn } = createGuards(authClient)
  const authLoaders = createAuthLoaders(authClient)
  // The pages under /auth read the client from context; the layout route supplies it.
  const AuthShell = () => (
    <AuthClientProvider client={authClient}>
      <AuthLayout />
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
        { path: 'sign-up', loader: redirectIfSignedIn, lazy: () => import('@/views/sign-up') },
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
      ],
    },
    {
      id: APP_ROUTE_ID,
      // Middleware, not a loader: matched loaders run in parallel, so only middleware stops a child
      // loader from calling the API before the visitor is known to be signed in.
      middleware: [requireSession],
      Component: AppLayout,
      ErrorBoundary: RouteError,
      children: [
        { index: true, loader: () => redirect('/stocks') },
        {
          path: 'stocks',
          handle: { crumb: 'Stocks' } satisfies RouteHandle,
          children: [
            { index: true, lazy: () => import('@/views/stocks') },
            {
              path: ':id',
              handle: { crumb: (params) => params.id ?? '' } satisfies RouteHandle,
              lazy: () => import('@/views/stock-detail'),
            },
          ],
        },
        {
          path: 'concentration',
          handle: { crumb: 'Concentration' } satisfies RouteHandle,
          lazy: () => import('@/views/concentration'),
        },
        {
          path: 'chains',
          handle: { crumb: 'Value chains' } satisfies RouteHandle,
          lazy: () => import('@/views/chains'),
        },
        {
          path: 'lists',
          handle: { crumb: 'Lists' } satisfies RouteHandle,
          lazy: () => import('@/views/lists'),
        },
        {
          path: 'import-export',
          handle: { crumb: 'Import / export' } satisfies RouteHandle,
          lazy: () => import('@/views/import-export'),
        },
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
  return createBrowserRouter(createRoutes(authClient))
}

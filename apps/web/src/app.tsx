import { useEffect } from 'react'
import type { DataRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import type { AuthClient } from '@/features/auth/auth-client'
import { watchAuth } from '@/features/auth/guards'
import { Toaster } from '@/components/ui/sonner'
import { createAppRouter } from '@/routers/router'

// One router per auth client. React StrictMode runs a `useState` initializer twice in development, and
// every `createBrowserRouter` starts its loaders at once: the email-link loader then verified a
// single-use token twice and showed its toast twice.
const routers = new WeakMap<AuthClient, DataRouter>()
function routerFor(authClient: AuthClient): DataRouter {
  let router = routers.get(authClient)
  if (!router) {
    router = createAppRouter(authClient)
    routers.set(authClient, router)
  }
  return router
}

export function App({ authClient }: { authClient: AuthClient }) {
  const router = routerFor(authClient)
  // A sign-out in another tab or a failed refresh sends this tab to sign-in.
  useEffect(() => watchAuth(router, authClient), [router, authClient])
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  )
}

import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router/dom'
import type { AuthClient } from '@/features/auth/auth-client'
import { watchAuth } from '@/features/auth/guards'
import { Toaster } from '@/components/ui/sonner'
import { createAppRouter } from '@/routers/router'

export function App({ authClient }: { authClient: AuthClient }) {
  const [router] = useState(() => createAppRouter(authClient))
  // A sign-out in another tab or a failed refresh sends this tab to sign-in.
  useEffect(() => watchAuth(router, authClient), [router, authClient])
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  )
}

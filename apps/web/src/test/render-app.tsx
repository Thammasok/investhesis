import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import type { AuthClient } from '@/features/auth/auth-client'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient } from './fake-auth-client'
import type { StubApi } from './stub-api'

/** Renders the whole route table at `path`, signed in, against a scripted API. */
export function renderApp(path: string, api: StubApi, authClient: AuthClient = FakeAuthClient.signedIn()) {
  const router = createMemoryRouter(createRoutes(authClient, { apiClient: api.client() }), { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

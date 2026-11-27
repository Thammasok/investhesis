import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import type { AuthClient } from '@/features/auth/auth-client'
import { setLanguage } from '@/i18n'
import type { Language } from '@investhesis/domain'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient } from './fake-auth-client'
import type { StubApi } from './stub-api'

/** Renders the whole route table at `path`, signed in, against a scripted API. */
export function renderApp(
  path: string,
  api: StubApi,
  authClient: AuthClient = FakeAuthClient.signedIn(),
  { language }: { language?: Language } = {},
) {
  // The Thai catalogue is preloaded by test/setup.ts, so this takes effect before the first render.
  if (language) void setLanguage(language)
  const router = createMemoryRouter(createRoutes(authClient, { apiClient: api.client() }), { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

import type { Language } from '@investhesis/domain'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import type { AuthClient } from '@/features/auth/auth-client'
import { setLanguage } from '@/i18n'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient } from './fake-auth-client'
import type { StubApi } from './stub-api'

export type RenderOptions = { language?: Language }

/**
 * Renders the whole route table at `path`, signed in, against a scripted API. The third argument is
 * the auth client, the options, or (to give both) the auth client and then the options.
 */
export function renderApp(
  path: string,
  api: StubApi,
  authOrOptions: AuthClient | RenderOptions = FakeAuthClient.signedIn(),
  options: RenderOptions = {},
) {
  const isOptions = !('getSession' in authOrOptions)
  const authClient = isOptions ? FakeAuthClient.signedIn() : authOrOptions
  const { language } = isOptions ? authOrOptions : options
  // The Thai catalogue is preloaded by test/setup.ts, so this takes effect before the first render.
  if (language) void setLanguage(language)
  const router = createMemoryRouter(createRoutes(authClient, { apiClient: api.client() }), { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

import { render } from '@testing-library/react'
import type { Language } from '@investhesis/domain'
import { th } from '@/i18n/catalogue/th/index'
import { i18n } from '@/i18n/i18n'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import type { AuthClient } from '@/features/auth/auth-client'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient } from './fake-auth-client'
import type { StubApi } from './stub-api'

/** Renders the whole route table at `path`, signed in, against a scripted API. */
export type RenderAppOptions = { authClient?: AuthClient; language?: Language }

/** The third argument is an auth client (older tests) or options `{ authClient, language }`. */
export function renderApp(path: string, api: StubApi, third: AuthClient | RenderAppOptions = {}) {
  const options: RenderAppOptions = 'signIn' in third ? { authClient: third as AuthClient } : (third as RenderAppOptions)
  const authClient = options.authClient ?? FakeAuthClient.signedIn()
  if (options.language) setLanguageNow(options.language)
  const router = createMemoryRouter(createRoutes(authClient, { apiClient: api.client() }), { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

/** Switches the language synchronously for a test (the Thai catalogue is imported statically here). */
export function setLanguageNow(language: Language) {
  i18n.addResourceBundle('th', 'translation', th, true, true)
  void i18n.changeLanguage(language)
  document.documentElement.lang = language
}

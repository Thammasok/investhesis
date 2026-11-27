import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { FakeAuthClient } from '@/test/fake-auth-client'
import { renderApp } from '@/test/render-app'
import { emptyApi } from '@/test/stub-api'
import { getLanguage, setLanguage } from './language'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => vi.clearAllMocks())

async function openMenu() {
  await userEvent.click(await screen.findByRole('button', { name: /^(Account menu|เมนูบัญชี)$/ }))
}

describe('language switch in the account menu', () => {
  it('TC-U-1035: choosing Thai changes the page and saves exactly once', async () => {
    const api = emptyApi().on('PATCH /settings', { language: 'th' })
    renderApp('/stocks', api)
    await screen.findByRole('heading', { level: 1, name: 'Stocks' })
    const before = api.calls.length
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'ไทย' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'หุ้น' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('th')
    await waitFor(() => expect(api.callsTo('PATCH /settings')).toHaveLength(1))
    expect(api.callsTo('PATCH /settings')[0]?.body).toEqual({ language: 'th' })
    expect(api.calls.slice(before).map((c) => `${c.method} ${c.path}`)).toEqual(['PATCH /settings'])
  })

  it('TC-U-1036: choosing the current language sends nothing', async () => {
    const api = emptyApi().on('PATCH /settings', {})
    renderApp('/stocks', api)
    await screen.findByRole('heading', { level: 1, name: 'Stocks' })
    const before = api.calls.length
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'English' }))
    expect(api.calls.length).toBe(before)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('TC-U-1037: a failed save keeps the language and Retry sends it again', async () => {
    let attempts = 0
    const api = emptyApi().on('PATCH /settings', () => {
      attempts += 1
      if (attempts === 1) throw new ApiError(500, { code: 'internal', detail: 'boom' })
      return { language: 'th' }
    })
    renderApp('/stocks', api)
    await screen.findByRole('heading', { level: 1, name: 'Stocks' })
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'ไทย' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    const [, options] = vi.mocked(toast.error).mock.calls[0] as [string, { duration: number; action: { label: string; onClick: () => void } }]
    expect(options.duration).toBe(10_000)
    expect(options.action.label).toBe('ลองอีกครั้ง')
    expect(getLanguage()).toBe('th')
    await act(async () => options.action.onClick())
    await waitFor(() => expect(api.callsTo('PATCH /settings')).toHaveLength(2))
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('TC-U-1042: items carry their own lang and the change is announced', async () => {
    renderApp('/stocks', emptyApi().on('PATCH /settings', {}), { language: 'th' })
    await screen.findByRole('heading', { level: 1, name: 'หุ้น' })
    await openMenu()
    expect(await screen.findByRole('menuitemradio', { name: 'ไทย' })).toHaveAttribute('lang', 'th')
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('lang', 'en')
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'English' }))
    await waitFor(() => expect(document.querySelector('[data-language-announcer]')).toHaveTextContent('English'))
  })
})

describe('the account language', () => {
  it('TC-U-1038: a saved language applies before the page renders', async () => {
    const api = emptyApi().on('GET /me', { id: 'u1', email: 'a@example.test', displayName: null, language: 'th' })
    renderApp('/stocks', api)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('หุ้น')
    expect(screen.queryByRole('heading', { level: 1, name: 'Stocks' })).not.toBeInTheDocument()
    expect(localStorage.getItem('investhesis.language')).toBe('th')
  })

  it('TC-U-1039: a null account language keeps the browser choice and writes nothing', async () => {
    await setLanguage('th')
    const api = emptyApi()
    renderApp('/stocks', api)
    expect(await screen.findByRole('heading', { level: 1, name: 'หุ้น' })).toBeInTheDocument()
    expect(api.callsTo('PATCH /settings')).toHaveLength(0)
  })

  it('a re-read of /me does not undo a switch whose save failed', async () => {
    const api = emptyApi()
      .on('GET /me', { id: 'u1', email: 'a@example.test', displayName: null, language: 'en' })
      .on('PATCH /settings', () => {
        throw new ApiError(500, { code: 'internal', detail: 'boom' })
      })
    const { router } = renderApp('/stocks', api)
    await screen.findByRole('heading', { level: 1, name: 'Stocks' })
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'ไทย' }))
    await screen.findByRole('heading', { level: 1, name: 'หุ้น' })
    await act(async () => router.revalidate())
    expect(getLanguage()).toBe('th')
  })
})

describe('language switch on the auth pages', () => {
  it('TC-U-1041: changes the language without a request', async () => {
    const api = emptyApi()
    renderApp('/auth/sign-in', api, { authClient: FakeAuthClient.signedOut() })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to your account' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ไทย' }))
    expect(screen.getByRole('button', { name: 'ไทย' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('investhesis.language')).toBe('th')
    expect(api.calls).toHaveLength(0)
  })
})

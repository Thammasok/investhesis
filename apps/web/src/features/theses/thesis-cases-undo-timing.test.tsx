import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from '@/components/ui/sonner'
import { FakeAuthClient } from '@/test/fake-auth-client'
import { createRoutes } from '@/routers/router'
import { makeThesis } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import { routes, usd } from './cases-helpers'

// Real sonner on purpose: this case is about when the Undo action disappears.
afterEach(() => vi.useRealTimers())

describe('thesis undo timing', () => {
  it('TC-C-742: the Undo action is live at 4,999 ms, gone after 5,000 ms, and offers no restore afterwards', async () => {
    const entry = makeThesis({ id: 'e1', stockId: usd.id, type: 'buy', date: '2026-11-20', note: 'First reason' })
    let list = [entry]
    const stubs = new StubApi({
      ...routes(usd, () => list),
      [`DELETE /stocks/${usd.id}/theses/e1`]: () => {
        list = []
        return entry
      },
      [`POST /stocks/${usd.id}/theses/restore`]: entry,
    })
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const router = createMemoryRouter(createRoutes(FakeAuthClient.signedIn(), { apiClient: stubs.client() }), {
      initialEntries: [`/stocks/${usd.id}`],
    })
    render(
      <>
        <RouterProvider router={router} />
        <Toaster />
      </>,
    )

    const step = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
    const deleteButton = await screen.findByRole('button', { name: 'Delete Buy entry of 20 Nov 2026' })
    fireEvent.click(deleteButton)
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await screen.findByText('Entry deleted')
    const undo = () => screen.queryByRole('button', { name: 'Undo' })
    expect(undo()).not.toBeNull()

    await step(4900)
    expect(undo()).not.toBeNull()
    await step(99)
    expect(undo()).not.toBeNull()
    await step(1500)
    expect(screen.queryByText('Entry deleted')).not.toBeInTheDocument()
    expect(stubs.callsTo(`POST /stocks/${usd.id}/theses/restore`)).toHaveLength(0)
  })
})

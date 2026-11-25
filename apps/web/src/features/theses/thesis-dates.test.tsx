// Set before anything reads the clock: the browser of this test is on the US west coast.
process.env.TZ = 'America/Los_Angeles'

import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { makeStock, makeThesis } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

describe('thesis dates', () => {
  it('TC-U-784: the entry date has no time zone shift and the Edited marker shows', async () => {
    const stock = makeStock({ ticker: 'NVDA' })
    const entry = makeThesis({
      date: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
    })
    const api = new StubApi({
      'GET /lists': { items: [] },
      'GET /stocks': { items: [stock] },
      [`GET /stocks/${stock.id}`]: stock,
      [`GET /stocks/${stock.id}/theses`]: { items: [entry] },
    })
    renderApp(`/stocks/${stock.id}`, api)

    const card = within(await screen.findByRole('article'))
    expect(new Date().getTimezoneOffset()).toBeGreaterThan(0)
    expect(card.getByText('1 Jan 2026')).toBeInTheDocument()
    // 5 Jan 00:00 UTC is 4 Jan in Los Angeles: the Edited date is read in the browser's zone.
    expect(card.getByText('Edited 4 Jan 2026')).toBeInTheDocument()
  })
})

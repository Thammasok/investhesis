import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { makeStock } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, StubApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

describe('concentration in Thai', () => {
  it('TC-U-1053: groups show Thai labels, ties order by Thai label, the badge is Thai', async () => {
    const stub = new StubApi({
      'GET /stocks': {
        items: [
          makeStock({ ticker: 'XOM', gicsSector: 'Energy' }),
          makeStock({ ticker: 'JPM', gicsSector: 'Financials' }),
        ],
      },
      'GET /lists': { items: [] },
      'GET /settings': DEFAULT_SETTINGS,
    })
    renderApp('/concentration?lens=gicsSector', stub, { language: 'th' })
    expect(await screen.findByRole('heading', { level: 1, name: 'การกระจุกตัว' })).toBeInTheDocument()
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    // Equal size: Thai alphabetical order, not the English one (Energy before Financials).
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'แสดงหุ้นใน การเงิน' })).toBeInTheDocument()
    expect(within(rows[1] as HTMLElement).getByRole('button', { name: 'แสดงหุ้นใน พลังงาน' })).toBeInTheDocument()
    for (const row of rows) {
      expect(within(row as HTMLElement).getByText('50.0%')).toBeInTheDocument()
      expect(within(row as HTMLElement).getByText('เกิน 40%')).toBeInTheDocument()
    }
    // The lens name comes from the glossary.
    expect(screen.getByRole('combobox', { name: 'จัดกลุ่มตาม' })).toHaveTextContent('กลุ่มธุรกิจ (GICS)')
  })
})

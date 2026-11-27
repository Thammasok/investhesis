import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => {
  vi.mocked(toast).mockClear()
})

describe('lists in Thai', () => {
  it('TC-U-1059: list toasts and Undo are translated', async () => {
    const aapl = makeStock({ ticker: 'AAPL', name: 'Apple Inc.', listIds: ['core'] })
    const stub = new StubApi({
      'GET /lists/core': makeList('core', 'หุ้นหลัก', 1),
      'GET /lists': { items: [makeList('core', 'หุ้นหลัก', 1)] },
      'GET /stocks': { items: [aapl] },
      'DELETE /lists/core/stocks/s-AAPL': undefined,
    })
    renderApp('/lists/core', stub, { language: 'th' })
    await userEvent.click(await screen.findByRole('button', { name: 'นำ AAPL ออกจาก หุ้นหลัก' }))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    const [message, options] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string } }]
    expect(message).toBe('นำ AAPL ออกจาก หุ้นหลัก แล้ว')
    expect(options.action.label).toBe('เลิกทำ')
  })

  it('TC-U-1059: the lists page counts and names read in Thai', async () => {
    const stub = new StubApi({ 'GET /lists': { items: [makeList('core', 'หุ้นหลัก', 3)] } })
    renderApp('/lists', stub, { language: 'th' })
    expect(await screen.findByRole('heading', { level: 1, name: 'รายการหุ้น' })).toBeInTheDocument()
    expect(screen.getByText('1 รายการ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'สร้างรายการ' })).toBeInTheDocument()
  })
})

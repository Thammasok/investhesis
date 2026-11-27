import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { makeThesis } from '@/test/stock-fixtures'
import { apiFor, usd } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

describe('thesis log in Thai', () => {
  it('TC-U-1057: entries show the Thai type and date, the Edited marker, and the text as typed', async () => {
    const entry = makeThesis({
      stockId: usd.id,
      type: 'buy',
      date: '2026-11-27',
      note: 'Cloud demand <b>keeps</b> growing.',
      createdAt: '2026-11-27T01:00:00.000Z',
      updatedAt: '2026-11-27T05:00:00.000Z',
    })
    renderApp(`/stocks/${usd.id}`, apiFor(usd, [entry]), { language: 'th' })
    await screen.findByRole('heading', { level: 2, name: 'เหตุผลการลงทุน' })
    const sectionCard = screen.getByRole('heading', { level: 2, name: 'เหตุผลการลงทุน' }).closest('[data-slot="card"]') as HTMLElement
    const card = await screen.findByRole('article')
    expect(within(card).getByText('ซื้อ')).toBeInTheDocument()
    expect(within(card).getByText('27 พ.ย. 2026')).toBeInTheDocument()
    expect(within(card).getByText(/^แก้ไขแล้ว \d{1,2} (พ\.ย\.|ธ\.ค\.) 2026$/)).toBeInTheDocument()
    // The note is text, never markup.
    expect(within(card).getByText('Cloud demand <b>keeps</b> growing.')).toBeInTheDocument()
    expect(within(sectionCard).getByRole('button', { name: 'แก้ไขบันทึกซื้อวันที่ 27 พ.ย. 2026' })).toBeInTheDocument()
    expect(within(sectionCard).getByText('1 รายการ')).toBeInTheDocument()
  })
})

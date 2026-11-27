import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'

const stocks = () => [
  makeStock({ ticker: 'JPM', name: 'JPMorgan Chase', gicsSector: 'Financials' }),
  makeStock({ ticker: 'XOM', name: 'Exxon Mobil', gicsSector: 'Energy' }),
]
const api = () => new StubApi({ 'GET /stocks': { items: stocks() }, 'GET /lists': { items: [] } })

async function openSector() {
  const view = renderApp('/stocks', api(), { language: 'th' })
  await userEvent.click(await screen.findByRole('button', { name: /^ตัวกรอง/ }))
  const sheet = await screen.findByRole('dialog')
  await userEvent.click(within(sheet).getByRole('button', { name: /^กลุ่มธุรกิจ \(GICS\)/ }))
  return { ...view, sheet }
}

describe('filters in Thai', () => {
  it('TC-U-1051: the sheet shows Thai options and its find box matches both spellings', async () => {
    const { sheet } = await openSector()
    const find = await within(sheet).findByRole('searchbox', { name: 'ค้นหาใน กลุ่มธุรกิจ (GICS)' })
    const sector = find.closest('fieldset') as HTMLElement
    // Labelled in Thai, with the count in the name and the canonical value on hover.
    const option = within(sector).getByRole('checkbox', { name: 'การเงิน, 1 หุ้น' })
    expect(option.closest('div')?.querySelector('label')?.getAttribute('title')).toBe('Financials')

    for (const typed of ['การเงิน', 'Financials']) {
      await userEvent.clear(find)
      await userEvent.type(find, typed)
      // Only the Financials option stays (and "Not set", which is never searched).
      await waitFor(() => expect(within(sector).queryByRole('checkbox', { name: /^พลังงาน/ })).toBeNull())
      expect(within(sector).getByRole('checkbox', { name: 'การเงิน, 1 หุ้น' })).toBeInTheDocument()
      expect(within(sector).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual([
        'การเงิน, 1 หุ้น',
        'ยังไม่ระบุ, 0 หุ้น',
      ])
    }
  })

  it('TC-U-1052: filter links stay canonical', async () => {
    const { sheet, router } = await openSector()
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'การเงิน, 1 หุ้น' }))
    await waitFor(() => expect(router.state.location.search).toBe('?gicsSector=Financials'))
  })
})

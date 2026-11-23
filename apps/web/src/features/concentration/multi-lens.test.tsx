import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CONCENTRATION_LENSES } from '@investhesis/domain'
import type { Stock } from '@/features/stocks/types'
import { renderApp } from '@/test/render-app'
import { makeStock } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, StubApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const MULTI = ['customers', 'revenueTypes', 'themes', 'indexMembership']
const MANY: Record<string, string> = { customers: 'customers', revenueTypes: 'revenue types', themes: 'themes', indexMembership: 'index memberships' }

/** Dataset HC-H of test-cases.md §5.2: themes [AI, EV], [AI], [] and two values on the other multi lenses. */
function hcH(): Stock[] {
  return [
    makeStock({
      ticker: 'A',
      themes: ['AI', 'EV'],
      customers: ['B2B', 'B2C'],
      revenueTypes: ['Product sale', 'Subscription'],
      indexMembership: ['S&P 500', 'Nasdaq-100'],
      holding: { shares: '10.0000', averageCost: '100.0000', costCurrency: 'USD' },
    }),
    makeStock({ ticker: 'B', themes: ['AI'], holding: { shares: '1.0000', averageCost: '18125.0000', costCurrency: 'THB' } }),
    makeStock({ ticker: 'C' }),
  ]
}

const api = () =>
  new StubApi({
    'GET /stocks': { items: hcH() },
    'GET /lists': { items: [] },
    'GET /settings': { ...DEFAULT_SETTINGS, usdThbRate: '36.250000', usdThbRateUpdatedAt: '2026-11-23T10:00:00.000Z' },
  })

const open = async (search: string) => {
  const view = renderApp(`/concentration${search}`, api())
  await screen.findByRole('heading', { level: 1, name: 'Concentration' })
  return view
}
const rowFor = (label: string) => screen.getByRole('button', { name: `Show stocks in ${label}` }).closest('tr') as HTMLElement

describe('concentration: multi-value lenses', () => {
  it.each(CONCENTRATION_LENSES.map((l) => l.key))('TC-C-421: the multi-value note for lens %s', async (key) => {
    await open(`?lens=${key}`)

    const note = screen.queryByText(/counts in each of them, so the shares add up to more than 100%/)
    if (MULTI.includes(key)) expect(note).toHaveTextContent(`A stock with several ${MANY[key]} counts in each of them, so the shares add up to more than 100%.`)
    else expect(note).not.toBeInTheDocument()
  })

  it('TC-C-421: themes in the count view show AI 66.7%, EV 33.3% and Not set 33.3%, summing to 133.3%', async () => {
    await open('?lens=themes')

    const shares = ['AI', 'EV', 'Not set'].map((g) => within(rowFor(g)).getByText(/^\d+\.\d%$/).textContent)
    expect(shares).toEqual(['66.7%', '33.3%', '33.3%'])
    expect(shares.reduce((sum, s) => sum + parseFloat(s ?? '0'), 0).toFixed(1)).toBe('133.3')
  })

  it('TC-C-421: the value view counts a stock once in the total but in every group it has', async () => {
    await open('?lens=themes&measure=value')

    // A = 10 x 100 USD x 36.25 = 36,250.00; B = 18,125.00; total 54,375.00 (A once).
    expect(within(rowFor('AI')).getByText('฿54,375.00')).toBeInTheDocument()
    expect(within(rowFor('AI')).getByText('100.0%')).toBeInTheDocument()
    expect(within(rowFor('EV')).getByText('฿36,250.00')).toBeInTheDocument()
    expect(within(rowFor('EV')).getByText('66.7%')).toBeInTheDocument()
    expect(within(rowFor('Not set')).getByText('฿0.00')).toBeInTheDocument()
    expect(screen.getByText(/shares add up to more than 100%/)).toBeInTheDocument()
  })

  it('TC-C-421: a stock with two index memberships appears in two sub-rows', async () => {
    await open('?lens=indexMembership')

    await userEvent.click(screen.getByRole('button', { name: 'Show stocks in S&P 500' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show stocks in Nasdaq-100' }))

    for (const group of ['S&P 500', 'Nasdaq-100']) {
      const controls = screen.getByRole('button', { name: `Show stocks in ${group}` }).getAttribute('aria-controls') as string
      expect(within(document.getElementById(controls) as HTMLElement).getByRole('link', { name: 'A' })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('link', { name: 'A' })).toHaveLength(2)
  })
})

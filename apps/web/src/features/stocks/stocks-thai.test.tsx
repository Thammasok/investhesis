import { MESSAGES_TH, formatRule } from '@investhesis/domain'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { setLanguage } from '@/i18n/language'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi, emptyApi } from '@/test/stub-api'
import { countLabel } from './format'
import { sortStocks } from './sort-stocks'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

type User = ReturnType<typeof userEvent.setup>
const newApi = (post: unknown = makeStock({ ticker: 'PTT' })) =>
  new StubApi({ 'GET /lists': { items: [makeList('core', 'หุ้นหลัก')] }, 'GET /stocks': { items: [] }, 'POST /stocks': post })

async function openNewInThai(api: StubApi) {
  const user = userEvent.setup()
  renderApp('/stocks/new', api, { language: 'th' })
  await screen.findByRole('dialog', { name: 'เพิ่มหุ้น' })
  return user
}
async function pick(user: User, name: RegExp, option: string) {
  await user.click(screen.getByRole('combobox', { name }))
  await user.click(await screen.findByRole('option', { name: option }))
}
async function fillThai(user: User, ticker: string) {
  await user.click(screen.getByRole('radio', { name: 'ไทย' }))
  await user.type(screen.getByRole('textbox', { name: /^สัญลักษณ์หุ้น/ }), ticker)
  await pick(user, /^ตลาดหลักทรัพย์/, 'SET')
  await user.type(screen.getByRole('textbox', { name: /^ชื่อบริษัท/ }), 'PTT')
}

describe('stocks in Thai', () => {
  it('TC-U-1043: the stocks table shows Thai lens labels with the English value on hover', async () => {
    const ptt = makeStock({ ticker: 'PTT', name: 'PTT PCL', gicsSector: 'Energy', style: 'Growth' })
    renderApp('/stocks', new StubApi({ 'GET /stocks': { items: [ptt] }, 'GET /lists': { items: [] } }), { language: 'th' })
    const row = (await screen.findByRole('link', { name: 'PTT' })).closest('tr') as HTMLElement
    expect(within(row).getByText('พลังงาน')).toHaveAttribute('title', 'Energy')
    expect(within(row).getByText('เติบโต')).toHaveAttribute('title', 'Growth')
    expect(within(row).getByText('PTT PCL')).toBeInTheDocument()
  })

  it('TC-U-1044: the stock form sends canonical values while showing Thai', async () => {
    const api = newApi()
    const user = await openNewInThai(api)
    await fillThai(user, 'PTT')
    await pick(user, /^สไตล์/, 'เติบโต')
    await user.click(screen.getByRole('button', { name: 'บันทึกหุ้น' }))
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    const body = api.callsTo('POST /stocks')[0]?.body as Record<string, unknown>
    expect(body.style).toBe('Growth')
    expect(body.market).toBe('TH')
    expect(body.exchange).toBe('SET')
  })

  it('TC-U-1045: client validation errors read in Thai', async () => {
    const api = newApi()
    const user = await openNewInThai(api)
    await fillThai(user, '!!')
    await user.click(screen.getByRole('button', { name: 'บันทึกหุ้น' }))
    expect(await screen.findByText(`สัญลักษณ์หุ้น ${MESSAGES_TH.tickerFormat}`)).toBeInTheDocument()
    expect(api.callsTo('POST /stocks')).toHaveLength(0)
  })

  it('TC-U-1046: server validation errors are translated from the rule', async () => {
    const params = { market: 'TH', allowed: ['SET', 'mai'] }
    const api = newApi()
    api.on('POST /stocks', () => {
      throw new ApiError(400, {
        code: 'validation_failed',
        errors: [{ path: 'exchange', message: 'must be SET or mai for market TH', rule: 'exchangeForMarket', params }],
      })
    })
    const user = await openNewInThai(api)
    await fillThai(user, 'PTT')
    await user.click(screen.getByRole('button', { name: 'บันทึกหุ้น' }))
    const text = `ตลาดหลักทรัพย์ ${formatRule('exchangeForMarket', params, 'th')}`
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.queryByText(/must be SET or mai/)).not.toBeInTheDocument()
  })

  it('TC-U-1047: sorting a lens column follows the Thai label, unset last', () => {
    const stocks = [
      makeStock({ ticker: 'UTL', gicsSector: 'Utilities' }),
      makeStock({ ticker: 'NONE', gicsSector: null }),
      makeStock({ ticker: 'ENG', gicsSector: 'Energy' }),
      makeStock({ ticker: 'FIN', gicsSector: 'Financials' }),
    ]
    const tickers = (sorted: { ticker: string }[]) => sorted.map((s) => s.ticker)
    expect(tickers(sortStocks(stocks, 'sector', 'asc', 'th'))).toEqual(['FIN', 'ENG', 'UTL', 'NONE'])
    expect(tickers(sortStocks(stocks, 'sector', 'asc', 'en'))).toEqual(['ENG', 'FIN', 'UTL', 'NONE'])
  })

  it('TC-U-1048: counts and the holding card read in Thai', async () => {
    const ptt = makeStock({
      ticker: 'PTT',
      market: 'TH',
      exchange: 'SET',
      currency: 'THB',
      holding: { shares: '10.0000', averageCost: '12.5000', costCurrency: 'THB' },
    })
    const api = new StubApi({
      [`GET /stocks/${ptt.id}`]: ptt,
      [`GET /stocks/${ptt.id}/theses`]: { items: [] },
      'GET /stocks': { items: [ptt] },
      'GET /lists': { items: [] },
    })
    renderApp(`/stocks/${ptt.id}`, api, { language: 'th' })
    const heading = await screen.findByRole('heading', { level: 2, name: 'การถือครอง' })
    const card = within(heading.closest('[data-slot="card"]') as HTMLElement)
    expect(card.getByText('ถืออยู่')).toBeInTheDocument()
    expect(card.getByText('จำนวนหุ้น').nextElementSibling).toHaveTextContent('10')
    expect(card.getByText('ต้นทุนเฉลี่ย').nextElementSibling).toHaveTextContent('฿12.50')
    expect(countLabel(1, 'stock', 'th')).toBe('1 หุ้น')
    expect(countLabel(12, 'stock', 'th')).toBe('12 หุ้น')
  })

  it('TC-U-1048: the stocks page count reads in Thai', async () => {
    const api = new StubApi({ 'GET /stocks': { items: [makeStock()] }, 'GET /lists': { items: [] } })
    renderApp('/stocks', api, { language: 'th' })
    expect((await screen.findAllByText('1 หุ้น')).length).toBeGreaterThan(0)
  })

  it('TC-U-1050: the not-found page and the error boundary are translated', async () => {
    const view = renderApp('/nope', emptyApi(), { language: 'th' })
    expect(await screen.findByRole('heading', { name: 'ไม่พบหน้า' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ไปที่หุ้น' })).toHaveAttribute('href', '/stocks')
    view.unmount()

    const failing = new StubApi({
      'GET /stocks': () => {
        throw new ApiError(500, { code: 'internal_error' })
      },
      'GET /lists': { items: [] },
    })
    renderApp('/stocks', failing, { language: 'th' })
    expect(await screen.findByRole('heading', { name: 'เกิดข้อผิดพลาด' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'โหลดใหม่' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ไปที่หุ้น' })).toBeInTheDocument()
    void toast
  })

  it('TC-U-1040: typed form input survives a language switch', async () => {
    const api = newApi()
    api.on('PATCH /settings', {})
    const user = userEvent.setup()
    renderApp('/stocks/new', api)
    await screen.findByRole('dialog', { name: 'Add stock' })
    await user.type(screen.getByRole('textbox', { name: /^Ticker/ }), 'PTT')
    await user.type(screen.getByRole('textbox', { name: /^Company name/ }), 'PTT PCL')
    await user.click(screen.getByRole('radio', { name: 'TH' }))
    // The modal dialog hides the account menu from the page, so switch the way the menu does.
    await act(async () => setLanguage('th'))
    expect(await screen.findByRole('dialog', { name: 'เพิ่มหุ้น' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^สัญลักษณ์หุ้น/ })).toHaveValue('PTT')
    expect(screen.getByRole('textbox', { name: /^ชื่อบริษัท/ })).toHaveValue('PTT PCL')
    expect(screen.getByRole('radio', { name: 'ไทย' })).toBeChecked()
  })
})

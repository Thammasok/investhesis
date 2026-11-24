import { EXPORT_COLUMNS } from '@investhesis/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import type { Stock } from '@/features/stocks/types'
import { exportFileName } from './export-file-name'
import { csvOfRows, listNameMap, tableOfRows } from './export-rows'

const saveFile = vi.hoisted(() => vi.fn())
vi.mock('@/lib/save-file', () => ({ saveFile }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const th = { market: 'TH', exchange: 'SET', currency: 'THB' } as const
const stocks = (): Stock[] => [
  makeStock({ ticker: 'PTT', name: 'PTT PCL', ...th, listIds: ['core'], holding: { shares: '1000.0000', averageCost: '34.5000', costCurrency: 'THB' } }),
  makeStock({ ticker: 'PTTEP', name: 'PTT EP', ...th }),
  makeStock({ ticker: 'KBANK', name: 'Kasikorn', ...th }),
  makeStock({ ticker: 'NVDA', name: 'NVIDIA' }),
]
const lists = [makeList('core', 'Core', 1), makeList('alpha', 'Alpha', 0)]
const apiFor = (items: Stock[]) =>
  new StubApi({ 'GET /stocks': { items }, 'GET /lists': { items: lists }, 'GET /lists/core': lists[0] })

const textOf = async (blob: Blob) => new Promise<string>((resolve) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.readAsText(blob)
})
// A BOM is a byte-order mark: FileReader decodes it away, so read the bytes for that one check.
const bytesOf = async (blob: Blob) => new Promise<Uint8Array>((resolve) => {
  const reader = new FileReader()
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
  reader.readAsArrayBuffer(blob)
})
const rowsOf = (text: string) => text.replace(/^﻿/, '').split('\r\n').filter(Boolean)

beforeEach(() => {
  saveFile.mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
/** `undefined` is a browser with no clipboard API. Restored after each test; the shared `matchMedia` stub stays. */
const setClipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
afterEach(() => {
  vi.useRealTimers()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

const openMenu = async (path: string, items: Stock[] = stocks()) => {
  const view = renderApp(path, apiFor(items))
  await screen.findByRole('searchbox', { name: 'Search stocks' })
  await userEvent.click(screen.getByRole('button', { name: 'Export' }))
  return view
}

describe('export menu', () => {
  it('TC-U-640 downloads the filtered, sorted rows under the local date', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 24, 23, 30) }) // 24 Nov, local time
    await openMenu('/stocks?market=TH&sort=ticker&dir=desc')
    expect(screen.getByRole('menuitem', { name: /Download CSV/ })).toHaveTextContent('(3 stocks)')

    await userEvent.click(screen.getByRole('menuitem', { name: /Download CSV/ }))

    expect(saveFile).toHaveBeenCalledTimes(1)
    const [blob, name] = saveFile.mock.calls[0] as [Blob, string]
    expect(name).toBe('investhesis-stocks-2026-11-24.csv')
    expect([...(await bytesOf(blob)).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const lines = rowsOf(await textOf(blob))
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(','))
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['PTTEP', 'PTT', 'KBANK'])
  })

  it('TC-U-642 copies the same rows tab-separated, no BOM, and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    await openMenu('/stocks?market=TH&sort=ticker')
    await userEvent.click(screen.getByRole('menuitem', { name: /Copy as table/ }))

    expect(writeText).toHaveBeenCalledTimes(1)
    const text = writeText.mock.calls[0]?.[0] as string
    expect(text.startsWith('﻿')).toBe(false)
    const lines = rowsOf(text)
    expect(lines[0]).toBe(EXPORT_COLUMNS.join('\t'))
    expect(lines.slice(1).map((l) => l.split('\t')[0])).toEqual(['KBANK', 'PTT', 'PTTEP'])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Copied 3 rows'))
  })

  it('TC-U-643 says so when the clipboard is refused or missing, without a success toast', async () => {
    const refusal = "Couldn't copy: your browser blocked the clipboard. Use Download CSV instead."
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) })
    const first = await openMenu('/stocks')
    await userEvent.click(screen.getByRole('menuitem', { name: /Copy as table/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(refusal))
    expect(toast.success).not.toHaveBeenCalled()
    first.unmount()

    vi.mocked(toast.error).mockClear()
    setClipboard(undefined)
    await openMenu('/stocks')
    await userEvent.click(screen.getByRole('menuitem', { name: /Copy as table/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(refusal))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('TC-U-644 disables both exports with a reason when no stock is shown, but keeps the backup link', async () => {
    await openMenu('/stocks?q=zzz')
    expect(screen.getByText('No stocks to export')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Download CSV/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /Copy as table/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /Back up all data/ })).toHaveAttribute('href', '/import-export')
    await userEvent.click(screen.getByRole('menuitem', { name: /Download CSV/ }))
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('names the counts with the right number: 1 stock, 1 row', async () => {
    await openMenu('/stocks?q=nvda')
    expect(screen.getByRole('menuitem', { name: /Download CSV/ })).toHaveTextContent('(1 stock)')
    expect(screen.getByRole('menuitem', { name: /Copy as table/ })).toHaveTextContent('(1 row)')
  })

  it('TC-C-521 on a list page names the file after the list and writes only its members, with every list a stock is in', async () => {
    // PTT is only in Core; PTTEP is in Core and Alpha, so its `lists` cell names both, sorted.
    const items = stocks().map((s) => (s.ticker === 'PTTEP' ? { ...s, listIds: ['core', 'alpha'] } : s))
    renderApp('/lists/core', apiFor(items))
    await screen.findByRole('searchbox', { name: 'Search stocks' })
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Download CSV/ }))
    const [blob, name] = saveFile.mock.calls[0] as [Blob, string]
    expect(name).toMatch(/^investhesis-Core-\d{4}-\d{2}-\d{2}\.csv$/)
    const lines = rowsOf(await textOf(blob))
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['PTT', 'PTTEP'])
    expect(lines[2]).toContain('Alpha;Core')
  })
})

describe('export file names', () => {
  const now = new Date(2026, 10, 24, 12, 0)
  it('TC-U-641 sanitises the list name', () => {
    expect(exportFileName('Core / Swing: 2026?', now)).toBe('investhesis-Core - Swing- 2026-2026-11-24.csv')
    expect(exportFileName('???', now)).toBe('investhesis-list-2026-11-24.csv')
    expect(exportFileName('x'.repeat(70), now)).toBe(`investhesis-${'x'.repeat(60)}-2026-11-24.csv`)
    expect(exportFileName(null, now)).toBe('investhesis-stocks-2026-11-24.csv')
  })
  it('keeps Thai and counts code points, not UTF-16 units', () => {
    expect(exportFileName('หุ้นไทย', now)).toBe('investhesis-หุ้นไทย-2026-11-24.csv')
    expect(exportFileName('😀'.repeat(70), now)).toBe(`investhesis-${'😀'.repeat(60)}-2026-11-24.csv`)
  })
  it('trims spaces and dashes from both ends, collapses runs and strips control characters', () => {
    expect(exportFileName('  -Core--Swing-  ', now)).toBe('investhesis-Core-Swing-2026-11-24.csv')
    expect(exportFileName('a\u0000b\tc', now)).toBe('investhesis-a-b-c-2026-11-24.csv')
  })
  it('names the file by the local date', () => {
    expect(exportFileName(null, new Date(2026, 0, 5, 0, 5))).toBe('investhesis-stocks-2026-01-05.csv')
  })
})

describe('export rows', () => {
  it('TC-C-519 writes cells as typed: quoted when needed, never escaped for formulas', () => {
    const odd = [
      makeStock({ ticker: 'ODD1', name: 'Acme, "Inc"', themes: ['a;b', 'x'] }),
      makeStock({ ticker: 'ODD2', name: '=1+1' }),
      makeStock({ ticker: 'ODD3', name: 'two\nlines' }),
    ]
    const text = csvOfRows(odd, new Map())
    expect(text.startsWith('﻿')).toBe(true)
    expect(text).toContain('"Acme, ""Inc"""')
    expect(text).toContain(',=1+1,')
    expect(text).toContain('"two\nlines"')
    expect(text.endsWith('\r\n')).toBe(true)
  })

  it('a tab inside a cell is quoted in the copied table, a comma is not', () => {
    const text = tableOfRows([makeStock({ ticker: 'T', name: 'a\tb, c' })], new Map())
    expect(text).toContain('"a\tb, c"')
  })

  it('TC-C-520 builds the CSV of 1,000 stocks with holdings in under a second', () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      makeStock({
        ticker: `T${i}`,
        name: `Stock ${i}`,
        themes: ['a', 'b', 'c'],
        listIds: ['l1', 'l2', 'l3'],
        holding: { shares: '10.0000', averageCost: '20.0000', costCurrency: 'USD' },
      }),
    )
    const names = listNameMap([makeList('l1', 'One'), makeList('l2', 'Two'), makeList('l3', 'Three')])
    const t0 = performance.now()
    const text = csvOfRows(many, names)
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(rowsOf(text)).toHaveLength(1001)
  })
})

it('keeps the menu items inside the open menu', async () => {
  await openMenu('/stocks')
  const menu = screen.getByRole('menu')
  expect(within(menu).getAllByRole('menuitem')).toHaveLength(3)
})

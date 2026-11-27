import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { makeList } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import { rowProblemText } from './row-problem'
import type { PreviewResponse } from './types'

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }))

const preview: PreviewResponse = {
  fileName: 'stocks.csv',
  format: 'csv',
  counts: { new: 1, duplicate: 0, error: 1 },
  headerWarnings: [],
  ignoredColumns: [],
  rows: [
    { rowNumber: 2, ticker: 'NVDA', market: 'US', name: 'NVIDIA', status: 'new', errors: [] },
    {
      rowNumber: 3,
      ticker: 'NVDA',
      market: 'US',
      name: 'NVIDIA',
      status: 'error',
      errors: [{ path: 'ticker', message: 'repeats row 2 in this file', rule: 'repeatsRow', params: { row: 2 } }],
    },
  ],
}

const api = () =>
  new StubApi({
    'GET /lists': { items: [makeList('L1', 'Core holdings', 1)] },
    'POST /imports/preview': preview,
    'DOWNLOAD /imports/template.csv': { blob: new Blob(['a']), filename: 'template.csv' },
    'DOWNLOAD /imports/template.xlsx': { blob: new Blob(['b']), filename: 'template.xlsx' },
  })

describe('imports in Thai', () => {
  it('TC-U-1055: the template download sends the current language', async () => {
    const stub = api()
    renderApp('/import-export/import', stub, { language: 'th' })
    await screen.findByRole('dialog', { name: 'นำเข้าหุ้น' })
    expect(screen.getByText('ไฟล์ XLSX มีชีตคำแนะนำ')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'แม่แบบ Excel' }))
    await waitFor(() => expect(stub.calls.map((c) => c.path)).toContain('/imports/template.xlsx?lang=th'))
    await userEvent.click(screen.getByRole('button', { name: 'แม่แบบ CSV' }))
    await waitFor(() => expect(stub.calls.map((c) => c.path)).toContain('/imports/template.csv'))
    expect(stub.calls.map((c) => c.path)).not.toContain('/imports/template.csv?lang=th')
  })

  it('TC-U-1056: import row problems read in Thai from rules', async () => {
    renderApp('/import-export/import', api(), { language: 'th' })
    await screen.findByRole('dialog', { name: 'นำเข้าหุ้น' })
    const input = screen.getByLabelText('เลือกไฟล์') as HTMLInputElement
    await userEvent.upload(input, new File(['ticker,market\nNVDA,US'], 'stocks.csv', { type: 'text/csv' }))
    await screen.findByRole('heading', { level: 2, name: 'ตรวจสอบ' })
    const dialog = screen.getByRole('dialog')
    const texts = within(dialog).getAllByText(/ticker: ซ้ำกับแถวที่ 2 ในไฟล์นี้/)
    expect(texts.length).toBeGreaterThan(0)
  })

  it('TC-U-1056: a problem without a rule keeps the API text', () => {
    expect(rowProblemText({ path: 'name', message: 'required' }, 'th')).toBe('name: required')
    expect(rowProblemText({ path: 'ticker', message: 'x', rule: 'repeatsRow', params: { row: 2 } }, 'en')).toBe(
      'ticker: repeats row 2 in this file',
    )
  })
})

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import type { ImportSummary, PreviewResponse, PreviewRow } from './types'

const lists = [makeList('L1', 'Core holdings', 22), makeList('L2', 'Watching', 3)]

function row(rowNumber: number, ticker: string, status: PreviewRow['status'], extra: Partial<PreviewRow> = {}): PreviewRow {
  return { rowNumber, ticker, market: 'US', name: `${ticker} Inc.`, status, errors: [], ...extra }
}

function preview(overrides: Partial<PreviewResponse> = {}): PreviewResponse {
  const rows = overrides.rows ?? [
    row(2, 'NVDA', 'new'),
    row(3, 'AAPL', 'duplicate', { existingStockId: 's1' }),
    row(4, 'XYZ', 'error', { market: 'JP', name: '', errors: [{ path: 'market', message: 'must be US or TH' }, { path: 'name', message: 'required' }] }),
  ]
  const count = (s: PreviewRow['status']) => rows.filter((r) => r.status === s).length
  return {
    fileName: 'holdings.xlsx',
    format: 'xlsx',
    counts: { new: count('new'), duplicate: count('duplicate'), error: count('error') },
    headerWarnings: [],
    ignoredColumns: [],
    rows,
    ...overrides,
  }
}

const summary: ImportSummary = {
  targetList: { id: 'L1', name: 'Core holdings' },
  created: 31,
  updated: 0,
  skipped: 3,
  failed: 1,
  addedToList: 34,
  errorRows: [{ rowNumber: 4, cells: { ticker: 'XYZ', market: 'JP', name: '' }, errors: [{ path: 'market', message: 'must be US or TH' }] }],
}

function api(routes: Record<string, unknown> = {}) {
  return new StubApi({ 'GET /lists': { items: lists }, 'POST /imports/preview': preview(), 'POST /imports': summary, ...routes })
}

const problem = (status: number, code: string, errors: unknown[] = []) => () => {
  throw new ApiError(status, { code, errors })
}

const csv = () => new File(['ticker,market\nNVDA,US'], 'holdings.csv', { type: 'text/csv' })
const fileInput = () => screen.getByLabelText('Choose file') as HTMLInputElement
const live = () => document.querySelector('[aria-live="polite"]') as HTMLElement
const bodyOf = (stub: StubApi, route: string) => stub.callsTo(route)[0]?.body as FormData

async function openWizard(stub: StubApi, path = '/import-export/import') {
  const view = renderApp(path, stub)
  await screen.findByRole('dialog', { name: 'Import stocks' })
  return view
}

async function reachReview(stub: StubApi, path = '/import-export/import', file = csv()) {
  const view = await openWizard(stub, path)
  await userEvent.upload(fileInput(), file)
  await screen.findByRole('heading', { level: 2, name: 'Review' })
  return { ...view, file }
}

const combo = (name: RegExp | string) => screen.getByRole('combobox', { name })
async function choose(name: RegExp | string, option: RegExp | string) {
  await userEvent.click(combo(name))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}
const importButton = () => screen.getByRole('button', { name: /^Import \d+ stocks?$/ })

let created: Blob[] = []
beforeEach(() => {
  created = []
  URL.createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob)
    return `blob:test/${created.length}`
  })
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('import preview: ignored columns', () => {
  const reviewWith = async (ignoredColumns: string[]) => {
    await openWizard(api({ 'POST /imports/preview': preview({ ignoredColumns }) }))
    await userEvent.upload(fileInput(), csv())
    await screen.findByRole('heading', { level: 2, name: 'Review' })
  }

  it('TC-U-662 names the ignored columns once, in a status note', async () => {
    await reviewWith(['lists', 'held'])
    const note = screen.getByText(/Lists and holdings columns are not imported/).closest('[data-slot="alert"]') as HTMLElement
    expect(note).toHaveAttribute('role', 'status')
    expect(note).toHaveTextContent('Lists and holdings columns are not imported: lists, held.')
    expect(note).toHaveTextContent('Add the stocks to lists and mark holdings in the app after the import.')
    expect(screen.getByText('held')).toHaveClass('font-mono')
  })

  it('TC-U-663 shows no note for a template file', async () => {
    await reviewWith([])
    expect(screen.queryByText(/Lists and holdings columns are not imported/)).not.toBeInTheDocument()
  })
})

describe('import wizard: step 1', () => {
  it('TC-C-160: shows the step indicator and the file step heading, with the backup card in place of "Coming later"', async () => {
    await openWizard(api())
    const steps = within(screen.getByRole('list', { name: 'Import steps' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent?.replace(/\d/, ''))).toEqual(['File', 'Review', 'Done'])
    expect(steps[0]).toHaveAttribute('aria-current', 'step')
    expect(steps[1]).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('heading', { level: 2, name: 'Choose file' })).toBeInTheDocument()
    expect(screen.queryByText(/Coming later/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download JSON', hidden: true })).toBeInTheDocument() // the page behind the dialog
    expect(fileInput()).toHaveAttribute('accept', '.csv,.xlsx')
    expect(screen.getByText(/Up to 1 MB and 1,000 rows/)).toBeInTheDocument()
  })

  it('TC-C-161: the template buttons fetch with the bearer token (api.download) and save the blob, then revoke the URL', async () => {
    const stub = api({
      'DOWNLOAD /imports/template.csv': { blob: new Blob(['a']), filename: 'investhesis-stocks-template.csv' },
      'DOWNLOAD /imports/template.xlsx': { blob: new Blob(['b']), filename: 'investhesis-stocks-template.xlsx' },
    })
    await openWizard(stub)
    expect(screen.queryByRole('link', { name: /template/ })).not.toBeInTheDocument()
    const clicks: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(`${this.download}|${this.href}`)
    })

    await userEvent.click(screen.getByRole('button', { name: 'CSV template' }))
    await waitFor(() => expect(clicks).toEqual(['investhesis-stocks-template.csv|blob:test/1']))
    await userEvent.click(screen.getByRole('button', { name: 'Excel template' }))
    await waitFor(() => expect(clicks[1]).toBe('investhesis-stocks-template.xlsx|blob:test/2'))
    expect(stub.callsTo('DOWNLOAD /imports/template.csv')).toHaveLength(1)
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1'))
    expect(document.querySelector('a[download]')).toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('TC-C-161: a failed template download shows an alert and the button works again', async () => {
    const stub = api({ 'DOWNLOAD /imports/template.csv': problem(500, 'internal_error') })
    await openWizard(stub)
    await userEvent.click(screen.getByRole('button', { name: 'CSV template' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download the template. Try again.')
    expect(screen.getByRole('button', { name: 'CSV template' })).toBeEnabled()
  })

  it.each([
    [413, 'file_too_large', 'File is larger than 1 MB'],
    [415, 'file_unsupported', 'Use a .csv or .xlsx file'],
    [422, 'file_too_many_rows', 'The file has more than 1,000 rows; the limit is 1,000'],
    [422, 'file_empty', 'The file has no data rows'],
    [400, 'file_missing', 'Choose a file to import'],
    [500, 'internal_error', 'Something went wrong. Try again.'],
  ])('TC-C-162: preview %i %s shows an alert on step 1', async (status, code, message) => {
    const stub = api({ 'POST /imports/preview': problem(status, code) })
    await openWizard(stub)
    await userEvent.upload(fileInput(), csv())
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { level: 2, name: 'Choose file' })).toBeInTheDocument()
    expect(fileInput()).toBeEnabled()
  })

  it('TC-U-111: missing headers are named in the alert and the wizard stays on step 1', async () => {
    const stub = api({
      'POST /imports/preview': problem(422, 'file_missing_headers', [{ path: 'ticker', message: 'missing' }, { path: 'name', message: 'missing' }]),
    })
    await openWizard(stub)
    await userEvent.upload(fileInput(), csv())
    expect(await screen.findByRole('alert')).toHaveTextContent('Missing columns: ticker, name')
    expect(screen.queryByRole('heading', { level: 2, name: 'Review' })).not.toBeInTheDocument()
  })

  it('TC-C-162: a network failure is retryable, and choosing the same file again re-sends it; a valid file clears the alert', async () => {
    let attempts = 0
    const stub = api({
      'POST /imports/preview': () => {
        attempts += 1
        if (attempts === 1) throw new ApiError(0, undefined, 'network_error')
        return preview()
      },
    })
    await openWizard(stub)
    const file = csv()
    await userEvent.upload(fileInput(), file)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server')
    expect(fileInput().value).toBe('')
    await userEvent.upload(fileInput(), file)
    await screen.findByRole('heading', { level: 2, name: 'Review' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(stub.callsTo('POST /imports/preview')).toHaveLength(2)
  })

  it('TC-C-160: "Checking file…" is announced in the polite live region and the zone is disabled meanwhile', async () => {
    let finish: (value: PreviewResponse) => void = () => {}
    const stub = api({ 'POST /imports/preview': () => new Promise((resolve) => (finish = resolve)) })
    await openWizard(stub)
    await userEvent.upload(fileInput(), csv())
    await waitFor(() => expect(live()).toHaveTextContent('Checking file…'))
    expect(fileInput()).toBeDisabled()
    await act(async () => finish(preview()))
    await screen.findByRole('heading', { level: 2, name: 'Review' })
    expect(live()).toHaveTextContent('')
  })

  it('TC-C-163: sends the dropped file once; ignores a drop without files; uses the first of two; shows hostile names as text', async () => {
    const stub = api()
    await openWizard(stub)
    const zone = fileInput().closest('label') as HTMLElement

    fireEvent.dragOver(zone, { dataTransfer: { files: [], types: ['Files'] } })
    expect(zone).toHaveClass('border-primary')
    fireEvent.dragLeave(zone)
    expect(zone).not.toHaveClass('border-primary')

    fireEvent.drop(zone, { dataTransfer: { files: [], types: ['text/plain'] } })
    expect(stub.callsTo('POST /imports/preview')).toHaveLength(0)

    const hostile = new File(['x'], '<img src=x onerror=alert(1)>.xlsx')
    fireEvent.drop(zone, { dataTransfer: { files: [hostile, csv()] } })
    await screen.findByRole('heading', { level: 2, name: 'Review' })
    expect(stub.callsTo('POST /imports/preview')).toHaveLength(1)
    expect((bodyOf(stub, 'POST /imports/preview').get('file') as File).name).toBe(hostile.name)
    expect(document.querySelectorAll('img')).toHaveLength(0)
  })
})

describe('import wizard: step 2', () => {
  it('TC-U-110: shows counts, the file header, and filters rows by status', async () => {
    const stub = api({
      'POST /imports/preview': preview({
        rows: [row(2, 'NVDA', 'new'), row(3, 'AAPL', 'duplicate'), row(4, 'XYZ', 'error', { errors: [{ path: 'market', message: 'must be US or TH' }] })],
      }),
    })
    await reachReview(stub)
    expect(screen.getByText('holdings.xlsx · 3 rows')).toBeInTheDocument()
    expect(screen.getByText('1 new')).toBeInTheDocument()
    expect(screen.getByText('1 duplicate')).toBeInTheDocument()
    expect(screen.getByText('1 error')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(4)

    await userEvent.click(screen.getByRole('radio', { name: 'Errors' }))
    const table = screen.getByRole('table', { name: 'Rows in holdings.xlsx, showing errors' })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByText('XYZ')).toBeInTheDocument()
    expect(within(table).queryByText('NVDA')).not.toBeInTheDocument()
  })

  it('TC-C-165: each filter shows only its status and a filter with no matches shows a message instead of an empty table', async () => {
    const stub = api({ 'POST /imports/preview': preview({ rows: [row(2, 'NVDA', 'new'), row(3, 'AAPL', 'new')] }) })
    await reachReview(stub)
    expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'New' }))
    expect(screen.getAllByRole('row')).toHaveLength(3)
    await userEvent.click(screen.getByRole('radio', { name: 'Duplicates' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('No duplicate rows.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'All' }))
    expect(screen.getByRole('table', { name: 'Rows in holdings.xlsx, showing all' })).toBeInTheDocument()
  })

  it('TC-C-166: shows status as icon and text, every failed field as "field: message", and "Already saved" for duplicates', async () => {
    const long = 'x'.repeat(200)
    const stub = api({
      'POST /imports/preview': preview({
        rows: [
          row(2, 'AAPL', 'duplicate'),
          row(3, 'XYZ', 'error', {
            errors: [
              { path: 'market', message: 'must be US or TH' },
              { path: 'name', message: 'required' },
              { path: 'sector', message: long },
            ],
          }),
          row(4, 'PTTEP', 'new', { market: 'TH', name: 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม' }),
        ],
      }),
    })
    await reachReview(stub)
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0] as HTMLElement).getAllByText('Duplicate').length).toBeGreaterThan(0)
    expect(within(rows[0] as HTMLElement).getAllByText('Already saved').length).toBeGreaterThan(0)
    const failed = rows[1] as HTMLElement
    expect(failed).toHaveClass('bg-destructive/5')
    for (const text of ['market: must be US or TH', 'name: required', `sector: ${long}`]) {
      expect(within(failed).getAllByText(text).length).toBeGreaterThan(0)
    }
    expect(within(failed).getAllByText('Error').length).toBeGreaterThan(0)
    expect(within(failed).getAllByRole('cell')[0]).toHaveTextContent('3')
    expect(within(rows[2] as HTMLElement).getAllByText('บมจ. ปตท. สำรวจและผลิตปิโตรเลียม').length).toBeGreaterThan(0)
  })

  it('TC-C-167: header warnings are listed in a status alert, not role=alert, and do not block import', async () => {
    const stub = api({ 'POST /imports/preview': preview({ headerWarnings: ['Unknown column "notes" ignored', 'Unknown column "x" ignored'] }) })
    await reachReview(stub)
    expect(screen.getByText('Unknown column "notes" ignored')).toBeInTheDocument()
    expect(screen.getByText('Unknown column "x" ignored')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await choose(/Add to list/, 'Core holdings')
    expect(importButton()).toBeEnabled()
  })

  it('TC-C-167: no warning, no alert', async () => {
    await reachReview(api())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('TC-U-112: the Duplicates group is absent without duplicates; Import is disabled until a list is chosen; then it sends skip', async () => {
    const stub = api({ 'POST /imports/preview': preview({ rows: ['A', 'B', 'C', 'D', 'E'].map((t, i) => row(i + 2, t, 'new')) }) })
    await reachReview(stub)
    expect(screen.queryByRole('radiogroup', { name: 'Duplicates' })).not.toBeInTheDocument()
    expect(importButton()).toBeDisabled()
    expect(importButton()).toHaveTextContent('Import 5 stocks')
    await choose(/Add to list/, 'Watching')
    expect(importButton()).toBeEnabled()
    await userEvent.click(importButton())
    await screen.findByRole('heading', { level: 2, name: 'Done' })
    const body = bodyOf(stub, 'POST /imports')
    expect(body.get('duplicateMode')).toBe('skip')
    expect(body.get('targetListId')).toBe('L2')
    expect(body.has('newListName')).toBe(false)
  })

  it('TC-C-169: with duplicates, Skip is selected, each option is described, and Update is sent when chosen', async () => {
    const stub = api()
    await reachReview(stub)
    const group = screen.getByRole('radiogroup', { name: 'Duplicates' })
    expect(within(group).getByRole('radio', { name: /Skip/ })).toBeChecked()
    expect(within(group).getByText('Keep saved stocks as they are')).toBeInTheDocument()
    expect(within(group).getByText("Overwrite with this file's non-empty values")).toBeInTheDocument()
    await userEvent.click(within(group).getByRole('radio', { name: /Update/ }))
    await choose(/Add to list/, 'Core holdings')
    await userEvent.click(importButton())
    await screen.findByRole('heading', { level: 2, name: 'Done' })
    expect(bodyOf(stub, 'POST /imports').get('duplicateMode')).toBe('update')
  })

  it('TC-U-113: when every row is an error Import stays disabled with the reason', async () => {
    const stub = api({ 'POST /imports/preview': preview({ rows: [1, 2, 3, 4].map((n) => row(n + 1, `E${n}`, 'error')) }) })
    await reachReview(stub)
    await choose(/Add to list/, 'Core holdings')
    expect(screen.getByText('Nothing to import — fix the file and choose it again')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Import/ })).toBeDisabled()
  })

  it('TC-C-168: the select offers the lists and "New list…"; a new name is required, validated, and sent as newListName', async () => {
    const stub = api()
    await reachReview(stub)
    expect(combo(/Add to list/)).toHaveAttribute('aria-required', 'true')
    await userEvent.click(combo(/Add to list/))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Core holdings', 'Watching', 'New list…'])
    await userEvent.click(screen.getByRole('option', { name: 'New list…' }))

    const name = screen.getByRole('textbox', { name: /New list name/ })
    expect(importButton()).toBeDisabled()
    await userEvent.type(name, 'x'.repeat(61))
    await userEvent.click(importButton())
    expect(await screen.findByText('Use 1 to 60 characters.')).toBeInTheDocument()
    expect(stub.callsTo('POST /imports')).toHaveLength(0)

    await userEvent.clear(name)
    await userEvent.type(name, '  Swing study ')
    await userEvent.click(importButton())
    await screen.findByRole('heading', { level: 2, name: 'Done' })
    const body = bodyOf(stub, 'POST /imports')
    expect(body.get('newListName')).toBe('Swing study')
    expect(body.has('targetListId')).toBe(false)
  })

  it('TC-U-116: ?listId= pre-selects the target list; an unknown id selects nothing', async () => {
    await reachReview(api(), '/import-export/import?listId=L1')
    expect(combo(/Add to list/)).toHaveTextContent('Core holdings')
    expect(importButton()).toBeEnabled()
  })

  it('TC-C-168: an unknown ?listId= leaves nothing selected, without an error', async () => {
    await reachReview(api(), '/import-export/import?listId=nope')
    expect(combo(/Add to list/)).not.toHaveTextContent('Core holdings')
    expect(importButton()).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('TC-C-164: "Choose another" returns to step 1 without a request and drops the file', async () => {
    const stub = api()
    await reachReview(stub)
    await userEvent.click(screen.getByRole('button', { name: 'Choose another' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Choose file' })).toBeInTheDocument()
    expect(fileInput().value).toBe('')
    expect(stub.callsTo('POST /imports/preview')).toHaveLength(1)
    expect(screen.queryByText('holdings.xlsx · 3 rows')).not.toBeInTheDocument()
  })

  it('TC-C-164: Cancel also returns to step 1', async () => {
    await reachReview(api())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Choose file' })).toBeInTheDocument()
  })

  it('TC-C-160: a step change moves focus to the step heading and marks the step current', async () => {
    await reachReview(api())
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Review' })).toHaveFocus())
    const steps = within(screen.getByRole('list', { name: 'Import steps' })).getAllByRole('listitem')
    expect(steps[1]).toHaveAttribute('aria-current', 'step')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Choose file' })).toHaveFocus())
  })
})

describe('import wizard: confirm', () => {
  it('TC-C-170: sends options before the very same File, one request on a double click, and announces "Importing…"', async () => {
    let finish: (value: ImportSummary) => void = () => {}
    const stub = api({ 'POST /imports': () => new Promise((resolve) => (finish = resolve)) })
    const { file } = await reachReview(stub)
    await choose(/Add to list/, 'Core holdings')
    expect(importButton()).toHaveTextContent('Import 2 stocks')
    await userEvent.dblClick(importButton())
    await waitFor(() => expect(live()).toHaveTextContent('Importing…'))
    expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled()
    expect(stub.callsTo('POST /imports')).toHaveLength(1)

    const body = bodyOf(stub, 'POST /imports')
    expect([...body.keys()]).toEqual(['duplicateMode', 'targetListId', 'file'])
    expect(body.get('file')).toBe(file)
    await act(async () => finish(summary))
    await screen.findByRole('heading', { level: 2, name: 'Done' })
  })

  it('TC-C-170: the label says "Import 1 stock" for one row', async () => {
    const stub = api({ 'POST /imports/preview': preview({ rows: [row(2, 'NVDA', 'new')] }) })
    await reachReview(stub)
    expect(screen.getByRole('button', { name: 'Import 1 stock' })).toBeInTheDocument()
  })

  it('TC-U-114: a taken new list name is a field error on step 2 and the file is kept', async () => {
    const stub = api({ 'POST /imports': problem(409, 'list_name_taken') })
    const { file } = await reachReview(stub)
    await choose(/Add to list/, 'New list…')
    await userEvent.type(screen.getByRole('textbox', { name: /New list name/ }), 'Watching')
    await userEvent.click(importButton())
    expect(await screen.findByText('A list with this name already exists.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /New list name/ })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('heading', { level: 2, name: 'Review' })).toBeInTheDocument()
    await userEvent.click(importButton())
    await waitFor(() => expect(stub.callsTo('POST /imports')).toHaveLength(2))
    expect(bodyOf(stub, 'POST /imports').get('file')).toBe(file)
  })

  it.each([
    [413, 'file_too_large', 'File is larger than 1 MB'],
    [422, 'nothing_to_import', 'Nothing to import — fix the file and choose it again'],
    [500, 'internal_error', 'Something went wrong. Try again.'],
  ])('TC-C-171: confirm %i %s shows an alert on step 2 and can be retried', async (status, code, message) => {
    let fail = true
    const stub = api({
      'POST /imports': () => {
        if (fail) throw new ApiError(status, { code })
        return summary
      },
    })
    await reachReview(stub)
    await choose(/Add to list/, 'Core holdings')
    await userEvent.click(importButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { level: 2, name: 'Review' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /Import finished/ })).not.toBeInTheDocument()
    expect(combo(/Add to list/)).toHaveTextContent('Core holdings')

    fail = false
    await userEvent.click(importButton())
    expect(await screen.findByRole('heading', { level: 2, name: 'Done' })).toBeInTheDocument()
  })

  it('TC-C-171: a network failure is retryable', async () => {
    const stub = api({ 'POST /imports': () => { throw new ApiError(0, undefined, 'network_error') } })
    await reachReview(stub)
    await choose(/Add to list/, 'Core holdings')
    await userEvent.click(importButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server')
    expect(importButton()).toBeEnabled()
  })

  it('TC-C-171: a 404 says the list is gone, reloads the lists and clears the choice', async () => {
    let remaining = lists
    const stub = api({ 'GET /lists': () => ({ items: remaining }), 'POST /imports': () => { remaining = [lists[1] as (typeof lists)[number]]; throw new ApiError(404, { code: 'not_found' }) } })
    await reachReview(stub)
    await choose(/Add to list/, 'Core holdings')
    await userEvent.click(importButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('That list no longer exists. Choose another list.')
    await waitFor(() => expect(stub.callsTo('GET /lists').length).toBeGreaterThan(1))
    expect(combo(/Add to list/)).not.toHaveTextContent('Core holdings')
    expect(importButton()).toBeDisabled()
    await userEvent.click(combo(/Add to list/))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Watching', 'New list…'])
  })
})

describe('import wizard: step 3', () => {
  async function finish(stub = api()) {
    await reachReview(stub)
    await choose(/Add to list/, 'Core holdings')
    await userEvent.click(importButton())
    await screen.findByRole('heading', { level: 2, name: 'Done' })
  }

  it('TC-U-115: shows the counts, a link to the list and the error-rows CSV (BOM first, original columns plus errors)', async () => {
    await finish()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Import finished into "Core holdings"')
    expect(status).toHaveTextContent('31 created · 3 skipped · 0 updated · 1 failed')
    expect(screen.getByRole('link', { name: 'Open Core holdings' })).toHaveAttribute('href', '/lists/L1')

    const clicks: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download)
    })
    await userEvent.click(screen.getByRole('button', { name: 'Download error rows (CSV)' }))
    expect(clicks).toEqual(['investhesis-import-errors.csv'])
    const blob = created[0] as Blob
    expect(blob.type).toContain('text/csv')
    const bytes = new Uint8Array(
      await new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.readAsArrayBuffer(blob)
      }),
    )
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    expect(text.split('\r\n')[0]).toBe('﻿row,ticker,market,name,errors')
    expect(text.split('\r\n')).toHaveLength(3)
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled())
  })

  it('TC-C-172: no download button when nothing failed; "Import another" returns to a clean step 1', async () => {
    const stub = api({ 'POST /imports': { ...summary, failed: 0, errorRows: [] } })
    await finish(stub)
    expect(screen.queryByRole('button', { name: /Download error rows/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Import another' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Choose file' })).toHaveFocus()
    expect(fileInput().value).toBe('')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('TC-C-172: lists are reloaded after a successful import so a new list shows in the select', async () => {
    const stub = api()
    await finish(stub)
    await waitFor(() => expect(stub.callsTo('GET /lists').length).toBeGreaterThan(1))
  })
})

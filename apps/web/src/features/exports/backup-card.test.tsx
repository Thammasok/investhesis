import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { StubApi } from '@/test/stub-api'
import { backupFileName, localDate } from './export-file-name'

const saved: string[] = []
beforeEach(() => {
  saved.length = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test/1')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download)
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const file = (name: string) => ({ blob: new Blob(['x']), filename: name })
const page = (extra: Record<string, unknown> = {}) =>
  new StubApi({ 'GET /lists': { items: [] }, ...extra })
const open = async (stub: StubApi) => {
  renderApp('/import-export', stub)
  await screen.findByRole('button', { name: 'Download JSON' })
}

describe('backup card', () => {
  it('TC-U-660 and TC-C-524 downloads the JSON backup and saves it under the local date', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const stub = page({ 'DOWNLOAD /exports/backup.json': async () => { await gate; return file('investhesis-backup-2026-11-25.json') } })
    await open(stub)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 24, 23, 30) }) // local time, 24 Nov

    await userEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    const busy = screen.getByRole('button', { name: 'Download JSON' })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled()
    release()
    await waitFor(() => expect(saved).toEqual(['investhesis-backup-2026-11-24.json']))
    expect(screen.getByRole('button', { name: 'Download JSON' })).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('button', { name: 'Download JSON' })).not.toHaveAttribute('aria-disabled')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('TC-U-661 and TC-C-524 a failed backup shows an alert, keeps the other button usable and clears on the next click', async () => {
    const stub = page({
      'DOWNLOAD /exports/backup.csv': () => { throw new ApiError(503, { code: 'db_unavailable' }) },
      'DOWNLOAD /exports/backup.json': file('x.json'),
    })
    await open(stub)
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't download the backup. Check your connection and try again.")
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled()
    expect(saved).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await waitFor(() => expect(saved).toHaveLength(1))
  })

  it('TC-U-664 and TC-C-524 the loading spinner respects reduced motion and the busy button keeps its name', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await open(page({ 'DOWNLOAD /exports/backup.csv': async () => { await gate; return file('x.csv') } }))
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    const button = screen.getByRole('button', { name: 'Download CSV' }) // the visible "Preparing…" text is hidden from the name
    expect(button).toHaveTextContent('Preparing…')
    expect(button.querySelector('svg.animate-spin')).toHaveClass('motion-reduce:animate-none')
    release()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  })

  it('TC-U-665 says what the files hold, that they include shares and costs, and points to the Stocks page', async () => {
    await open(page())
    expect(screen.getByText(/Download everything: each stock with its lenses and holding, your lists, and your concentration settings\./)).toBeInTheDocument()
    expect(screen.getByText(/These files include your shares and costs\. Keep them private\./)).toBeInTheDocument()
    expect(screen.getByText(/filter the Stocks page and use Export there/)).toBeInTheDocument()
    expect(screen.getByText('Import stocks from CSV or Excel, or download all your data.')).toBeInTheDocument()
  })

  it('names the file by the local date, not the UTC one', () => {
    const lateNight = new Date(2026, 10, 24, 23, 30)
    expect(localDate(lateNight)).toBe('2026-11-24')
    expect(backupFileName('csv', new Date(2026, 0, 5, 0, 5))).toBe('investhesis-backup-2026-01-05.csv')
  })
})

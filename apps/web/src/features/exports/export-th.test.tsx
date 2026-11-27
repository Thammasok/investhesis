import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'

const saveFile = vi.hoisted(() => vi.fn())
vi.mock('@/lib/save-file', () => ({ saveFile }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const api = () =>
  new StubApi({
    'GET /stocks': {
      items: [
        makeStock({ ticker: 'XOM', name: 'Exxon Mobil', gicsSector: 'Energy' }),
        makeStock({ ticker: 'JPM', name: 'JPMorgan Chase', gicsSector: 'Financials' }),
      ],
    },
    'GET /lists': { items: [] },
  })

const textOf = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
beforeEach(() => saveFile.mockClear())
afterEach(() => {
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

/** Exports once in a language and returns the saved text and the copied text. */
async function exportIn(language: 'en' | 'th') {
  const copied: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) },
    configurable: true,
  })
  const th = language === 'th'
  const view = renderApp('/stocks', api(), { language })
  await userEvent.click(await screen.findByRole('button', { name: th ? 'ส่งออก' : 'Export' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: th ? /^ดาวน์โหลด CSV/ : /^Download CSV/ }))
  await waitFor(() => expect(saveFile).toHaveBeenCalled())
  const saved = await textOf((saveFile.mock.calls.at(-1) as [Blob])[0])
  await userEvent.click(await screen.findByRole('button', { name: th ? 'ส่งออก' : 'Export' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: th ? /^คัดลอกเป็นตาราง/ : /^Copy as table/ }))
  await waitFor(() => expect(copied).toHaveLength(1))
  view.unmount()
  return { saved, copied: copied[0] as string }
}

describe('export in Thai', () => {
  it('TC-U-1054: export bytes do not depend on the language', async () => {
    const en = await exportIn('en')
    saveFile.mockClear()
    const th = await exportIn('th')
    expect(th.saved).toBe(en.saved)
    expect(th.copied).toBe(en.copied)
    expect(th.saved).toContain('Energy')
    expect(th.copied).toContain('Energy')
  })
})

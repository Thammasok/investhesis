import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { deferred } from '@/test/stub-api'
import { chainRegion, inChain, openChains, openRenameOf, renameButtonOf, serverApi, TH, typeName } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))
beforeEach(() => vi.clearAllMocks())

const posts = (stub: ReturnType<typeof serverApi>) => stub.callsTo('POST /chains/rename')
const submit = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))

describe('the rename dialog', () => {
  it('TC-C-930 the dialog is labelled, selected and counts every stock of the chain, in view or not', async () => {
    const stocks = [...inChain('AI semis', 'A', 2, TH), ...inChain('AI semis', 'B', 1), ...inChain('Oil', 'O', 1)]
    await openChains('/chains?market=TH', serverApi(stocks))

    const dialog = await openRenameOf('AI semis')

    expect(dialog).toHaveAccessibleName('Rename chain')
    expect(dialog).toHaveAccessibleDescription('Changes the name on 3 stocks, including any outside this view.')
    const input = within(dialog).getByRole('textbox', { name: 'Chain name' }) as HTMLInputElement
    expect(input).toHaveValue('AI semis')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveFocus()
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'AI semis'.length])
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeInTheDocument()
    // The limit is enforced by cutting at 60 code points (so 60 emoji fit), not by a maxLength attribute.
    expect(input).not.toHaveAttribute('maxlength')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('TC-C-930 a chain of one stock reads in the singular', async () => {
    await openChains('/chains', serverApi([...inChain('AI semis', 'A', 3), ...inChain('Oil', 'O', 1)]))
    await userEvent.click(within(chainRegion('Oil')).getByRole('button', { name: /Rename/ }))
    expect(await screen.findByRole('dialog')).toHaveAccessibleDescription('Changes the name on 1 stock, including any outside this view.')
  })

  const KNOWN = () => [...inChain('AI semis', 'A', 3), ...inChain('AI & Semis', 'B', 7), ...inChain('ai & semis', 'C', 1, { createdAt: '2027-01-01T00:00:00.000Z' }), ...inChain('AI & Semis x', 'D', 1)]
  const CASES: [string, string, 'merge' | 'rename' | 'unchanged', string?][] = [
    ['AI semis', 'ai & semis', 'merge', 'AI & Semis'],
    ['AI semis', '  AI & SEMIS  ', 'merge', 'AI & Semis'],
    ['AI semis', 'AI &  Semis', 'rename'],
    ['AI semis', 'ai semis', 'rename'],
    ['AI semis', 'AI semis', 'unchanged'],
    ['AI semis', 'AI & Semis x', 'merge', 'AI & Semis x'],
  ]
  it.each(CASES)('TC-C-931 renaming %j to %j is a %s', async (chain, typed, outcome, other) => {
    const stub = serverApi(KNOWN())
    await openChains('/chains', stub)
    const dialog = await openRenameOf(chain)
    await typeName(dialog, typed)

    await submit(dialog)

    if (outcome === 'merge') {
      const title = await within(dialog).findByRole('heading', { name: `Merge into "${other}"?` })
      expect(title).toBeInTheDocument()
      expect(posts(stub)).toHaveLength(0)
      const otherCount = other === 'AI & Semis' ? 8 : 1
      expect(dialog).toHaveTextContent(`"AI semis" (3 stocks) and "${other}" (${otherCount === 1 ? '1 stock' : '8 stocks'}) will become one chain named "${typed.trim()}". This can't be split again automatically.`)
      expect(within(dialog).getByRole('button', { name: `Merge ${3 + otherCount} stocks` })).toBeInTheDocument()
    } else if (outcome === 'rename') {
      await waitFor(() => expect(posts(stub)).toHaveLength(1))
      expect(posts(stub)[0]?.body).toEqual({ from: 'AI semis', to: typed, merge: false })
      expect(screen.queryByRole('heading', { name: /^Merge into/ })).toBeNull()
    } else {
      await waitFor(() => expect(toast).toHaveBeenCalledWith('No changes to save'))
      expect(posts(stub)).toHaveLength(0)
    }
  })

  it('TC-C-932 the merge step takes focus, Back restores the name, Escape cancels, and Tab stays in the dialog', async () => {
    const stub = serverApi(KNOWN())
    await openChains('/chains', stub)
    const dialog = await openRenameOf('AI semis')
    await typeName(dialog, 'ai & semis')
    await submit(dialog)

    const title = await within(dialog).findByRole('heading', { name: 'Merge into "AI & Semis"?' })
    expect(title).toHaveFocus()
    expect(title).toHaveAttribute('tabindex', '-1')
    for (let i = 0; i < 6; i++) {
      await userEvent.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }

    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }))
    const input = within(dialog).getByRole('textbox', { name: 'Chain name' })
    expect(input).toHaveValue('ai & semis')
    expect(input).toHaveFocus()
    await submit(dialog)
    await within(dialog).findByRole('heading', { name: 'Merge into "AI & Semis"?' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(renameButtonOf('AI semis')).toHaveFocus()
    expect(posts(stub)).toHaveLength(0)

    const again = await openRenameOf('AI semis')
    await typeName(again, 'ai & semis')
    await submit(again)
    await userEvent.click(await within(again).findByRole('button', { name: 'Merge 11 stocks' }))
    await waitFor(() => expect(posts(stub)).toHaveLength(1))
    expect(posts(stub)[0]?.body).toEqual({ from: 'AI semis', to: 'ai & semis', merge: true })
  })

  it('TC-C-933 one request while saving, a disabled form, a motion-safe spinner, and the answer is not dropped', async () => {
    const stub = serverApi(inChain('Banks', 'A', 2))
    const gate = deferred<unknown>()
    stub.on('POST /chains/rename', () => gate.promise)
    await openChains('/chains', stub)
    const dialog = await openRenameOf('Banks')
    const input = await typeName(dialog, 'Lenders')

    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(posts(stub)).toHaveLength(1))
    const button = within(dialog).getByRole('button', { name: 'Rename' })
    await userEvent.click(button)
    await userEvent.keyboard('{Enter}')

    expect(posts(stub)).toHaveLength(1)
    expect(button).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(input).toHaveAttribute('readonly')
    expect(dialog.querySelector('svg.animate-spin')?.getAttribute('class')).toContain('motion-reduce:animate-none')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    gate.resolve({ name: 'Lenders', changed: 2, merged: false })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toast.success).toHaveBeenCalledWith('Renamed to Lenders · 2 stocks changed')
    expect(posts(stub)).toHaveLength(1)
  })

  it('TC-C-934 empty, blank, long and emoji names behave at the limit', async () => {
    const stub = serverApi(inChain('Banks', 'A', 1))
    await openChains('/chains', stub)
    const dialog = await openRenameOf('Banks')

    for (const blank of ['', '   ']) {
      const input = await typeName(dialog, blank)
      await submit(dialog)
      expect(await within(dialog).findByText('Enter a name of 1 to 60 characters.')).toBeInTheDocument()
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input.getAttribute('aria-describedby')).toBeTruthy()
      expect(document.getElementById(input.getAttribute('aria-describedby') as string)).toHaveTextContent('Enter a name of 1 to 60 characters.')
      expect(input).toHaveFocus()
      expect(posts(stub)).toHaveLength(0)
      await userEvent.type(input, 'x')
      expect(input).not.toHaveAttribute('aria-invalid')
    }

    const input = within(dialog).getByRole('textbox', { name: 'Chain name' }) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.click(input)
    await userEvent.paste('p'.repeat(100))
    expect(input.value).toHaveLength(60)
    await userEvent.type(input, 'q') // a 61st typed character at the limit changes nothing
    expect(input.value).toHaveLength(60)
    await submit(dialog)
    await waitFor(() => expect(posts(stub)).toHaveLength(1))
    expect(posts(stub)[0]?.body).toMatchObject({ to: 'p'.repeat(60) })
  })

  it('TC-C-934 sixty emoji are sent whole', async () => {
    const stub = serverApi(inChain('Banks', 'A', 1))
    await openChains('/chains', stub)
    const dialog = await openRenameOf('Banks')
    const input = within(dialog).getByRole('textbox', { name: 'Chain name' })
    await userEvent.clear(input)
    await userEvent.click(input)
    await userEvent.paste('\u{1F600}'.repeat(60))

    await submit(dialog)

    await waitFor(() => expect(posts(stub)).toHaveLength(1))
    expect(posts(stub)[0]?.body).toMatchObject({ to: '\u{1F600}'.repeat(60) })
  })

  it('TC-C-935 a name equal to the title after trimming sends nothing; a case-only change is a change', async () => {
    const stub = serverApi(inChain('AI & Semis', 'A', 1))
    await openChains('/chains', stub)

    let dialog = await openRenameOf('AI & Semis')
    await typeName(dialog, '  AI & Semis  ')
    await submit(dialog)
    await waitFor(() => expect(toast).toHaveBeenCalledWith('No changes to save'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts(stub)).toHaveLength(0)

    dialog = await openRenameOf('AI & Semis')
    await typeName(dialog, 'Other')
    await typeName(dialog, 'AI & Semis')
    await submit(dialog)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts(stub)).toHaveLength(0)

    dialog = await openRenameOf('AI & Semis')
    await typeName(dialog, 'ai & semis')
    await submit(dialog)
    await waitFor(() => expect(posts(stub)).toHaveLength(1))
    expect(posts(stub)[0]?.body).toEqual({ from: 'AI & Semis', to: 'ai & semis', merge: false })
  })

  it('TC-C-936 every opening starts clean on the name step with the title selected', async () => {
    const stub = serverApi([...inChain('Banks', 'A', 1), ...inChain('Oil', 'O', 1)])
    await openChains('/chains', stub)

    let dialog = await openRenameOf('Banks')
    await typeName(dialog, 'xyz')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    dialog = await openRenameOf('Oil')
    expect(within(dialog).getByRole('textbox', { name: 'Chain name' })).toHaveValue('Oil')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    dialog = await openRenameOf('Banks')
    const input = within(dialog).getByRole('textbox', { name: 'Chain name' }) as HTMLInputElement
    expect(input).toHaveValue('Banks')
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5])
    await typeName(dialog, '')
    await submit(dialog)
    await within(dialog).findByText('Enter a name of 1 to 60 characters.')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    dialog = await openRenameOf('Banks')
    expect(within(dialog).getByRole('textbox', { name: 'Chain name' })).toHaveValue('Banks')
    expect(within(dialog).queryByText('Enter a name of 1 to 60 characters.')).toBeNull()
    expect(within(dialog).queryByRole('heading', { name: /^Merge into/ })).toBeNull()
  })

  it('TC-C-937 each answer of the API has its own place in the dialog', async () => {
    const stub = serverApi(inChain('Banks', 'A', 1))
    const answers: (() => unknown)[] = [
      () => {
        throw new ApiError(400, { code: 'validation_failed', errors: [{ path: 'from', message: 'bad from' }] })
      },
      () => {
        throw new ApiError(400, { code: 'validation_failed', errors: [{ path: 'to', message: 'Bad to.' }] })
      },
      () => {
        throw new ApiError(500, { code: 'internal', detail: 'stack trace here' })
      },
      () => {
        throw new ApiError(0, {}, 'network_error')
      },
      () => ({ name: 'Lenders', changed: 1, merged: false }),
    ]
    stub.on('POST /chains/rename', () => answers.shift()?.())
    await openChains('/chains', stub)
    const dialog = await openRenameOf('Banks')
    const input = await typeName(dialog, 'Lenders')

    await submit(dialog)
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't rename the chain. Try again.")
    expect(input).not.toHaveAttribute('aria-invalid')

    await submit(dialog)
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(within(dialog).getByText('Bad to.')).toBeInTheDocument()

    await userEvent.type(input, 's') // clears the error, then a 500
    await userEvent.clear(input)
    await userEvent.type(input, 'Lenders')
    await submit(dialog)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't rename the chain. Try again.")
    expect(dialog.textContent).not.toMatch(/stack trace/)
    expect(input).toHaveValue('Lenders')
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeEnabled()

    await submit(dialog)
    await waitFor(() => expect(posts(stub)).toHaveLength(4))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't rename the chain. Try again.")

    await submit(dialog)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts(stub)).toHaveLength(5)
  })

  it('TC-C-937 a 404 shows the gone message with only Close, and the page re-reads so the chain disappears', async () => {
    const stub = serverApi([...inChain('Banks', 'A', 1), ...inChain('Oil', 'O', 1)])
    await openChains('/chains', stub)
    const dialog = await openRenameOf('Banks')
    await typeName(dialog, 'Lenders')
    // Somebody else renamed it first: the server no longer has "Banks".
    stub.setRows(stub.rows().map((r) => (r.valueChain === 'Banks' ? { ...r, valueChain: 'Elsewhere' } : r)))
    const reads = stub.callsTo('GET /stocks').length

    await submit(dialog)

    expect(await within(dialog).findByText('This chain no longer exists.')).toBeInTheDocument()
    expect(within(dialog).getByText('It may have been renamed elsewhere.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Rename' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull()
    await waitFor(() => expect(stub.callsTo('GET /stocks').length).toBe(reads + 1))
    const titles = () => Array.from(document.querySelectorAll('h2[tabindex="-1"]')).map((h) => h.textContent)
    await waitFor(() => expect(titles()).not.toContain('Banks'))
    expect(titles()).toEqual(expect.arrayContaining(['Elsewhere', 'Oil']))
    const close = within(dialog).getAllByRole('button', { name: 'Close' })
    await userEvent.click(close[close.length - 1] as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('region', { name: 'Banks' })).toBeNull()
  })
})


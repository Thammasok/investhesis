import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import type { ListSummary } from '@/features/stocks/types'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => {
  vi.mocked(toast).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

/** An API whose `GET /lists` answers from `store`, so a revalidation after an action shows the change. */
function listsApi(store: ListSummary[]) {
  return new StubApi({ 'GET /lists': () => ({ items: store }), 'GET /stocks': { items: [] } })
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('lists page: table', () => {
  it('TC-C-150: lists rows with name links, right-aligned counts and a row menu named per list', async () => {
    const store = [makeList('w', 'Watching', 11), makeList('c', 'Core holdings', 22), makeList('t', 'หุ้นหลัก', 0)]
    renderApp('/lists', listsApi(store))

    expect(await screen.findByRole('heading', { level: 1, name: 'Lists' })).toBeInTheDocument()
    expect(screen.getByText('3 lists')).toBeInTheDocument()
    expect(rows().map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual(['Core holdings', 'Watching', 'หุ้นหลัก'])
    expect(screen.getByRole('link', { name: 'Core holdings' })).toHaveAttribute('href', '/lists/c')
    const count = within(rows()[0] as HTMLElement).getByText('22')
    expect(count).toHaveClass('text-right', 'tabular-nums')
    expect(screen.getByRole('link', { name: 'หุ้นหลัก' })).toHaveTextContent('หุ้นหลัก')

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Core holdings' }))
    expect(screen.getByRole('menuitem', { name: /Rename/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument()
  })

  it('TC-C-150: the row menu works from the keyboard', async () => {
    renderApp('/lists', listsApi([makeList('c', 'Core holdings', 2)]))
    const button = await screen.findByRole('button', { name: 'Actions for Core holdings' })
    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('menuitem', { name: /Rename/ })).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Rename list' })).toBeInTheDocument()
  })

  it('TC-C-150: shows 1 list in the count and an empty state with New list when there are none', async () => {
    const { unmount } = renderApp('/lists', listsApi([makeList('c', 'Core holdings', 1)]))
    expect(await screen.findByText('1 list')).toBeInTheDocument()
    unmount()

    renderApp('/lists', listsApi([]))
    expect(await screen.findByRole('heading', { name: 'No lists yet' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /New list/ }).length).toBeGreaterThan(0)
  })
})

describe('lists page: create', () => {
  it('TC-U-100: creates a list, closes the dialog, toasts and shows the new row', async () => {
    const store: ListSummary[] = []
    const api = listsApi(store)
    api.on('POST /lists', ({ body }: { body: unknown }) => {
      store.push(makeList('n', (body as { name: string }).name, 0))
      return store[0]
    })
    renderApp('/lists', api)
    await userEvent.click((await screen.findAllByRole('button', { name: /New list/ }))[0] as HTMLElement)
    await userEvent.type(await screen.findByRole('textbox', { name: /Name/ }), 'Core holdings')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /lists')[0]?.body).toEqual({ name: 'Core holdings' })
    expect(toast.success).toHaveBeenCalledWith('List created')
    const row = await screen.findByRole('row', { name: /Core holdings/ })
    expect(within(row).getByText('0')).toBeInTheDocument()
  })

  it('TC-U-101: a 409 shows the field error, keeps the dialog open and focuses Name', async () => {
    const api = listsApi([makeList('w', 'watching', 3)])
    api.on('POST /lists', () => {
      throw new ApiError(409, { code: 'list_name_taken' })
    })
    renderApp('/lists', api)
    await userEvent.click(await screen.findByRole('button', { name: /New list/ }))
    const input = await screen.findByRole('textbox', { name: /Name/ })
    await userEvent.type(input, 'watching{Enter}')

    expect(await screen.findByText('A list with this name already exists.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('A list with this name already exists.')
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('TC-C-151: the dialog is labelled by its title, focuses Name, rejects blank and over-long names', async () => {
    const api = listsApi([makeList('w', 'Watching')])
    renderApp('/lists', api)
    await userEvent.click(await screen.findByRole('button', { name: /New list/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New list' })
    const input = within(dialog).getByRole('textbox', { name: /Name/ })
    expect(input).toHaveFocus()

    await userEvent.type(input, '   {Enter}')
    expect(await within(dialog).findByText(/Enter a name/)).toBeInTheDocument()
    expect(api.callsTo('POST /lists')).toHaveLength(0)

    await userEvent.clear(input)
    await userEvent.type(input, 'x'.repeat(61))
    expect(input).toHaveValue('x'.repeat(60))
  })

  it('TC-C-151: a name over 60 characters pasted past maxLength is still rejected', async () => {
    const api = listsApi([])
    renderApp('/lists', api)
    await userEvent.click((await screen.findAllByRole('button', { name: /New list/ }))[0] as HTMLElement)
    const input = await screen.findByRole('textbox', { name: /Name/ })
    input.removeAttribute('maxlength')
    await userEvent.type(input, 'y'.repeat(61) + '{Enter}')
    expect(await screen.findByText(/1 to 60 characters/)).toBeInTheDocument()
    expect(api.callsTo('POST /lists')).toHaveLength(0)
  })

  it('TC-C-151: Enter sends one POST even on a double Enter, with a spinner while pending', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const api = listsApi([])
    api.on('POST /lists', async () => {
      await gate
      return makeList('n', 'Core', 0)
    })
    renderApp('/lists', api)
    await userEvent.click((await screen.findAllByRole('button', { name: /New list/ }))[0] as HTMLElement)
    await userEvent.type(await screen.findByRole('textbox', { name: /Name/ }), 'Core{Enter}{Enter}')

    const submit = await screen.findByRole('button', { name: /Creating/ })
    expect(submit).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /lists')).toHaveLength(1)
  })

  it('TC-C-151: Esc closes with no request and focus returns to New list', async () => {
    const api = listsApi([makeList('w', 'Watching')])
    renderApp('/lists', api)
    const trigger = await screen.findByRole('button', { name: /New list/ })
    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(api.callsTo('POST /lists')).toHaveLength(0)
  })

  it('TC-C-151: a 500 shows a form alert and keeps the typed name', async () => {
    const api = listsApi([])
    api.on('POST /lists', () => {
      throw new ApiError(500, { code: 'internal_error' })
    })
    renderApp('/lists', api)
    await userEvent.click((await screen.findAllByRole('button', { name: /New list/ }))[0] as HTMLElement)
    const input = await screen.findByRole('textbox', { name: /Name/ })
    await userEvent.type(input, 'Core{Enter}')
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't create the list")
    expect(input).toHaveValue('Core')
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  it('TC-C-151: reopening the dialog starts clean after an error', async () => {
    const api = listsApi([])
    api.on('POST /lists', () => {
      throw new ApiError(409, { code: 'list_name_taken' })
    })
    renderApp('/lists', api)
    const open = async () => userEvent.click((await screen.findAllByRole('button', { name: /New list/ }))[0] as HTMLElement)
    await open()
    await userEvent.type(await screen.findByRole('textbox', { name: /Name/ }), 'dup{Enter}')
    await screen.findByText('A list with this name already exists.')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await open()
    expect(await screen.findByRole('textbox', { name: /Name/ })).toHaveValue('')
    expect(screen.queryByText('A list with this name already exists.')).not.toBeInTheDocument()
  })
})

describe('lists page: rename', () => {
  async function openRename(name = 'Core holdings') {
    const menu = await screen.findByRole('button', { name: `Actions for ${name}` })
    await userEvent.click(menu)
    await userEvent.click(await screen.findByRole('menuitem', { name: /Rename/ }))
    return { menu, dialog: await screen.findByRole('dialog', { name: 'Rename list' }) }
  }

  it('TC-C-152: is prefilled, unchanged submit closes with no request, a change sends PATCH and toasts', async () => {
    const store = [makeList('c', 'Core holdings', 22)]
    const api = listsApi(store)
    api.on('PATCH /lists/c', ({ body }: { body: unknown }) => {
      store[0] = { ...(store[0] as ListSummary), name: (body as { name: string }).name }
      return store[0]
    })
    renderApp('/lists', api)
    let { dialog } = await openRename()
    const input = within(dialog).getByRole('textbox', { name: /Name/ })
    expect(input).toHaveValue('Core holdings')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('PATCH /lists/c')).toHaveLength(0)
    expect(toast.error).not.toHaveBeenCalled()

    ;({ dialog } = await openRename())
    const field = within(dialog).getByRole('textbox', { name: /Name/ })
    await userEvent.clear(field)
    await userEvent.type(field, 'Core{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('PATCH /lists/c')[0]?.body).toEqual({ name: 'Core' })
    expect(toast.success).toHaveBeenCalledWith('List renamed')
    expect(await screen.findByRole('link', { name: 'Core' })).toBeInTheDocument()
  })

  it('TC-C-152: a 409 shows the field error, keeps the dialog and focuses Name', async () => {
    const api = listsApi([makeList('c', 'Core holdings', 22)])
    api.on('PATCH /lists/c', () => {
      throw new ApiError(409, { code: 'list_name_taken' })
    })
    renderApp('/lists', api)
    const { dialog } = await openRename()
    const input = within(dialog).getByRole('textbox', { name: /Name/ })
    await userEvent.type(input, ' 2{Enter}')
    expect(await within(dialog).findByText('A list with this name already exists.')).toBeInTheDocument()
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('TC-C-152: a 404 shows an error in the dialog and refreshes the list', async () => {
    const api = listsApi([makeList('c', 'Core holdings', 22)])
    api.on('PATCH /lists/c', () => {
      throw new ApiError(404, { code: 'not_found' })
    })
    renderApp('/lists', api)
    const { dialog } = await openRename()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'x{Enter}')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('no longer exists')
    await waitFor(() => expect(api.callsTo('GET /lists').length).toBeGreaterThan(1))
  })

  it('TC-C-152: Esc returns focus to the row menu button', async () => {
    renderApp('/lists', listsApi([makeList('c', 'Core holdings', 22)]))
    const { menu } = await openRename()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(menu).toHaveFocus())
  })
})

describe('lists page: delete', () => {
  async function openDelete(name = 'Core holdings') {
    const menu = await screen.findByRole('button', { name: `Actions for ${name}` })
    await userEvent.click(menu)
    await userEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }))
    return { menu, dialog: await screen.findByRole('alertdialog') }
  }

  it.each([
    [22, 'Delete Core holdings?', 'Its 22 stocks stay saved.'],
    [1, 'Delete Core holdings?', 'Its 1 stock stays saved.'],
    [0, 'Delete Core holdings?', 'It has no stocks.'],
  ])('TC-U-102: with %i stocks the dialog says %s then %s, focus starts on Cancel', async (count, title, text) => {
    renderApp('/lists', listsApi([makeList('c', 'Core holdings', count)]))
    const { dialog } = await openDelete()
    expect(within(dialog).getByRole('heading', { name: title })).toBeInTheDocument()
    expect(within(dialog).getByText(text)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    const confirm = within(dialog).getByRole('button', { name: 'Delete' })
    expect(confirm).toHaveAttribute('data-variant', 'destructive')
    // Light theme: white on the destructive colour (the tinted variant measures 4.3:1 and fails AA).
    expect(confirm).toHaveClass('bg-destructive', 'text-white')
  })

  it('TC-U-102: confirm calls DELETE once, toasts and removes the row', async () => {
    const store = [makeList('c', 'Core holdings', 22), makeList('w', 'Watching', 1)]
    const api = listsApi(store)
    api.on('DELETE /lists/c', () => {
      store.splice(0, 1)
    })
    renderApp('/lists', api)
    const { dialog } = await openDelete()
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.callsTo('DELETE /lists/c')).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('Core holdings deleted')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Core holdings' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Watching' })).toBeInTheDocument()
  })

  it('TC-C-153: Esc and Cancel close with no request and return focus to the row menu button', async () => {
    const api = listsApi([makeList('c', 'Core holdings', 22)])
    renderApp('/lists', api)
    let { menu } = await openDelete()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(menu).toHaveFocus())
    ;({ menu } = await openDelete())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(menu).toHaveFocus())
    expect(api.callsTo('DELETE /lists/c')).toHaveLength(0)
  })

  it('TC-C-153: a 404 counts as done and refreshes; a 500 keeps the dialog usable', async () => {
    const api = listsApi([makeList('c', 'Core holdings', 22)])
    let status = 500
    api.on('DELETE /lists/c', () => {
      throw new ApiError(status, { code: 'x' })
    })
    renderApp('/lists', api)
    const { dialog } = await openDelete()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't delete Core holdings")
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled()

    status = 404
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.callsTo('GET /lists').length).toBeGreaterThan(1)
  })
})

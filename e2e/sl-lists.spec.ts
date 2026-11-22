import { expect, test, type Page } from '@playwright/test'
import { h1, settled, signedInUser, toast, us } from './lib/sl.ts'

/** Alt+T moves focus into the toast region; Tab then reaches the toast's Undo action. */
async function focusUndo(page: Page) {
  const undo = page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' })
  await page.keyboard.press('Alt+T')
  for (let i = 0; i < 4 && !(await undo.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(undo).toBeFocused()
}

test.describe('lists', () => {
  test('TC-E-106: manage lists end to end', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/lists')
    const aapl = await api.stock(us('AAPL'))
    const msft = await api.stock(us('MSFT'))
    await expect(page.getByRole('heading', { name: 'No lists yet' })).toBeVisible()
    const dialog = page.getByRole('dialog')
    const create = async (name: string) => {
      await page.getByRole('button', { name: 'New list' }).click()
      await dialog.getByLabel('Name').fill(name)
      await dialog.getByRole('button', { name: 'Create' }).click()
    }

    // Act 1: create, then a case-variant duplicate
    await create('Core holdings')
    await expect(toast(page, 'List created')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Core holdings' })).toBeVisible()
    await create('core HOLDINGS')

    // Assert 1: the dialog stays open with the error
    await expect(dialog).toContainText('A list with this name already exists.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect((await api.lists()).map((l) => l.name)).toEqual(['Core holdings'])

    // Act 2: rename
    await page.getByRole('button', { name: 'Actions for Core holdings' }).click()
    await page.getByRole('menuitem', { name: 'Rename…' }).click()
    await dialog.getByLabel('Name').fill('Core')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'List renamed')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Core', exact: true })).toBeVisible()

    // Act 3: add two stocks through the picker, remove one, undo
    await page.getByRole('link', { name: 'Core', exact: true }).click()
    await expect(page.getByText('This list is empty.')).toBeVisible()
    for (const ticker of ['AAPL', 'MSFT']) {
      await page.getByRole('button', { name: 'Add stock' }).first().click()
      await page.getByRole('option', { name: new RegExp(ticker) }).click()
      await expect(page.getByRole('row', { name: new RegExp(ticker) })).toBeVisible()
    }
    await expect(page.getByText('2 stocks')).toBeVisible()
    await page.getByRole('button', { name: 'Remove MSFT from Core' }).click()
    await expect(page.getByText('1 stock', { exact: true })).toBeVisible()
    await toast(page, 'Removed MSFT from Core').getByRole('button', { name: 'Undo' }).click()

    // Assert 3
    await expect(page.getByText('2 stocks')).toBeVisible()
    expect((await api.lists())[0]!.stockCount).toBe(2)

    // Act 4: delete the list
    await page.goto('/lists')
    await page.getByRole('button', { name: 'Actions for Core' }).click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('Delete Core?')
    await expect(page.getByRole('alertdialog')).toContainText('Its 2 stocks stay saved.')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()

    // Assert 4: stocks survive and carry no list badge
    await expect(page.getByRole('heading', { name: 'No lists yet' })).toBeVisible()
    expect((await api.stocks()).map((s) => s.id).sort()).toEqual([aapl.id, msft.id].sort())
    await page.goto('/stocks')
    await expect(page.locator('tbody tr')).toHaveCount(2)
    await expect(page.locator('tbody [data-slot="badge"]', { hasText: 'Core' })).toHaveCount(0)
  })

  test('TC-E-121: keyboard only, lists and dialogs', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/lists')
    await api.list('Core holdings')
    const nvda = await api.stock(us('NVDA', { name: 'NVIDIA' }))
    await page.reload()
    await settled(page)
    const dialog = page.getByRole('dialog')
    const alertDialog = page.getByRole('alertdialog')

    // Act 1: Tab to New list, Enter, type, Enter
    const newList = page.getByRole('button', { name: 'New list' })
    await newList.focus()
    await page.keyboard.press('Enter')

    // Assert 1: focus starts on the name input; Esc returns to the trigger
    await expect(dialog.getByLabel('Name')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(newList).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.type('Swing study')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('link', { name: 'Swing study' })).toBeVisible()

    // Act 2: row menu with Enter, Rename…, Esc
    const rowMenu = page.getByRole('button', { name: 'Actions for Swing study' })
    await rowMenu.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Rename…' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByLabel('Name')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rowMenu).toBeFocused()

    // Act 3: Delete…, focus on Cancel, Tab to the confirm button, Esc
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Delete…' }).focus()
    await page.keyboard.press('Enter')
    const cancel = alertDialog.getByRole('button', { name: 'Cancel' })
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(alertDialog.getByRole('button', { name: 'Delete' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rowMenu).toBeFocused()
    expect((await api.lists()).map((l) => l.name).sort()).toEqual(['Core holdings', 'Swing study'])

    // Act 4: open a list, pick a stock with the arrow keys
    await page.getByRole('link', { name: 'Core holdings' }).focus()
    await page.keyboard.press('Enter')
    await expect(h1(page)).toHaveText('Core holdings')
    await page.getByRole('button', { name: 'Add stock' }).first().focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // Assert 4: the stock is in, and the remove button and Undo are reachable by keyboard
    await expect(toast(page, 'Added NVDA to Core holdings')).toBeVisible()
    const remove = page.getByRole('button', { name: 'Remove NVDA from Core holdings' })
    await remove.focus()
    await page.keyboard.press('Enter')
    await expect(toast(page, 'Removed NVDA from Core holdings')).toBeVisible()
    await focusUndo(page)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('row', { name: /NVDA/ })).toBeVisible()
    expect((await api.stocks())[0]!.listIds).toHaveLength(1)
    void nvda
  })

  test('TC-E-123: keyboard only, stock detail actions', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    const stock = await api.stock(us('NVDA'))
    const core = await api.list('Core holdings')
    await api.list('Watching')
    await api.addToList(core.id, stock.id)
    await page.goto(`/stocks/${stock.id}`)
    await settled(page)

    // Assert: tab order Edit -> More -> list remove -> Add to list
    await page.getByRole('link', { name: 'Edit' }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'More actions' })).toBeFocused()

    // Act 1: More -> Delete -> Cancel returns focus
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Delete' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'More actions' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Core holdings' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Remove from Core holdings' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Add to list' })).toBeFocused()

    // Act 2: Add to list with the arrow keys
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('link', { name: 'Watching' })).toBeVisible()

    // Act 3: remove with Enter, undo with the toast shortcut
    await page.getByRole('button', { name: 'Remove from Watching' }).focus()
    await page.keyboard.press('Enter')
    await expect(toast(page, 'Removed from Watching')).toBeVisible()
    await focusUndo(page)
    await page.keyboard.press('Enter')

    // Assert
    await expect(page.getByRole('link', { name: 'Watching' })).toBeVisible()
    expect((await api.lists()).map((l) => l.stockCount)).toEqual([1, 1])
  })
})

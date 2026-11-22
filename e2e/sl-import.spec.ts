import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { F, HEADERS, csv, xlsx } from '../apps/api/test/fixtures/imports/build.ts'
import {
  apiAs,
  arrow,
  chooseTarget,
  codePoints,
  h1,
  importButton,
  lens,
  newUser,
  openSignedIn,
  pickFile,
  previewCounts,
  settled,
  signedInUser,
  summaryLine,
  toast,
  us,
} from './lib/sl.ts'

// exceljs belongs to the API workspace; load it from there and type only what is used.
const ExcelJS = createRequire(join(__dirname, '../apps/api/package.json'))('exceljs') as {
  Workbook: new () => { xlsx: { load(data: Buffer): Promise<unknown> }; worksheets: { getRow(n: number): { values: unknown } }[] }
}
const BOM = [0xef, 0xbb, 0xbf]

const row = (fields: Record<string, string>) => HEADERS.map((h) => fields[h] ?? '')

test.describe('import', () => {
  test('TC-E-109: import a CSV edited from the downloaded template into a new list', async ({ page }) => {
    // Arrange: download the template through the button
    const { api } = await signedInUser(page, '/import-export')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV template' }).click()])
    const template = readFileSync((await download.path())!)
    expect([...template.subarray(0, 3)]).toEqual(BOM)
    const header = template.toString('utf8').slice(1).split(/\r?\n/)[0]!.split(',')
    expect(header).toEqual(HEADERS)

    // Arrange: keep the header, replace the two example rows with four of our own
    const edited = csv(
      header,
      [
        { ticker: 'NVDA', market: 'US', exchange: 'NASDAQ', name: 'NVIDIA Corporation', sector: 'Information Technology', style: 'Growth' },
        { ticker: 'PTTEP', market: 'TH', exchange: 'SET', name: 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม', sector: 'Resources', gics_sector: 'Energy', themes: 'พลังงาน' },
        { ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', name: 'Apple Inc', style: 'growth', size: 'mega' },
        { ticker: 'MSFT', market: 'US', exchange: 'NASDAQ', name: 'Microsoft', themes: 'AI; Cloud ;ai' },
      ],
      { bom: true },
    )

    // Act
    await pickFile(page, 'edited-template.csv', edited, 'text/csv')

    // Assert: review
    await expect(page.getByRole('heading', { name: 'Review' })).toBeFocused()
    expect(await previewCounts(page)).toEqual(['4 new', '0 duplicate', '0 error'])
    await chooseTarget(page, 'New list…')
    await page.getByLabel('New list name').fill('Swing study')
    await expect(importButton(page)).toHaveText('Import 4 stocks')

    // Act
    await importButton(page).click()

    // Assert: summary, list page, canonical values
    await expect(summaryLine(page)).toContainText('4 created · 0 skipped · 0 updated · 0 failed')
    await page.getByRole('link', { name: 'Open Swing study' }).click()
    await expect(h1(page)).toHaveText('Swing study')
    await expect(page.locator('tbody tr')).toHaveCount(4)
    const saved = Object.fromEntries((await api.stocks()).map((s) => [s.ticker, s]))
    expect(saved['AAPL']).toMatchObject({ style: 'Growth', size: 'Mega' })
    expect(saved['MSFT']!.themes).toEqual(['AI', 'Cloud'])
    expect(codePoints(saved['PTTEP']!.name)).toEqual(codePoints('บมจ. ปตท. สำรวจและผลิตปิโตรเลียม'))
    expect(saved['NVDA']).toMatchObject({ economicCycle: 'Sensitive', lensSources: { economicCycle: 'default' } })
    await page.goto(`/stocks/${saved['NVDA']!.id}`)
    await expect(lens(page, 'Economic cycle').getByText('Default')).toBeVisible()
  })

  test('TC-E-110: import an XLSX with duplicates in update mode', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/import-export')
    await api.stock(us('NVDA', { style: 'Value', gicsSector: 'Information Technology' }))
    await api.stock(us('AAPL'))
    const core = await api.list('Core holdings')
    await page.reload()
    await settled(page)
    const book = await xlsx([
      {
        rows: [
          HEADERS,
          row({ ticker: 'NVDA', market: 'US', exchange: 'NASDAQ', name: 'NVIDIA', style: 'Growth' }),
          row({ ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', name: 'Apple Inc.', moat: 'Brand' }),
          row({ ticker: 'MSFT', market: 'US', exchange: 'NASDAQ', name: 'Microsoft' }),
          row({ ticker: 'BAD1', market: 'JP', exchange: 'NASDAQ', name: 'Broken' }),
        ],
      },
    ])

    // Act
    await pickFile(page, 'update.xlsx', book)

    // Assert: preview counts
    expect(await previewCounts(page)).toEqual(['1 new', '2 duplicate', '1 error'])

    // Act
    await page.getByLabel('Update', { exact: true }).check()
    await chooseTarget(page, 'Core holdings')
    await importButton(page).click()

    // Assert
    await expect(summaryLine(page)).toContainText('1 created · 0 skipped · 2 updated · 1 failed')
    const stocks = Object.fromEntries((await api.stocks()).map((s) => [s.ticker, s]))
    expect(stocks['NVDA']).toMatchObject({ style: 'Growth', economicCycle: 'Sensitive' })
    expect(stocks['AAPL']).toMatchObject({ moat: 'Brand' })
    expect(stocks['BAD1']).toBeUndefined()
    expect([...stocks['NVDA']!.listIds, ...stocks['AAPL']!.listIds, ...stocks['MSFT']!.listIds]).toEqual([core.id, core.id, core.id])
  })

  test('TC-E-111: error rows in the preview, the filter and the downloaded report', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/import-export')
    const file = csv(
      ['ticker', 'market', 'exchange', 'name'],
      [
        ['AAA', 'US', 'NYSE', 'Alpha'],
        ['ข้อผิดพลาด!', 'JP', 'XXX', ''],
        ['BBB', 'US', 'NYSE', 'Bravo'],
        ['BAD', 'US', 'SET', 'บริษัท, "ผิด"'],
        ['CCC', 'TH', 'SET', 'ซี'],
      ],
      { bom: true },
    )
    await pickFile(page, 'mixed.csv', file, 'text/csv')

    // Act: filter to the errors
    await page.getByLabel('Errors', { exact: true }).check()

    // Assert: exactly the two error rows, each with every failed field
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('market:')
    await expect(rows.nth(0)).toContainText('exchange:')
    await expect(rows.nth(0)).toContainText('name:')
    await expect(rows.nth(1)).toContainText('exchange:')

    // Act: import and download the report
    await chooseTarget(page, 'New list…')
    await page.getByLabel('New list name').fill('Report')
    await importButton(page).click()
    await expect(summaryLine(page)).toContainText('3 created · 0 skipped · 0 updated · 2 failed')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download error rows (CSV)' }).click()])

    // Assert: BOM, columns, two data lines, Thai intact, nothing saved from the error rows
    const bytes = readFileSync((await download.path())!)
    expect([...bytes.subarray(0, 3)]).toEqual(BOM)
    const text = bytes.toString('utf8').slice(1)
    expect(text.split('\r\n')[0]).toBe('row,ticker,market,exchange,name,errors')
    expect(text).toContain('ข้อผิดพลาด!,JP,XXX,')
    expect(text).toContain('"บริษัท, ""ผิด"""')
    expect(text.trimEnd().split('\r\n')).toHaveLength(3)
    expect((await api.stocks()).map((s) => s.ticker).sort()).toEqual(['AAA', 'BBB', 'CCC'])
  })

  test('TC-E-112: file-level problems keep the page on step 1 and a valid file recovers', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/import-export')
    const alert = page.getByRole('alert')
    const cases: [string, Buffer, string][] = [
      ['size-1.1mb.csv', F.ofSize(1_153_434), 'File is larger than 1 MB'],
      ['report.txt', F.reportTxt(), 'Use a .csv or .xlsx file'],
      ['rows-1001.csv', F.rows1001(), 'The file has more than 1,000 rows; the limit is 1,000'],
      ['header-only.csv', F.headerOnly(), 'The file has no data rows'],
      ['missing-headers.csv', csv(['ticker', 'market'], [['A', 'US']]), 'Missing columns: exchange, name'],
      ['fake.xlsx', F.fakeXlsx(), 'Use a .csv or .xlsx file'],
    ]

    // Act + Assert: every problem shows its message and stays on step 1
    for (const [name, body, message] of cases) {
      await pickFile(page, name, body)
      await expect(alert).toHaveText(message)
      await expect(page.getByRole('heading', { name: 'Choose file' })).toBeVisible()
    }
    expect(await api.stocks()).toHaveLength(0)

    // Act: a valid file
    await pickFile(page, 'ok.csv', F.noBom(), 'text/csv')

    // Assert
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
    await expect(alert).toHaveCount(0)
    expect(await api.stocks()).toHaveLength(0)
  })

  test('TC-E-113: skip keeps a saved stock but still lists it; update changes it', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/import-export')
    await api.stock(us('AAPL', { style: 'Quality' }))
    const first = csv(['ticker', 'market', 'exchange', 'name'], [['NVDA', 'US', 'NASDAQ', 'NVIDIA'], ['AAPL', 'US', 'NASDAQ', 'Apple']])
    const second = csv(['ticker', 'market', 'exchange', 'name', 'style'], [['AAPL', 'US', 'NASDAQ', 'Apple', 'Growth']])
    const run = async (file: Buffer, listOption: string, mode?: 'Skip' | 'Update', newName?: string) => {
      await page.goto('/import-export')
      await pickFile(page, 'f.csv', file, 'text/csv')
      await chooseTarget(page, listOption)
      if (newName) await page.getByLabel('New list name').fill(newName)
      if (mode) await page.getByLabel(mode, { exact: true }).check()
      await importButton(page).click()
    }

    // Act 1: skip (the Duplicates group is shown, as AAPL is saved)
    await run(first, 'New list…', 'Skip', 'One')

    // Assert 1
    await expect(summaryLine(page)).toContainText('1 created · 1 skipped · 0 updated · 0 failed')
    expect((await api.stocks()).find((s) => s.ticker === 'AAPL')).toMatchObject({ style: 'Quality' })
    expect((await api.lists())[0]!.stockCount).toBe(2)

    // Act 2 + Assert 2: same duplicate with Skip, then with Update
    await run(second, 'One', 'Skip')
    await expect(summaryLine(page)).toContainText('0 created · 1 skipped · 0 updated · 0 failed')
    expect((await api.stocks()).find((s) => s.ticker === 'AAPL')).toMatchObject({ style: 'Quality' })
    await run(second, 'One', 'Update')
    await expect(summaryLine(page)).toContainText('0 created · 0 skipped · 1 updated · 0 failed')
    expect((await api.stocks()).find((s) => s.ticker === 'AAPL')).toMatchObject({ style: 'Growth' })
  })

  test('TC-E-113: the Duplicates group is absent when the file has no duplicates', async ({ page }) => {
    // Arrange
    await signedInUser(page, '/import-export')

    // Act
    await pickFile(page, 'new.csv', csv(['ticker', 'market', 'exchange', 'name'], [['NVDA', 'US', 'NASDAQ', 'NVIDIA']]), 'text/csv')

    // Assert
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Skip' })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: 'Update' })).toHaveCount(0)
  })

  test('TC-E-114: import into a list from its page; a foreign list id selects nothing', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    const list = await api.list('Empty one')
    const stranger = await apiAs(await newUser())
    const foreign = await stranger.list('Not yours')
    await page.goto(`/lists/${list.id}`)

    // Act
    await page.getByRole('link', { name: 'Import into it' }).click()

    // Assert: the URL, then the pre-selected list after choosing a file
    await expect(page).toHaveURL(`/import-export?listId=${list.id}`)
    await pickFile(page, 'a.csv', F.noBom(), 'text/csv')
    await expect(page.locator('#import-target')).toContainText('Empty one')
    await importButton(page).click()
    await expect(summaryLine(page)).toContainText('3 created')
    expect((await api.lists())[0]!.stockCount).toBe(3)

    // Act: someone else's list id
    await page.goto(`/import-export?listId=${foreign.id}`)
    await pickFile(page, 'b.csv', F.noBom(), 'text/csv')

    // Assert: nothing selected, no error page, and the foreign list's name is nowhere
    await expect(page.locator('#import-target')).toContainText('Choose a list')
    await expect(page.getByText('Not yours')).toHaveCount(0)
    await expect(importButton(page)).toBeDisabled()
  })

  test('TC-E-115: template downloads work with a real sign-in (buttons that send the bearer token)', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/import-export')
    const statuses: number[] = []
    page.on('response', (r) => {
      if (r.url().includes('/api/imports/template.')) statuses.push(r.status())
    })

    // Act
    const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV template' }).click()])
    const [xlsxDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel template' }).click()])

    // Assert: names match what the API names them, content is valid
    const expectedNames = await Promise.all(
      ['csv', 'xlsx'].map(async (ext) => {
        const res = await fetch(`http://localhost:3000/imports/template.${ext}`, { headers: { authorization: `Bearer ${api.token}` } })
        return /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1]
      }),
    )
    expect([csvDownload.suggestedFilename(), xlsxDownload.suggestedFilename()]).toEqual(expectedNames)
    expect(expectedNames.every(Boolean)).toBe(true)
    const csvBytes = readFileSync((await csvDownload.path())!)
    expect([...csvBytes.subarray(0, 3)]).toEqual(BOM)
    expect(csvBytes.toString('utf8').slice(1).split(/\r?\n/)[0]!.split(',')).toHaveLength(19)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(readFileSync((await xlsxDownload.path())!))
    expect(book.worksheets[0]!.getRow(1).values).toEqual([undefined, ...HEADERS])
    expect(statuses).toEqual([200, 200])
  })

  test('TC-E-122: keyboard only, import', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/import-export')
    await api.stock(us('AAPL', { name: 'Apple Inc' }))
    const file = csv(
      ['ticker', 'market', 'exchange', 'name'],
      [['AAPL', 'US', 'NASDAQ', 'Apple Inc'], ['NVDA', 'US', 'NASDAQ', 'NVIDIA'], ['BAD', 'JP', 'NASDAQ', 'Broken']],
    )

    // Act 1: Tab to the file input and open the chooser from the keyboard
    await page.getByRole('button', { name: 'Excel template' }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Choose file')).toBeFocused()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
    await chooser.setFiles({ name: 'k.csv', mimeType: 'text/csv', buffer: file })

    // Assert 1: the step heading takes focus, tab order is as designed
    await expect(page.getByRole('heading', { name: 'Review' })).toBeFocused()
    const focused = async () => page.evaluate(() => (document.activeElement as HTMLElement).id || document.activeElement?.textContent?.trim() || '')
    await page.keyboard.press('Tab')
    expect(await focused()).toBe('Choose another')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('radio', { name: 'All' })).toBeFocused()
    await arrow(page, 'ArrowRight')
    await expect(page.getByRole('radio', { name: 'New' })).toBeChecked()
    await arrow(page, 'ArrowLeft')
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked()
    await page.keyboard.press('Tab')
    await expect(page.locator('#import-target')).toBeFocused()

    // Act 2: New list… with the keyboard
    await page.keyboard.press('Enter')
    await page.getByRole('option', { name: 'New list…' }).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('New list name')).toBeFocused()
    await page.keyboard.type('Keys')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('radio', { name: 'Skip' })).toBeFocused()
    await arrow(page, 'ArrowDown')
    await expect(page.getByRole('radio', { name: 'Update' })).toBeChecked()
    await page.keyboard.press('Tab')
    expect(await focused()).toBe('Cancel')
    await page.keyboard.press('Tab')
    await expect(importButton(page)).toBeFocused()
    await page.keyboard.press('Enter')

    // Assert 2: the summary is announced and focus moved to the step heading
    await expect(page.getByRole('heading', { name: 'Done' })).toBeFocused()
    await expect(summaryLine(page)).toContainText('1 created · 0 skipped · 1 updated · 1 failed')

    // Act 3: Tab to the download button and press Enter
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Open Keys' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Download error rows (CSV)' })).toBeFocused()
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')])

    // Assert 3
    expect(download.suggestedFilename()).toBe('investhesis-import-errors.csv')
  })

  test('TC-E-127: a 1,000-row import through the UI', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/import-export')

    // Act: F-07 first, then F-06
    await pickFile(page, 'rows-1001.csv', F.rows1001(), 'text/csv')
    await expect(page.getByRole('alert')).toHaveText('The file has more than 1,000 rows; the limit is 1,000')
    expect(await api.stocks()).toHaveLength(0)
    await pickFile(page, 'rows-1000.csv', F.rows1000(), 'text/csv')
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()

    // Assert: the table scrolls inside its own container, the page does not scroll sideways, the filter responds
    const box = page.locator('div.overflow-auto', { has: page.locator('table') }).first()
    expect(await box.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const started = Date.now()
    await page.getByLabel('Errors', { exact: true }).check()
    await expect(page.getByText('No rows with errors.')).toBeVisible()
    expect(Date.now() - started).toBeLessThan(1000)
    await page.getByLabel('All', { exact: true }).check()

    // Act: import into a new list
    await chooseTarget(page, 'New list…')
    await page.getByLabel('New list name').fill('Thousand')
    await importButton(page).click()

    // Assert
    await expect(summaryLine(page)).toContainText('1000 created', { timeout: 30_000 })
    expect(await api.stocks()).toHaveLength(1000)
    await page.goto('/stocks')
    await expect(page.locator('tbody tr')).toHaveCount(1000)
  })

  test('TC-E-128: Thai text through import (CSV and XLSX) and back', async ({ page }) => {
    // Arrange: the same data as CSV for user A and as XLSX for user B
    const rowsData = JSON.parse(JSON.stringify(F.thaiNames().toString('utf8').slice(1).split('\n').slice(1, 6))) as string[]
    expect(rowsData).toHaveLength(5)
    const { api: apiA } = await signedInUser(page, '/import-export')
    const cells = (line: string) => line.split(',')
    const thaiXlsx = await xlsx([{ rows: [HEADERS, ...rowsData.map(cells)] }])

    // Act: A imports the CSV
    await pickFile(page, 'thai.csv', F.thaiNames(), 'text/csv')
    await chooseTarget(page, 'New list…')
    await page.getByLabel('New list name').fill('ไทย')
    await importButton(page).click()
    await expect(summaryLine(page)).toContainText('5 created')

    // Act: B imports the XLSX
    const userB = await newUser()
    const apiB = await apiAs(userB)
    await openSignedIn(page, userB, '/import-export')
    await pickFile(page, 'thai.xlsx', thaiXlsx)
    await chooseTarget(page, 'New list…')
    await page.getByLabel('New list name').fill('ไทย')
    await importButton(page).click()
    await expect(summaryLine(page)).toContainText('5 created')

    // Assert: identical stored values, identical code points
    const pick = (stocks: Awaited<ReturnType<typeof apiA.stocks>>) => stocks.map((s) => [s.ticker, codePoints(s.name), s.themes, s.setIndustryGroup])
    expect(pick(await apiB.stocks())).toEqual(pick(await apiA.stocks()))
    const ptt = (await apiB.stocks()).find((s) => s.ticker === 'PTT')!
    expect(codePoints(ptt.name)).toEqual(codePoints('บมจ. ปตท.'))
    expect(ptt.themes).toEqual(['พลังงาน', 'ปันผล'])

    // Assert: table, detail and the edit form show the same text
    await page.goto('/stocks')
    await expect(page.getByRole('row', { name: /PTT/ })).toContainText('บมจ. ปตท.')
    await page.goto(`/stocks/${ptt.id}`)
    await expect(h1(page)).toContainText('บมจ. ปตท.')
    await expect(lens(page, 'Themes')).toContainText('พลังงาน')
    await page.goto(`/stocks/${ptt.id}/edit`)
    expect(codePoints(await page.locator('#stock-name').inputValue())).toEqual(codePoints('บมจ. ปตท.'))

    // Assert: no mojibake in the template round trip
    await page.goto('/import-export')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV template' }).click()])
    const template = readFileSync((await download.path())!).toString('utf8')
    expect(template).toContain('บริษัท ปตท. สำรวจและผลิตปิโตรเลียม จำกัด (มหาชน)')
  })

  test('TC-E-130: import data never leaves the app', async ({ page, context }) => {
    // Arrange
    const { api } = await signedInUser(page, '/import-export')
    const marker = `CELLVALUE${Date.now()}`
    const file = csv(['ticker', 'market', 'exchange', 'name'], [['PRIV', 'US', 'NYSE', marker]])
    const requests: { url: string; method: string; body: Buffer | null }[] = []
    context.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: null }))
    // Bodies of multipart uploads are only readable while a route holds the request.
    const bodies: { url: string; method: string; body: Buffer | null }[] = []
    await context.route('**/api/**', async (route) => {
      bodies.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataBuffer() })
      await route.continue()
    })
    const appOrigin = new URL(page.url()).origin

    // Act 1: a full import
    await pickFile(page, 'priv.csv', file, 'text/csv')
    await chooseTarget(page, 'New list…')
    await page.getByLabel('New list name').fill('Private')
    await importButton(page).click()
    await expect(summaryLine(page)).toContainText('1 created')

    // Act 2: abandon a second import at step 2 (close the page)
    const second = await context.newPage()
    await second.goto('/import-export')
    await pickFile(second, 'abandon.csv', csv(['ticker', 'market', 'exchange', 'name'], [['GONE', 'US', 'NYSE', `${marker}-abandoned`]]), 'text/csv')
    await expect(second.getByRole('heading', { name: 'Review' })).toBeVisible()
    await second.close()

    // Assert: every request goes to the app origin or local Supabase Auth
    const hosts = new Set(requests.map((r) => new URL(r.url).origin))
    for (const host of hosts) expect([appOrigin, 'http://127.0.0.1:54321'], host).toContain(host)
    // Assert: the cell value is in the two preview bodies and the confirm body, nowhere else
    const carrying = bodies.filter((r) => r.body?.includes(marker)).map((r) => `${r.method} ${new URL(r.url).pathname}`)
    expect(carrying.sort()).toEqual(['POST /api/imports', 'POST /api/imports/preview', 'POST /api/imports/preview'])
    // Assert: the abandoned import saved nothing
    expect((await api.stocks()).map((s) => s.ticker)).toEqual(['PRIV'])
    expect(await api.lists()).toHaveLength(1)
    // Assert: the API log holds no cell value
    await settled(page)
    expect(readFileSync(join(__dirname, '.output/dev-server.log'), 'utf8')).not.toContain(marker)
  })

  test('TC-E-117: an expired token during import is refreshed once and the same file is re-sent', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/import-export')
    await pickFile(page, 'a.csv', F.noBom(), 'text/csv')
    await chooseTarget(page, 'New list…')
    await page.getByLabel('New list name').fill('Refresh')
    const posts: string[] = []
    let rejected = false
    await page.route('**/api/imports', async (route) => {
      posts.push(route.request().method())
      if (!rejected) {
        rejected = true
        await route.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ status: 401, code: 'unauthenticated', title: 'Unauthorized' }) })
      } else await route.continue()
    })

    // Act
    await importButton(page).click()

    // Assert: the retry succeeded and nothing was created twice
    await expect(summaryLine(page)).toContainText('3 created · 0 skipped · 0 updated · 0 failed')
    expect(posts).toEqual(['POST', 'POST'])
    expect(await api.stocks()).toHaveLength(3)
    await expect(toast(page, /sign/i)).toHaveCount(0)
  })
})

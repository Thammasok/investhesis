import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Request } from '@playwright/test'
import { addEntry, addViaUi, deleteConfirm, editButton, entryCards, entryDialog, entryWith, fillEntry, noteBox, openAdd, openStock, sectionCard, seedStockOnly, seedWithEntries, ZONE } from './lib/tl.ts'
import { API_ORIGIN, apiAs, h1, newUser, openSignedIn, settled, toast, WEB_ORIGIN } from './lib/sl.ts'

test.use({ timezoneId: ZONE })

const problem = (status: number, code: string) => ({ status, contentType: 'application/problem+json', body: JSON.stringify({ code, status, title: code, type: 'about:blank' }) })

test.describe('isolation and sign-in', () => {
  test("TC-E-707: another user's stock is not found in the web, and all five thesis routes answer 404 without changing anything", async ({ page }) => {
    const a = await seedWithEntries('e2e-tl-a')
    const userB = await newUser('e2e-tl-b')
    const b = await apiAs(userB)
    const mine = a.entries[0]!

    await openSignedIn(page, userB, `/stocks/${a.nvda.id}`)
    await expect(h1(page)).toHaveText('Not found')
    await expect(page.locator('body')).not.toContainText('NVIDIA')
    await expect(page.locator('body')).not.toContainText('Capex keeps rising')

    const base = `/stocks/${a.nvda.id}/theses`
    const calls = [
      await b.call('GET', base),
      await b.call('POST', base, { type: 'buy', date: '2026-11-20', note: 'planted' }),
      await b.call('PATCH', `${base}/${mine.id}`, { note: 'hacked' }),
      await b.call('DELETE', `${base}/${mine.id}`),
      await b.call('POST', `${base}/restore`, { entry: { ...mine, id: '0192f0a0-0000-7000-8000-0000000007e1' } }),
    ]
    expect(calls.map((c) => c.status)).toEqual([404, 404, 404, 404, 404])
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain('Capex keeps rising')
    expect(await a.api.theses(a.nvda.id)).toEqual(a.entries)
    expect((await b.backupJson()).theses).toEqual([])
  })

  test('TC-E-708: signed out gets sign-in and 401; an expired token is refreshed once and the save still succeeds', async ({ page, browser }) => {
    // Signed out: the page goes to sign-in, the five routes answer 401 with no token
    const seed = await seedWithEntries()
    const out = await (await browser.newContext({ baseURL: WEB_ORIGIN })).newPage()
    await out.goto(`/stocks/${seed.nvda.id}`)
    await expect(out).toHaveURL(/\/auth\/sign-in/)
    await out.context().close()
    const base = `${API_ORIGIN}/stocks/${seed.nvda.id}/theses`
    const id = seed.entries[0]!.id
    for (const [method, url] of [['GET', base], ['POST', base], ['PATCH', `${base}/${id}`], ['DELETE', `${base}/${id}`], ['POST', `${base}/restore`]] as const) {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }) })
      expect(res.status, `${method} ${url}`).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer')
    }

    // Signed in: the first POST is answered 401 as if the token had expired
    await openStock(page, seed)
    await page.waitForTimeout(1200) // a refreshed token must differ from the seeded one (iat has second resolution)
    let rejected = 0
    await page.route(`**/api/stocks/${seed.nvda.id}/theses`, async (route) => {
      if (route.request().method() === 'POST' && rejected === 0) {
        rejected++
        await route.fulfill(problem(401, 'unauthenticated'))
      } else await route.continue()
    })
    const refreshes: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/auth/v1/token') && r.url().includes('grant_type=refresh_token')) refreshes.push(r.url())
    })

    await openAdd(page)
    await fillEntry(page, { type: 'Review', note: 'Typed before the token expired', target: '12.5' })
    await entryDialog(page).getByRole('button', { name: 'Add entry' }).click()

    await expect(toast(page, 'Entry added')).toBeVisible()
    expect(refreshes).toHaveLength(1)
    expect(rejected).toBe(1)
    const saved = (await seed.api.theses(seed.nvda.id)).filter((e) => e.note === 'Typed before the token expired')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ type: 'review', targetPrice: '12.5000' })
  })
})

test.describe('failures', () => {
  test('TC-E-709: a failed list read shows the section error and Retry; a failed save keeps every typed value and the retry saves once', async ({ page }) => {
    const seed = await seedWithEntries()
    let listFailures = 0
    let saveFailures = 0
    await page.route(`**/api/stocks/${seed.nvda.id}/theses`, async (route) => {
      const method = route.request().method()
      if (method === 'GET' && listFailures === 0) (listFailures++, await route.abort('failed'))
      else if (method === 'POST' && saveFailures === 0) (saveFailures++, await route.abort('failed'))
      else await route.continue()
    })
    await openSignedIn(page, seed.user, `/stocks/${seed.nvda.id}`)

    const alert = page.getByRole('alert').filter({ hasText: "Couldn't load the thesis entries." })
    await expect(alert).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Classification' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Holding' })).toBeVisible()
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(entryCards(page)).toHaveCount(3)

    await addEntry(page).click()
    await fillEntry(page, { type: 'Sell', note: 'Typed and kept', target: '99.5', invalidation: 'Kept too' })
    await entryDialog(page).getByRole('button', { name: 'Add entry' }).click()
    await expect(entryDialog(page).getByText("Couldn't save the entry. Try again.")).toBeVisible()
    await expect(noteBox(page)).toHaveValue('Typed and kept')
    await expect(entryDialog(page).getByRole('textbox', { name: /^Target price/ })).toHaveValue('99.5')
    await expect(entryDialog(page).getByRole('textbox', { name: /^Invalidation/ })).toHaveValue('Kept too')
    await expect(entryDialog(page).getByRole('radio', { name: 'Sell' })).toBeChecked()
    await expect(toast(page, 'Entry added')).toHaveCount(0)

    await entryDialog(page).getByRole('button', { name: 'Add entry' }).click()
    await expect(toast(page, 'Entry added')).toBeVisible()
    const rows = (await seed.api.theses(seed.nvda.id)).filter((e) => e.note === 'Typed and kept')
    expect(rows).toHaveLength(1)
    expect(await seed.api.theses(seed.nvda.id)).toHaveLength(4)
  })

  test('TC-E-721: after another tab deletes an entry, editing it here keeps the typed text and says it is gone; deleting a gone entry fails the same way', async ({ page, context }) => {
    const seed = await seedStockOnly()
    const e1 = await seed.api.addThesis(seed.nvda.id, { type: 'buy', date: '2026-11-20', note: 'First entry' })
    const e2 = await seed.api.addThesis(seed.nvda.id, { type: 'update', date: '2026-10-03', note: 'Second entry' })
    await openStock(page, seed) // tab B
    const tabA = await context.newPage()
    await tabA.goto(`/stocks/${seed.nvda.id}`)
    await settled(tabA)
    await expect(entryCards(tabA)).toHaveCount(2)

    // Tab A deletes the first entry; tab B still shows it
    await editButton(tabA, /^Delete Buy entry/).click()
    await deleteConfirm(tabA).getByRole('button', { name: 'Delete' }).click()
    await expect(entryCards(tabA)).toHaveCount(1)
    await expect(entryWith(page, 'First entry')).toBeVisible()

    // Tab B edits it: the answer is 404 and the typed text stays
    await editButton(page, /^Edit Buy entry/).click()
    await noteBox(page).fill('Edited in the other tab')
    await entryDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(entryDialog(page).getByText('This entry or stock no longer exists.')).toBeVisible()
    await expect(noteBox(page)).toHaveValue('Edited in the other tab')
    await expect(toast(page, 'Entry updated')).toHaveCount(0)
    await entryDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(entryDialog(page)).toHaveCount(0)
    await expect(entryCards(page)).toHaveCount(1) // the failed save re-read the list

    // Tab A deletes the second one too; tab B (listing it) deletes it: the failure shows, nothing crashes
    await editButton(tabA, /^Delete Update entry/).click()
    await deleteConfirm(tabA).getByRole('button', { name: 'Delete' }).click()
    await expect(entryCards(tabA)).toHaveCount(0)
    await editButton(page, /^Delete Update entry/).click()
    await deleteConfirm(page).getByRole('button', { name: 'Delete' }).click()
    await expect(deleteConfirm(page).getByText('This entry or stock no longer exists.')).toBeVisible()
    await expect(toast(page, 'Entry deleted')).toHaveCount(0)
    await deleteConfirm(page).getByRole('button', { name: 'Cancel' }).click()

    await page.reload()
    await expect(sectionCard(page)).toContainText('No thesis yet')
    expect(await seed.api.theses(seed.nvda.id)).toEqual([])
    expect([e1.id, e2.id]).toHaveLength(2)
  })
})

test.describe('text, not markup, and no leaks', () => {
  test('TC-E-710: markup in a note is shown as typed and nothing runs', async ({ page }) => {
    const seed = await seedStockOnly()
    const dialogs: string[] = []
    page.on('dialog', async (d) => {
      dialogs.push(d.message())
      await d.dismiss()
    })
    const markup = '<img src=x onerror="window.__x=1"><script>window.__x=2</script>\nhttps://example.com'
    await openStock(page, seed)

    await addViaUi(page, { note: markup, invalidation: '<b>bold</b>' })

    const card = entryCards(page).first()
    await expect(card.locator('p').first()).toHaveText(markup)
    await expect(card.getByText('<b>bold</b>')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined()
    expect(dialogs).toEqual([])
    await expect(sectionCard(page).locator('img, script, b')).toHaveCount(0)
    await expect(sectionCard(page).getByRole('link')).toHaveCount(0)
    await page.reload()
    await expect(entryCards(page).first().locator('p').first()).toHaveText(markup)
    expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined()
  })

  test('TC-E-711: add, edit, delete and undo with sentinel text reach only our own origins and never the API log', async ({ page }) => {
    const seed = await seedStockOnly()
    const requests: Request[] = []
    page.on('request', (r) => requests.push(r))
    let lastRequestId = ''
    page.on('response', (r) => {
      if (r.url().includes('/api/')) lastRequestId = r.headers()['x-request-id'] ?? lastRequestId
    })
    const SENT = ['SENTINEL-NOTE-711', 'SENTINEL-INV-711', 'SENTINEL-EDIT-711', '987654.3210']
    await openStock(page, seed)
    requests.length = 0

    await addViaUi(page, { note: SENT[0]!, invalidation: SENT[1]!, target: SENT[3]! })
    await editButton(page, /^Edit Buy entry/).click()
    await noteBox(page).fill(SENT[2]!)
    await entryDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'Entry updated')).toBeVisible()
    await editButton(page, /^Delete Buy entry/).click()
    await deleteConfirm(page).getByRole('button', { name: 'Delete' }).click()
    await toast(page, 'Entry deleted').getByRole('button', { name: 'Undo' }).click()
    await expect(toast(page, 'Entry restored')).toBeVisible()
    await expect(entryWith(page, SENT[2]!)).toBeVisible()

    const origins = [...new Set(requests.map((r) => new URL(r.url()).origin))]
    expect(origins.every((o) => o === WEB_ORIGIN || o === API_ORIGIN)).toBe(true)
    for (const r of requests) for (const s of SENT) expect(`${r.url()} ${r.headers()['referer'] ?? ''}`).not.toContain(s)

    // The log file also holds Vite's forwarded browser-console lines (page addresses); this is about the API's own lines.
    const logFile = join(__dirname, '.output/dev-server.log')
    await expect.poll(() => readFileSync(logFile, 'utf8').includes(lastRequestId), { timeout: 10_000 }).toBe(true)
    const log = readFileSync(logFile, 'utf8')
      .split('\n')
      .filter((line) => !line.includes('[vite]'))
      .join('\n')
    expect(log).toContain('/theses')
    for (const s of SENT) expect(log, s).not.toContain(s)
    expect((await seed.api.theses(seed.nvda.id))[0]?.note).toBe(SENT[2])
  })
})


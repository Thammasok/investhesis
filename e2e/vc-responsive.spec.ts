import { expect, test, type Page } from '@playwright/test'
import { noHorizontalScroll, openSignedIn, settled, us } from './lib/sl.ts'
import { chainCard, laneIn, openChains, renameButton, renameDialog, nameBox, seedChainsDataset, ZONE } from './lib/vc.ts'
import { overflowing } from './lib/tl.ts'

test.use({ timezoneId: ZONE })

/** Names like those of dataset VC-D, to push long text through the layout. */
const LONG = ['Oil <img src=x onerror=alert(1)> and gas', 'A&B/C?d=e#f%20+g and more words to wrap', 'น้ำมันและก๊าซ'.repeat(4)]
/** Names with no break opportunity: 60 emoji and a 60 character word. */
const UNBROKEN = ['\u{1F600}'.repeat(60), 'w'.repeat(60)]

async function seedLong() {
  const seed = await seedChainsDataset()
  for (const [i, name] of LONG.entries()) await seed.api.stock(us(`LG${i}`, { name: `${'Long company name '.repeat(8)}`.slice(0, 120), valueChain: name, valueChainPosition: 'Upstream' }))
  return seed
}

const small = (page: Page, w: number, h: number) => page.setViewportSize({ width: w, height: h })

async function boxes(page: Page, title: string) {
  const card = chainCard(page, title)
  const out: Record<string, { x: number; y: number; width: number; height: number }> = {}
  for (const lane of ['Upstream', 'Midstream', 'Downstream']) out[lane] = (await laneIn(card, lane).boundingBox())!
  const extra = card.getByRole('region', { name: /^(Integrated|No position)/ })
  for (const [i, el] of (await extra.all()).entries()) out[`extra${i}`] = (await el.boundingBox())!
  return out
}

for (const [w, h] of [[360, 740], [320, 640]] as const) {
  test(`TC-E-920: at ${w} px nothing scrolls sideways, lanes stack in order, buttons wrap and every control is big enough`, async ({ page }) => {
    test.setTimeout(180_000)
    const seed = await seedLong()
    await small(page, w, h)
    await openChains(page, seed.user)

    expect(await noHorizontalScroll(page)).toBe(true)
    expect(await overflowing(page)).toEqual([])
    const b = await boxes(page, 'AI & Semis')
    const order = ['Upstream', 'Midstream', 'Downstream', 'extra0']
    for (const [i, name] of order.slice(1).entries()) {
      expect(b[name]!.y, `${name} below ${order[i]}`).toBeGreaterThan(b[order[i]!]!.y)
      expect(Math.abs(b[name]!.x - b[order[i]!]!.x)).toBeLessThan(2)
    }
    // The header buttons sit under the title when the row is too narrow
    const title = await chainCard(page, 'AI & Semis').getByRole('heading', { level: 2 }).boundingBox()
    const rename = await renameButton(page, 'AI & Semis').boundingBox()
    expect(rename!.x + rename!.width).toBeLessThanOrEqual(w)
    expect(title!.x + title!.width).toBeLessThanOrEqual(w)
    // Every control is at least 24 x 24
    const small24 = await page.evaluate(() =>
      [...document.querySelectorAll('main a, main button, section a, section button, [role="combobox"]')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          // The note link buttons ("Show them", "Set rate on Concentration") are finding F-VC-3, below
          if (el.closest('[role="status"]')) return false
          return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(el).display !== 'inline'
        })
        .map((el) => `${el.tagName} ${(el.textContent ?? '').slice(0, 20)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
    )
    expect(small24).toEqual([])

    // The Filters sheet, the dialog and the merge step
    await page.getByRole('button', { name: /^Filters/ }).click()
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    await page.keyboard.press('Escape')
    await renameButton(page, LONG[1]!).click()
    await expect(renameDialog(page)).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    const dialog = await renameDialog(page).boundingBox()
    expect(dialog!.x).toBeGreaterThanOrEqual(0)
    expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(w)
        await nameBox(page).fill('AI & Semis')
    await renameDialog(page).getByRole('button', { name: 'Rename' }).click()
    const merge = page.getByRole('dialog').getByRole('heading', { name: /^Merge into/ })
    await expect(merge).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    const buttons = await page.getByRole('dialog').getByRole('button', { name: /^(Back|Merge)/ }).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))
    for (const width of buttons) expect(width).toBeGreaterThan(w * 0.5)
    await page.keyboard.press('Escape')

    // 200% zoom is the same as half the width: still no sideways scroll
    await small(page, Math.round(w / 2), h)
    await settled(page)
    expect(await noHorizontalScroll(page)).toBe(true)
  })
}

test('TC-E-921: the lanes share a row from 768 px and stack below it, with the extra areas full width', async ({ page }) => {
  test.setTimeout(120_000)
  const seed = await seedChainsDataset()
  await openSignedIn(page, seed.user, '/chains')
  await settled(page)

  for (const width of [767, 768, 1024, 1440]) {
    await small(page, width, 900)
    await settled(page)
    const b = await boxes(page, 'AI & Semis')
    const lanes = ['Upstream', 'Midstream', 'Downstream'].map((n) => b[n]!)
    if (width < 768) {
      expect(lanes[1]!.y, `${width}`).toBeGreaterThan(lanes[0]!.y)
      expect(lanes[2]!.y).toBeGreaterThan(lanes[1]!.y)
    } else {
      expect(Math.abs(lanes[0]!.y - lanes[1]!.y), `${width}`).toBeLessThan(2)
      expect(Math.abs(lanes[1]!.y - lanes[2]!.y)).toBeLessThan(2)
      expect(lanes[1]!.x).toBeGreaterThan(lanes[0]!.x + lanes[0]!.width - 1)
      expect(lanes[2]!.x).toBeGreaterThan(lanes[1]!.x + lanes[1]!.width - 1)
      expect(Math.abs(lanes[0]!.width - lanes[1]!.width)).toBeLessThan(2)
      expect(Math.abs(lanes[1]!.width - lanes[2]!.width)).toBeLessThan(2)
      const card = await chainCard(page, 'AI & Semis').boundingBox()
      const extra = b['extra0']!
      expect(extra.y).toBeGreaterThan(lanes[0]!.y + lanes[0]!.height - 1)
      expect(extra.width).toBeGreaterThan(card!.width * 0.8)
    }
    expect(await noHorizontalScroll(page)).toBe(true)
  }
  // A collapsed sidebar does not break the grid
  await small(page, 1024, 900)
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click()
  await page.waitForTimeout(400)
  const b = await boxes(page, 'AI & Semis')
  expect(Math.abs(b['Upstream']!.y - b['Downstream']!.y)).toBeLessThan(2)
  expect(b['Downstream']!.x).toBeGreaterThan(b['Midstream']!.x)
  // No overlap between the lanes and the buttons
  const overlaps = await page.evaluate(() => {
    let n = 0
    const lane = [...document.querySelectorAll('[data-slot="card"] section')].map((el) => el.getBoundingClientRect())
    for (let i = 0; i < lane.length; i++) for (let j = i + 1; j < lane.length; j++) {
      const a = lane[i]!, c = lane[j]!
      if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) n++
    }
    return n
  })
  expect(overlaps).toBe(0)
})

// Finding F-VC-2: a chain name with no break opportunity (60 emoji, a 60 character word) widens the card header's grid
// column past the screen, so the Rename and Stocks buttons sit off screen (right edge about 886 px at 360 px) although the
// page itself does not scroll. `break-words` does not shrink a grid track's minimum width; `min-w-0` or `wrap-anywhere` would.
test.fail('TC-E-920: a name with no break opportunity keeps the chain header and its buttons on screen [F-VC-2]', async ({ page }) => {
  test.setTimeout(120_000)
  const seed = await seedChainsDataset()
  for (const [i, name] of UNBROKEN.entries()) await seed.api.stock(us(`UB${i}`, { name: 'Unbroken', valueChain: name, valueChainPosition: 'Upstream' }))
  await small(page, 360, 740)
  await openChains(page, seed.user)
  expect(await overflowing(page)).toEqual([])
})

// Finding F-VC-3: the link buttons inside the notes ("Show them", "Set rate on Concentration") are 20 px tall
// (`h-auto p-0` on the link variant), under the 24 x 24 CSS px minimum of the case.
test.fail('TC-E-920: the link buttons in the notes are at least 24 px high [F-VC-3]', async ({ page }) => {
  test.setTimeout(120_000)
  const seed = await seedChainsDataset()
  await small(page, 360, 740)
  await openChains(page, seed.user)
  const heights = await page.getByRole('status').getByRole('link').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
  expect(heights.length).toBeGreaterThan(0)
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(24)
})

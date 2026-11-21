# E2E Testing with Playwright (Pacta web)

Contents: [When to write one](#when-to-write-an-e2e-test) · [Layout](#layout) · [Setup](#setup) ·
[Two modes](#two-modes-mocked-and-integration) · [Fixtures](#fixtures) · [Locale & theme](#locale-and-theme) ·
[Selectors](#selectors) · [Pacta patterns](#pacta-specific-patterns) · [Auth](#auth-once-supabase-is-wired) ·
[Tenant isolation](#tenant-isolation) · [CI](#ci) · [Pitfalls](#pitfalls)

This file is the source of truth for **how E2E tests are set up and written in `apps/web`**.
`software-tester-automation` turns designed TC-xxx cases into specs; when it does, it follows
these conventions. Vitest + RTL (`references/testing.md`) stays the main safety net — E2E covers
what jsdom can't: the real production bundle, lazy route chunks, real focus/keyboard, layout at
mobile width, downloads, and (later) the real API.

Check Context7 (`/microsoft/playwright`) for current API details before using anything not shown
here — Playwright ships monthly.

## When to write an E2E test

Write one for each **critical journey**, not each component. A feature that adds or changes a
critical journey isn't done until its E2E spec is updated.

| Phase | Journeys |
|---|---|
| Now | sign in · sign up (details → email code) · forgot password (email → code → new password → toast on sign-in) · public 404 |
| Phase 1 | upload/scan → processing → needs review → edit fields → confirm · copy field · export CSV/Excel |
| Later | tenant isolation (see below) |

Branching logic, validation messages, and copy belong in Vitest (`renderRoute`), where they are
10–100× faster. If an E2E test asserts something an RTL test could, move it.

## Layout

```
apps/web/
├── e2e/
│   ├── fixtures.ts            ← extended `test` (mockApi, locale, t)
│   ├── mocks/                 ← JSON fixtures for mocked /api responses (realistic Thai data)
│   ├── pages/                 ← page objects, only when ≥2 specs share them (kebab-case)
│   │   └── sign-in-page.ts
│   ├── auth.spec.ts
│   └── tsconfig.json          ← own tsconfig so `tsc -b` checks e2e code
├── playwright.config.ts
└── vite.config.ts             ← Vitest must exclude e2e/**
```

All names are kebab-case, like the rest of the app. Specs are `*.spec.ts`; Vitest tests stay
`*.test.ts(x)` under `src/`.

## Setup

```bash
# in apps/web
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

**Exclude `e2e/` from Vitest.** Vitest's default `include` matches `*.spec.ts`, so without this
`pnpm test` tries to run Playwright specs in jsdom and fails:

```ts
// vite.config.ts
import { configDefaults } from 'vitest/config'

export default defineConfig({
  // ...
  test: {
    // ...existing options
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
```

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The /main sidebar becomes a sheet below the md breakpoint; cover it on one device.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  // Test the production build, not the dev server: build-only bugs (env vars, lazy chunks,
  // tree shaking) are what users hit.
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

`vite preview` has no `/api` proxy configured, which is what we want in mocked mode: any request
that escapes `page.route` fails loudly instead of hitting a stray local API.

```jsonc
// e2e/tsconfig.json — strict like the app; Playwright transpiles itself, this is for tsc only
{
  "extends": "../tsconfig.node.json",
  "compilerOptions": {
    "tsBuildInfoFile": "../node_modules/.tmp/tsconfig.e2e.tsbuildinfo",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["./**/*.ts", "../playwright.config.ts"]
}
```

Add `{ "path": "./e2e" }` to `references` in `apps/web/tsconfig.json`.

```jsonc
// apps/web/package.json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

Add a matching `test:e2e` script at the repo root (`pnpm --filter @pacta/web test:e2e`), and
ignore `apps/web/test-results/`, `apps/web/playwright-report/`, `apps/web/e2e/.auth/` in git.

oxlint: the `vitest` plugin's rules don't apply to Playwright specs — add an `overrides` entry for
`e2e/**` that turns off any vitest rule that misfires, rather than disabling the plugin globally.

## Two modes: mocked and integration

| | Mocked (now) | Integration (once the Rust API lands) |
|---|---|---|
| Backend | `page.route('**/api/**')` with fixtures in `e2e/mocks/` | Rust API + Postgres (Liquibase applied, `dev` seed) + local Supabase Auth |
| Proves | UI journeys, routing, i18n, production bundle | the real contract end to end, auth, tenant isolation |
| Parallel | fully parallel, no shared state | per-worker isolation — see `.claude/knowledges/e2e-test-isolation.md` |
| Runs | every PR | every PR once stable; start nightly |

Mocked mode is not a substitute for the API's own tests. Keep mock payloads in the **shape the
OpenAPI spec defines**; once `packages/api-client` exists, type the fixtures with its generated
types so a contract change breaks the E2E typecheck instead of silently drifting.

Mock data must look like real procure-to-pay data: Thai vendor names, 13-digit tax IDs, Buddhist
and Gregorian dates, amounts as strings with 2 decimals (money is `numeric(18,2)`), per-field
confidence scores.

## Fixtures

```ts
// e2e/fixtures.ts
import { test as base, expect, type Page } from '@playwright/test'
import thAuth from '../src/locales/th/auth.json' with { type: 'json' }
import thCommon from '../src/locales/th/common.json' with { type: 'json' }

type Locale = 'th' | 'en'

type Fixtures = {
  /** Locale saved in localStorage before the app boots. Override with `test.use({ appLocale: 'en' })`. */
  appLocale: Locale
  /** Registers a catch-all for /api and fails the test if any request reached it unmocked. */
  mockApi: MockApi
}

type MockApi = {
  json: (path: string | RegExp, body: unknown, status?: number) => Promise<void>
}

export const test = base.extend<Fixtures>({
  appLocale: ['th', { option: true }],

  page: async ({ page, appLocale }, use) => {
    // Zustand `persist` stores `{ state, version }`; match its shape or rehydration ignores it.
    await page.addInitScript((locale) => {
      localStorage.setItem('pacta-locale', JSON.stringify({ state: { locale }, version: 0 }))
      localStorage.setItem('pacta-theme', JSON.stringify({ state: { preference: 'light' }, version: 0 }))
    }, appLocale)
    await use(page)
  },

  mockApi: async ({ page }, use) => {
    const unhandled: string[] = []
    // Registered first, so every later page.route() for a specific path wins over it.
    await page.route('**/api/**', (route) => {
      unhandled.push(`${route.request().method()} ${route.request().url()}`)
      return route.fulfill({ status: 501, json: { error: 'not mocked' } })
    })
    await use({
      json: (path, body, status = 200) =>
        page.route(typeof path === 'string' ? `**/api${path}` : path, (route) =>
          route.fulfill({ status, json: body }),
        ),
    })
    expect(unhandled, 'unmocked /api requests').toEqual([])
  },
})

/** Thai copy, straight from the app's bundles — never retype UI strings in a spec.
 *  Add each new namespace here when `src/locales/i18n.ts` gains one. */
export const th = { auth: thAuth, common: thCommon }

export { expect, type Page }
```

Check the real persisted shape in `src/stores/*-store.ts` (the `name` and `partialize`) before
relying on the init script; if a store changes, this fixture must change with it.

## Locale and theme

Tests run in **Thai** by default (the product is Thai-first, and Vitest also starts in Thai).
Add one English smoke spec per journey area (`test.use({ appLocale: 'en' })`) to catch missing
keys or layout that breaks with longer English labels — not a full duplicate suite.

Use the context `locale: 'th-TH'` and `timezoneId: 'Asia/Bangkok'` so `Intl` date and number
formatting matches what users see.

## Selectors

Same priority as RTL: `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` →
`getByTestId`. Take the accessible name from the locale bundle:

```ts
await page.getByLabel(th.auth.signIn.email).fill('somchai@company.co.th')
await page.getByRole('button', { name: th.auth.signIn.submit }).click()
```

For interpolated strings (`"Resend code in {{seconds}} s"`), build a regex from the bundle text
rather than hard-coding a Thai sentence. Never put literal UI text in a spec — it fails when copy
changes and hides the real key.

A `data-testid` is acceptable only for things with no accessible name (e.g. a confidence badge
color); add it in the component, kebab-case.

## Pacta-specific patterns

**Email code (input-otp).** `OtpForm` renders one real `<input>` labelled by
`auth.otp.codeLabel`; fill it directly:

```ts
await page.getByLabel(th.auth.otp.codeLabel).fill('123456')
```

If a mask or `onComplete` handler doesn't fire, use `pressSequentially` — it's closer to typing.

**Resend cooldown (60 s).** Never wait for it — control the clock. Install before navigation:

```ts
await page.clock.install()
await page.goto('/auth/sign-up')
// ...reach the code step
await expect(page.getByRole('button', { name: /\d+/ })).toBeDisabled()
await page.clock.fastForward('01:00')
await page.getByRole('button', { name: th.auth.otp.resend }).click()
```

**Sensitive data stays out of the URL.** The code step is local state, not a route, and forms
must not fall back to a native GET submit. Assert it on every auth journey:

```ts
await expect(page).not.toHaveURL(/@|password|code=/)
```

**Toasts (Sonner).** Assert by role and text: `page.getByRole('status')` or
`page.getByText(th.auth.forgotPassword.done)`. Don't wait for the toast to disappear.

**Lazy routes.** The first navigation to each `views/*` page loads a separate chunk. A journey
that lands on `/main` after sign-in proves the chunk loads from the production build — keep at
least one such path in the suite.

**Downloads (CSV/Excel export).** (Phase 1 — the `documents` namespace below doesn't exist yet;
use whatever keys the feature adds.)

```ts
const download = page.waitForEvent('download')
await page.getByRole('button', { name: th.documents.export.csv }).click()
const file = await download
expect(file.suggestedFilename()).toMatch(/\.csv$/)
const text = await (await file.createReadStream()).toArray()
// Assert Thai text survives (UTF-8 BOM for Excel) and amounts keep 2 decimals.
```

**Clipboard (copy field).** Grant permission per test:
`test.use({ permissions: ['clipboard-read', 'clipboard-write'] })`, then read with
`page.evaluate(() => navigator.clipboard.readText())`. Chromium only.

**File upload.** `page.getByLabel(...).setInputFiles('e2e/mocks/files/tax-invoice.pdf')`. Keep
sample files small and synthetic — never real customer documents (PDPA).

## Auth (once Supabase is wired)

Today the auth forms only `preventDefault`, so auth E2E covers the UI flow only. When sign-in
calls Supabase and `/main` gets a `requireAuth` loader:

- Add a `setup` project (`e2e/auth.setup.ts`) that signs in once per role and saves
  `storageState` to `e2e/.auth/<role>.json`; other projects depend on it.
- Mocked mode: intercept the Supabase Auth endpoints with `page.route` (the URL comes from
  `VITE_SUPABASE_URL`); integration mode: use local Supabase with seeded `dev` users.
- Keep one spec that signs in **through the UI**, so the real form stays covered.
- Add a spec proving an unauthenticated visit to `/main` redirects to sign-in.

## Tenant isolation

CLAUDE.md requires proof that one tenant never sees another tenant's documents. The API's
integration tests are the primary proof; add one E2E spec in integration mode as the end-to-end
check: user A (tenant A) uploads a document, user B (tenant B) can't see it in the list and gets
a not-found page on its direct URL. Use two browser contexts with the two `storageState` files.

## CI

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm --filter @pacta/web exec playwright install --with-deps chromium
- run: pnpm --filter @pacta/web test:e2e
- uses: actions/upload-artifact@v4
  if: ${{ !cancelled() }}
  with:
    name: playwright-report
    path: apps/web/playwright-report/
    retention-days: 7
```

Run E2E after lint, typecheck, and Vitest — they're cheaper and fail faster. Traces and reports
can contain screenshots of form data; keep retention short and never use real customer data.

## Pitfalls

- **Vitest picks up `*.spec.ts`.** Exclude `e2e/**` (see Setup).
- **`waitForTimeout`.** Use web-first assertions (`toBeVisible`, `toHaveURL`) or `page.clock`.
- **`networkidle`.** Discouraged by Playwright and unreliable with polling (job status). Wait
  for the UI state instead.
- **Hard-coded Thai/English strings.** Import from `src/locales`.
- **Mocking after `goto`.** Register routes before navigation, or the first requests escape.
- **Testing against `pnpm dev`.** HMR and dev-only transforms hide build bugs; use `preview`.
- **Too many E2E tests.** Each one is slow and can flake. If it isn't a critical journey, it
  belongs in Vitest.
- **Order dependence.** Each test sets up its own state (mocks, storage, seed via API). Never rely
  on another test having run first.

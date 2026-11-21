# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state: web shell + API skeleton

The repo holds:

- `Multi-Market Stock Watchlist Brief.md` — the product brief. It is the only source of truth for what to build.
- `.claude/` — rules, knowledge notes and skills for a planning → design → dev-plan → TDD workflow.
- A pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`) with `apps/web` (`@investhesis/web`) and `apps/api` (`@investhesis/api`). The API has no tables or business routes yet.

### Stack (decided by the owner, 2026-11-21)

- **Frontend:** React + TypeScript (Vite SPA, `apps/web`).
- **Backend:** Fastify + TypeScript (`apps/api`), modelled on Pacta's `apps/api` (`~/Workspaces/Github/pacta/apps/api`): same config, plugin, error and lifecycle patterns. Copy from there rather than inventing new conventions.
- **Database:** Supabase (Postgres) for v1, reached only by the API through Drizzle on `pg` with `DATABASE_URL`. Use the direct or session-pooler connection, not the transaction pooler.
- **Auth:** `AUTH_MODE=supabase` (default) verifies Supabase access tokens; `AUTH_MODE=mock` (`MOCK_USER_ID`, optional `MOCK_USER_EMAIL`, `MOCK_USER_NAME`) runs every request as one env user for development and tests, and config refuses it when `NODE_ENV=production`.
- Decided in planning (2026-11-21): schema migrations run with the Supabase CLI (`supabase/migrations/`, Stock Lists ADR-001), and real auth is Supabase Auth with email + password and invite-only sign-up through an allowlist (`docs/features/user-auth/v1.0/`). The API verifies Supabase access tokens via JWKS behind `IdentityResolver`; the mock user stays for development and tests.

### Commands

From the repo root (each runs across the workspace): `pnpm install`, `pnpm dev` (web on http://localhost:5173 and API on http://localhost:3000; `pnpm dev:web` / `pnpm dev:api` for one), `pnpm lint` (oxlint), `pnpm typecheck` (`tsc -b`), `pnpm test` (Vitest, run once), `pnpm build`. Local Supabase (Docker): `pnpm db:start` (makes the git-ignored `supabase/signing_keys.json` via `pnpm db:keys` if missing, then `supabase start`), `pnpm db:stop`, `pnpm db:reset`, and `pnpm test:supabase` (script-level checks of the Auth settings in `scripts/supabase-auth.test.ts`, needs the stack running; not part of `pnpm test`). Auth settings, local URLs and the hosted checklist: `supabase/README.md`. In `apps/web`: `pnpm test:watch`, `pnpm preview`; one test: `pnpm vitest run src/routers/router.test.tsx -t "not found"`.

### `apps/web`

Vite 8, React 19, TypeScript 7 (strict), Tailwind v4 (`@tailwindcss/vite`), shadcn/ui (radix base, nova preset, `components.json`; add components with `pnpm dlx shadcn@latest add <name>` inside `apps/web`), React Router v8 in data mode, Vitest + Testing Library (jsdom).

- `@/` aliases `src/`. File and folder names are kebab-case.
- The route table is `src/routers/router.tsx` (`routes`, `createAppRouter`). Pages live in `src/views/`; each exports `Component` and loads via `lazy`, so each page is its own chunk. Import from `react-router`, and `RouterProvider` from `react-router/dom`. `/` redirects to `/stocks`; `*` is the not-found page; `RouteError` is the error boundary.
- The signed-in area is the pathless route `APP_ROUTE_ID` (`'app'`), rendered by `AppLayout` (`src/components/layout/app-layout.tsx`), built from shadcn's `sidebar-08` block: an inset sidebar plus a header with the sidebar trigger and a breadcrumb. When sign-in exists, its guard goes in that route's `loader`, and sign-in pages go in a sibling route outside it. Sidebar parts live in `components/layout/sidebar/`. The pages are listed in `nav-items.ts`; an item counts as active on its own path and on any path below it, and tapping one on a phone closes the sidebar sheet. The account menu (`nav-user.tsx`) shows a placeholder user until the web reads `GET /me`. Account is disabled; Sign out just links to `/auth/sign-in`, since mock auth has no session to end. The breadcrumb comes from each route's `handle: { crumb } satisfies RouteHandle` (`routers/route-handle.ts`; `crumb` is a string or a function of params). The block's demo files (nav-projects, nav-secondary) were removed. `hooks/use-mobile.ts` was rewritten with `useSyncExternalStore`, so if a future `shadcn add` overwrites it, rewrite it again; `test/setup.ts` stubs `matchMedia` for it. `TooltipProvider` wraps the layout. Every page is a `PagePlaceholder` for now.
- Auth pages live under `/auth` (`/auth` redirects to `/auth/sign-in`), a sibling of the signed-in area: `sign-in`, `sign-up` (both behind `redirectIfSignedIn`) and `check-email`. `AuthLayout` (`components/layout/auth-layout.tsx`) is shadcn's `login-02` page, with a decorative panel from `lg`; the `/auth` route wraps it in `AuthClientProvider`, so pages call `useAuthClient()` (lazy route components take no props). Forms are in `features/auth/components/` (`SignInForm`, `SignUpForm`, `CheckEmailPanel`, `PasswordInput`, `AuthHeading` which sets the tab title and focuses the h1). They always `preventDefault`, so credentials never reach the URL; the email travels to check-email in router state (`{ email, justSent }`), never the URL. `validateNewPassword` (`password-rules.ts`) is the one rule set for new passwords (8-72, confirm must match); sign-in does not apply it. `withNext` carries a safe `next` through the sign-in/sign-up/forgot links. `useCooldown` drives the 60 s resend. `/auth/forgot-password` is linked but has no page until T-005. Tests drive the pages through `createRoutes(FakeAuthClient)` (`features/auth/auth-pages.test.tsx`); the signed-in fake bounces guest pages to /stocks, so use `FakeAuthClient.signedOut()` for them.
- Running `shadcn add` for a block asks to overwrite `button.tsx` and then quits without adding anything. Re-run it with `--overwrite`: the shared `ui/` files differ from stock only by the `cn` import fix, so re-apply that fix afterwards. `hooks/use-mobile.ts` is not part of `login-02`, so it was left untouched.
- In tests, shadcn's `BreadcrumbPage` has `role="link"` and `aria-current="page"`, so scope nav queries to `getByRole('navigation', { name: 'Main' })`.
- Theme tokens are CSS variables in `src/index.css` (written by shadcn). After `shadcn add`, check that imports use `@/lib/utils`: the CLI once wrote `from "cn"` there. Lint ignores `only-export-components` under `src/components/ui/`.
- Auth foundation (`features/auth/`, user-auth T-003): `AuthClient` port (`auth-client.ts`) with a supabase-js adapter (`supabase-auth-client.ts`, the only importer of `@supabase/supabase-js`; oxlint `no-restricted-imports`), a mock adapter, and `FakeAuthClient` in `src/test/`. `src/config.ts` `readConfig(import.meta.env)` reads `VITE_AUTH_MODE` (default `supabase`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and throws naming a missing one, so copy `apps/web/.env.example` to `.env` (it sets `mock`) before `pnpm dev`. `createRoutes(authClient)` builds the route table (`createAppRouter(authClient)` for the browser); the `app` route's `middleware: [requireSession]` is the guard (not a loader), and `/auth/sign-in` has the `redirectIfSignedIn` loader. In `mock` mode guards never redirect. `lib/api-client.ts` (`createApiClient`) adds the bearer token and on a 401 refreshes once, retries, then signs out and goes to sign-in via `sessionEndedHandler`; `App` runs `watchAuth` for sign-outs in other tabs. Router tests build routes with `createRoutes(FakeAuthClient.signedIn())`.
- Dev server proxies `/api/*` to the API at `http://localhost:3000`, stripping the `/api` prefix (as in Pacta).
- UI copy is English only for now; the brief needs Thai and English, so i18n is still to do.

### `apps/api`

Node 24+ running TypeScript natively (type stripping, no build in dev), Fastify 5, Zod 4 with `@fastify/type-provider-zod`, `@fastify/swagger` (spec at `/openapi.json`), Drizzle on `pg`, pino, oxlint, Vitest.

- Setup: `cp apps/api/.env.example apps/api/.env`. Local Supabase (`supabase start`) listens on `127.0.0.1:54322`; without a database the API still starts, and `/ready` answers 503 `db`.
- `process.env` is read only in `src/config/env.ts` (`loadConfig`, Zod-validated, frozen `Config`).
- `src/app.ts` `buildApp(deps)` wires plugins and routes; `src/main.ts` builds the config, the DB handle and the app, and installs graceful shutdown. Tests call `buildApp` with `app.inject` and a quiet `logStream`; `test/env.ts` has `baseEnv`.
- `plugins/`: `request-id`, `security` (helmet, CORS, `cache-control: no-store` on every response), `error-handler` (RFC 7807 `application/problem+json` via `AppError`), `openapi`, `health` (`/health`, `/ready`), `authenticate`.
- Auth: `authenticate` sets `req.identity` on every path except `PUBLIC_PATHS` (and `OPTIONS`) through an `IdentityResolver`, chosen by `identityResolverFor(config)`. `AUTH_MODE` is `supabase` (default when unset; needs `SUPABASE_URL`, which gives `Config.supabaseAuth` issuer, JWKS URL and audience) or `mock` (development and tests; refused in production). `src/auth/supabase-identity-resolver.ts` verifies the bearer token with `jose` (ES256/RS256 only, issuer, audience, 30 s tolerance, `exp` and `sub` required, then UUID `sub`, `role=authenticated`, not anonymous). Every failure is `401 unauthenticated` with `WWW-Authenticate: Bearer` and the reason only in the log; a JWKS outage with no cached key is `503 auth_unavailable` + `Retry-After: 5`. Problem bodies carry `requestId`. Tests sign their own tokens (`test/auth.ts`: `makeKeys`, `signTestToken`, `supabaseEnv`) and pass `supabaseIdentityResolver({ keys: createLocalJWKSet(...) })` as `resolveIdentity`; `test/env.ts` stays on `AUTH_MODE=mock`. Routes read the user with `requireIdentity(req)` and scope every query by `identity.userId`. OpenAPI declares `bearerAuth` on every non-public route; the logger serializes request headers with `authorization` and `cookie` redacted.
- `modules/<name>/` holds features (`*.routes.ts` → `*.service.ts` → `*.repository.ts`, as in Pacta). `modules/me` serves `GET /me`. Drizzle table typings go in `src/db/schema/`.
- One test: `pnpm --filter @investhesis/api exec vitest run src/modules/me/me.routes.test.ts`.

## Product (from the brief)

*Investhesis* is a personal, account-backed web app: one investor saves US and Thai (SET/mai) stocks, classifies each on the same **10 lenses**, and sees portfolio concentration (groups at ≥40% are flagged). It replaces a browser-only prototype of 35 US stocks, which is reference material and not code to extend. The brief's CSV import must accept that prototype's data with the same lens names and values.

Things that shape the design and are easy to miss:

- **Markets are first-class.** Each stock stores market (US/TH), exchange, trading currency (USD/THB) and index membership. Market-specific taxonomies (SET industry groups) are stored *alongside* the unified lens values (mapped GICS sector), never instead.
- **Size is computed from USD-converted market cap**, so a Thai and a US large cap compare equally. Keep the local-currency value too. Market cap and size refresh daily per market.
- **Auto vs manual lens values must be tracked** per field, so the user's overrides survive refreshes. Sector-based defaults (e.g. Utilities → Defensive) are overridable.
- **One data provider per market, plus manual entry.** Thai data is harder to source; lookup or refresh failure must never block saving. The stock keeps its last values with a "stale" marker.
- **Privacy:** shares and cost basis never go to third parties, including the data provider. Every row carries a user id; each user reads only their own rows.
- Value weights convert to one base currency (default THB). Thai and English UI labels. Full CSV/JSON export is required.
- **Financials per stock** (revenue, cost of revenue, opex, net income, margins by period) come from a provider with manual override, so the data layer needs financials adapters per market as well as market-cap lookup. Store the reporting currency per period.
- **Thesis notes are dated entries** (buy, sell, update, review; optional target and invalidation conditions), not one editable note, so the history is kept.
- **Multi-page means several routes in one Vite SPA** (`/stocks`, `/stocks/:id`, `/concentration`, `/chains`, `/lists`, `/import-export`), not server-rendered pages.
- Out of scope for v1: live prices and charts, broker sync, other markets, crypto/funds, sharing, AI-generated classifications.

The brief's open questions are still unresolved: data providers (now including financial statements), financials history depth, Thai size buckets, value-chain modelling, and holdings lots vs average cost. Confirm these with the owner before making any of those decisions in code. The stack is settled (see above).

## `.claude/rules` were copied from another project

`.claude/rules/*.md` (`architecture.md`, `api.md`, `web.md`, `testing.md`, `test-gate.md`, `data-and-compliance.md`, `database-and-stack.md`, `git.md`) describe **Pacta**, a Thai document-OCR product (`@pacta/api`, `apps/api`, Fastify, Liquibase, `app.jobs`, OCR providers, PDPA retention, `tenant_id` multi-tenancy). That stack and data model don't exist here, and the Pacta `pnpm` commands and `docs/features/user-auth/v2.0/` paths in those rules won't work.

Treat those rules as **not applicable to Investhesis** unless the owner adopts them. The brief calls for single-user v1 with a user id per row, not multi-tenant tenants/memberships, and has no OCR or document pipeline. Ask the owner whether to rewrite or delete them before relying on them. `.claude/knowledges/migration-workflow.md` is likewise from another project (Prisma → Liquibase).

Rules that are generic and probably worth keeping:

- **Git:** trunk-based on `main`, no feature branches or PRs unless asked, linear history (`git pull --rebase`), push only when the owner asks. Conventional Commits (`type(scope): imperative lowercase description`, ≤72 chars). Version tags only after the owner approves, one per finished feature plan.
- **Test gate:** confirm the full suite is green before starting a dev task and again before handing it to review. Never skip, loosen or `.only` tests to get green. The command table in `test-gate.md` is Pacta-specific and must be redone for this project.

## Planned workflow

The brief's next steps are `requirements.md` v1.0 → system design (architecture, data model, API contracts, data-provider adapters) → dev plan with per-task test cases. The skills in `.claude/skills/` (`solution-planner`, `requirements-engineering`, `solution-architecture`, `orchestrator`, etc.) are meant for this. Planning artifacts go under `docs/features/<feature>/v<version>/`, and `.claude/knowledges/` holds reference notes (TDD, 3A, test pyramid, twelve-factor, etc.).

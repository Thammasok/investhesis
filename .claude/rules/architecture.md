# Architecture rules

Loaded every session. Non-negotiable rules and the planned layout.

## Architecture rules (non-negotiable)

> History: the earlier Rust + Supabase stack is superseded (2026-11-09). The current auth and API design is **`docs/features/user-auth/v2.0/`** (requirements, design, dev plan); v1.0 is superseded.

- **API-first.** A single TypeScript API (Node 24, Fastify 5) is the only thing that touches the database. The web app, browser extension, and any future public API are clients of it. No direct DB access in frontend/extension code.
- **PostgreSQL 18 behind our own interfaces**, so the host is a config change:
  - DB access only from the API through Drizzle (queries and typing only) using `DATABASE_URL`.
  - File storage behind a `StorageProvider` port with S3-compatible semantics; no vendor named in the port. The first adapter is Google Cloud Storage through `@google-cloud/storage` (file-storage v1.0, ADR-002), with `fake-gcs-server` locally (ADR-003); the SDK is imported only under `integrations/storage/`.
  - No business logic in DB triggers.
- **Auth is Pacta-owned** (`modules/auth` in the API): argon2id passwords, email OTP, EdDSA access JWT plus a rotating opaque refresh token in an httpOnly cookie. The API verifies tokens in its own middleware and maps to `app.users` / `app.memberships`. Clients talk only to the Pacta API.
- **Liquibase owns the schema.** All DDL lives in `db/changelog/` as formatted-SQL changelogs under a master changelog, run via the official Liquibase Docker image. Drizzle is for queries only (hand-written schema typing plus a drift test); never use drizzle-kit migrations.
  - Note: `.claude/knowledges/migration-workflow.md` describes a Prisma → Liquibase flow from another project; it does **not** apply here (no Prisma).
- All application tables live in the **`app` schema**.
- Migrations and the API use a **direct or session-mode connection**, not a transaction-mode pooler (prepared statements break).
- **Multi-tenant from day one:** every business table has `tenant_id`; every query is tenant-scoped in the service layer. Tests must prove one tenant never sees another tenant's documents.
- **Third-party services go through `integrations/` ports and adapters** (port, one adapter per vendor, a fake, a shared contract suite). Email: Mailtrap Sending API in shared environments, Mailpit over SMTP locally.
- **OCR behind an `OcrProvider` TypeScript interface**, async. Jobs live in `app.jobs`, polled with `SELECT ... FOR UPDATE SKIP LOCKED` by a worker inside the Node API process (separable later). No extra queue infra. Ship a mock provider returning realistic Thai sample data. Adapters: OpenAI (Responses API), Anthropic (Messages API) and `local` (any OpenAI-compatible `/v1/chat/completions` server), each behind the port with a shared contract suite; the vendor SDKs are imported only under `integrations/ocr/`. Page images (`lib/page-images/`: PDF render in a worker thread with `pdfjs-dist` and `@napi-rs/canvas`, image work with `sharp`) are the only importers of those packages, and the API never serves object bytes: the web gets short-lived signed URLs for the stored page JPEGs. A real provider needs the owner's PDPA decision first (`ops/ocr/README.md`).
- **The OpenAPI spec is the contract.** The API generates it (Zod + `@fastify/swagger`) and serves it at `/openapi.json`; web and extension consume a generated TS client in `packages/api-client`, with no hand-written duplicate types.

## Planned layout & stack

- Monorepo: pnpm workspaces (Turborepo later), TypeScript throughout.
- `apps/api` — Node 24, Fastify 5, Zod 4, Drizzle on `pg`, pino, an xlsx library, a GCS client (`@google-cloud/storage`) behind `StorageProvider`. Lint with oxlint.
- `apps/web` — React + Vite SPA + Tailwind + shadcn/ui + TanStack Query + Zustand + React Router (built; see above).
- `apps/extension` — WXT (Manifest V3), minimal popup only (sign in, upload file/screenshot, show extracted fields with copy buttons).
- `packages/api-client` — generated from the OpenAPI spec.
- `db/` — Liquibase changelogs; seed changeset uses context `dev` only.
- Tests: Vitest everywhere; API integration tests against local PostgreSQL 18 (Docker) with Liquibase applied.
- CI order: Liquibase update → tests.

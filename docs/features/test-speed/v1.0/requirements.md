---
version: 1.0
status: approved
date: 2026-11-27
source: owner request 2026-11-27 ("automation testing is slow"); measured run of 2026-11-27
---

# Requirements: Faster Test Suite

The Investhesis gate (`CLAUDE.md`, "Tests and the Investhesis gate") takes about 25 minutes, and
the owner runs it before and after every development task. This slice makes the **full gate finish
in under 10 minutes** without removing, skipping or weakening any test. It also adds a quick check
to run while developing.

This is test infrastructure only. No product screen, API route or schema changes, so there is no
UX phase.

## Baseline (measured 2026-11-27, last full run)

| Step | Wall time | Tests |
|---|---|---|
| `pnpm test` (domain, API, web Vitest) | about 21 s | 1,571 |
| `pnpm test:supabase` | 107 s, of which 83 s are deliberate rate-limit waits in `scripts/auth-integration.test.ts` | 74 |
| `pnpm test:e2e` | **1,296 s (21.6 min)** on one worker | 307 |

Inside E2E:

- The a11y, contrast and responsive specs (`*-a11y`, `*-responsive`) take about 11 minutes.
- Each of these specs is one test that loops over every screen state in `e2e/lib/states.ts`. The
  slowest single test (`TC-E-415`) takes 53 s.
- `workers: 1`. The comment in `e2e/playwright.config.ts` gives the reason as "auth rate limits
  are per IP" (`supabase/config.toml` `sign_in_sign_ups = 30` per 5 minutes). A probe on
  2026-11-27 sent 45 password sign-ins from node in 2.5 s and all of them succeeded, so the local
  stack does not enforce that limit on the suite's sign-ins. Also, no test asserts the sign-in
  limit. The real constraints on parallel runs are the shared state listed in
  [FR-002](#fr-002).

## Decisions taken for this slice

- **Target: the full gate under 10 minutes** (owner, 2026-11-27) on the owner's development
  machine (10 CPU cores, Docker running local Supabase).
- **The full gate keeps every test.** Speed comes from parallel execution and from splitting long
  tests, never from dropping cases, loosening assertions or adding retries. This keeps the
  test-gate rule.
- **The `test:supabase` rate-limit waits stay in the full gate.** A "slow" flag would only help the
  quick check, and the quick check does not run `test:supabase`, so it is out of scope.

## Actors

- **Owner / developer**: runs the full gate before and after a task, and the quick check while
  developing.
- **Developer agent**: an AI agent working a dev-plan task. It runs the same commands under the
  test-gate rule.

## Use Cases

### UC-001

**Run the full gate fast**: before handing a task to review, the developer runs the full gate
with the same commands as today and gets the verdict in under 10 minutes.

### UC-002

**Check a change quickly**: while developing, the developer runs one command that runs only the
unit and E2E tests related to the files changed since `main`, and gets a result in about a minute.

### UC-003

**Find what broke**: when an a11y or responsive check fails, the report names the screen state
that failed, not only the spec.

## Functional Requirements

### FR-001

The system SHALL run the E2E suite on more than one Playwright worker by default. The worker count
SHALL be overridable by an environment variable (for example `E2E_WORKERS`), so a smaller machine
or a debugging run can use 1.

### FR-002

The system SHALL run, on a single worker and after or apart from the parallel tests, every E2E spec
that depends on state shared across tests:

- the one fixed mock-mode user (`auth-mock-mode`, and the mock-mode cases of `sl-resilience` and
  `hc-holdings`)
- the end-of-run log checks (`zz-api-logs`)
- any spec found in the audit ([FR-006](#fr-006)) to need it

### FR-003

The system SHALL NOT change the local Supabase auth configuration (`supabase/config.toml`) to make
the suite parallel. The auth checks that do depend on the stack's limits and timers (the
`test:supabase` resend and refresh-token cases) SHALL keep running unchanged.

Correction, 2026-11-27: this requirement first said a sign-in rate-limit case had to keep running
against a limit of 30. The probe in the baseline showed there is no such case and the limit is not
hit, so there is nothing to raise or protect.

### FR-004

The system SHALL generate one Playwright test per screen state for each state-looping a11y,
contrast and responsive spec, from the existing state lists (`STATES`, `HC_STATES`, `TL_STATES`,
`VC_STATES` and the search-filter-export states).

- Each generated test SHALL keep the original `TC-` id at the start of its title, followed by the
  state name.
- The checks on each state SHALL stay exactly the same: axe rules, contrast thresholds, 360 px
  overflow check, and both light and dark themes.

### FR-005

The test report scripts (`pnpm test:report`, `test:report:holdings`, `test:report:sfe`,
`test:report:tl`, `test:report:vc`, `test:report:auth`) SHALL still produce one pass/fail verdict
per `TC-` id. A TC split into several state tests SHALL pass only when all its state tests pass.

### FR-006

The system SHALL be audited for coupling between E2E specs before running them in parallel. The
audit covers at least:

- the shared `dev-server.log` and `mock-server.log` scans (`hc-privacy`, `sfe-privacy`,
  `vc-privacy`, `sl-import`, `tl-resilience`, `zz-api-logs`)
- the one mock-mode user
- the fixed ports
- `global-setup.ts`

Each coupling found SHALL be removed or its spec placed on the serial worker
([FR-002](#fr-002)). The audit result SHALL be recorded in the design.

### FR-007

The system SHALL provide a quick-check command (for example `pnpm test:quick`) that runs:

- Vitest in the domain, API and web packages for files changed since `main`, including
  uncommitted changes
- the E2E specs related to the files changed since `main`

It SHALL NOT replace or shorten the full gate.

### FR-008

The documented gate commands in `CLAUDE.md` SHALL stay the same, apart from any new optional
variables (worker count) and the new quick-check command. `CLAUDE.md` and
`.claude/rules/test-gate.md` (or its Investhesis replacement, if the owner adopts one) SHALL
describe the two tiers.

## Non-Functional Requirements

### NFR-001

**Performance**: the full gate SHALL finish in under 10 minutes of wall time on the owner's
machine.

- Measurement: from `pnpm db:start` to the end of `pnpm test:e2e`, with a running Docker and a
  warm `node_modules`.
- The run SHALL be measured three times; the median SHALL be under 10 minutes and no run over 11.

### NFR-002

**Performance**: `pnpm test:e2e` on its own SHALL finish in under 7 minutes of wall time, measured
like [NFR-001](#nfr-001).

### NFR-003

**Reliability**: the parallel E2E suite SHALL pass 5 consecutive full runs with no failures and with
`retries: 0`. A test that fails only under parallel load counts as a defect to fix, not a flake to
retry.

### NFR-004

**Coverage kept**: after the change, every `TC-` id present in the reports of
2026-11-27 SHALL still appear, with the same verdict. Expected failures (`test.fail` with a
finding id) SHALL stay expected failures.

### NFR-005

**Timing tests stay meaningful**: the timing checks (`vc-perf` `TC-E-923`, the no-request checks
`TC-E-406`, `TC-E-419`, `TC-E-507`) SHALL keep their thresholds. If load from parallel workers
makes them unstable, they SHALL move to the serial worker ([FR-002](#fr-002)), not get looser
thresholds.

### NFR-006

**Quick check speed**: the quick check ([FR-007](#fr-007)) SHALL finish in under 90 seconds when the
change touches one web feature folder, with the local stack and the E2E servers already started or
started by the command.

## Constraints

- Tools stay as they are: Playwright 1.65 (Chromium only), Vitest 5, pnpm workspace, local
  Supabase in Docker. No paid CI service or remote test grid.
- Ports 5173/3000 (Supabase mode) and 5273/3100 (mock mode) stay the default, with `E2E_WEB_PORT`
  still overriding.
- No product code changes, unless the audit finds a product defect. That is reported to the owner
  as a finding, not fixed silently.
- Git rules apply: work on `main`, small Conventional Commits.

## Out of Scope

- Making the `test:supabase` rate-limit waits faster or optional.
- Speeding up `pnpm test` (Vitest), which already takes about 21 s.
- Sharding across several machines or a CI pipeline.
- Browsers other than Chromium.
- Changing what any test checks.

## Open Questions

### OQ-1

Closed 2026-11-27. The question was whether the parallel tests need a higher sign-in rate limit
or another way to get a session. Neither is needed: the probe in the baseline showed the limit is
not hit (45 sign-ins in 2.5 s, all succeeded). See [FR-003](#fr-003).

---
version: 1.0
status: active
date: 2026-11-27
requires: design.md
---

# Development Plan: Faster Test Suite

Builds [requirements.md](requirements.md) per [design.md](design.md). There are no screens, so
there is no `ux-design.md`. Every task that changes code follows the test gate: green before,
green after, then human review. The gate is the **Investhesis gate** in `CLAUDE.md`, run from the
repo root:

1. `pnpm db:start && pnpm db:reset`
2. `pnpm test:supabase`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm build`
7. `pnpm test:e2e`

`.claude/rules/test-gate.md` still lists Pacta's commands, which is carried work in
`docs/todo.md`.

**Test ids.** This slice uses the 1200 range. 1000s are taken by i18n v2.0 and 1100s by
value-chains v1.1. `TC-U-12xx` appear in the task contracts below, and `TC-A/E-12xx` come from
[T-009](#t-009--design-test-cases--faster-test-suite). Every test title starts with its id.

**Pure helper tests.** The new pure functions (state-test planning, quick-map resolution) live in
`e2e/lib/` and `scripts/lib/`. Their tests run with a small `e2e/vitest.config.ts` (node
environment, no stack). The root `pnpm test` gains one more step for it, so they join the gate
without needing Docker.

**No product code changes.** If the audit or a parallel run exposes a product defect, it is pinned
with `test.fail` and a finding id, and reported to the owner. It is not fixed inside this slice.

## Summary

- **Total tasks**: 10
- **Estimated effort**: about 5 days
- **Critical path**:
  [T-001](#t-001--baseline-snapshot-and-coupling-audit) →
  [T-003](#t-003--state-test-generator) →
  [T-004](#t-004--split-the-stock-lists-and-holdings-state-loops) →
  [T-007](#t-007--tune-workers-and-make-the-parallel-suite-stable) →
  [T-008](#t-008--document-the-two-tiers) →
  [T-010](#t-010--automate-tests--faster-test-suite)

## Tasks

### T-001 — Baseline snapshot and coupling audit

```yaml
- title: Baseline snapshot and coupling audit
- description: >
  Record what "nothing was lost" means before anything changes, then finish the coupling audit
  of design.md (§Coupling audit, FR-006).
  (1) Run the full gate on main. Save every TC id and its verdict from the Vitest JSON and
  Playwright JSON reports to docs/features/test-speed/v1.0/baseline-verdicts.json, with the
  e2e test count and wall time; this is NFR-004's reference.
  (2) Write the audit script e2e/audit-states.spec.ts, run only by hand with E2E_AUDIT=1 and
  skipped otherwise. For every state in STATES, HC_STATES, TL_STATES, VC_STATES and the
  search-filter-export states, it snapshots each seeded user's GET /exports/backup.json, enters
  the state, snapshots again and reports the states whose backup changed. Ignore
  updatedAt-only differences only when the stock itself is unchanged.
  (3) Run the whole suite once with --workers=4 and fullyParallel, without committing that
  config. List every test that fails only in parallel, with its cause.
  (4) Update the design.md audit table with the results: the confirmed fresh states, the
  confirmed @serial tests, and the parallel-only failures with their causes.
- agent: software-tester-automation
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `baseline-verdicts.json` exists and lists every TC id in the reports of the baseline run
      with its verdict (`pass`, `fail`, `expected-fail`, `skip`), plus the E2E test count and wall
      time.
- [ ] `E2E_AUDIT=1 pnpm test:e2e audit-states` prints one line per state that writes data. Without
      `E2E_AUDIT` the spec is skipped and adds no time.
- [ ] The design.md audit table lists every state that writes (expected at least
      `settings-dialog-with-rate` and `undo-toast-visible`) and every test that needs `@serial`.
- [ ] Every test that failed only under `--workers=4` is listed with its cause and the fix
      planned in [T-007](#t-007--tune-workers-and-make-the-parallel-suite-stable).
- [ ] Nothing in `e2e/playwright.config.ts` is committed by this task.

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1201
    scenario: the backup diff ignores a timestamp-only change
    given: two backups whose only difference is one stock's updatedAt
    when: backupDiff(before, after)
    then: no change is reported
    test_data:
      input: "{ stocks: [{ id: 's1', ticker: 'NVDA', updatedAt: 'T1' }] } vs the same with updatedAt 'T2'"
      expected: "[]"
  - id: TC-U-1202
    scenario: the backup diff reports a changed setting
    given: settings.usdThbRate null before and '36.25' after
    when: backupDiff(before, after)
    then: one change naming the path
    test_data:
      input: "settings.usdThbRate: null -> '36.25'"
      expected: "['settings.usdThbRate']"
  - id: TC-U-1203
    scenario: the backup diff reports a removed thesis entry
    given: a theses array with entry t1 before and without it after
    when: backupDiff(before, after)
    then: one change naming the entry
    test_data:
      input: "theses: [t1, t2] -> [t2]"
      expected: "['theses[id=t1]']"
```

**Notes**: `backupDiff` is a pure function in `e2e/lib/backup-diff.ts`. Run the baseline gate
on a clean `main`; if it is red, the test-gate rule applies before anything else.

### T-002 — Playwright projects, worker count and the serial tag

```yaml
- title: Playwright projects, worker count and the serial tag
- description: >
  Implement ADR-001, ADR-002 and ADR-005 of design.md in e2e/playwright.config.ts.
  Projects: 'parallel' (fullyParallel, grepInvert @serial, ignores the final files);
  'serial' (workers 1, grep @serial); 'final' (workers 1, testMatch zz-api-logs and vc-perf,
  dependencies ['parallel', 'serial']).
  Global workers come from E2E_WORKERS (positive integer, default 4 until T-007 sets the final
  default). An invalid value fails at config load with a message naming E2E_WORKERS.
  Tag the tests T-001 confirmed as @serial with { tag: '@serial' }; the titles keep their TC-
  prefix. Remove the stale "auth rate limits are per IP" comment and give the real reasons.
  Pure parts (reading E2E_WORKERS, choosing a project for a spec) live in
  e2e/lib/projects.ts so they can be unit tested.
- agent: software-tester-automation
- depends_on: [T-001]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] `pnpm exec playwright test --config e2e/playwright.config.ts --list` shows each test in
      exactly one project. `zz-api-logs` and `vc-perf` are only in `final`, and the `@serial`
      tests are only in `serial`.
- [ ] `E2E_WORKERS=1 pnpm test:e2e` runs everything on one worker, as today.
- [ ] `E2E_WORKERS=abc pnpm test:e2e` stops before any test with a message naming
      `E2E_WORKERS`.
- [ ] `pnpm test:e2e sl-import` and `-g "TC-E-109"` still work.
- [ ] Full gate green. The state loops are still unsplit at this point, so no time target applies
      yet.

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1204
    scenario: worker count defaults when E2E_WORKERS is unset
    given: an environment without E2E_WORKERS
    when: workersFrom(env)
    then: the default count
    test_data:
      input: "{}"
      expected: "4 (or the default T-007 settles)"
  - id: TC-U-1205
    scenario: worker count reads a positive integer
    given: E2E_WORKERS set to a number
    when: workersFrom(env)
    then: that number
    test_data:
      input: "{ E2E_WORKERS: '6' }"
      expected: "6"
  - id: TC-U-1206
    scenario: an invalid worker count is refused
    given: E2E_WORKERS is not a positive integer
    when: workersFrom(env)
    then: throws naming the variable
    test_data:
      input: "{ E2E_WORKERS: '0' }, { E2E_WORKERS: 'abc' }, { E2E_WORKERS: '2.5' }"
      expected: "Error /E2E_WORKERS/"
  - id: TC-U-1207
    scenario: the final files are listed once
    given: the FINAL_SPECS constant
    when: read
    then: exactly zz-api-logs.spec.ts and vc-perf.spec.ts
    test_data:
      input: FINAL_SPECS
      expected: "['zz-api-logs.spec.ts', 'vc-perf.spec.ts']"
```

**Notes**: when `final` is skipped because a dependency failed, the report scripts print
`SKIPPED` for `TC-E-923` and the log-scan ids. That is expected (design.md §Risks).

### T-003 — State-test generator

```yaml
- title: State-test generator
- description: >
  Add e2e/lib/state-tests.ts per design.md (§Components, ADR-003).
  stateTests({ id, title, states, seed, enter, check, variants }) declares one Playwright test
  per state × variant, titled '<id>: <title> — <state> (<variant>)'; the variant part is left
  out when there is a single variant.
  The seeded context is a worker-scoped fixture (seed() once per worker). A state with
  fresh: true gets its own seed() in a test-scoped fixture.
  The planning is a pure function, planStateTests(states, variants) -> [{ title, state,
  variant, fresh }], unit tested.
  Add the optional fresh flag to the state types in e2e/lib/states.ts and set it on the states
  T-001 found.
  No spec is converted in this task, except one small pilot: tl-responsive (1.7 s today), to
  prove the fixture wiring end to end.
- agent: software-tester-automation
- depends_on: [T-001]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `planStateTests` and the title format are covered by TC-U-1208..1211.
- [ ] `tl-responsive` runs as one test per state. Its TC id still reads pass in
      `pnpm test:report:tl`.
- [ ] A `fresh` state never shares a seed with another test. Proved by TC-U-1211 and by a pilot
      run where the fresh state's user id differs from the worker's.
- [ ] Full gate green.

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1208
    scenario: one test per state and variant
    given: 3 states and variants ['light', 'dark']
    when: planStateTests(states, variants)
    then: 6 entries, states in list order, light before dark per state
    test_data:
      input: "states a, b, c; variants light, dark"
      expected: "a(light), a(dark), b(light), b(dark), c(light), c(dark)"
  - id: TC-U-1209
    scenario: the title keeps the TC id first
    given: id TC-E-415, title 'no axe violations', state 'concentration-expanded', variant 'dark'
    when: the title is built
    then: the title starts with the id, so the report scripts match it
    test_data:
      input: "TC-E-415, 'no axe violations', concentration-expanded, dark"
      expected: "'TC-E-415: no axe violations — concentration-expanded (dark)'"
  - id: TC-U-1210
    scenario: a single variant leaves out the brackets
    given: no variants (for example a responsive spec at 360 px only)
    when: planStateTests(states, undefined)
    then: titles end with the state name
    test_data:
      input: "state 'page-filled', no variants"
      expected: "'TC-E-920: … — page-filled'"
  - id: TC-U-1211
    scenario: the fresh flag is carried to every variant
    given: state b with fresh true, variants light and dark
    when: planStateTests
    then: both b entries have fresh true, the others false
    test_data:
      input: "a, b(fresh), variants light, dark"
      expected: "fresh: [false, false, true, true]"
  - id: TC-U-1212
    scenario: duplicate state names are refused
    given: two states named 'stocks-data'
    when: planStateTests
    then: throws naming the duplicate (Playwright would refuse duplicate titles less clearly)
    test_data:
      input: "states stocks-data, stocks-data"
      expected: "Error /stocks-data/"
```

### T-004 — Split the stock-lists and holdings state loops

```yaml
- title: Split the stock-lists and holdings state loops
- description: >
  Convert sl-a11y, sl-responsive, hc-a11y and hc-responsive (and any contrast loop in them)
  to stateTests. Move the per-state body into check(page, state, ctx) unchanged: the same
  axe tags and exclusions, the same viewport rules, contrast thresholds, duplicate-id and
  landmark checks.
  Findings pinned with test.fail (F-2, F-3, F-4 in sl-a11y) stay pinned on exactly the states
  they concern. Where a finding was pinned on the whole loop, pin it on each state it fails on.
  Every other state must pass on its own; that is a coverage gain, not a change.
- agent: software-tester-automation
- depends_on: [T-003]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `TC-E-118`, `TC-E-124`, `TC-E-415`, `TC-E-417` (and the other ids of these four files) give
      the same verdicts as `baseline-verdicts.json` in `pnpm test:report` and
      `pnpm test:report:holdings`.
- [ ] No test in these files is longer than 60 s (the default timeout). The `test.setTimeout(420_000)`
      calls are gone.
- [ ] A diff review shows the checks per state are the same expressions as before; only their
      placement changed.
- [ ] Full gate green.

**Notes**: no new TC-U. The contract is "same checks, same verdicts", proved by the report
comparison in [T-010](#t-010--automate-tests--faster-test-suite).

### T-005 — Split the thesis-log, value-chains and search-filter-export state loops

```yaml
- title: Split the thesis-log, value-chains and search-filter-export state loops
- description: >
  Same as T-004 for tl-a11y, vc-a11y (TC-E-918, TC-E-919), vc-responsive, sfe-a11y and
  sfe-responsive. (tl-responsive was the T-003 pilot.)
- agent: software-tester-automation
- depends_on: [T-003]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `pnpm test:report:tl`, `test:report:vc` and `test:report:sfe` give the same verdicts as
      `baseline-verdicts.json` for these files.
- [ ] No `test.setTimeout` above 60 s remains in these files.
- [ ] Full gate green.

### T-006 — Quick check command

```yaml
- title: Quick check command
- description: >
  Add pnpm test:quick [ref] (scripts/test-quick.mjs) and e2e/quick-map.json per design.md
  (§Interfaces, ADR-004).
  Changed files are git diff --name-only <ref>...HEAD plus uncommitted and untracked files
  (ref defaults to main).
  Vitest: vitest run --changed <ref> in each package that has a changed file, or all three
  when packages/domain changed.
  E2E: map paths with resolveSpecs(changed, map) to spec globs, add changed e2e/*.spec.ts and,
  for e2e/lib changes, Playwright's --only-changed=<ref>; run with --project=parallel
  --project=serial.
  Print the chosen packages and specs with the reason, and the line "shared code changed: run
  the full gate before review" when a non-test path under apps/ or packages/ matched no map
  entry.
  With nothing to run, exit 0 and say so. The exit code is non-zero if either runner failed.
  resolveSpecs is pure and lives in scripts/lib/quick-map.ts.
- agent: software-engineer-backend
- depends_on: []
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] A change only in `apps/web/src/features/chains/` runs the web Vitest files related to it
      and `vc-*.spec.ts`, and finishes in under 90 s with the stack running
      ([NFR-006](requirements.md#nfr-006)).
- [ ] A change only in `docs/` runs nothing and exits 0 with "nothing to test".
- [ ] A change in `apps/web/src/components/layout/` prints the shared-code line.
- [ ] A failing Vitest or Playwright test makes the command exit non-zero.
- [ ] Full gate green.

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1213
    scenario: a feature folder maps to its specs
    given: map { 'apps/web/src/features/chains/': ['vc-*'] }
    when: resolveSpecs(['apps/web/src/features/chains/chain-section.tsx'], map)
    then: the vc specs, nothing unmapped
    test_data:
      input: "apps/web/src/features/chains/chain-section.tsx"
      expected: "{ specs: ['vc-*'], unmapped: [] }"
  - id: TC-U-1214
    scenario: the longest matching prefix wins and specs are not repeated
    given: map with 'apps/web/src/features/' -> [] and 'apps/web/src/features/theses/' -> ['tl-*']
    when: two changed files under features/theses
    then: tl specs once
    test_data:
      input: "features/theses/a.tsx, features/theses/b.tsx"
      expected: "{ specs: ['tl-*'], unmapped: [] }"
  - id: TC-U-1215
    scenario: app code with no entry is reported as unmapped
    given: an empty map
    when: resolveSpecs(['apps/web/src/components/layout/app-layout.tsx'], {})
    then: listed as unmapped
    test_data:
      input: "apps/web/src/components/layout/app-layout.tsx"
      expected: "{ specs: [], unmapped: ['apps/web/src/components/layout/app-layout.tsx'] }"
  - id: TC-U-1216
    scenario: docs and test-only files are neither specs nor unmapped
    given: any map
    when: resolveSpecs(['docs/todo.md', 'apps/web/src/features/chains/x.test.tsx'], map)
    then: nothing to run from E2E, nothing unmapped
    test_data:
      input: "docs/todo.md, a .test.tsx file"
      expected: "{ specs: [], unmapped: [] }"
  - id: TC-U-1217
    scenario: a changed spec runs itself
    given: any map
    when: resolveSpecs(['e2e/sl-import.spec.ts'], map)
    then: that spec
    test_data:
      input: "e2e/sl-import.spec.ts"
      expected: "{ specs: ['sl-import.spec.ts'], unmapped: [] }"
```

### T-007 — Tune workers and make the parallel suite stable

```yaml
- title: Tune workers and make the parallel suite stable
- description: >
  With T-002, T-004 and T-005 in, fix every parallel-only failure at its cause (listed by T-001
  and found now). Typical fixes: wait for the right signal instead of a fixed time, give a
  test its own data, move a test to @serial or final with the reason in a comment. Raising a
  timeout, adding retries or loosening an assertion is not a fix (NFR-003, NFR-005).
  Then measure pnpm test:e2e at E2E_WORKERS 4 and 6 (3 runs each), and set the default to the
  smallest count whose median meets NFR-002 (under 420 s). Run the suite 5 times in a row at
  that default, all green.
  Record the runs (date, workers, wall time, pass counts) in
  docs/features/test-speed/v1.0/timings.md.
- agent: software-tester-automation
- depends_on: [T-002, T-004, T-005]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `timings.md` lists at least 3 runs at 4 workers and 3 at 6, with wall times, and the chosen
      default with the reason.
- [ ] The chosen default's median `pnpm test:e2e` is under 420 s ([NFR-002](requirements.md#nfr-002)).
- [ ] 5 consecutive full E2E runs at the default are green with `retries: 0`
      ([NFR-003](requirements.md#nfr-003)).
- [ ] No timeout was raised and no threshold loosened. `git diff` of `e2e/` shows no larger
      `timeout` values or `TC-E-923` threshold.
- [ ] Full gate green.

### T-008 — Document the two tiers

```yaml
- title: Document the two tiers
- description: >
  Update CLAUDE.md ("Commands" and "Tests and the Investhesis gate"): E2E_WORKERS and its
  default, the three projects and what goes in each, the @serial tag and when to use it, how
  to add a state to a state list (and when to mark it fresh), and pnpm test:quick with what it
  does and does not cover.
  Replace the "Several cases count rows..." style reasons with the current ones where they
  changed. Remove the statement that auth rate limits force one worker.
  Add a short "Quick check while developing" paragraph to .claude/rules/test-gate.md that
  points at CLAUDE.md, without rewriting its Pacta table (carried work).
- agent: software-tester-automation
- depends_on: [T-006, T-007]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] `CLAUDE.md` names `E2E_WORKERS`, the `parallel`/`serial`/`final` projects, `@serial`,
      `fresh`, and `pnpm test:quick`.
- [ ] No sentence in `CLAUDE.md` or `e2e/playwright.config.ts` still says rate limits force one
      worker.
- [ ] The gate commands listed in `CLAUDE.md` are unchanged ([FR-008](requirements.md#fr-008)).

### T-009 — Design test cases — Faster Test Suite

```yaml
- title: Design test cases — Faster Test Suite
- description: >
  Using the software-tester-design skill, write docs/features/test-speed/v1.0/test-cases.md.
  The SUT is the test infrastructure itself: the Playwright config, the state-test generator,
  the quick check and the gate timing.
  Cover:
  (a) coverage parity: every baseline TC id present, with the same verdict, and expected
  failures still expected (NFR-004);
  (b) placement: each test in exactly one project, the @serial and final rules;
  (c) timing: gate median and maximum (NFR-001), E2E median (NFR-002), quick check (NFR-006);
  (d) stability: 5 green runs, retries 0 (NFR-003);
  (e) timing checks unchanged (NFR-005);
  (f) quick-check behaviour at the command level: exit codes, the shared-code line, the
  nothing-to-test path.
  Ids TC-A-12xx (command and script level) and TC-E-12xx (whole-suite runs).
- agent: software-tester-design
- depends_on: []
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] SUT definition documented.
- [ ] TC cases cover NFR-001..006 and FR-001..008, each with Level, Input, Expected output,
      Preconditions and Mock needed.
- [ ] Each case names how it is measured (command, number of runs, what is compared).

**Notes**: runs in parallel with engineering; depends only on requirements and design.

### T-010 — Automate tests — Faster Test Suite

```yaml
- title: Automate tests — Faster Test Suite
- description: >
  Using the software-tester-automation skill, automate the T-009 cases.
  Expected pieces:
  - scripts/test-speed-report.mjs: compares the current Vitest and Playwright JSON reports with
    baseline-verdicts.json and prints a pass/fail table per TC-12xx; it fails when an id is
    missing or a verdict changed.
  - scripts/gate-timing.mjs: runs the full gate N times and records the wall time per step in
    timings.md.
  - pnpm test:report:speed: runs the report.
  Run everything and write docs/features/test-speed/v1.0/test-report.md.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] All TC from T-009 automated and passing, or pinned with a finding id and listed in the
      report.
- [ ] `pnpm test:report:speed` shows every baseline TC id present with an unchanged verdict.
- [ ] Three full-gate runs recorded: the median is under 10 min and none is over 11 min
      ([NFR-001](requirements.md#nfr-001)).
- [ ] Test report produced with pass/fail per TC id.

**Notes**: report "T-010 done" with the full test report when all TCs pass.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |

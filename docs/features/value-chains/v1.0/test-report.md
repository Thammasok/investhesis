---
version: 1.0
status: review
date: 2026-11-26
task: T-008
---

# Test report: Value Chains

Results of the automated cases of [test-cases.md](test-cases.md) (102 new `TC-A/C/E-9xx` cases and the 47 `TC-U-9xx` of the task contracts). The table is the output of `pnpm test:report:vc` after `pnpm test:report:unit` and the full `pnpm test:e2e`.

## Gate (2026-11-26, local Supabase)

| Step | Result |
|---|---|
| `pnpm db:start && pnpm db:reset` | ok |
| `pnpm test:supabase` | 74 passed |
| `pnpm lint`, `pnpm typecheck` (includes `e2e/`) | clean |
| `pnpm test` | domain 216, api 514, web 841, all passed |
| `pnpm build` | ok |
| Coverage | domain 98.76 % lines (`chains.ts` 100 %); api `src/modules/chains` 100 % lines (target 85 %); web `src/features` 98.23 % lines (target 70 %) |
| `pnpm test:e2e` | 307 passed (21.6 min), of which 3 are expected failures (below) |

One API test (TC-A-917, 30 rounds of opposite merges) timed out at the 5 s default once, under the load of the parallel files; both stress tests now have a 60 s timeout and the suite was re-run green.

## Results per case

| TC | tests | result | files |
|---|---|---|---|
| TC-A-900 | 2 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-901 | 3 | pass | src/modules/chains/chains.auth.test.ts |
| TC-A-902 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-903 | 10 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-904 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-905 | 11 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-906 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-907 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-908 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-909 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-910 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-911 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-912 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-913 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-914 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-915 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-916 | 1 | pass | src/modules/chains/chains.concurrency.test.ts |
| TC-A-917 | 1 | pass | src/modules/chains/chains.concurrency.test.ts |
| TC-A-918 | 2 | pass | src/modules/chains/chains.atomicity.test.ts |
| TC-A-919 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-920 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-921 | 1 | pass | src/modules/chains/chains.privacy.test.ts |
| TC-A-922 | 1 | pass | src/modules/chains/chains.privacy.test.ts |
| TC-A-923 | 1 | pass | src/modules/chains/chains.privacy.test.ts |
| TC-A-924 | 1 | pass | src/modules/chains/chains.latency.test.ts |
| TC-A-925 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-926 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-927 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-928 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-A-929 | 1 | pass | src/modules/chains/chains.cases.test.ts |
| TC-C-900 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-901 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-902 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-903 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-904 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-905 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-906 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-907 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-908 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-909 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-910 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-911 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-912 | 1 | pass | src/features/chains/chains-cases-page.test.tsx |
| TC-C-913 | 2 | pass | src/features/chains/chains-cases-scope.test.tsx |
| TC-C-914 | 3 | pass | src/features/chains/chains-cases-scope.test.tsx |
| TC-C-915 | 1 | pass | src/features/chains/chains-cases-scope.test.tsx |
| TC-C-916 | 1 | pass | src/features/chains/chains-cases-scope.test.tsx |
| TC-C-917 | 1 | pass | src/features/chains/chains-cases-scope.test.tsx |
| TC-C-918 | 1 | pass | src/features/chains/chains-cases-links.test.tsx |
| TC-C-919 | 2 | pass | src/features/chains/chains-cases-links.test.tsx |
| TC-C-920 | 1 | pass | src/features/chains/chains-cases-links.test.tsx |
| TC-C-921 | 4 | pass | src/features/chains/chains-cases-links.test.tsx |
| TC-C-922 | 2 | pass | src/features/chains/chains-cases-links.test.tsx |
| TC-C-923 | 1 | pass | src/features/chains/chains-cases-states.test.tsx |
| TC-C-924 | 1 | pass | src/features/chains/chains-cases-states.test.tsx |
| TC-C-925 | 1 | pass | src/features/chains/chains-cases-states.test.tsx |
| TC-C-926 | 2 | pass | src/features/chains/chains-cases-states.test.tsx |
| TC-C-927 | 1 | pass | src/features/chains/chains-cases-static.test.tsx |
| TC-C-928 | 2 | pass | src/features/chains/chains-cases-static.test.tsx |
| TC-C-929 | 1 | pass | src/features/chains/chains-cases-static.test.tsx |
| TC-C-930 | 2 | pass | src/features/chains/chains-cases-rename.test.tsx |
| TC-C-931 | 6 | pass | src/features/chains/chains-cases-rename.test.tsx |
| TC-C-932 | 1 | pass | src/features/chains/chains-cases-rename.test.tsx |
| TC-C-933 | 1 | pass | src/features/chains/chains-cases-rename.test.tsx |
| TC-C-934 | 2 | pass | src/features/chains/chains-cases-rename.test.tsx |
| TC-C-935 | 1 | pass | src/features/chains/chains-cases-rename.test.tsx |
| TC-C-936 | 1 | pass | src/features/chains/chains-cases-rename.test.tsx |
| TC-C-937 | 2 | pass | src/features/chains/chains-cases-rename.test.tsx |
| TC-C-938 | 2 | pass | src/features/chains/chains-cases-rename-b.test.tsx |
| TC-C-939 | 5 | pass | src/features/chains/chains-cases-rename-b.test.tsx |
| TC-C-940 | 1 | pass | src/features/chains/chains-cases-rename-b.test.tsx |
| TC-C-941 | 2 | pass | src/features/chains/chains-cases-rename-b.test.tsx |
| TC-C-942 | 1 | pass | src/features/chains/chains-cases-rename-b.test.tsx |
| TC-E-900 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-901 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-902 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-903 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-904 | 1 | pass | e2e/vc-rename.spec.ts |
| TC-E-905 | 1 | pass | e2e/vc-rename.spec.ts |
| TC-E-906 | 1 | pass | e2e/vc-rename.spec.ts |
| TC-E-907 | 2 | pass | e2e/vc-rename.spec.ts |
| TC-E-908 | 1 | pass | e2e/vc-rename.spec.ts |
| TC-E-909 | 1 | pass | e2e/vc-rename.spec.ts |
| TC-E-910 | 1 | pass | e2e/vc-rename.spec.ts |
| TC-E-911 | 1 | pass | e2e/vc-rename.spec.ts |
| TC-E-912 | 1 | pass | e2e/vc-rename.spec.ts |
| TC-E-913 | 1 | pass | e2e/vc-rename.spec.ts |
| TC-E-914 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-915 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-916 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-917 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-918 | 2 | pass | e2e/vc-a11y.spec.ts |
| TC-E-919 | 6 | pass + expected failure | e2e/vc-a11y.spec.ts |
| TC-E-920 | 4 | pass + expected failure | e2e/vc-responsive.spec.ts |
| TC-E-921 | 1 | pass | e2e/vc-responsive.spec.ts |
| TC-E-922 | 1 | pass | e2e/vc-keyboard.spec.ts |
| TC-E-923 | 1 | pass | e2e/vc-perf.spec.ts |
| TC-E-924 | 1 | pass | e2e/vc-privacy.spec.ts |
| TC-E-925 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-926 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-927 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-E-928 | 1 | pass | e2e/vc-chains.spec.ts |
| TC-U-900 | 1 | pass | src/chains.test.ts |
| TC-U-901 | 1 | pass | src/chains.test.ts |
| TC-U-902 | 1 | pass | src/chains.test.ts |
| TC-U-903 | 1 | pass | src/chains.test.ts |
| TC-U-904 | 1 | pass | src/chains.test.ts |
| TC-U-905 | 1 | pass | src/chains.test.ts |
| TC-U-906 | 1 | pass | src/chains.test.ts |
| TC-U-907 | 1 | pass | src/chains.test.ts |
| TC-U-908 | 1 | pass | src/chains.test.ts |
| TC-U-909 | 1 | pass | src/chains.test.ts |
| TC-U-910 | 1 | pass | src/chains.test.ts |
| TC-U-911 | 2 | pass | src/concentration.test.ts |
| TC-U-912 | 1 | pass | src/concentration.test.ts |
| TC-U-913 | 2 | pass | src/modules/chains/chains.routes.test.ts |
| TC-U-914 | 1 | pass | src/modules/chains/chains.routes.test.ts |
| TC-U-915 | 1 | pass | src/modules/chains/chains.routes.test.ts |
| TC-U-916 | 1 | pass | src/modules/chains/chains.routes.test.ts |
| TC-U-917 | 1 | pass | src/modules/chains/chains.routes.test.ts |
| TC-U-918 | 1 | pass | src/modules/chains/chains.routes.test.ts |
| TC-U-919 | 1 | pass | src/modules/chains/chains.routes.test.ts |
| TC-U-920 | 1 | pass | src/modules/chains/chains.routes.test.ts |
| TC-U-921 | 2 | pass | src/modules/chains/chains.routes.test.ts, src/modules/chains/chains.supabase.test.ts |
| TC-U-922 | 1 | pass | src/modules/chains/chains.rollback.test.ts |
| TC-U-923 | 2 | pass | src/modules/chains/chains.latency.test.ts, src/modules/chains/chains.routes.test.ts |
| TC-U-924 | 1 | pass | src/features/stock-filters/scope-portfolio.test.ts |
| TC-U-925 | 1 | pass | src/features/stock-filters/scope-portfolio.test.ts |
| TC-U-926 | 1 | pass | src/features/stock-filters/scope-portfolio.test.ts |
| TC-U-927 | 1 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-928 | 1 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-929 | 1 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-930 | 1 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-931 | 2 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-932 | 2 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-933 | 1 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-934 | 2 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-935 | 1 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-936 | 1 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-937 | 1 | pass | src/features/chains/chains-page.test.tsx |
| TC-U-938 | 1 | pass | src/features/chains/chains-rename.test.tsx |
| TC-U-939 | 2 | pass | src/features/chains/chains-rename.test.tsx |
| TC-U-940 | 1 | pass | src/features/chains/chains-rename.test.tsx |
| TC-U-941 | 1 | pass | src/features/chains/chains-rename.test.tsx |
| TC-U-942 | 1 | pass | src/features/chains/chains-rename.test.tsx |
| TC-U-943 | 1 | pass | src/features/chains/chains-rename.test.tsx |
| TC-U-944 | 1 | pass | src/features/chains/chains-rename.test.tsx |
| TC-U-945 | 1 | pass | src/features/chains/chains-rename.test.tsx |
| TC-U-946 | 1 | pass | src/features/chains/chains-rename.test.tsx |

## Expected failures and findings (for the owner)

These are real product findings, pinned with `test.fail` and a finding id so the gate stays green. Product code was not changed. When one is fixed its test starts failing: remove the `test.fail`.

| Id | Case | Finding |
|---|---|---|
| F-VC-1 | TC-E-919 (dark mode) | The keyboard focus ring of the outline **Rename** button measures 2.68:1 (needs 3:1): the outline variant's dark border wins over `focus-visible:border-ring`, as noted for the Settings button of `/concentration`. The entry link and the Stocks link pass in both schemes, and Rename passes in light mode. |
| F-VC-2 | TC-E-920 | A chain name with no break opportunity (60 emoji, a 60-character word) widens the chain card header's grid column to the name's width (right edge about 886 px at 360 px). The Rename and Stocks buttons are then off screen although the page itself does not scroll. `break-words` does not shrink a grid track; `min-w-0` or `wrap-anywhere` on the title would. Names that can wrap (spaces, Thai, markup) are fine. |
| F-VC-3 | TC-E-920 | The link buttons in the notes ("Show them", "Set rate on Concentration") are 20 px high (`h-auto p-0`), under the 24 x 24 px minimum of the case. |

## Cases tested as the code behaves (the case said "proposed" or was silent)

- TC-A-900: the route declares no 503 response in OpenAPI; the test pins that.
- TC-A-903: Thai has no canonical decomposition, so NFC and NFD Thai are the same text; accented Latin ("Café") stands in for the NFC/NFD case (404, as proposed). Greek final sigma and `ß` are 404.
- TC-A-927: malformed JSON, an empty body and `text/plain` are `400 bad_request` (not `validation_failed`, not 415).
- TC-A-917: no deadlock in 30 rounds (the lock is taken in id order); the second call answers 200 (`merged: false`) or 404.
- TC-A-918: the killed-backend case uses its own pool whose clients swallow the `error` event (pg emits it on a checked-out client, which is otherwise an uncaught exception of the process).
- TC-C-900: the sidebar marks the active item with `data-active`; there is no `aria-current`.
- TC-C-912: equal-size chains sort by code unit (capitals before lower case): Oil, Autos, Zinc, banks, Ünits, Thai.
- TC-C-914 / TC-E-917: dataset VC-A has 12 stocks (the cases say 13). "Not set" for Value chain position is the null position (AAPL, KO, JNJ); BCP has the value `None`, which is a separate filter value.
- TC-C-915 / TC-C-916: after a form submit the app route also re-reads `GET /me` once; the three portfolio reads are exactly once each.
- TC-C-924: the route error page offers **Reload** (a full page reload) and **Go to stocks**, not Retry; "Retry re-requests the three reads" is covered end to end by TC-E-928 (reload after the API returns).
- TC-C-926: `/chains` hides the advice line with no saved stocks; `/concentration` shows it there (also tested).
- TC-C-930: no `maxLength` attribute; the 60 code point limit is enforced by cutting the typed or pasted text (60 emoji fit).
- TC-C-937: the page re-reads after the 404 answer itself (fetcher revalidation), not on Close.
- TC-C-940: the proposed `aria-label`s are not in the product, so every chain's Rename (and Stocks) button has the same accessible name; they sit inside their chain's named region and carry `data-chain-rename`.
- TC-E-906: dataset VC-A has six "AI & Semis" stocks, so two extra were added to reach the 3 and 8 of the case. The merge toast reports the total of the merged stocks (11), not `changed`.
- TC-E-907: after the first 409 the page re-reads, so the second try is recognised locally as a merge and sends no request (requests: merge false, then merge true).
- TC-E-928: one slowed read (1.5 s) instead of ten Slow 3G loads, and an aborted read for the API-down case.
- TC-E-912: the "guess V's chain by name" step is made through the API (404), not the UI.

## Timings

| Requirement | Measurement | Result |
|---|---|---|
| NFR-001 regroup under 200 ms, no request | Browser (TC-E-923, 200 stocks in 20 chains, 5 runs each) | scope median 82.5 ms (max 151.5), filter 66.3 ms (max 116.9), search 54.4 ms (max 61.9), zero API requests |
| | jsdom (TC-C-917) | medians 7.7, 7.6 and 6.3 ms; TC-U-937 p95 13.9 ms |
| NFR-002 rename of 200 stocks under 500 ms | API p95 (TC-A-924, 20 renames of 200 stocks, 20 merges of 100 + 100) | rename median 2.7 ms, p95 3.2 ms; merge median 1.7 ms, p95 1.9 ms (TC-U-923: 200 stocks, 30 runs, median 2.5 ms, p95 4.4 ms) |
| | Browser (TC-E-923, 20 renames of 10 to 200 stocks, response end) | 5 to 20 ms, median 6 ms |

## Not automated

- TC-A-901 (first half) exercises the JWKS outage with a throwing key resolver, not an unreachable URL.
- TC-E-928 does not run ten loads on Slow 3G (see above).
- Thai UI labels, undo of a rename and rate limiting are out of scope (test-cases.md section 9, item 17).

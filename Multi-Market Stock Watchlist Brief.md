# Multi-Market Stock Watchlist Brief

Nov 21, 2026 · @Nutz

## Overview

We are building a personal web app where one investor saves stocks from several markets (US and Thailand first, other markets later), classifies each one across 10 lenses, and sees at a glance where the portfolio is concentrated.

It grows out of the single-page watchlist prototype (35 US stocks, browser-only storage). That prototype proved the classification model but loses data across devices, cannot hold Thai stocks, and has no prices.

**Problem.** Holdings sit in separate apps (Dime for US stocks, SBITO for Thai stocks). Nothing shows the combined picture by sector, value-chain position, style or cycle, so concentration risk stays hidden.

**Goals for v1**

- One watchlist that holds US and Thai stocks side by side, each tagged with its market and currency.
- Every stock classified on the same 10 lenses, whatever its market.
- Holdings marked per stock, with a concentration view that flags any group at 40% or more.
- Financial detail per stock (income and cost structure by period), so the business can be judged beyond its labels.
- A dated buy/sell thesis log per stock, so the reason for each decision is kept.
- A multi-page app (separate URLs for list, stock detail, concentration and value chains).
- Data that survives across devices (account-backed, not browser storage).

**Success measures**

- All current US and Thai holdings entered and classified within one evening (about 30 to 50 stocks).
- Adding a new stock with full classification takes under 2 minutes.
- The concentration view answers "where am I overweight?" without exporting to a spreadsheet.

## Actors and use cases

v1 has one human actor and one system actor; sharing and multi-user teams come later.

- **Investor (owner):** a self-directed long-term investor who holds US and Thai stocks and wants one classified view of them.
- **Market data provider (system):** an external API that supplies company name, exchange, sector and market cap for a ticker.

| ID | Use case | Description |
| --- | --- | --- |
| UC-001 | Add a stock | Enter a ticker and market (US or TH); the app looks up the company and pre-fills what it can. |
| UC-002 | Classify a stock | Set or edit the 10 lenses; auto-filled lenses (sector, size) can be overridden. |
| UC-003 | Mark a holding | Flag a stock as held, optionally with shares and average cost. |
| UC-004 | Browse and filter | Search and filter the list by market, sector, lens values and held status; sort any column. |
| UC-005 | See concentration | Group the current list by any lens and see counts (and value weight when holdings have amounts). |
| UC-006 | See value chains | View stocks grouped into chains (e.g. AI & Semis, Oil & Gas) as upstream, midstream and downstream lanes. |
| UC-007 | Organise watchlists | Keep several named lists (e.g. Core holdings, Watching, Swing study). |
| UC-008 | Export | Copy or download the filtered list as CSV. |
| UC-009 | Import | Load stocks from CSV, including the 35-stock prototype data. |
| UC-010 | Review financials | Open a stock and see its type, income and cost structure by period (revenue, cost of revenue, operating expenses, net income, margins). |
| UC-011 | Write a thesis | Add dated notes per stock: buy thesis, sell thesis, update or review, with optional target and invalidation conditions. |

## Classification model

Every stock carries the same 10 lenses so US and Thai stocks can be compared in one view. Market-specific taxonomies are stored alongside, never instead.

| # | Lens | Values | Source |
| --- | --- | --- | --- |
| 1 | Sector | US: GICS 11 sectors. TH: SET 8 industry groups, plus a mapped GICS sector for cross-market grouping | Auto from data provider, editable |
| 2 | Value chain position | Chain name (free text, e.g. AI & Semis) + Upstream / Midstream / Downstream / Integrated / None | Manual |
| 3 | Size | Mega / Large / Mid / Small / Micro, computed from market cap in USD | Auto, refreshed daily |
| 4 | Style | Growth / Value / Dividend / Quality | Manual |
| 5 | Economic cycle | Cyclical / Sensitive / Defensive | Manual, default from sector |
| 6 | Peter Lynch type | Fast Grower / Stalwart / Slow Grower / Cyclical / Turnaround / Asset Play | Manual |
| 7 | Business life cycle | Growth / Mature / Turnaround / Decline | Manual |
| 8 | Business model | Customer (B2B / B2C / Government) + revenue type (subscription, transaction fee, product sale, ads, rent, interest) | Manual |
| 9 | Moat | Brand / Network effect / Switching cost / Cost advantage / Efficient scale / Intangibles / Unclear | Manual |
| 10 | Theme and volatility | Themes as tags (AI, GLP-1, EV, ...); volatility High / Mid / Low | Manual tags; volatility auto from beta when available |

**Per-market details.** Each stock stores market (US, TH), exchange (NYSE, NASDAQ, SET, mai), trading currency (USD, THB) and index membership (S&P 500, Nasdaq-100, SET50, SET100). Size buckets use USD-converted market cap so a Thai large cap and a US large cap mean the same thing; the local-currency value is kept too.

## Functional requirements

| ID | Requirement | Use case |
| --- | --- | --- |
| FR-001 | Sign in with an account; all data is private to that account. | All |
| FR-002 | Add a stock by ticker + market; reject duplicates within a watchlist. | UC-001 |
| FR-003 | Look up company name, exchange, sector and market cap from the data provider; allow manual entry when lookup fails. | UC-001 |
| FR-004 | Edit all 10 lenses per stock; mark which values are auto-filled vs set by the user. | UC-002 |
| FR-005 | Apply sector-based defaults (e.g. Utilities defaults to Defensive) that the user can override. | UC-002 |
| FR-006 | Mark a stock as held; optional shares, average cost and currency. | UC-003 |
| FR-007 | Search by ticker, name or theme; filter by market, sector, any lens and held status; sort by any column. | UC-004 |
| FR-008 | Group the filtered list by any lens and show counts; show value weight (converted to one base currency, default THB) when holdings have amounts. | UC-005 |
| FR-009 | Warn when one group holds 40% or more of the list or the held value (threshold configurable). | UC-005 |
| FR-010 | Show value-chain lanes per chain, with held stocks highlighted. | UC-006 |
| FR-011 | Create, rename and delete named watchlists; a stock can be in more than one list. | UC-007 |
| FR-012 | Export the filtered list to CSV. | UC-008 |
| FR-013 | Import stocks from CSV with a preview and per-row error report. | UC-009 |
| FR-014 | Refresh market cap (and the size bucket) daily for every saved stock. | UC-001 |
| FR-015 | Work on desktop and phone browsers. | All |
| FR-016 | Show financials per stock by period (annual, and quarterly where available): revenue, cost of revenue, operating expenses, operating income, net income and margins, in the reporting currency. | UC-010 |
| FR-017 | Fetch financials from the data provider for each market; allow manual entry and override, marked as manual. | UC-010 |
| FR-018 | Show the stock's type (the Peter Lynch type, business model and life-cycle lenses) with its financials on the stock page. | UC-010 |
| FR-019 | Add, edit and delete dated thesis entries per stock, each with a type (buy, sell, update, review), text and optional target price and invalidation conditions; show the history newest first. | UC-011 |
| FR-020 | Routes: `/stocks` (list), `/stocks/:id` (detail, financials, thesis), `/concentration`, `/chains`, `/lists`, `/import-export`. Pages are linkable and work with the browser back button. | All |

## Non-functional requirements and constraints

| ID | Type | Requirement |
| --- | --- | --- |
| NFR-001 | Performance | List of 200 stocks filters and regroups in under 200 ms in the browser. |
| NFR-002 | Performance | Adding a stock (with lookup) responds in under 2 s. |
| NFR-003 | Security | Auth required for every API call; each user reads and writes only their own rows. |
| NFR-004 | Privacy | Shares and cost basis are never sent to third parties, including the data provider. |
| NFR-005 | Reliability | Lookup or refresh failures never block saving; the stock keeps its last known values with a "stale" marker. |
| NFR-006 | Data freshness | Market cap and size refreshed at least once per trading day per market. |
| NFR-007 | Usability | Thai and English UI labels; numbers show the right currency symbol (USD, THB). |
| NFR-008 | Accessibility | Keyboard-operable table and filters; WCAG 2.1 AA contrast in light and dark themes. |
| NFR-009 | Portability | Full data export to CSV/JSON at any time, so nothing is locked in. |
| NFR-010 | Cost | Runs on free or low-cost hosting and data-API tiers at single-user scale. |
| NFR-011 | Privacy | Thesis notes are private to the account and not sent to third parties. |

**Constraints**

- Thai stock data (SET, mai) is harder to get from free APIs than US data; the data layer must allow one provider per market and manual entry as a fallback.
- The app is a personal research tool, not a broker: no order placement, and a visible note that classifications are the user's judgment, not advice.
- Data must import cleanly from the 35-stock prototype (same lens names and values).

## Scope, assumptions and open questions

**Out of scope for v1**

- Live prices, price charts and technical indicators (financial statement charts are fine) (the daily entry-point analysis workflow stays a separate project).
- Broker sync with Dime or SBITO, and order placement.
- Markets beyond US and Thailand in the first release, though the model must accept them (Hong Kong/China is the likely next one; the data model allows it).
- Crypto, funds, gold and insurance holdings.
- Multi-user sharing, teams and public watchlists.
- AI-generated classifications (a candidate for v2: suggest lens values, user confirms).

**Assumptions**

- Greenfield build; the prototype page is reference material, not code to extend.
- Single user in v1, but the schema keeps a user id on every row.
- Base currency for value weights is THB.

**Open questions**

- [ ] Which data provider(s) for US and for SET/mai, and what does each cost at daily refresh? This now includes financial statements (income and cost lines), not only market cap.
- [ ] How much history for financials: annual only, or quarterly too?
- [ ] Should the size buckets for Thai stocks use USD thresholds, or market-relative ones (e.g. SET50 = Large)?
- [ ] Is a free-text value-chain name enough, or should chains be a managed list with ordered stages?
- [ ] Should holdings track lots (each purchase) or only total shares and average cost?
- [ ] Preferred stack: React + Vite + shadcn/ui with a TypeScript or Go API and PostgreSQL? (Decided: multi-page means several routes in one Vite SPA, not server-rendered pages.)

**Next steps**

1. Answer the open questions above.
2. Turn this brief into `requirements.md` v1.0 (Phase 1 of the solution plan).
3. Phase 2: system design (architecture, data model, API contracts, data-provider adapters).
4. Phase 3: development plan with test cases per task.

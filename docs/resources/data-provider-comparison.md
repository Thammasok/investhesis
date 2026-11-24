# Market data provider comparison (US + SET/mai)

Researched 2026-11-24 for the brief's data-provider open question. Web research and a few live
unauthenticated probes only; no paid key was used. Prices are personal-use, USD, as seen on
2026-11-24. Anything not confirmed on a primary page or by a probe is marked **unverified**.

## Needs being scored

1. **Lookup**: name, exchange, sector/industry (GICS for US; SET industry group/sector for TH), market cap (local currency).
2. **Daily market-cap refresh** for up to ~200 stocks (≈200 calls/day, or a batch call).
3. **Financials**: revenue, cost of revenue, opex, operating income, net income; annual (+ quarterly), with reporting currency and history depth.
4. **Optional**: beta, index membership (S&P 500, Nasdaq-100, SET50, SET100), USD/THB rate.

Only tickers are ever sent; holdings never leave the API (privacy rule in the brief).

## Probes run on 2026-11-24

| Probe | Result |
|---|---|
| Yahoo chart API `PTT.BK`, `ADVANC.BK`, `AU.BK`, `SPA.BK`, `BE8.BK` | All answered, currency THB, `exchangeName: "SET"` (mai stocks AU, SPA are not distinguished from SET). |
| Yahoo `quoteSummary` `AU.BK` (needs cookie + crumb) | Sector "Consumer Cyclical", industry "Restaurants" (Yahoo's own scheme, not SET's), marketCap 3,066,744,576, beta -0.063. |
| Yahoo fundamentals-timeseries `PTT.BK` | `annualTotalRevenue`: 4 years (FY2022-FY2025); quarterly: 5 quarters; `currencyCode: THB`. |
| Twelve Data `/stocks?exchange=XBKK` (no key) | Lists SET symbols incl. NVDRs (`2S.R`) and mai `AU` (After You), all with `exchange: "SET"`, `mic_code: XBKK`. |
| EODHD public pages `PTT.BK`, `ADVANC.BK`, `AU.BK` (mai) | Pages exist; `AU.BK` says "data is available with plans that include the Fundamentals API"; `PTT.BK` shows market cap and beta 0.295. Exchange `BK` lists 1,436 active tickers. |
| SEC `companyfacts` for Apple (CIK 320193) | No key. `OperatingIncomeLoss`, `NetIncomeLoss`, `OperatingExpenses` back to FY2007; revenue switches tag (`Revenues` to `RevenueFromContractWithCustomer...` in 2018); `CostOfRevenue` absent (Apple uses another tag). |
| Frankfurter `latest?base=USD&symbols=THB` | 34.045 for 2026-11-23, no key. |
| set.or.th JSON endpoints and the listed-companies `.xls` | Blocked by Incapsula bot protection for scripts (works in a browser). |
| FMP pricing / docs pages | HTTP 403 to our fetcher (CloudFront); FMP figures below come from search snippets of FMP's own pricing page. |

## Comparison table

| Provider | US | SET / mai | Free tier | Cheapest tier that covers the needs | Licence / ToS notes |
|---|---|---|---|---|---|
| **EODHD** | Yes | **Yes** (`.BK`; PTT, ADVANC, mai AU seen; fundamentals offered) | 20 calls/day, 1 yr EOD, no fundamentals | **Equity analyst (Fundamentals) $59.99/mo, $599.90/yr (≈$49.99/mo)**; 100k calls/day, 1,000/min. Fundamentals call costs 10 credits | Separate personal vs commercial plans; personal plan fits a single-user app (exact clauses unverified) |
| **Financial Modeling Prep** | Yes | Unverified (global only on Ultimate; no `.BK` evidence found) | 250 calls/day (Basic) | Ultimate $139/mo (≈$99/mo annual) for non-US; Starter $29/mo is US-only; Premium $69/mo US/UK/CA | Personal-use plans; bandwidth caps 20/50/150 GB |
| **Twelve Data** | Yes | **Yes** (XBKK, incl. mai `AU`); needs **Pro** | 8 credits/min, 800/day, 3 markets, no fundamentals | Pro $99/mo ($82 annual), 610 credits/min, income statement + statistics | Personal vs commercial pricing; fundamentals per-symbol credit cost unverified |
| **Alpha Vantage** | Yes | Not found in any doc; unverified | 25 requests/day | $49.99/mo (75 req/min) | Fundamentals (`OVERVIEW`, `INCOME_STATEMENT`) are US-focused |
| **Finnhub** | Yes | No on free (US only) | 60 calls/min, US only, personal use | Global fundamentals only on high tiers (sources disagree: $2,500-3,500/mo, or $50-200/mo per market); unverified | Free key is personal / non-commercial |
| **Massive (ex-Polygon.io)** | Yes | No (US only) | 5 calls/min, 2 yr history | "Financials & Ratios" $29/mo (individual use) | Rebranded 2025-10-30; old keys still work |
| **Tiingo** | Yes | No (US and China) | 50 req/hr, 1,000/day, 500 symbols/mo | Power $30/mo; fundamentals is a separate add-on | Internal use only: no display or sharing |
| **SEC EDGAR XBRL** (`companyfacts`, `frames`, nightly bulk zip) | Financials only | No | Free, no key; ≤10 requests/s per user; declare a User-Agent | Free | Public data. No market cap, no GICS (SIC only) |
| **Yahoo Finance (unofficial, `yahoo-finance2`)** | Yes | **Yes** (all probes worked, mai incl.) | No official limits; cookie + crumb; endpoints change without notice | n/a (no paid API) | **ToS risk**: Yahoo terms forbid collecting data "using any automated means" and any commercial use; package says it is not endorsed by Yahoo |
| **SETSMART (SET) Company Fundamental API** | No | **Yes, official** (all listed symbols) | None | **SETSMART for Investor THB 250/mo (≈$7.3)**; API key from SETSMART at no extra charge; 30 req/min, ≥2 s apart | Personal subscription; use/redistribution terms in SET's Market Data Policy, not reviewed (unverified) |
| **Settrade Open API** | No | Trading/quotes via a broker account | Free with a participating broker | n/a | Aimed at algorithmic trading; no fundamentals endpoint found (unverified) |
| **Frankfurter** (ECB, or Bank of Thailand as source) | FX only | FX only | Free, no key | Free | Open source service; BOT's own portal (portal.api.bot.or.th) needs a token |

### SETSMART API details (from SET's spec v1.1, 2026-09-21)

- `eod-price-by-security-type?securityType=CS&date=…` returns every common stock for one day in
  **one call**, with `marketCap` in baht, P/E, P/BV, dividend yield.
- `financial-data-and-ratio-by-symbol` and `financial-data-and-ratio` (all symbols per quarter):
  `totalRevenueQuarter/Accum`, `totalExpensesQuarter/Accum`, `ebitQuarter/Accum`,
  `netProfitQuarter/Accum`, EPS, cash flows, ROE/ROA, margins; thousand baht; consolidated
  statement preferred. **No cost-of-revenue / opex split** and no sector field in this spec.
- History depends on the package (Investor package page says 5 years). Market (SET vs mai) is
  not a field in the spec.

## Coverage matrix

Y = covered (verified), y = documented but not verified for Thai stocks, ~ = partial, - = no.

| Need | EODHD | FMP | Twelve Data Pro | Alpha V. | Finnhub free | Massive | Tiingo | SEC EDGAR | Yahoo (unofficial) | SETSMART | Frankfurter |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 US name/exchange | Y | Y | Y | Y | Y | Y | Y | ~ (name, SIC) | Y | - | - |
| 1 US sector | Y (GicSector… fields) | ~ (own scheme) | ~ | ~ | ~ (own industry) | ~ (SIC) | add-on | ~ (SIC) | ~ (own scheme) | - | - |
| 1 TH name/exchange | Y | unverified | Y (no mai flag) | - | - | - | - | - | Y (no mai flag) | Y | - |
| 1 TH sector | y (GICS-style, not SET's) | unverified | unverified | - | - | - | - | - | ~ (Yahoo scheme) | - (not in API) | - |
| 1+2 Market cap US | Y | Y | Y | Y | Y | Y | add-on | - | Y | - | - |
| 1+2 Market cap TH | Y | unverified | y (statistics) | - | - | - | - | - | Y | **Y, one batch call** | - |
| 3 US income lines | Y, annual+quarterly | Y | Y | Y | - (free) | Y | add-on | **Y, free, FY2007+** (tags vary) | ~ (4 yr) | - | - |
| 3 TH income lines | y, 25+ yrs, minor cos 6 yr/20 q, `currency_symbol` | unverified | y | - | - | - | - | - | ~ (4 yr / 5 q, THB) | ~ (revenue, total expenses, EBIT, net; 5 yr) | - |
| 4 Beta | Y | Y | y | Y | y | - | - | - | Y | - | - |
| 4 Index membership | S&P 500 (with history); others current, SET50/100 unverified | ~ (US indexes) | - | - | - | - | - | - | - | - | - |
| 4 USD/THB | needs EOD plan, not Equity analyst | Y | Y | Y | - | Y | - | - | Y | - | **Y, free** |

## Recommendation

**(a) US: EODHD Equity analyst**, with SEC EDGAR as a free cross-check and fallback for
financials. EODHD gives name, exchange, GICS-style sector, market cap and beta in one
fundamentals call. Finnhub free (60/min) plus EDGAR is the $0 alternative if US were the only
market, but it adds a second adapter and Finnhub's industry is not GICS.

**(b) SET/mai: EODHD, the same subscription.** It is the only low-cost commercial API with
documented SET coverage, mai tickers, fundamentals and THB reporting currency. 200 stocks x
10 credits = 2,000 credits/day against a 100,000 cap, so the daily refresh fits easily. SETSMART
(THB 250/mo) is the official, cheapest Thai source and returns all market caps in one call;
keep it as the **budget option or second source** if EODHD's Thai data turns out thin, but it
lacks sector and the cost-of-revenue/opex split.

**(c) Financials: EODHD** for both markets (annual + quarterly income statements with
`currency_symbol`); SEC EDGAR for US gaps; manual override for anything missing.

**FX:** Frankfurter (free, no key; can use the Bank of Thailand as source). **Index
membership:** EODHD components for S&P 500 / Nasdaq-100; SET50/SET100 change twice a year, so
manual entry (from SET's published lists) is acceptable if EODHD lacks them.

**Thai sector taxonomy:** no API found that returns SET industry group/sector. Plan for a manual
field (or a periodic manual import of SET's listed-companies file, which SET serves to browsers
only) alongside the provider's GICS-style sector.

### Estimated monthly cost

| Combination | Monthly (USD) |
|---|---|
| **Recommended: EODHD Equity analyst + SEC EDGAR + Frankfurter** | **$59.99 monthly, or ≈$49.99 billed annually ($599.90/yr)** |
| Budget: Finnhub free + SEC EDGAR (US) + SETSMART Investor (TH) + Frankfurter + manual sectors | ≈ $7.3 (THB 250) |
| Not recommended: FMP Ultimate ($139) or Twelve Data Pro ($99) | $99-139 |
| Free but risky: Yahoo unofficial for both markets | $0 (ToS breach risk) |

Suggested next step: buy **one month** of EODHD Equity analyst and test 10 SET and 5 mai tickers
(sector/GicSector populated? quarterly statements present? market cap currency THB?) before
switching to annual billing. Confirm with the owner whether ~$50-60/mo meets NFR-010; if not,
the budget combination works at the cost of three adapters and more manual entry.

## Open risks

1. **Thai sector taxonomy.** No provider returns SET industry group/sector via API; EODHD gives
   a GICS-style sector at best (population for Thai stocks unverified). Needs a manual field or
   an owner-run import.
2. **mai coverage gaps.** Every source tested (Yahoo, Twelve Data) labels mai stocks as "SET";
   the market must come from the user or SET's list. EODHD keeps only 6 years / 20 quarters
   for minor companies; small mai caps may have empty fundamentals (unverified).
3. **GICS licensing.** True GICS is MSCI/S&P licensed. EODHD's `Gic*` fields are its
   classification; FMP, Finnhub, Yahoo use their own schemes. Store the provider's label and
   allow overrides, as the brief already requires.
4. **ToS.** Yahoo forbids automated collection and commercial use: do not ship it as the
   provider. EODHD, FMP, Twelve Data personal plans: storing data in a private single-user app
   is presumably fine but the clauses were not read (unverified). SETSMART's Market Data Policy
   not reviewed.
5. **Unverified prices.** FMP pages blocked our fetcher; Finnhub's paid pricing is inconsistent
   across sources; Alpha Vantage's page does not say which column is monthly. Re-check before
   buying.
6. **Line-item mapping.** EDGAR tags vary by filer and year (Apple: no `CostOfRevenue`);
   SETSMART has only total expenses and EBIT. Cost of revenue / opex will be null for some
   stocks; the financials model must allow nulls and manual entry.
7. **Call budget on EODHD.** The fundamentals endpoint costs 10 credits per call; fine at 200
   stocks, but a full-exchange bulk fundamentals call needs a higher plan.
8. **FX not in Equity analyst.** EODHD forex is in the EOD plans, hence Frankfurter/BOT.

## Sources (seen 2026-11-24)

- EODHD pricing: https://eodhd.com/pricing
- EODHD fundamentals docs: https://eodhd.com/financial-apis/stock-etfs-fundamental-data-feeds
- EODHD Thailand exchange list: https://eodhd.com/exchange/BK ; tickers: https://eodhd.com/financial-summary/PTT.BK , https://eodhd.com/financial-summary/AU.BK
- FMP pricing (search snippet of FMP's page; direct fetch 403): https://site.financialmodelingprep.com/api/pricing-md , https://site.financialmodelingprep.com/pricing-plans
- Twelve Data pricing: https://twelvedata.com/pricing ; exchanges (XBKK requires Pro): https://twelvedata.com/exchanges ; symbol list: https://api.twelvedata.com/stocks?exchange=XBKK
- Alpha Vantage premium: https://www.alphavantage.co/premium/
- Finnhub pricing: https://finnhub.io/pricing ; comparison with conflicting figures: https://www.roic.ai/blog/finnhub-alternative-roic-ai-vs-finnhub-api , https://massive.com/compare/massive-vs-finnhub
- Massive pricing: https://massive.com/pricing
- Tiingo pricing: https://www.tiingo.com/about/pricing
- SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces ; fair access: https://www.sec.gov/about/developer-resources
- Yahoo terms: https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html ; yahoo-finance2: https://github.com/gadicc/node-yahoo-finance2
- SET fundamental data API: https://www.set.or.th/app/online-data/fundamental-data?lang=en ; spec v1.1: https://media.set.or.th/set/Documents/2022/Oct/05_1_Company_Fundamental_Specification.pdf
- SETSMART pricing: https://set.or.th/en/services/connectivity-and-data/data/web-based
- Frankfurter: https://frankfurter.dev/providers/bot/

## Second pass (independent run, 2026-11-24)

A second research run reached the same recommendation (EODHD for US and SET/mai, about
$50–60 a month; SETSMART Investor as the low-cost Thai option; Frankfurter for USD/THB). Points
where it differs or adds detail, all still unverified with a paid key:

- It names the EODHD plan "Fundamentals" ($59.99/month, $49.99 billed yearly) and confirmed GICS
  down to sub-industry, beta and full income-statement lines with currency from a live demo call
  (US ticker only).
- It found mai tickers ABM.BK and 88TH.BK on EODHD's symbol list.
- SETSMART: the pages say the API is for "SETSMART members"; whether the THB 250 individual
  package includes API access is not confirmed.
- Twelve Data covers SET/mai only from its $99 Pro plan, and its terms require deleting stored
  data within 30 days of cancelling, which conflicts with keeping last known values (brief NFR-005).
- A cheaper split: FMP Starter ($29, US only, price from a third-party summary) plus SETSMART,
  about $36 a month.

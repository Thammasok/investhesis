---
version: 1.0
status: approved
date: 2026-11-27
requires: design.md
---

# UX/UI Design: Thai and English UI

Like the earlier slices there are no mockups: the screens are the existing ones, built on the
`sidebar-08` shell, the theme tokens in `apps/web/src/index.css` and the installed `ui/`
components. **No new shadcn component is needed**: the switch uses `dropdown-menu`
(`DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, already installed) and `button`. No new
colours or radii. The [Shared patterns](../../stock-lists/v1.0/ux-design.md#shared-patterns) of
Stock Lists apply unchanged.

This slice changes **what every screen says and how Thai text sits in it**, not the layouts. So
the wireframes cover only the new pieces (the switch in two places, the save-failure toast, the
XLSX instructions sheet, the emails); the rest of the document is the rules every existing screen
follows in Thai and the glossary the Thai copy uses.

## Screens in Scope

- **Account menu** (sidebar footer, every signed-in page) — gains the language choice
  ([FR-001](requirements.md#fr-001), [FR-002](requirements.md#fr-002)).
- **Auth pages** (`/auth/*`, `AuthLayout`) — a compact switch in the top row
  ([FR-001](requirements.md#fr-001), [FR-003](requirements.md#fr-003)).
- **Every existing page, dialog, sheet and toast** — translated, Thai typography rules
  ([FR-004](requirements.md#fr-004) to [FR-010](requirements.md#fr-010)).
- **Import / export** (`/import-export`) — template download in the current language
  ([FR-012](requirements.md#fr-012)).
- **XLSX template, Instructions sheet** — new sheet ([FR-012](requirements.md#fr-012)).
- **Confirmation and reset emails** — bilingual ([FR-013](requirements.md#fr-013)).

## Lo-fi Wireframes

### Account menu with language

<pre>
┌ Sidebar ─────────────┐
│ …                    │
│ ┌──────────────────┐ │   open ▸ (right of the trigger on desktop, above it on phones)
│ │ (NU) nutz@…   ⇕  │─┼──▶┌──────────────────────────┐
│ └──────────────────┘ │   │ (NU) nutz@example.test    │
└──────────────────────┘   ├──────────────────────────┤
                           │ 👤 บัญชี                   │   ← Account
                           ├──────────────────────────┤
                           │ ภาษา · Language           │   ← group label, always both
                           │  ● ไทย                     │   ← radio item, lang="th"
                           │  ○ English                │   ← radio item, lang="en"
                           ├──────────────────────────┤
                           │ ⎋ ออกจากระบบ               │   ← Sign out
                           └──────────────────────────┘
</pre>

- **Layout notes** — the two choices sit inline in the menu (no submenu), so a phone user taps
  once more, not twice. The group label is bilingual and fixed, so an investor who lands in the
  wrong language can still find it.
- **User flow** — pick a language → the menu closes (Radix default on select) → the whole page,
  including the menu labels and breadcrumb, is in the new language at once → the save runs in the
  background. Picking the language already selected does nothing (no request).
- **Annotations** — each item's text is the language's own name and never translated. The
  checked item shows the radio dot; screen readers hear "ไทย, radio, checked, 1 of 2".

### Save failure

<pre>
                                       ┌──────────────────────────────────────────┐
                                       │ ⚠ บันทึกภาษาไม่สำเร็จ                       │
                                       │   จะใช้ภาษาไทยบนอุปกรณ์นี้ต่อไป              │
                                       │                               [ลองอีกครั้ง] │
                                       └──────────────────────────────────────────┘
English: "Couldn't save your language" / "English stays on for this device." / [Retry]
</pre>

- **User flow** — the language on screen does not roll back. Retry repeats the same PATCH; a
  success shows no toast (the language is already on screen). The toast stays 10 s (longer than
  the 5 s Undo toasts, since it carries an action the investor did not expect).

### Auth pages

<pre>
┌─────────────────────────────────────────────┬──────────────────────┐
│ [▲] Investhesis              [ไทย | English] │                      │
│                                             │   decorative panel   │
│              เข้าสู่ระบบ                       │   (from lg)          │
│      ใช้อีเมลและรหัสผ่านของคุณ                  │                      │
│      อีเมล     [                    ]       │                      │
│      รหัสผ่าน  [                 👁 ]       │                      │
│      [         เข้าสู่ระบบ          ]       │                      │
│      ลืมรหัสผ่าน?                            │                      │
└─────────────────────────────────────────────┴──────────────────────┘
Phone (360 px): the brand stays left, the switch right, on the same row.
</pre>

- **Layout notes** — the brand row becomes `justify-between`; the switch is two small buttons
  side by side, the current one pressed. The decorative panel's two lines are translated too.
- **User flow** — tap the other language → the page changes at once and the choice is kept in
  this browser; nothing is sent. After sign-in, a saved account language replaces it.

### Import / export: template download

No layout change. The template buttons keep their place; the XLSX one downloads the template in
the current language and its help text says so: "XLSX includes an Instructions sheet" /
"ไฟล์ XLSX มีชีตคำแนะนำ". The CSV button is unchanged.

### XLSX template, Instructions sheet (Thai)

<pre>
Sheet tabs: [ Stocks ] [ คำแนะนำ ]

 A: คอลัมน์          B: จำเป็น   C: ใส่อะไร                         D: ค่าที่ใช้ได้ (ค่าในไฟล์ — ความหมาย)
 ticker              ใช่        สัญลักษณ์หุ้น 1-12 ตัว A-Z 0-9 . -    
 market              ใช่        ตลาด                                US — สหรัฐฯ; TH — ไทย
 gics_sector         ไม่         กลุ่มธุรกิจ GICS                      Energy — พลังงาน; Financials — การเงิน; …
 style               ไม่         สไตล์การลงทุน                         Growth — เติบโต; Value — คุณค่า; …
 themes              ไม่         ธีม คั่นด้วย ;                         ข้อความอิสระ
 …
Row 1 bold, frozen. Column D wraps. A note in A{last+2}: "ใส่ค่าในคอลัมน์ D ตามภาษาอังกฤษด้านซ้ายของ — เท่านั้น"
</pre>

- **Annotations** — the English sheet is the same with "Instructions", "Column / Required / What
  it takes / Allowed values" and values listed without the dash and label. Column names and
  allowed values come from `TEMPLATE_COLUMNS` and `LENS_VALUES`, so the sheet can't drift from
  what import accepts.

### Emails

<pre>
 ┌──────────────────────────────────────────┐
 │ รีเซ็ตรหัสผ่าน                              │  h2, lang="th"
 │ กดลิงก์นี้เพื่อรีเซ็ตรหัสผ่านบัญชี Investhesis  │
 │ [รีเซ็ตรหัสผ่าน]                            │  same link
 │ ─────────────────────────────────────────│
 │ Reset password                            │  h2, lang="en"
 │ Follow this link to reset the password …  │
 │ [Reset your password]                     │  same link
 └──────────────────────────────────────────┘
Subject: "รีเซ็ตรหัสผ่าน Investhesis / Reset your Investhesis password"
</pre>

The confirmation email follows the same shape. Each part is wrapped in a `div lang="…"`.

## Hi-fi Component Specs

### Language switch

#### Layout

- **In the account menu** — after the Account group: `DropdownMenuSeparator`, then
  `DropdownMenuGroup` → `DropdownMenuLabel className="text-xs font-normal text-muted-foreground"`
  ("ภาษา · Language") → `DropdownMenuRadioGroup value={language} onValueChange={choose}` with two
  `DropdownMenuRadioItem`s.
- **On auth pages** — `LanguageSwitch variant="inline"` in the brand row: a `div role="group"
  aria-label="ภาษา · Language" className="flex gap-1"` with two `Button`s.
- **Responsive** — the menu opens `side="right"` from `md`, `bottom` below it, as today. The
  inline switch never wraps (two short words) and keeps its row on 360 px.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---|---|---|---|---|
| Group label | `DropdownMenuLabel` | — | `text-xs font-normal text-muted-foreground` | static |
| Language item | `DropdownMenuRadioItem` | — | default; `lang="th"` / `lang="en"` on the item | default, highlighted (`focus:bg-accent`), checked (radio dot) |
| Inline button (current) | `Button` | `secondary` / `sm` | `h-7 px-2 text-xs` | `aria-pressed="true"`, focus ring |
| Inline button (other) | `Button` | `ghost` / `sm` | `h-7 px-2 text-xs` | hover `bg-accent`, focus ring, `aria-pressed="false"` |
| Save failure | `sonner` `toast.error` | — | default | `duration: 10000`, `action: { label: t('common.retry') }` |

#### Accessibility

- **Contrast** — `text-muted-foreground` (0.54) on `bg-popover` and `secondary` button text pass
  AA in both themes (same pairs measured in Stock Lists).
- **ARIA roles** — radio items have `role="menuitemradio"` and `aria-checked` from Radix; inline
  buttons use `aria-pressed`; each item and button carries `lang` for its own language (WCAG
  3.1.2) so a screen reader voices `ไทย` in Thai while the page is English.
- **Keyboard navigation** — menu: arrows move, Enter/Space selects, Esc closes and returns focus
  to the trigger (Radix). After a change the trigger keeps focus, so the next Tab is where it was.
  Inline: Tab to each button, Enter/Space switches; focus stays on the pressed button.
- **Announcement** — after a switch a polite live region (the existing toaster region is not
  used) says the new language's name in that language, e.g. "ภาษาไทย" / "English", once.

### Thai on every screen

These rules apply to every page, dialog, sheet and toast; no screen gets its own Thai layout.

#### Layout

- **Font** — `index.css` adds `@import '@fontsource-variable/noto-sans-thai/thai.css';` and the
  family after Geist in both `--font-sans` declarations:
  `Geist, 'Noto Sans Thai Variable', ui-sans-serif, sans-serif, system-ui`. Latin text (tickers,
  numbers, codes) stays in Geist inside Thai sentences; weights follow the same `font-medium` /
  `font-semibold` classes.
- **Line height** — Thai marks above and below the line need more room. Under
  `:root:lang(th)` the text-size line heights are raised:

  | Token | English (Tailwind default) | Thai |
  |---|---|---|
  | `--text-xs--line-height` | 1rem (1.333) | 1.125rem (1.5) |
  | `--text-sm--line-height` | 1.25rem (1.429) | 1.375rem (1.571) |
  | `--text-base--line-height` | 1.5rem (1.5) | 1.625rem (1.625) |
  | `--text-lg--line-height` | 1.75rem | 1.875rem |
  | `--text-2xl--line-height` | 2rem | 2.25rem |

  The four `leading-none` / `leading-tight` uses on text that can be Thai (card titles, sidebar
  user summary, badges) become `leading-snug`. Fixed-height controls (`h-8`, `h-9` buttons and
  inputs, `h-7` inline switch) fit the Thai `text-sm`/`text-xs` heights above.
- **Wrapping** — Thai has no spaces between words, so long labels wrap only where the browser
  finds a break (Chrome and Safari break Thai by dictionary). Rules:
  - Table headers (`TableHead`) may wrap to two lines in Thai: `whitespace-normal` on headers;
    the sort button keeps its icon on the last line (`inline-flex items-end`).
  - Badges (lens values, `Over N%`, entry type, Held) never wrap: `whitespace-nowrap`; a table
    cell wraps between badges instead (`flex flex-wrap gap-1` already used).
  - Select triggers and sidebar items keep `truncate`, with the full text in `title`.
  - Buttons never truncate; header action rows already wrap below `sm`.
- **Responsive** — no breakpoint changes. The 360 px rule ([NFR-005](requirements.md#nfr-005))
  is checked in Thai for every state in `e2e/lib/states.ts`.

#### Components

| Element | Change in Thai | States |
|---|---|---|
| Page `h1`, tab title | Translated; `document.title = "<ชื่อหน้า> · Investhesis"` | — |
| Breadcrumb | Translated crumb; tickers, list and chain names as stored | — |
| Lens values (table, stock page, filter sheet, concentration, chains, form options) | Thai label from the glossary; canonical value in `title` on badges and options, so hovering shows the English term | default, hover (title) |
| Form selects for lenses | Options show the Thai label; "Not set" is `ยังไม่ระบุ` | default, open, error |
| Filter sheet find box | Placeholder `ค้นหาตัวเลือก`; matches Thai label and English value | default, no match (`ไม่พบตัวเลือก`) |
| Dates | `27 พ.ย. 2026` everywhere ([FR-009](requirements.md#fr-009)) | — |
| Counts | `12 หุ้น`, `1 หุ้น` (no plural), `3 รายการ` | — |
| Field errors | Thai field label + Thai rule text, e.g. `สัญลักษณ์หุ้น ต้องมี 1-12 ตัวอักษร…` | error |
| Toasts | Translated, including Undo (`เลิกทำ`) and Retry (`ลองอีกครั้ง`) | — |
| Advice note | `การจัดกลุ่มและเหตุผลการลงทุนเป็นความเห็นของคุณเอง ไม่ใช่คำแนะนำการลงทุน` | — |

#### Accessibility

- **Contrast** — colours are unchanged; the Thai font at `text-xs` uses the same tokens. The axe
  and computed-contrast E2E checks run for every state in both languages, light and dark.
- **ARIA** — every `aria-label`, screen-reader-only text and live-region message comes from the
  catalogue; `html lang` follows the language, and user content in the other script (an English
  company name on a Thai page) is not tagged (WCAG 3.1.2 exempts names and proper nouns).
- **Keyboard navigation** — unchanged; tab order does not depend on language.

### Glossary (Thai copy, for owner approval)

The Thai catalogue uses these terms everywhere ([NFR-007](requirements.md#nfr-007)). Stored and
exported values stay in the English column.

#### Lens names

| English | Thai |
|---|---|
| Sector (GICS) | กลุ่มธุรกิจ (GICS) |
| SET industry group | กลุ่มอุตสาหกรรม SET |
| Value chain position | ตำแหน่งในห่วงโซ่คุณค่า |
| Value chain name | ชื่อห่วงโซ่คุณค่า |
| Size | ขนาด |
| Style | สไตล์ |
| Economic cycle | วัฏจักรเศรษฐกิจ |
| Lynch type | ประเภทหุ้นแบบ Lynch |
| Life cycle | วงจรธุรกิจ |
| Customers | กลุ่มลูกค้า |
| Revenue types | ประเภทรายได้ |
| Moat | ความได้เปรียบ (Moat) |
| Themes | ธีม |
| Volatility | ความผันผวน |
| Market | ตลาด |
| Index membership | ดัชนีที่เป็นสมาชิก |

#### Lens values

| Lens | English → Thai |
|---|---|
| GICS sector | Communication Services → บริการสื่อสาร; Consumer Discretionary → สินค้าฟุ่มเฟือย; Consumer Staples → สินค้าจำเป็น; Energy → พลังงาน; Financials → การเงิน; Health Care → การแพทย์และสุขภาพ; Industrials → อุตสาหกรรม; Information Technology → เทคโนโลยีสารสนเทศ; Materials → วัสดุ; Real Estate → อสังหาริมทรัพย์; Utilities → สาธารณูปโภค |
| SET industry group (SET's own Thai names) | Agro & Food Industry → เกษตรและอุตสาหกรรมอาหาร; Consumer Products → สินค้าอุปโภคบริโภค; Financials → ธุรกิจการเงิน; Industrials → สินค้าอุตสาหกรรม; Property & Construction → อสังหาริมทรัพย์และก่อสร้าง; Resources → ทรัพยากร; Services → บริการ; Technology → เทคโนโลยี |
| Value chain position | Upstream → ต้นน้ำ; Midstream → กลางน้ำ; Downstream → ปลายน้ำ; Integrated → ครบวงจร; None → ไม่มี |
| Size | Mega → ใหญ่พิเศษ; Large → ใหญ่; Mid → กลาง; Small → เล็ก; Micro → เล็กมาก |
| Style | Growth → เติบโต; Value → คุณค่า; Dividend → ปันผล; Quality → คุณภาพ |
| Economic cycle | Cyclical → วัฏจักร; Sensitive → อ่อนไหว; Defensive → ตั้งรับ |
| Lynch type | Fast Grower → โตเร็ว; Stalwart → โตมั่นคง; Slow Grower → โตช้า; Cyclical → วัฏจักร; Turnaround → พลิกฟื้น; Asset Play → สินทรัพย์ซ่อนค่า |
| Life cycle | Growth → เติบโต; Mature → อิ่มตัว; Turnaround → พลิกฟื้น; Decline → ถดถอย |
| Customers | B2B → ธุรกิจ (B2B); B2C → ผู้บริโภค (B2C); Government → ภาครัฐ |
| Revenue types | Subscription → ค่าสมาชิก; Transaction fee → ค่าธรรมเนียมธุรกรรม; Product sale → ขายสินค้า; Ads → โฆษณา; Rent → ค่าเช่า; Interest → ดอกเบี้ย |
| Moat | Brand → แบรนด์; Network effect → เครือข่ายผู้ใช้; Switching cost → ต้นทุนการเปลี่ยน; Cost advantage → ได้เปรียบด้านต้นทุน; Efficient scale → ขนาดที่เหมาะสม; Intangibles → สินทรัพย์ไม่มีตัวตน; Unclear → ไม่ชัดเจน |
| Volatility | High → สูง; Mid → กลาง; Low → ต่ำ |
| Markets (labels only; codes stay) | US → สหรัฐฯ; TH → ไทย |
| Not set | ยังไม่ระบุ |
| Thesis types | Buy → ซื้อ; Sell → ขาย; Update → อัปเดต; Review → ทบทวน |

#### App terms

| English | Thai |
|---|---|
| Stocks / Stock | หุ้น |
| Concentration | การกระจุกตัว |
| Value chains | ห่วงโซ่คุณค่า |
| Lists / List | รายการหุ้น / รายการ |
| Import / export | นำเข้า / ส่งออก |
| Holding · Held · Not held | การถือครอง · ถืออยู่ · ไม่ได้ถือ |
| Shares · Average cost · Cost · Cost currency | จำนวนหุ้น · ต้นทุนเฉลี่ย · ต้นทุน · สกุลเงินต้นทุน |
| Value at cost | มูลค่าตามต้นทุน |
| Threshold · Over N% | เกณฑ์ · เกิน N% |
| USD/THB rate | อัตราแลกเปลี่ยน USD/THB |
| Thesis · Thesis entry | เหตุผลการลงทุน · บันทึกเหตุผล |
| Target price · Invalidation | ราคาเป้าหมาย · เงื่อนไขที่ทำให้เหตุผลไม่เป็นจริง |
| Edited | แก้ไขแล้ว |
| Ticker · Company name · Exchange | สัญลักษณ์หุ้น · ชื่อบริษัท · ตลาดหลักทรัพย์ |
| Filters · Search · Not set | ตัวกรอง · ค้นหา · ยังไม่ระบุ |
| Add · Edit · Save · Cancel · Delete · Rename · Undo · Retry | เพิ่ม · แก้ไข · บันทึก · ยกเลิก · ลบ · เปลี่ยนชื่อ · เลิกทำ · ลองอีกครั้ง |
| Sign in · Sign out · Forgot password · Account | เข้าสู่ระบบ · ออกจากระบบ · ลืมรหัสผ่าน · บัญชี |
| Backup | สำรองข้อมูล |

Tone: polite and short, no particles (`ครับ/ค่ะ`), `คุณ` for "you" only where English uses
"you". Brand names, tickers, `GICS`, `SET`, `mai`, `CSV`, `XLSX`, `JSON` stay in Latin script.

## Design Review

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|---|---|---|---|
| 1 | Visibility of system status | A failed save could leave the investor thinking the language is saved on every device | 2 | Error toast with Retry; screen keeps the language; 10 s duration |
| 2 | Match with the real world | Thai labels for Lynch types and moats are less familiar than the English terms to many Thai investors | 2 | Canonical English shown in `title` on badges and options; glossary approval by owner |
| 3 | User control and freedom | Stuck in a language you can't read | 3 | Bilingual group label "ภาษา · Language" and each language named in itself; fixed position in the account menu |
| 4 | Consistency and standards | Same term translated two ways across pages | 2 | One glossary; terms live once in the catalogue (`common.*`, lens labels in domain) |
| 5 | Error prevention | Investor edits a Thai label into a CSV and import rejects it | 2 | Instructions sheet says to use the English value; out of scope to accept Thai values (requirements) |
| 6 | Recognition rather than recall | — | — | — |
| 7 | Flexibility | Switching per device is not possible (account-wide) | 1 | Accepted by the owner's decision |
| 8 | Aesthetic and minimalist design | Thai headers wrapping in the stocks table | 2 | Two-line headers allowed; badges don't wrap |
| 9 | Help users recover from errors | Server errors with an unknown rule | 1 | Generic translated message, field still highlighted |
| 10 | Help and documentation | — | — | XLSX instructions sheet |

No issue scored 3 or 4 remains unresolved.

### Accessibility Audit

- **WCAG AA** — no colour changes; the switch uses measured pairs. To be confirmed by axe and the
  contrast helper in both languages and themes (E2E).
- **Language of page and parts** — `html lang` follows the choice (3.1.1); switch items carry
  their own `lang` (3.1.2); email parts carry `lang`.
- **Keyboard flow** — confirmed on paper: the switch is reachable in the account menu and on auth
  pages, focus stays put after a switch, nothing else changes order.
- **Text resize** — the raised Thai line heights keep marks unclipped at 200 % zoom; checked in
  E2E by comparing `scrollHeight` to `clientHeight` on truncated elements in Thai.

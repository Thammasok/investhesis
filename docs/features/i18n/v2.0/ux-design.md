---
version: 2.0
status: approved
date: 2026-11-27
requires: design.md
---

# UX/UI Design: Thai and English UI

As in earlier slices there are no mockups: the switch builds on the `sidebar-08` shell, the
`login-02` auth layout, the theme tokens in `apps/web/src/index.css` and the installed `ui/`
components. **One new shadcn component** is added for the auth pages: `toggle-group` (with its
`toggle` dependency; re-apply the `cn` import fix afterwards, see `CLAUDE.md`). No new colours or
radii.

The [Shared patterns](../../stock-lists/v1.0/ux-design.md#shared-patterns) of Stock Lists apply
(page header and focus, toasts, form errors, the contrast rule). Every screen keeps its layout;
this slice changes words, not structure. Added here:

- **Language names** — always in their own language and script, in this order: `English`, `ไทย`.
  Each option carries `lang="en"` / `lang="th"` so a screen reader pronounces it correctly
  ([NFR-004](requirements.md#nfr-004)).
- **Thai typography** — Thai glyphs come from Noto Sans Thai Variable, Latin from Geist
  ([FR-013](requirements.md#fr-013)). Thai stacks vowels and tone marks above and below the line,
  so text that is clipped (`truncate`, `line-clamp-*`, `overflow-hidden`) must keep at least the
  default `leading-normal`; the two `leading-tight` / `leading-none` uses outside `ui/` (account
  menu summary and one badge) are checked in Thai at 360 px.
- **Words around numbers** — numbers, money and percentages keep their English form in both
  languages (`฿1,234,567.89`, `41.3%`, `1,000`); only the words change
  (`3 stocks` → `3 หุ้น`) ([FR-011](requirements.md#fr-011)).

## Screens in Scope

- **Account menu** (signed-in area, sidebar footer, `nav-user.tsx`) — gains the Language group
  ([FR-001](requirements.md#fr-001), [FR-002](requirements.md#fr-002)).
- **Auth layout** (`/auth/*`, `auth-layout.tsx`) — gains the language toggle
  ([FR-001](requirements.md#fr-001), [FR-003](requirements.md#fr-003)).
- **Language not saved toast** — new state, any signed-in page ([FR-002](requirements.md#fr-002)).
- **Every existing screen in Thai** — same layouts as their slices' ux-design; this document lists
  only the places where longer Thai text needs a check
  ([FR-004](requirements.md#fr-004), [NFR-004](requirements.md#nfr-004)).

## Lo-fi Wireframes

### Account menu

<pre>
┌──────────────────────────────────┐
│ (IN) investor@example.com        │  ← DropdownMenuLabel (unchanged)
├──────────────────────────────────┤
│ Language                         │  ← DropdownMenuLabel, muted, small
│ ● English                        │  ← DropdownMenuRadioItem lang="en"
│ ○ ไทย                            │  ← DropdownMenuRadioItem lang="th"
├──────────────────────────────────┤
│ 👤 Account          (disabled)   │  (unchanged)
│ ⎋  Sign out                      │  (unchanged)
└──────────────────────────────────┘
</pre>

- **Layout notes** — Language sits between the user summary and the Account group, so the
  destructive-ish Sign out stays last.
- **User flow** — pick ไทย → menu closes, focus returns to the menu button, every text on the page
  is Thai at once (address and open forms untouched) → `PATCH /settings` in the background. The
  current language's item is checked; picking it again does nothing and sends nothing.
- **Annotations** — the group label is `Language` / `ภาษา`; the menu button's name follows the
  language (`Account menu` / `เมนูบัญชี`).

### Auth layout

<pre>
┌───────────────────────────────────────┬──────────────────────┐
│ [↗] Investhesis        [English│ไทย]  │                      │
│                                       │   decorative panel   │
│            Sign in                    │   (lg and up,        │
│            Email   [            ]     │    text translated)  │
│            Password[            ]     │                      │
│            [ Sign in ]                │                      │
└───────────────────────────────────────┴──────────────────────┘
</pre>

- **Layout notes** — the brand row becomes `justify-between`; the toggle sits at the end of it on
  every width (at 360 px the brand and the toggle still fit on one line: about 120 px + 128 px).
- **User flow** — tap ไทย → the page is Thai at once, typed email and password kept; the choice is
  remembered in this browser only (no account yet). After sign-in the account setting, if any,
  wins ([FR-003](requirements.md#fr-003)).
- **Annotations** — the toggle is a single-choice group named `Language` / `ภาษา`; it cannot be
  emptied (clicking the pressed item does nothing).

### Language not saved toast

<pre>
┌─────────────────────────────────────────────────────┐
│ ⚠ Couldn't save your language. It applies on this   │
│   device until you try again.            [ Retry ]  │
└─────────────────────────────────────────────────────┘
</pre>

- **User flow** — switch → save fails (network, 5xx) → the language stays on screen, this toast
  shows (sonner `toast.error`, default duration, `action: Retry`) → Retry sends the same PATCH; a
  success shows no toast, a second failure shows the toast again. A 401 follows the api-client's
  usual session-ended path.
- Thai: `บันทึกภาษาไม่สำเร็จ ภาษานี้จะใช้บนอุปกรณ์นี้จนกว่าจะลองอีกครั้ง` · `ลองอีกครั้ง`.

### Existing screens in Thai — places to check

No new wireframes; each must keep its layout in Thai at 360 px and at desktop width:

| Place | Risk | Rule |
|---|---|---|
| Sidebar nav (`nav-items.ts`) | Longer labels in icon-collapsed tooltips | Labels short: หุ้น, รายการ, การกระจุกตัว, ห่วงโซ่คุณค่า, นำเข้า/ส่งออก |
| Stock table headers | Lens names are longer in Thai | Headers may wrap to two lines (`whitespace-normal`), never truncate |
| Filters sheet sections | 18 lens headings, long Thai names | Headings wrap; checkbox labels keep `<value>, <N> หุ้น` order |
| Concentration Group by select | Long lens names in the trigger | Trigger truncates with the full name in the option list |
| Page header buttons at 360 px | `Add stock`, `Import`, `Export` get longer | Existing wrap rules of each page; no icon-only buttons added |
| `Over N%` badge | `เกิน N%` | Same badge, same icon |
| Toasts with Undo | Thai sentence + `เลิกทำ` | sonner wraps; nothing to change |
| Dates | `27 พ.ย. 2026` | `tabular-nums` where already used |

## Hi-fi Component Specs

### Account menu

#### Layout

- **Wrapper** — the existing `DropdownMenuContent` of `NavUser`.
- **Responsive** — unchanged (`side="bottom"` on a phone, `right` from `md`).

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Group label | `DropdownMenuLabel` | — | `text-xs text-muted-foreground` | static |
| Language group | `DropdownMenuRadioGroup` `value={language}` `onValueChange={setLanguage}` | — | — | — |
| Option | `DropdownMenuRadioItem` `value="en"` / `"th"`, `lang` | — | default item classes | default, highlighted (keyboard/hover), checked (indicator dot), focus |
| Separators | `DropdownMenuSeparator` | — | — | — |

#### Accessibility

- **Contrast** — unchanged menu tokens (already measured by the stock-lists contrast suite).
- **ARIA roles** — Radix gives `menuitemradio` with `aria-checked`; the group is labelled by the
  label (`aria-labelledby`).
- **Keyboard navigation** — arrows move through the items, Enter/Space picks, Esc closes; focus
  returns to the menu button after a pick.

### Auth layout toggle

#### Layout

- **Wrapper** — brand row `flex items-center justify-between gap-2`.
- **Responsive** — same at every width; the toggle never wraps below the brand.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Toggle | `ToggleGroup type="single"` `aria-label` (Language) | `variant="outline"` `size="sm"` | — | — |
| Item | `ToggleGroupItem value="en"` / `"th"`, `lang` | — | `px-3` | default, hover, focus-visible ring, pressed (`data-[state=on]:bg-accent`) |

`onValueChange` ignores the empty value, so the group is never emptied.

#### Accessibility

- **Contrast** — outline toggle text is `foreground` on `background` (≥ 15:1); pressed is
  `accent-foreground` on `accent` (shadcn tokens, ≥ 4.5:1 in both themes; measured by the a11y
  E2E in this slice).
- **ARIA roles** — `role="group"` with `aria-label`; each item a `radio` with `aria-checked`
  (Radix single mode).
- **Keyboard navigation** — Tab reaches the group (roving focus on the pressed item), arrows move,
  Space/Enter picks. It comes before the form in tab order.

### Language not saved toast

- sonner `toast.error(t('common:language.saveFailed'), { action: { label: t('common:retry'), onClick: retry } })`.
- The toast is announced by sonner's live region; no focus move.

## Thai catalogue for lens values ([OQ-1](requirements.md#oq-1))

Proposed wording for the owner to approve. SET industry groups use SET's own Thai names; GICS
sectors use the names common on Thai broker sites. The canonical English value stays what is
stored, filtered and exported.

### Lens names

| Lens | English | ไทย |
|---|---|---|
| gicsSector | Sector (GICS) | ภาคธุรกิจ (GICS) |
| setIndustryGroup | SET industry group | กลุ่มอุตสาหกรรม SET |
| valueChainPosition | Value chain position | ตำแหน่งในห่วงโซ่คุณค่า |
| valueChain | Value chain name | ชื่อห่วงโซ่คุณค่า |
| size | Size | ขนาด |
| style | Style | สไตล์การลงทุน |
| economicCycle | Economic cycle | วัฏจักรเศรษฐกิจ |
| lynchType | Lynch type | ประเภทหุ้นตาม Lynch |
| lifeCycle | Life cycle | วงจรธุรกิจ |
| customers | Customers | ลูกค้า |
| revenueTypes | Revenue types | ประเภทรายได้ |
| moat | Moat | ความได้เปรียบเชิงแข่งขัน (Moat) |
| themes | Themes | ธีม |
| volatility | Volatility | ความผันผวน |
| market | Market | ตลาด |
| indexMembership | Index membership | ดัชนีที่เป็นสมาชิก |

### Lens values

| Lens | English | ไทย |
|---|---|---|
| gicsSector | Communication Services | บริการสื่อสาร |
| | Consumer Discretionary | สินค้าฟุ่มเฟือย |
| | Consumer Staples | สินค้าอุปโภคบริโภคจำเป็น |
| | Energy | พลังงาน |
| | Financials | การเงิน |
| | Health Care | การแพทย์และสุขภาพ |
| | Industrials | อุตสาหกรรม |
| | Information Technology | เทคโนโลยีสารสนเทศ |
| | Materials | วัสดุ |
| | Real Estate | อสังหาริมทรัพย์ |
| | Utilities | สาธารณูปโภค |
| setIndustryGroup | Agro & Food Industry | เกษตรและอุตสาหกรรมอาหาร |
| | Consumer Products | สินค้าอุปโภคบริโภค |
| | Financials | ธุรกิจการเงิน |
| | Industrials | สินค้าอุตสาหกรรม |
| | Property & Construction | อสังหาริมทรัพย์และก่อสร้าง |
| | Resources | ทรัพยากร |
| | Services | บริการ |
| | Technology | เทคโนโลยี |
| valueChainPosition | Upstream | ต้นน้ำ |
| | Midstream | กลางน้ำ |
| | Downstream | ปลายน้ำ |
| | Integrated | ครบวงจร |
| | None | ไม่มี |
| size | Mega | ใหญ่พิเศษ |
| | Large | ใหญ่ |
| | Mid | กลาง |
| | Small | เล็ก |
| | Micro | เล็กมาก |
| style | Growth | เติบโต |
| | Value | คุณค่า |
| | Dividend | ปันผล |
| | Quality | คุณภาพ |
| economicCycle | Cyclical | ตามวัฏจักร |
| | Sensitive | อ่อนไหวต่อเศรษฐกิจ |
| | Defensive | ทนต่อภาวะเศรษฐกิจ |
| lynchType | Fast Grower | โตเร็ว |
| | Stalwart | โตมั่นคง |
| | Slow Grower | โตช้า |
| | Cyclical | ตามวัฏจักร |
| | Turnaround | พลิกฟื้น |
| | Asset Play | สินทรัพย์ซ่อนมูลค่า |
| lifeCycle | Growth | เติบโต |
| | Mature | อิ่มตัว |
| | Turnaround | พลิกฟื้น |
| | Decline | ถดถอย |
| customers | B2B | B2B (ธุรกิจ) |
| | B2C | B2C (ผู้บริโภค) |
| | Government | ภาครัฐ |
| revenueTypes | Subscription | ค่าสมาชิก |
| | Transaction fee | ค่าธรรมเนียมธุรกรรม |
| | Product sale | ขายสินค้า |
| | Ads | โฆษณา |
| | Rent | ค่าเช่า |
| | Interest | ดอกเบี้ย |
| moat | Brand | แบรนด์ |
| | Network effect | เครือข่ายผู้ใช้ |
| | Switching cost | ต้นทุนการเปลี่ยน |
| | Cost advantage | ได้เปรียบด้านต้นทุน |
| | Efficient scale | ขนาดตลาดที่เหมาะสม |
| | Intangibles | สินทรัพย์ไม่มีตัวตน |
| | Unclear | ไม่ชัดเจน |
| volatility | High | สูง |
| | Mid | กลาง |
| | Low | ต่ำ |

### Other shared labels

| English | ไทย |
|---|---|
| Not set | ไม่ระบุ |
| Buy / Sell / Update / Review (thesis types) | ซื้อ / ขาย / อัปเดต / ทบทวน |
| Held / Not held / Held, amount unknown | ถือ / ไม่ได้ถือ / ถือ ไม่ทราบจำนวน |
| Language | ภาษา |

## Design Review

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| 1 | Visibility of system status | A failed save would be silent | 2 | Error toast with Retry |
| 2 | Match with the real world | Lens terms could read as machine translation | 2 | SET's own Thai names; owner approves the table above |
| 3 | User control and freedom | — | 1 | Switch is one step back either way; forms keep their input |
| 4 | Consistency and standards | Two different controls (menu radio vs toggle) | 1 | Same names, order and `lang`; each fits its container |
| 5 | Error prevention | Toggle could be emptied | 1 | Empty value ignored |
| 6 | Recognition rather than recall | A Thai reader stuck in English must find the switch | 2 | Option names in their own script, recognisable without reading the other language |
| 7 | Flexibility and efficiency | — | 1 | — |
| 8 | Aesthetic and minimalist design | — | 1 | No new chrome beyond one group and one toggle |
| 9 | Help users recover from errors | Thai error texts must be specific | 2 | Per-code catalogue entries (`problems`), generic only for unknown codes |
| 10 | Help and documentation | — | 1 | — |

No issue scores 3 or 4.

### Accessibility Audit

- **WCAG AA** — no new colours; the toggle and menu use measured shadcn tokens; the slice's axe
  and contrast E2E runs every `*_STATES` screen in Thai as well as English.
- **Language of parts (3.1.2)** — `<html lang>` follows the language; each switch option has its
  own `lang`.
- **Keyboard flow** — menu: arrows/Enter/Esc; toggle: Tab, arrows, Space. Focus is never lost on a
  switch, because nothing remounts: the page re-renders in place.

# Reports — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the Reports
workspace (page id `reports`) and the report viewer behind it.

|                  |                                    |
| ---------------- | ---------------------------------- |
| Reference        | `screenshots/reports-v129.png`     |
| Restored library | `screenshots/reports.png`          |
| List view        | `screenshots/reports-list.png`     |
| Reference viewer | `screenshots/report-v129-open.png` |
| Restored viewer  | `screenshots/report-viewer.png`    |

## What was there before

A `ResourceList` over `/reports` with six columns — Report, Category, What it
covers, Schedule, Last run, Source — behind a table of eight invented reports
with invented categories ("Compliance", "Security", "Inventory"). None of the
twenty approved reports existed, and nothing about the page said what any
report would return.

## What Reports actually is

Two screens, and the larger page in this console by some distance.

**The library**: five category counters — All Reports 20, Computers &
Software 5, Daily Operations 6, Security 4, Leadership 5 — then a toolbar of
search, a favourites filter, a sort and a Grid/List toggle, then a card per
report. Each card carries the report's title, description, the figure it would
return against the estate right now, the largest single group inside that
figure, its first breakdown drawn as a ring, and a footer reading "N charts ·
M columns".

**The viewer**: an All Reports button, the report's title, Schedule and
Export, three counters with the row total leading on a dark card, the
report's own charts in a two-by-two grid — each with the reference's
chart-type selector — and the report's rows in the catalogue's column order,
paged, under a search.

## The contract already described it

The ninth page in a row. `/reports` was declared as a `ReportDef[]` with the
summary "Report catalogue (20 standard reports) with live headline figures and
favourites", and `/reports/{id}/run`, `/reports/{id}/favorite`,
`/reports/{id}/export` and `/reports/custom` were all declared beside it.
`ReportDef.category` already carried the four approved categories as an enum.
The server served none of them: it served `/reports` as a flat table of its own
invention, and the page read that.

## One engine, twenty definitions

Every one of the twenty reports is a list of computers joined to whatever the
report is about — an installation, a missing update, an open finding, a USB
connection — which is why each carries the full device column set and why the
column counts are all in the high seventies and eighties.

So a report is modelled exactly as the reference models one: a row source, an
ordered column list and a handful of group-by charts. `report-catalog.ts` holds
the twenty definitions, extracted from the reference rather than retyped —
1,614 columns and 90 charts in all — and `routes/reports.ts` holds one engine
that runs any of them.

Two maps do the work: every field name the reference uses, as SQL over the
joined row, and every source, as a FROM clause. A report definition names
fields, never columns, so adding a report cannot invent data and renaming an
estate column is one edit. **The catalogue is checked at startup**: a report
naming a field with no SQL behind it stops the server rather than serving a
column of nulls. It caught one real gap while this was being built — "Last
deployment" is a property of the device, not of the row.

## Fixture changes

The reports ask for inventory the estate did not keep.

- **Twenty-nine device columns** — asset tag, domain, ownership, chassis, OS
  install date, uptime, time zone, CPU cores, BIOS version and date, TPM,
  Secure Boot, graphics, battery, purchase and warranty dates, subnet,
  gateway, SSID, public IP, VPN, antivirus product and definitions,
  encryption type, USB storage policy, local admins, last patched, patch ring,
  agent health and content source. The reference synthesises all of these when
  it enriches a device row; they are derived here from each row's own values
  for the same reason the experience measures are, so adding them does not
  shift the seed's random stream.
- **`usb_events`** — the one report source the estate had no table for at all:
  1,200 USB connections over thirty days, 244 of them refused by policy.
- **`software.seats` and `software.renews_at`** — what Software Licenses is
  about. A few titles are deliberately over-allocated, because that is the
  finding the report exists to surface.
- **`report_favorites`** — the reference keeps starred reports in local
  storage; a console with named accounts keeps them per user.

## Additive contract changes

Three, all additive; nothing was removed or renamed.

- **`ReportDef`** gained `unit`, `total`, `charts`, `columns`, `secondary` and
  `preview` — the figure on the card, the noun it is counted in, the two
  numbers in the footer, the largest group and the ring beside it.
- A new **`GET /reports/{id}/summary`** and **`ReportSummary`**: the counters
  and charts the viewer draws above the grid. `ReportPage` carries only
  columns and rows, so there was nowhere for them to come from.
- `ReportPage` is served as declared.

## Judgement calls

Recorded in `decisions.md`:

- **D-043** — the inventory attributes are derived, not drawn. Same reasoning
  as D-042, and the same hash technique.
- **D-044** — the library's figures are cached for a minute. They sweep every
  source, six hundred thousand installations among them, and are the same for
  every reader; the favourites are per user and cheap, so they stay outside
  the cache and are merged on top. Without it the page takes about five
  seconds to open.

## What is not restored

- **Line and Area chart forms.** The reference offers six forms per panel;
  this console draws four of them — Column, Bar, Donut and Pie. A count
  grouped by operating system is not a time series, and drawing it as a line
  would imply one.
- **The viewer's Location and Group scope selects.** The reference narrows a
  report by site and device group from the top bar. The engine would support
  it — it is one more clause — but the contract declares no scope parameters
  on `/reports/{id}/run`, and inventing query parameters is the one thing
  these restorations do not do. Raised as handover question 42.
- **Filters and Columns on the viewer's grid.** The reference opens a column
  chooser and a filter builder over the eighty columns. The console's own
  `DataTable` has both, but this grid is hand-drawn to follow the catalogue's
  column order; wiring the shared table to a dynamic column set is its own
  piece of work. The grid shows every column the report declares.
- **Schedule.** The button is present and goes to the custom-report builder,
  which is where a schedule is set; nothing in the contract schedules a
  standard report.
- **The card icons.** Each reference card carries a subject glyph. The
  restored cards carry the title, the description and the figures; the icon
  set is not in the extracted specs.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

# Audit before fixing — Reports and the console against v129

Both briefs ask for an audit before any code is written. This is it. Nothing in
this document has been fixed yet.

**Method.** Claims were checked against the code, the database, the running
server and the rendered page — not read off a screenshot. Every number here was
measured on the 50,000-device seed with the mock server on `localhost:8080` and
the console on `localhost:5173`. Where a claim in the brief turned out to be
wrong, it says so and gives the measurement.

**References.** `design-reference/Aegis-One-Console-v129.html` is the master.
v130 (`Downloads/Aegis-One-Integrated-Modern-Console_130.html`) is the source
for Remote Control only — it carries Remote Control (21 mentions, `aegis-rc`
styles) _and_ Vulnerabilities (25), so **v128 is not needed**: everything the
brief wanted from v128 is in v130, which is newer.

---

## 1. Confirmed, with evidence

| #   | Claim                                                   | Verified how                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A.1 | Report charts pull non-reference colours                | `ReportViewer.tsx:37` — `RAMP = ['deep','info','alt','teal','sand','neutral']`. Rendered "Computers by location" shows navy, teal, sand and grey in one chart.                                                                                     |
| A.2 | "Bar" renders identically to "Column"                   | `ReportViewer.tsx:206` special-cases only `donut`/`pie`; everything else falls through to `<Columns>`.                                                                                                                                             |
| A.3 | Column has no axis, gridlines or ticks                  | `shared/Figures.tsx:187` — `Columns` draws bars and an optional target line only. No axis, no gridlines, no tick labels.                                                                                                                           |
| A.4 | KPI tiles 2–3 are "the two largest groups of chart 1"   | `routes/reports.ts:425` — `...lead.slice(0, 2)`. On All Computers the third tile reads **Pending restart**, not Offline; on Installed Software it reads **CrowdStrike Falcon Sensor** and **Google Chrome**.                                       |
| A.5 | Report header is missing most of the reference          | Rendered page has `All Reports`, title, a description line, `Schedule`, `Export`. **No** report switcher, **no** Location/Group filters, **no** favourite star, **no** Export icon, and an **extra** description line the reference does not have. |
| A.6 | Details table is missing search, filters, columns, sort | `routes/reports.ts:438` defaults `limit` to **50**; reference uses 10.                                                                                                                                                                             |
| A.8 | Third-party icon pack                                   | `@phosphor-icons/react` imported in `app/nav.ts` and `layout/AppShell.tsx`.                                                                                                                                                                        |
| A.9 | Remote Control missing                                  | Zero occurrences in v129, 21 in v130. `README.md:108` still says "There is no remote control, and there must not be."                                                                                                                              |
| —   | Reports are slow                                        | Measured below.                                                                                                                                                                                                                                    |

### Measured: where the time actually goes

Server time only, two runs each, 50k seed:

| Endpoint                          | cold         | warm        | cached?      |
| --------------------------------- | ------------ | ----------- | ------------ |
| `/reports/software/summary`       | **16,602ms** | **8,657ms** | **no**       |
| `/reports` (library list)         | 9,482ms      | 16ms        | yes, 60s TTL |
| `/reports/updates/summary`        | 1,094ms      | 1,252ms     | no           |
| `/reports/computers/summary`      | 529ms        | 383ms       | no           |
| `/reports/computers/run?limit=50` | 79ms         | 75ms        | n/a (88 KB)  |
| `/reports/computers/run?limit=10` | 21ms         | 21ms        | n/a (20 KB)  |

Every other page's primary endpoint is **under 500 ms**, most under 10 ms. The
slowness is specific to report summaries, not console-wide:

| Page            | warm  | Page            | warm |
| --------------- | ----- | --------------- | ---- |
| Configuration   | 372ms | Patches         | 17ms |
| DEX             | 257ms | Overview        | 6ms  |
| Vulnerabilities | 118ms | everything else | ≤5ms |

---

## 2. The brief is wrong about four things

These are stated plainly because fixing them as written would waste effort or
make the build worse.

### 2.1 "Add SQLite indexes on every chart/group field"

**There are already 39 indexes.** The problem is not missing indexes.

`EXPLAIN QUERY PLAN` on the Installed Software chart query shows the real cost:
the report's source is a three-table join, and the charts only ever read columns
from `software` and `device_software` — the `devices` join is **never
referenced by any of the four charts**.

```
WITH the devices join:     SCAN d USING COVERING INDEX … → 766 ms
WITHOUT the devices join:  SCAN s …                      → 249 ms
identical results:         true
```

Four charts plus a `COUNT(*)` over the same join, per request, is the 8.6–16.6
seconds. The fix is to stop joining tables the chart does not use, and to cache
the summary the way the library list already is — not to add indexes.

Row counts, for scale: `devices` 50,000 · `device_software` 630,281 ·
`device_patches` 530,723 · `device_vulnerabilities` 61,103 · `software` 32.

### 2.2 "the donut `r + stroke/2 ≠ 30` clipping"

Measured in the live DOM: both donuts have `viewBox="0 0 60 60"` (half = 30)
and a maximum extent of `r + strokeWidth/2 = 25`. **Nothing is clipped.** No
chart panel clips by overflow either — every panel reported
`scrollHeight === clientHeight` and `overflow: visible`.

### 2.3 "No hard-coded hex values in components"

Already true. A grep for `#rrggbb` across `apps/aegis-one/src` and
`packages/ui/src` `.ts`/`.tsx` returns **zero**. Colours already come from CSS
modules and the token contract, and `scripts/check-colors.mjs` already fails on
any hex that is neither approved nor present in v129.

### 2.4 "Find every place that returns mock data despite the server running"

There is no such place, and no silent fallback. **The server on `localhost:8080`
is the mock server** — Fastify plus SQLite over a 50,000-device deterministic
seed. Every figure in the console is seed data because that is the only backend
that exists; there is no Go service to fall back from. The first brief states
this correctly in its section C; the second brief's issue 7 contradicts it.

What is worth building is the visible badge and `GET /api/v1/meta →
{ backend, version }` from section C, so the screen says which backend it is
talking to. "Remove the silent mock fallback" is not a task, because there is
nothing to remove.

Also: the console has **19** pages plus the sign-in screen, not 21.

---

## 3. Found during the audit, not in either brief

### 3.1 A slow report renders as an empty shell, with the wrong title

This is the real shape of "slow loading and half-rendered graphs", and it is
worse than a half-drawn chart. Opening `/reports/software`:

- the heading reads literally **"Report"** — a placeholder, not "Installed
  Software";
- there are **no KPI tiles and no chart panels at all**, only a "Details" box
  reading "Loading rows… / No rows" and a pager saying "Page 1 of 1";
- this persists for **about twenty seconds**, then the whole page appears at
  once, correctly.

The cause is structural, not a timing accident: the page's title, tiles and
charts all come from `/summary`, so the entire layout waits on the slowest
query in the report. Nothing renders progressively.

I could **not** reproduce a clipped or half-drawn chart at 1600×1000 after load
— see 2.2. If the half-graph was seen at another width or mid-load, it needs a
width and a step to reproduce; otherwise this is the defect being described.

### 3.2 Fourteen separate KPI tile implementations

`packages/ui` exports a `KpiTile` that already supports `onClick`, renders a
`<button>` and sets `aria-pressed`. Exactly **one** page uses it
(`DeploymentDetail.tsx`).

Thirteen other pages define their own local `Kpi` component — Configuration,
Deployments, DeviceGroups, Devices, Dex, Enrollment, Integrations, LiveActivity,
Overview, Patches, Software, Vulnerabilities, Zones. That is why tile behaviour
is inconsistent: there is no single tile. 28 of 30 local usages do wire a click
handler, so "tiles not working" is per-page, not universal — but it cannot be
fixed once until there is one component.

### 3.3 The horizontal bar chart already exists

`shared/Figures.tsx:261` exports `Bars`, which is horizontal — label on the
left, track on the right, value at the bar end. `ReportViewer.tsx:7` imports
only `Columns` and `Donut`. A.2 is a one-line wiring fix, not a new component.

### 3.4 Chart panels do not share a height

Side by side on All Computers: "Online and offline" body is 184px, "Operating
systems" 279px, "Computers by location" 262px, "Computer types" 184px. The
shorter panel beside a taller one reads as unfinished, which may be what was
circled.

---

## 4. Not yet audited

Stated so this document is not mistaken for complete:

- **The per-page side-by-side screenshot sweep at 1600×1000.** The earlier sweep
  in `sweep.md` compared structure at 1680×1400 and predates these briefs. The
  ten-column table per page needs that sweep re-run against v129 with the new
  dimensions (icons, gloss, tile behaviour, chart axes).
- **Gradient and token extraction from v129.** The specific gradients listed in
  the brief have not yet been grepped out of the reference and matched 1:1 to
  the selectors that use them, which the brief requires before applying any
  gloss.
- **The `Ax9N` icon map.** Not yet extracted from the reference bundle.
- **URL behaviour per page.** The sign-in redirect chain and port change are
  understood from the brief's own description and confirmed by the rendered
  flow, but tab/modal/drawer history behaviour has not been tested per page.

---

## 5. What I recommend doing first

In this order, because each one unblocks the next and the first two are where
the visible pain is:

1. **Make reports render progressively and stop over-joining.** Drop the unused
   `devices` join from chart queries, cache `/summary` like the library list,
   and render the title, tiles and each chart panel independently with their own
   skeletons. This removes the twenty-second empty shell.
2. **Fix the five concrete Reports defects**: the palette (A.1), wire `Bars`
   for "Bar" (A.2), add axes to `Columns` (A.3), per-report KPI definitions
   (A.4), and the header and table controls (A.5, A.6).
3. **One tile component.** Move every page onto `KpiTile` and delete the
   fourteen local copies, then make the counts match the lists they filter.
4. **One icon component** from the v129 `Ax9N` paths, then remove
   `@phosphor-icons/react`.
5. **Remote Control** from v130, and replace the README's "must not be" section.
6. **The proxy and `from=` landing** (section D), then the sweep (section E).

Steps 3 and 4 touch every page, so they should land after 1 and 2 rather than
between them.

# Every page against v129 — the sweep

Section E of the Reports brief: render the reference and the rebuild at
1600×1000, save both, and list every visible difference **before** fixing
anything. Nothing in this document has been fixed.

**Method.** `node scripts/sweep.mjs`, with the reference served by
`node scripts/ref-server.mjs`. Both scripts are committed. Shots are in
`docs/screenshots/sweep/<page>-ref.png` and `<page>-build.png`, with the raw
measurements in `sweep.json` beside them.

Screenshots are the evidence a person reads; they are a poor thing to judge
from. Thirty-eight of them is where a sweep quietly turns into an impression,
so the colour, icon, chart, table and timing columns below are measured out
of the running pages rather than eyeballed. Where a row says something could
not be measured across both sides, it says so.

**Scope note.** The reference's fixture is 32 devices and ours is 50,000, so
every figure differs by design. A difference in a _number_ is not a deviation
and is not listed. A difference in what the page _offers_ is.

---

## 1. The table

`Icons` is approved glyphs over total SVGs in the page body — the remainder
are charts, which are SVGs too. `Load` is time from navigation to the page
having no "Loading" text left.

| Page            | Route             | Icons | Palette | Gloss | Charts | Tiles  | Header / filters       | Table               | Load  |
| --------------- | ----------------- | ----- | ------- | ----- | ------ | ------ | ---------------------- | ------------------- | ----- |
| Overview        | `/`               | 24/37 | clean   | n/a   | 13 svg | 21 / 5 | **7 controls short**   | 19 rows, no pager   | 358ms |
| Devices         | `/devices`        | 24/24 | clean   | n/a   | —      | 13 / 4 | **5 controls short**   | search, sort, pager | 301ms |
| Device groups   | `/groups`         | 24/24 | clean   | n/a   | —      | 14 / 0 | matches                | sort, pager         | 236ms |
| Enrollment      | `/enrollment`     | 24/27 | clean   | n/a   | 3 svg  | 18 / 0 | matches                | 5 rows              | 324ms |
| Patches         | `/patches`        | 24/44 | clean   | n/a   | 20 svg | 17 / 0 | matches                | 35 rows, sort       | 280ms |
| Software        | `/software`       | 24/24 | clean   | **0** | —      | 16 / 4 | **installer upload**   | cards, search       | 326ms |
| Live Activity   | `/liveops`        | 24/27 | clean   | n/a   | 3 svg  | — ¹    | matches                | search              | 287ms |
| Remote Control  | `/remote-control` | 30/30 | clean   | n/a   | 6 svg  | — ¹    | no reference ²         | search              | 239ms |
| Deployments     | `/deployments`    | 24/40 | clean   | n/a   | 16 svg | 19 / 6 | matches                | 16 rows, sort       | 265ms |
| Vulnerabilities | `/vulns`          | 24/51 | clean   | **0** | 27 svg | 25 / 6 | **differs in shape**   | 42 rows, 7 filters  | 428ms |
| Configuration   | `/profiles`       | 24/24 | clean   | n/a   | —      | — ¹    | matches                | 6 filters           | 553ms |
| DEX             | `/dex`            | 24/33 | clean   | n/a   | 9 svg  | 11 / 0 | matches                | 31 rows             | 269ms |
| AEGIS Insight   | `/insight`        | 24/24 | clean   | **0** | —      | — ¹    | **no PREVIEW tag**     | —                   | 436ms |
| Aegis Zones     | `/sites`          | 24/34 | clean   | n/a   | 10 svg | 6 / 0  | matches                | 20 rows             | 208ms |
| Peer cache      | `/peercache`      | 24/24 | clean   | n/a   | —      | — ¹    | matches                | 9 rows              | 234ms |
| Reports         | `/reports`        | 24/24 | clean   | n/a   | —      | — ¹    | **no count chip**      | cards               | 284ms |
| Integrations    | `/integrations`   | 24/24 | clean   | n/a   | —      | — ¹    | matches                | —                   | 613ms |
| Administration  | `/admin`          | 24/24 | clean   | n/a   | —      | — ¹    | matches                | —                   | 256ms |
| Licensing       | `/licensing`      | 24/30 | clean   | n/a   | 6 svg  | 5 / 0  | **upload is a button** | 8 rows              | 258ms |
| Diagnostics     | `/diagnostics`    | 24/25 | clean   | **0** | 1 svg  | 5 / 0  | matches                | 7 rows              | 272ms |

¹ Not "no tiles". The counter selector finds tiles on thirteen pages and
misses them on seven, because there is no single tile component to select —
Configuration's counters, for one, are a local `Kpi` whose class names do not
contain the word. This is the audit's finding 3.2 showing up from the
outside, and it is why "tiles correct and clickable" cannot yet be answered
in one pass.

² v129 has no Remote Control page. The build's is from v130.

---

## 2. What the measurements settle

**Palette: clean on all twenty pages.** Every colour the build paints is one
the reference paints or declares — zero strangers, against 119 distinct
colours the reference painted across the sweep. This is a stronger check than
`check-colors.mjs`, which reads source files; this one reads what the browser
actually rendered, so a blended or computed colour could not hide.

**Gloss: missing, and now bounded.** The reference paints a gradient on
exactly two things and nothing else:

| Where                                 | Gradient                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `button.primary`, `button.am-primary` | `linear-gradient(rgb(36,71,107) 0%, rgb(27,58,90) 55%, rgb(21,48,76) 100%)`   |
| `button.sw-uninstall` (Software)      | `linear-gradient(rgb(224,71,76) 0%, rgb(192,38,45) 50%, rgb(158,28,34) 100%)` |

No glossy cards, no glossy tiles, no sheen overlays anywhere in the sweep.
The build paints **zero** gradients on every page. So brief item B.2 —
"grep the reference for each selector that uses these gradients and match it
1:1" — has a short answer: primary buttons and destructive buttons, and
nothing else. That is a change to two button variants, not a restyle.

**Icons: three strays in the whole console.** Every icon-shaped glyph on
every page comes from the approved set except three hand-rolled 20×20 SVGs in
`LiveActivity.tsx` (lines 555, 563, 569).

**Load: nothing is slow any more.** The slowest page settles in 613ms
(Integrations) and the median is 280ms. The Reports work removed the only
figures that were seconds rather than milliseconds.

**Headings: seventeen of nineteen match exactly**, including the ones that
are not the nav label — "Patch Management", "Software Catalog",
"Configuration Compliance", "Digital Employee Experience", "System Health".
The two that differ are listed below.

---

## 3. Every difference worth fixing

Ordered by how many pages it touches.

### 3.1 The top bar — all twenty pages

The reference's top bar carries a search field, a bell with an unread dot, a
help control and an `AA` avatar tile. The build has the user's name as text.
This is brief item A.7 and it is the single most visible difference left,
because it is on every screenshot.

### 3.2 Primary and destructive buttons are flat — all twenty pages

See the gradient table above.

### 3.3 Overview is missing its scope bar and its panel controls

- No `Zone`, `Platform` or `Department` selects above the dashboard.
- No `+ Custom Widget`, no `Customize`.
- The health panel has no `How it's calculated`, no `Thresholds`, no
  `Patching +7.8`-style driver chips (the build shows two drivers, the
  reference three).
- Every panel's two selects are named `View` and `Chart type` in the build;
  the reference names them per panel (`Overall Health Score view`,
  `Patch compliance chart type`), which is what a screen reader reads out.
- The build adds a `⟳` refresh control and an `All` select the reference does
  not have.

### 3.4 Devices is missing most of its filter bar

Missing: `Advanced Filter`, the `Saved views` select, the `Filters` button,
and the count on `Columns` (the reference shows `Columns 20`). The build's
four selects are labelled `Location`, `Platform`, `Status`; the reference
labels them `Device location`, `Device platform`, `Device status`. The search
placeholder differs — "Search hostname, IP, serial, user or model" against
"Search name, IP, MAC, DNS, user or anything else". Two columns carry no sort
affordance where the reference gives every column one.

The build adds a `Default view` control and a `Previous`/`Next` pager with a
rows-per-page select; the reference pages differently.

### 3.5 Vulnerabilities is a different page, not a drifted one

The reference offers `Open Patch Management`, `Deploy Fix` and `Review`
against a findings list. The build has five tabs — Findings, Devices,
Remediations, Projects, Scans — with seven filter selects, a scan history and
`+ New Scan`. Neither is a subset of the other.

This one needs a decision rather than a fix: the build's page is richer and
may well be the newer intent, but it is not what the reference shows, and the
brief says the reference wins where both have a page. **I have not touched
it.**

### 3.6 Smaller, page by page

| Page           | Difference                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Software       | No installer file input; the reference has `input:file` for adding an installer. The build's `Import Icons` has no counterpart.                                            |
| Licensing      | The reference uploads a licence with a file input; the build has an `Upload License` button.                                                                               |
| Device groups  | The reference imports groups with a file input labelled "Import groups from CSV"; the build has an `Import CSV` button.                                                    |
| Reports        | The reference's title carries a count chip — "Reports 20" — and each library card's title is itself a button. The build's titles are text with a separate "Open Report →". |
| AEGIS Insight  | The reference's title carries a `PREVIEW` tag; the build's does not. The build adds `New Diagnosis`.                                                                       |
| Live Activity  | The platform select is `Target platform` in the reference and `All Platforms` in the build. Three hand-rolled glyphs, as above.                                            |
| Configuration  | The reference has a `⋯` overflow control the build does not.                                                                                                               |
| Deployments    | The action filter is `Filter deployment action` in the reference and `Type` in the build. The build adds sortable column headers the reference does not have.              |
| Administration | The build adds an `API access` tab.                                                                                                                                        |
| Enrollment     | The reference's four counters are buttons; the build's are not clickable.                                                                                                  |

---

## 4. What this sweep does not cover

- **Tile behaviour.** Counting tiles needs one tile component, and there are
  still fourteen. Until they are one, "correct and clickable" has to be
  checked by hand per page.
- **Tabs, modals and drawers.** The sweep opens each page's default tab only.
  The brief's section D also asks that these not push history entries, which
  is untested.
- **Hover, focus and empty states.** Only the loaded, populated state is
  captured.
- **The reference's own scroll.** Both sides are shot at 1600×1000 without
  scrolling, so differences below the fold are not in these images.

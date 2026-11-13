# Every page against v129 — the sweep

Section E of the Reports brief: render the reference and the rebuild at
1600×1000, save both, and list every visible difference **before** fixing
anything. Nothing in this document has been fixed.

**Method.** `node scripts/sweep.mjs`, with the reference served by
`node scripts/ref-server.mjs`. Both scripts are committed. Shots are in
`docs/screenshots/sweep/<page>-ref.png` and `<page>-build.png`, with the raw
measurements in `sweep.json` beside them.

**One caveat, learnt the hard way.** The control inventory below reads a
control's `aria-label`. A control named with `aria-labelledby` is named just
as well and this reader cannot see it, which is how section 3.3 came to
claim the Overview had no scope bar when it had one all along. Where a
difference here is about a control being _missing_, check it against the
accessibility tree before acting on it.

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
| Overview        | `/`               | 24/37 | clean   | n/a   | 13 svg | 21 / 5 | scope done, 2 open ¹   | 19 rows, no pager   | 358ms |
| Devices         | `/devices`        | 24/24 | clean   | n/a   | —      | 13 / 4 | group + count done ¹   | search, sort, pager | 301ms |
| Device groups   | `/groups`         | 24/24 | clean   | n/a   | —      | 14 / 0 | matches                | sort, pager         | 236ms |
| Enrollment      | `/enrollment`     | 24/27 | clean   | n/a   | 3 svg  | 18 / 0 | matches                | 5 rows              | 324ms |
| Patches         | `/patches`        | 24/44 | clean   | n/a   | 20 svg | 17 / 0 | matches                | 35 rows, sort       | 280ms |
| Software        | `/software`       | 24/24 | clean   | done  | —      | 16 / 4 | **installer upload**   | cards, search       | 326ms |
| Live Activity   | `/liveops`        | 24/27 | clean   | n/a   | 3 svg  | — ¹    | matches                | search              | 287ms |
| Remote Control  | `/remote-control` | 30/30 | clean   | n/a   | 6 svg  | — ¹    | no reference ²         | search              | 239ms |
| Deployments     | `/deployments`    | 24/40 | clean   | n/a   | 16 svg | 19 / 6 | matches                | 16 rows, sort       | 265ms |
| Vulnerabilities | `/vulns`          | 24/51 | clean   | done  | 27 svg | 25 / 6 | **differs in shape**   | 42 rows, 7 filters  | 428ms |
| Configuration   | `/profiles`       | 24/24 | clean   | n/a   | —      | — ¹    | matches                | 6 filters           | 553ms |
| DEX             | `/dex`            | 24/33 | clean   | n/a   | 9 svg  | 11 / 0 | matches                | 31 rows             | 269ms |
| AEGIS Insight   | `/insight`        | 24/24 | clean   | done  | —      | — ¹    | **no PREVIEW tag**     | —                   | 436ms |
| Aegis Zones     | `/sites`          | 24/34 | clean   | n/a   | 10 svg | 6 / 0  | matches                | 20 rows             | 208ms |
| Peer cache      | `/peercache`      | 24/24 | clean   | n/a   | —      | — ¹    | matches                | 9 rows              | 234ms |
| Reports         | `/reports`        | 24/24 | clean   | n/a   | —      | — ¹    | **no count chip**      | cards               | 284ms |
| Integrations    | `/integrations`   | 24/24 | clean   | n/a   | —      | — ¹    | matches                | —                   | 613ms |
| Administration  | `/admin`          | 24/24 | clean   | n/a   | —      | — ¹    | matches                | —                   | 256ms |
| Licensing       | `/licensing`      | 24/30 | clean   | n/a   | 6 svg  | 5 / 0  | **upload is a button** | 8 rows              | 258ms |
| Diagnostics     | `/diagnostics`    | 24/25 | clean   | done  | 1 svg  | 5 / 0  | matches                | 7 rows              | 272ms |

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

### 3.1 The top bar — all twenty pages — **done**

The reference's top bar carries a search control, a bell with an unread dot,
a help control and an initials tile. The build had the user's name as text.

Built, and measured against the reference rather than eyeballed: the icon
buttons are 32×32, the tile is 36×36 in #20272D with #ECC57C initials at
12.5px/650, and the unread mark is a 5px **square** — all ten measurements
match.

What sits behind each control is narrower than v129's, and the copy says so
instead of promising more. The reference's search is a command palette over
every entity in the console; this one searches endpoints, which is a search
this console can run today. The bell shows the audit log — the one record of
"what just happened" that exists — and the dot means entries newer than the
last time this browser opened it, rather than an ornament that is always
lit. It hides entirely for a role without `audit:read`.

### 3.2 Primary and destructive buttons are flat — all twenty pages — **done**

Both gradients are now tokens and both variants carry them, with the
reference's own edge colour, inset highlight and drop shadow; the
destructive one also carries the text shadow the navy one does not. A
consumer of `packages/ui` that sets no gloss token still gets the flat
colour, so this is a design-system default rather than a requirement.

Measured: gradient, border and box-shadow on the primary button match the
reference string for string.

### 3.3 Overview — part wrong, and the rest now done

**Correction.** The first version of this section said the build had no
`Zone`, `Platform` or `Department` selects. It had all three, correctly
named, the whole time. The sweep's control reader looked at `aria-label` and
nothing else; these three are named with `aria-labelledby`, which names a
control just as well, so the reader saw three anonymous selects and the diff
called them missing. Checked afterwards with Playwright's own role-and-name
resolution: `combobox "Zone"`, `combobox "Platform"`, `combobox "Department"`,
one each. The "extra `All` select" in the same list was one of those three
read by its placeholder.

What was actually different, and is now fixed:

- **No `Reset`.** The reference offers one the moment something is narrowed,
  and nothing before that. The build now does the same.
- **The scope was not in the URL.** It is now — `/?zone=zn-mum-hq` — so a
  narrowed dashboard is a link someone can send. The reference keeps it in
  memory; section D of the brief asks for the query string, and the rest of
  this console already works that way.
- **The panel selects were named generically.** Four panels each offering
  `View` and `Chart type` give a screen reader eight controls with two names
  between them. They are now `Overall Health Score view`, `Patch compliance
chart type` and so on, as the reference names them.
- **The row was drawn as a card.** v129 gives it no border and 8px/12px of
  padding, so it reads as part of the page rather than a panel on it.

Still different, and not done:

- No `+ Custom Widget`, no `Customize`. That is dashboard composition, which
  is a feature rather than a scope bar.
- The health panel has no `How it's calculated` and no `Thresholds`, and
  shows two driver chips where the reference shows three.
- The build keeps a `⟳` refresh the reference does not have. It is useful and
  it is not in the way, so it stays unless you would rather it went.

### 3.4 Devices — two real gaps, now closed, and two claims that were wrong

Checked control by control, with accessible names resolved properly this
time.

**Closed:**

- **The group filter.** The reference's bar has one and the build's did not.
  `?group=` has been in the contract all along and _no server answered it_ —
  the parameter was accepted and ignored, so asking for one group returned
  the whole estate. It is implemented now, as a membership test rather than
  an id list, because the largest group holds 32,710 devices. Measured:
  50,000 to 32,710, and an unknown group gives 0 rather than everything.
- **The count on `Columns`.** The reference labels it `Columns 20` — what is
  visible, not what exists. The build now does too, everywhere the shared
  list toolbar is used.

**Wrong in the first version of this document:**

- **`Saved views` is not missing.** The build has it, as a menu labelled by
  the current view ("Default view") rather than the reference's `select`.
  Same feature, different control.
- **`Filters` opens nothing in the reference.** Clicking it shows no panel
  and no dialog; it toggles a filter row that the build shows inline at all
  times. A shape difference, not a missing control.

**Still open:**

- ~~`Advanced Filter`~~ **done.** The reference opens a rule builder over
  eighty fields and the contract has `?filter=` for exactly it — which was
  the third parameter found declared and unimplemented, accepted and ignored
  like `?group=` was. Both halves are built: the parameter is parsed through
  the same column and operator allowlist the ordinary parameters use, and the
  builder offers the reference's nine operators over the grid's 29 filterable
  columns. An unknown field or an operator a column cannot take is a 400
  naming it, not a rule that quietly does nothing.
- Two columns carry no sort indicator where the reference gives every column
  one. Still open.

**Not a difference:** the search placeholders read differently because the
build's is accurate. The reference promises "or any field"; this server
searches hostname, IP, serial, user and model, and the placeholder says so.
The build's `Default view` control and its pager are additions, not losses.

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

### 3.6b Found while building the bell: `/audit` is declared and unimplemented

The contract has `GET /audit` with `audit:read`, and no server answers it —
asking for it is a 404. The working endpoint is `/liveops/audit`, which the
Live Activity page uses and which the bell now uses too. Either the contract
should drop `/audit` or the mock should implement it; a declared path that
404s is the kind of thing a backend team builds against and then has to undo.

### 3.7 Open: two palette tokens are a shade off, console-wide

Found while matching the avatar tile, and left alone because it reaches
further than this brief. v129 paints its dark tiles #20272D and their gold
#ECC57C — 247 and 219 occurrences. This console's `--ao-sidebar` is #202329
and `--ao-brand-hi` is #E4C795, which appear 3 and 49 times. Both of ours are
in the reference, so the colour check passes and has always passed.

The avatar tile uses the reference's values through their own tokens. Moving
`--ao-sidebar` and `--ao-brand-hi` would also move the sidebar, every grid
header band and the lead counter on every page, so it wants a decision rather
than a quiet fix.

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

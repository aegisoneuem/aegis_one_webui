# Decisions

Non-obvious choices, newest last. Each entry says what was decided, why, and what would change it.

## D-001 Greenfield monorepo, nothing inherited from Saleos One

The first brief assumed an existing Saleos One monorepo. None exists in this workspace (only a
single-file `Saleos-One-Console.html`). The revised brief makes Aegis One the first of three
consoles, so `packages/ui` and `packages/mock-core` are built here and kept brand-free.
Revisit if a Saleos One source tree turns up.

## D-002 pnpm 12, Vite 8, React 18, react-router 6, TanStack Table 9

Versions are whatever `pnpm add` resolved on 2026-11-01. React stays on 18 and Router on 6 because
the brief fixes them. `@tanstack/react-table` resolved to v9; if its API proves unstable against
`@tanstack/react-virtual` in Phase 2, pin to the latest v8.

## D-003 The `--ui-*` variable contract is the only coupling between a console and `packages/ui`

`packages/ui` CSS reads `--ui-*` custom properties with no fallbacks and no colour literals.
`apps/aegis-one/src/styles/tokens.css` maps the brand palette (`--brand`, `--gold`, ...) onto them.
A sibling console ships its own `tokens.css` with the same `--ui-*` names, which is what lets Saleos
One use a different palette without touching the library. No fallbacks means a missing token shows
up immediately instead of silently rendering a default colour.

## D-004 Layout primitives live in `packages/ui`, the shell lives in the app

`Sidebar`, `NavGroup`, `NavItem`, `Breadcrumb` and `PageHeader` are in the library. `AppShell`
(sidebar plus breadcrumb plus outlet, route-handle breadcrumbs, Alt+Left) stays in
`apps/aegis-one/src/layout` because it knows the nav table and the router. A top-nav sibling console
writes its own shell from the same primitives.

## D-005 Inter is self-hosted

`@fontsource-variable/inter` ships the font from the bundle. The CSP in Phase 3 forbids third-party
style and font origins, so a CDN link is not an option. Monospace uses the system stack
(`ui-monospace`, Menlo) as specified, nothing is downloaded.

## D-006 Icons: Phosphor

The reference build bundles Phosphor icons (`weights` prop on its icon components), so
`@phosphor-icons/react` keeps the visual vocabulary. Tree-shaken per icon.

## D-007 Brand mark

The reference's sidebar mark is a 256x194 brushed-bronze angular "A" PNG, extracted unchanged to
`src/assets/brand/aegis-mark.png`. It is an A-shaped glyph rather than a literal shield; kept as is
because the brief says to keep the mark exactly. `aegis-mark.svg` is a vector trace of that PNG
(potrace, one path) filled with a gradient built from `--brand-deep`, `--brand` and `--gold`.
It is a trace, not the original artwork; replace it if the design team holds the master file.
`aegis-one-lockup.svg` sets the wordmark as live text in Inter; outline the text before using it
outside the console.

## D-008 Route skeleton shows an outline, not placeholder copy

Phase 1 pages render the sections, tabs and actions the feature inventory lists for that page. This
is scaffolding that Phase 4 deletes, and it is the real content list, not lorem ipsum.

## D-009 Sub-routes

`/devices/:deviceId[/:tab]`, `/deployments/new[/:step]`, `/deployments/created/:id`,
`/deployments/:id`, `/admin/api-access`, `/reports/custom`. Static segments are declared before
`:deploymentId` so `new` and `created` are never read as ids. Wizard step slugs follow the brief
(content, targets, schedule, network, options, review); see Open Questions in the feature inventory
for how this differs from the reference build.

## D-010 API contract conventions

- Redirect-only operations (`/auth/oidc/*`) have no 2xx response, hence `operation-2xx-response` is
  off in `redocly.yaml`. Static siblings of `/devices/{deviceId}` (`columns`, `summary`, `views`,
  `export`) trip `no-ambiguous-paths`; routers match static segments first, so it is off too.
- `additionalProperties: false` on every request body so the server can reject unknown fields
  (mass assignment). Response schemas are closed as well, so the Go side cannot drift silently.
- Secrets (`secret`, `clientSecret`) are `writeOnly` or returned exactly once on creation.
- `x-required-permission` on every operation and an `x-roles` matrix at the document root. The
  matrix is a first proposal for review; it contains no remote-control permission.
- Remote script execution is `liveops/script-jobs`: submit, poll, list per-endpoint results. No
  stream, socket or session resource exists.

## D-011 — The software catalogue drops three remote-access titles

Product rule 4 removes remote control from the console. It says nothing about
which third-party software an estate happens to have installed, and a UEM
console that could not report AnyDesk or TeamViewer would be worse at its job.

So the Remote Access category stays, with one exception: the three titles whose
names literally contain "Remote Desktop" or "Remote Control" are not seeded —
Microsoft Remote Desktop, Remote Desktop Connection Manager and Chrome Remote
Desktop Host. A row reading "Microsoft Remote Desktop" in a console that
deliberately has no remote control reads like a feature, and the point of the
rule is that nobody should be able to think the console offers one.

AnyDesk, TeamViewer, Citrix Workspace and Omnissa Horizon Client remain.

## D-012 — The contract is read, never restated

Anything expressed in the contract is loaded from it at runtime rather than
copied: request schemas are compiled from the spec, permissions come from
`x-required-permission`, and the seed reads the role matrix out of `x-roles`.

This started as a preference and became a rule after three drift incidents in
one build, each caught by a test, each more expensive than agreeing the change
would have been:

- The wizard sent `software-install` where the contract says `install-software`,
  so every submit failed after six filled-in steps.
- The seeded role matrix was a hand-maintained copy of `x-roles` and had lost
  `overview:read` for the Auditor, so auditors got 403 on the landing page.
- The console checked `profiles:read` and `sites:read`; the contract says
  `config:read` and `zones:read`.

A second copy of a fact drifts. The only reliable fix is not to have one.

## D-013 — Estate aggregates are cached for five seconds

Overview, DEX and the Devices facets each sweep the whole device table.
better-sqlite3 is synchronous, so those sweeps do not merely cost CPU — they
block every other request behind them. Recomputing them per reader is the main
reason the first load run showed p95 above two seconds.

`TtlCache` holds them for five seconds, keyed by the caller's zone scope.
Keyed by scope rather than by user, because two users with the same scope see
the same estate — and because a narrower scope must never read a wider entry.

Five seconds is short enough that nobody notices and long enough that twenty
concurrent readers pay for one computation. It is a mock-server concern: a real
database serves these concurrently and may not need it at all.

## D-014 — Every dynamic path goes through safeNavigate

React Router 6 has an open-redirect issue where a backslash in a `to` value is
treated as a scheme-relative URL. It is fixed only in v7, and the stack is
pinned to v6.

Rather than accept the risk in the abstract, `src/app/safeNavigate.ts` escapes
every dynamic path segment and allowlists the one page name the server
supplies (the AEGIS Insight action button). Ids are `encodeURIComponent`-escaped
at every call site.

This is worth keeping after an eventual v7 upgrade. Building a path out of a
value someone else chose is the kind of thing that should look deliberate.

## D-015 — Two pnpm supply-chain policies are documented, not enabled

Semgrep flagged three missing pnpm settings. `blockExoticSubdeps` is on.
`minimumReleaseAge` and `trustPolicy` are not, and the reasoning is in
docs/vapt-checklist.md as AR-1.

Both are correct controls that cannot be retrofitted onto an existing lockfile:
a ten-day minimum age rejects 78 legitimate entries, three days still rejects
ten, and `no-downgrade` rejects `semver@6.3.1` and `undici-types@6.21.0` as
possible takeovers when they are ordinary old majors pulled in transitively.

A policy that blocks `pnpm install` is a policy the next person deletes. A
commented setting with the reason, the values and the trigger for enabling it
survives; a broken install does not. Both go on at the next dependency refresh,
with a lockfile rebuilt from a fresh resolution and a full test pass.

## D-016 — The app serves its own security headers from Vite

Lighthouse reported "No CSP found in enforcement mode", and it was right. The
mock server sets a CSP on API responses, but the API does not serve the app.
Whatever hosts `dist/` has to send its own, and nothing did.

A Vite plugin now sends the production policy from `vite preview` and a relaxed
one from the dev server. The dev concession is real and deliberate: Vite
bootstraps React Refresh from an inline `<script>`, which `script-src 'self'`
blocks, leaving a blank page. Turning the strict policy on in dev broke the
whole app and every end-to-end test with it.

Keep the preview policy in step with whatever serves the bundle in production,
and verify against `vite preview` rather than the dev server.

## D-017 — Sign-in is a double-submit pair, not just a cookie

A ZAP baseline flagged the sign-in and MFA forms as having no anti-CSRF token,
and the attack is real: an attacker starts their own authorize flow, obtains a
`login_id`, and tricks a victim's browser into posting it with the attacker's
credentials. The victim then browses in the attacker's session.

The first fix bound the flow to an httpOnly cookie, which closes the attack —
the attacker can neither read nor plant it. But ZAP still reported the finding,
because a cookie-only defence is invisible to a scanner and to a reviewer.

So the token is also a hidden `csrf_token` field. That is the shape people
expect, it is checkable from outside, and it costs nothing. A control nobody
can see is a control nobody can confirm.

## D-018 — A scan that cannot authenticate reports a clean result

The first two ZAP active scans reported no findings across 124 endpoints. Both
were worthless: every request came back 401, because ZAP's `${VAR}`
substitution never reached the replacer's `replacementString`, and the scan
bounced off the auth layer without ever reaching the code it was meant to test.

Nothing in the output said so. "No findings" from a scan that could not get in
looks exactly like "no findings" from a scan that got in and found nothing.

`security/run-active-scan.mjs` therefore signs in, **verifies the token against
a real endpoint**, generates the plan with the values already in it, and the
report records the server-side response mix — 731 × 200, 0 × 401, 0 × 500 — so
the next reader can tell which kind of clean it was.

The same trap exists for anyone scanning the Go service. Check the traffic, not
just the findings.

## D-019 — The approved palette is restored, and enforced in CI

The console had drifted off the approved v129 palette. Not obviously: of the
nineteen colours that were in neither the approved list nor the reference
build, **sixteen were within dRGB 30 of an approved token**. `#E5E8EB` where
the design says `#E5E9ED`; `#47607A` where it says `#47617C`; `#1B2430` where
it says `#20262E`. Each is invisible in review and unmistakable in a diff,
which is why it read as a generic console rather than as a broken one.

Twenty-four of the forty-two approved tokens were missing entirely — including
the two most-used colours in the whole design, `#69717D` (436 uses in v129) and
`#E5E9ED` (340). The whole navy palette was absent, and the chart series had
been invented, one of them purple.

Three things changed:

1. `tokens.css` now carries the approved list verbatim under its v129 names,
   mapped onto the `--ui-*` contract the library reads.
2. State colours the approved list does not spell out — hovers, pressed, tints
   — are `color-mix` of approved tokens rather than picked values, so no new
   hex enters the codebase at all.
3. `scripts/check-colors.mjs` fails the build on any colour that is neither on
   the approved list nor present in v129, and runs as part of `pnpm lint`. When
   it fails it names the nearest approved token and the distance, because
   near-misses are the failure mode that actually happens.

The reference build is committed at `design-reference/Aegis-One-Console-v129.html`
and the check refuses to run without it. A colour check that cannot see the
specification would pass on anything, which is worse than no check.

### Open, and deliberately not guessed

- **Sidebar values.** The approved list gives `#202329`; v129's final cascade
  renders `#1b1f24` with active `#343027` / `#f1d39d`. The list was followed,
  as instructed, but the two disagree.
- **Fonts.** Still the `@fontsource` variable build, not the static woff2 files
  embedded in v129.
- **Logo.** `aegis-mark.svg` is a potrace trace — redrawn, which was explicitly
  not wanted. The byte-exact PNG extracted in Phase 1 is still there.
- **Chart assignment.** Series now use the approved navy palette everywhere.
  Some charts probably want the severity or compliance palette instead; which
  chart uses which is a v129 question, not a token question.

## D-020 — The fonts are v129's own files, and v129's own roles

The woff2 files are extracted byte-for-byte out of the reference build: 11
distinct files, 629 KB, loaded through `src/assets/fonts/fonts.css` with the
reference's own `unicode-range` subsetting. `@fontsource-variable/inter` is
gone. Nothing comes from a CDN, which the CSP forbids in any case.

Extracting them turned up something the written token list does not say. The
list specifies Inter, and Inter is embedded — but v129 also embeds **Aegis
Barlow** and **Aegis Condensed**, and its final style blocks apply them:

- `body, button, input, select, textarea, table` → **Aegis Barlow**
- `.am-large`, `.aox .card.kpi strong`, `.ax-big`, `.compact-wordmark` →
  **Aegis Condensed**
- Inter is declared 34 times but overridden by the later cascade

The file is the stated source of truth, so the tokens follow the file: Barlow
is `--ui-font-sans`, Condensed is `--ui-font-display` for KPI figures and the
wordmark, Inter stays in the stack behind Barlow. This is flagged rather than
assumed — it is the one place the written list and the reference disagree.

## D-021 — The logo is the extracted asset, not a trace

`aegis-mark.svg` was a potrace vector trace of the mark. It has been deleted,
along with the lockup built from it and the traced favicon.

The console now uses `aegis-mark.png` everywhere. That file was already
byte-identical to the mark embedded in v129 — the Phase 1 extraction was
exact; the mistake was drawing a vector from it and then preferring the
drawing.

Two of the ten PNGs embedded in the bundle are the VS Code and VLC icons, from
the software catalogue. The brand mark is the 256×194 one, sha `0ddb72ac`.

There is no vector version in the reference. If a scalable mark is wanted, it
has to come from whoever holds the original artwork — not from tracing the
bitmap again.

## D-022 — The Overview renders the contract's Overview schema, not the server's old one

`components.schemas.Overview` already described the approved page: weighted
health measures, patch compliance with severity / install-result / per-OS
breakdowns, three security controls, deployment status, expiring items, a
Needs Attention list and recent activity. It was modelled from v129 in Phase 1
and nothing had read it since.

The mock server returned a different shape, and the page rendered that shape.
Both now use the declared one, and the zone / platform / department query
parameters the contract already declares are implemented. The caller's zone
scope is ANDed with the query filter, so a filter can only narrow what the
role already allows, never widen it.

Service health left the Overview with the old shape. v129 has no such widget
and the schema has no field for it; `/diagnostics` still serves it, and the
Diagnostics page is now its only reader.

Six things v129 shows are not restored because each needs a contract change
or an asset that is not in the bundle: the Setup checklist, Custom Widget and
Customize, the Ask Aegis box, the deployment Device Results view, the patch
Devices-Needing-Patches-by-OS view, and the panel icon glyphs. They are listed
in `overview-restoration.md` rather than faked.

## D-023 — Chart geometry is SVG, so no data value is set through `style`

The columns, bars, donuts, pies and rings are drawn as SVG with the value in a
`height`, `width` or `dasharray` attribute. The first cut set bar heights with
inline `style`, which the `no-restricted-syntax` rule forbids — the rule is
there so the stylesheet keeps sole say over presentation, and a data-driven
pixel is still presentation.

Two things this cost, both worth knowing before editing these:

- A percentage height resolves against an indefinite height by falling back
  to the SVG's own aspect ratio, which for the column bars is 1:100. The plot
  needs a definite height and the svg needs `position: absolute`.
- A pie is the donut's arcs with a stroke wide enough to close the hole, and
  the stroke straddles the radius: `r + strokeWidth / 2` has to land exactly
  on the viewBox radius or the circle is clipped into a square.

## D-024 — The grid header is a token, not a Devices decision

v129 inverts every list page's table header: the dark sidebar colour with gold
uppercase labels. Patches, Deployments and Device groups all compute to the
same pair, so it belongs in the `--ui-*` contract rather than in one page's
stylesheet, and setting it lit up every grid in the console at once.

Header and row _heights_ are not global, because the reference's are not: 41px
headers on most grids, 57px on the inventory, rows from 57px to 93px by how
much a row carries. A page that needs its own sets the two custom properties
on its wrapper and they inherit down to the table.

The virtualizer now reads `--ui-row-height` rather than hard-coding 34. That
was not optional: the measured height and the stylesheet must agree or every
row after the first is drawn at the wrong offset, and the token existed to be
changed.

## D-025 — Twenty columns visible, the rest in the chooser

The approved grid shows twenty inventory columns and labels its chooser
"Columns 20". That is a count of what is visible: the contract's `Device`
record also carries compliance, missing patches, critical findings, disk
encryption and risk, and says the catalogue runs to eighty.

So the restored grid shows the approved twenty in the approved order, and
keeps the posture columns available but hidden. Deleting them would have made
an operator leave the inventory to answer "which of these is unencrypted",
which the old grid could answer and v129 answers from its own filters.

Five columns had no data behind them at all — DNS name, DNS server,
architecture, manufacturer, last boot. They are seeded now, derived from what
the fixture already knows rather than invented: the DNS name is the host's own
name in the demo domain, the manufacturer is the first token of the model, and
a last boot is never later than the last check-in.

## D-026 — The primary button is navy, not the gold accent

Every primary button in the console was gold, because `packages/ui` fills the
primary variant from `--ui-accent-strong` and this console's accent is the
brand gold. v129's call-to-action is navy: the page header's `Patch critical`
and the grid's `Deploy` both compute to
`linear-gradient(#24476b, #1b3a5a 55%, #15304c)`.

An accent and a call-to-action are not always the same colour, so the fill got
its own token rather than a different accent: `--ui-button-primary-bg`, with
`-fg` and `-hover` beside it, each falling back to the accent so a console that
sets none of them is unchanged. This console sets the fill to the approved
`--ao-navy` — flat, because the hard rules forbid gradients, and because flat
navy sits inside the range that gradient covers.

This changes Overview and Devices as well. Both were reviewed with the gold
button, so it is called out rather than left to be noticed.

## D-027 — The patch aggregates are rolled up while seeding

`/patches/summary` has to slice a 530,000-row join five ways — by OS version,
by tab, by vendor, by severity and by age. Computed on request it took 7.4
seconds and the browser gave up before it answered. Batching the counts into
conditional aggregation brought it to 4.7s; indexing the outstanding rows and
moving the predicate into `WHERE` brought the narrow queries to about 100ms
each, but the one unavoidable full pass still cost over a second.

Nothing writes to `device_patches` at runtime, so it is sliced once while
seeding into `patch_cells` (7,100 rows) and `patch_device_counts` (359 rows),
and the endpoint reads those. The same request now takes 0.55 seconds.

Two things make this safe rather than a stale cache. Both tables carry
`zone_id`, so a scoped caller's figures are the sum of their own zones' rows —
valid because a device belongs to exactly one zone. And approval, the one
thing an operator does change, is still read live from the 200-row `patches`
table, so a decision never has to wait for a rollup.

A real backend would materialise this the same way, on a schedule. The handover
note says so.

## D-028 — The approved design is square

Every card, panel, KPI tile, button, input, select and nav item in v129
computes to `border-radius: 0`. Checked on Overview, Devices, Patches and
Software, on the containers and on the controls alike. The console's scale was
4px on controls and 11px on cards, so every restored page had rounded corners
where the reference has none.

The scale is now zero. It stays declared rather than being deleted so
components keep referencing `--ui-radius-*` and one change moves them all — a
console built on this library that wants rounded corners sets three values.

This changes Overview, Devices and Patches, all of which were reviewed with
rounded corners, so it is called out rather than left to be noticed. It also
reads on the hard rules' side: "no pill-everything".

## D-029 — Package icons are imported, not shipped

v129's catalogue cards carry real vendor logos, embedded as base64 data URIs.
They are not ours to redistribute, and shipping them would also imply a
relationship with each vendor that nothing here establishes.

The reference answers the question itself. Its header carries an **Import
Icons** action, its `.appicon` class styles a lettered tile for packages with
no image, and the contract's `SoftwarePackage.logoUrl` is documented as a
"same-origin path" that is nullable. The icon is customer data an administrator
imports, not an asset the product ships.

So the restored card renders the monogram tile, every seeded package has
`logoUrl: null`, and the card uses the image the moment one is imported. If the
logos should ship after all, that is a licensing decision, not a design one.

## D-030 — No "Example" marker on deployment rows

v129's Deployments grid labels every row `… · Example`, sets "Example Record"
as the trigger, offers a **Hide Examples** toggle, and footnotes that example
rows are illustrative. That is the reference's fixture distinguishing rows it
made up from rows it means.

Nothing in the contract carries it: `DeploymentSummary` has no such field, and
adding one would mean seeding a subset of our actions as "real" and the rest as
"examples" — a distinction that does not exist in a seeded fixture where every
row is equally illustrative. Inventing it would be fabricating data, which this
project does not do.

So the marker, the toggle and the two footnote sentences about them are left
out, and the first sentence of the footnote — the one about stored per-computer
records — is kept and extended to say why a running action shows fewer results
than computers. If a real deployment can be an "example" (a saved preview that
never executes), that is an API change to propose rather than a design to
restore: see handover-backend.md question 13.

## D-031 — Group membership is materialised, not stated

The fixture used to give each group a `member_count` and no members. Three
things read that number and disagreed with each other: the grid showed it, the
contract's `/groups/{id}/members` had nothing to return, and `resolveTargets`
carried the comment "Groups are fixture metadata rather than materialised
membership" and resolved a group target to no devices at all.

Every group now carries a SQL predicate over `devices`, evaluated once at seed
time into `group_members`. The five figures a group shows — members, online,
offline, missing patches, sub-groups — are counted from that table, so the
member grid and the figures above it cannot drift apart, and a deployment
aimed at a group reaches the endpoints the group says it has.

It costs about 250,000 rows for sixteen groups over 50,000 devices, and one
`UPDATE` with five correlated subqueries to roll up. At real scale a dynamic
group's membership is a query the server runs, not a table it keeps; the
rollup here stands in for that, as D-027 does for the patch summary. See
handover-backend.md 18.

## D-032 — Enrollment methods are product capabilities, with one real state

v129's Enrollment page has a panel of four ways an endpoint can join — Agent
Installer, Directory Auto-Enroll, Imaging & VDI, Bulk Import — each with a
state badge. Nothing in the contract carried it, so `EnrollmentSummary` gains
a `methods` array.

Only one of the four states is a fact about an estate. **Directory
Auto-Enroll** reads `configured` when an identity integration is connected and
`not-configured` otherwise, which the server derives from `integrations`. The
other three are fixed, and that is honest rather than lazy: the agent
installer always works wherever tokens exist, Imaging & VDI is a documented
path with nothing to configure, and nothing in this build accepts a CSV of
serial numbers.

The names and the one-line descriptions are the reference's own copy, read out
of it rather than written here. They are served by the API rather than carried
in the page, because a capability appearing or disappearing is a server fact —
a console that hard-codes four methods cannot ever show a fifth.

## D-033 — A job's seven counters are the tally of its own rows

The contract's `LiveJob` carries a `counts` object with seven per-endpoint
figures beside `targetCount`. The old seed drew `completed` and `failed` from
a random distribution and materialised an unrelated sample of result rows, so
the figure the console showed and the rows behind it disagreed by design.

Now every target of a seeded job has a materialised row in
`live_job_results`, and the seven counters are computed from those rows as
they are written. `targetCount` therefore equals the sum of the counters, and
opening a task shows exactly the endpoints its counters counted. The price is
smaller jobs — 18 to 120 endpoints rather than up to 820 — which is the right
trade: a figure that cannot be checked against its own detail is worse than a
small one that can.

## D-034 — An offline endpoint is queued, not a separate status

`EndpointJobStatus` has both `queued` and `offline`. The approved design shows
an offline endpoint as **QUEUED** with its Connection column reading Offline
and the reason "Device offline · runs at next check-in" — because nothing has
failed: the request is waiting for the agent.

So `offline` is kept for the case it actually names, an agent that did not
answer while the endpoint is not reporting as offline either, and the common
case reads as the reference draws it. Connection is a separate column because
it is a fact about the endpoint, not about the job.

## D-035 — Storage & Mail is read-only in this build

v129's Storage & Mail panel has a Save Settings button. `PUT
/liveops/log-settings` is declared in the contract and unserved, so the
restored panel renders the settings and says so rather than offering a save
that would do nothing. The root path stays `\<ROOT_SERVER>\AegisLogs`: a real
one names a server, and this is a seeded estate.

## D-036 — A device's exposure score is stored, not summed per request

v129 computes each device's exposure live, over an estate of 32 devices. This
estate has 50,000, and the Devices tab ranks all of them by that figure, so
summing it per request would mean a join over `device_vulnerabilities` for
every row of every page.

The formula is the reference's — each open finding contributes its Priority
Rating times a severity weight, raised where the flaw is exploited in the
wild, the total scaled by how much the device matters and capped at 1,000 —
and it is evaluated once, in the seed's roll-up, into `devices.exposure`. The
estate score above the page is the average of that column over the devices
something actually scanned. A device nothing reached keeps 0 and the page
says "Not scanned" rather than reporting it as a clean result.

This is only safe because nothing in this build changes a finding's state at
runtime: the contract declares no write that would move the figure.

## D-037 — The grid sorts on the Priority Rating, not CVSS

The old page sorted findings by CVSS descending. The reference sorts on its
own Priority Rating and shows CVSS as a second, narrower column.

They answer different questions. CVSS says how bad a flaw is in the abstract;
the Priority Rating says how urgently it should be fixed _here_, which is
what an administrator works through. The clearest case in this estate is
CVE-2026-20881: CVSS 9.8 and Priority 9.7, next to a configuration finding
that scores 10.0 on CVSS and nothing like it on priority. `priority` is
therefore a column of its own on `vulnerabilities`, and the spec's default
sort.

## D-038 — "Now" is the server's to know

Age, SLA state and a project's days-to-due are all comparisons against the
current time. Computing them while rendering makes a component's output
depend on when it happened to render, which the console's lint rules forbid
and which would make two screenshots of the same data disagree.

So the server derives `ageDays`, `sla` and `dueInDays` and the page only
reads them. Where the page still needs a day count — "23 d left" beside the
SLA tag — it subtracts two figures the server already measured (the SLA
window and the finding's age) rather than reaching for the clock.

## D-039 — A device's check result is derived; the counts are stored

The reference evaluates 32 computers against 200 checks on every render —
6,400 decisions, which is nothing. This estate has 50,000 endpoints and the
same 200 checks, which is five million, and the Checks grid ranks all 200 by
how many devices fail them while the Devices tab ranks all 50,000 by how many
checks they fail. Neither can be computed per request, and materialising five
million results would make the fixture database an order of magnitude larger
for data nobody reads a row at a time.

So the decision is one SQL expression, `CHECK_PASS_SQL`, used twice. At seed
time it rolls up `pass_count`, `fail_count` and `exception_count` on each
check and `config_fail`, `config_high_fail` and `config_pass_pct` on each
device. At request time the same expression lists the devices behind one
check for the drawer, or the checks behind one device.

The important property is that a count and the rows behind it come from the
same predicate, so they cannot disagree. A counter an administrator cannot
click through to is a counter nobody checks; a counter that disagrees with
what it opens is worse than none.

Where a check names an inventory column — encryption, antivirus, firewall,
pending patches — the answer is read from it, so a device that is genuinely
unencrypted fails the encryption check. The rest are spread over the device
row and the check's position at the reference's own pass rates, with a device
already carrying critical vulnerabilities faring worse, exactly as v129 does.

This is only safe because nothing in this build writes a check result. See
"What is not restored" in `configuration-restoration.md` for what that costs.

## D-040 — The Device Group filter reads a materialised per-group roll-up

The reference's Device Group filter narrows every figure on the page, not
only the rows: pick a group and the overall percentage, the failing-check
count, the four widgets and the grid all report that group. Those counts
cannot be decomposed from the estate-wide ones.

Measured on this estate, a live aggregate over the largest group — Windows
Workstations, 32,761 devices against 120 applicable checks — takes 6.9
seconds. That is not a request.

So `config_check_groups` holds the same three counts per group per check:
2,520 rows for the sixteen groups, which answers in under a millisecond. It
costs 34 seconds on top of a 73-second seed, once.

The alternative was to narrow only the rows and leave the counters reporting
the whole estate, which would have put two different scopes on one screen.

## D-041 — `config_pass_pct` is computed from the check library

The column already existed on `devices` and was filled with a random figure.
The Devices grid showed it, the device detail page showed it, and now the
Configuration page computes the same thing properly — so the three would have
disagreed about the same device.

It is therefore recomputed in the configuration roll-up, from the checks that
apply to that device minus the ones under an exception. The Devices grid and
this page now answer the same question the same way.

## D-042 — The experience score is derived from its measures, not seeded

`dex_score` was a random integer: `78 + rng.int(-28, 20)`, nudged down when
the disk was nearly full. The Devices grid showed it, the device detail page
showed it, and the Overview averaged it — and none of them could say what it
meant, because it was not made of anything.

The approved DEX page is built entirely around the opposite claim. It
publishes the thresholds in a table on the page, and when an administrator
picks an endpoint it shows what that endpoint lost against each one. A score
that cannot be taken apart is a score nobody trusts, and a random one cannot
be taken apart at all.

So `devices` now carries the three measures the score is made of — processor
load, memory pressure and boot time — and `dex_score` is computed from them
and from free disk with the reference's own arithmetic: start at 100, take the
penalties off, then cap by band. The score stays stored, because the estate is
ranked by it and 50,000 rows cannot be scored per request, which is the same
arrangement the configuration roll-up uses and for the same reason (D-039).

The measures are spread from each device's own row through a multiplicative
hash rather than drawn from the seed's random stream. Two reasons. Drawing
them would shift every figure seeded after the estate, which is how the
Deployments status mix once lost its scheduled action. And `rowid % n` on its
own is periodic: a first attempt put exactly 6% of the estate in every bucket
and made the three measures correlate, which a reviewer would have spotted
immediately in the band split. Each measure is now mixed with its own salt
through a large prime.

One consequence worth stating: a band cap is a ceiling, not a deduction, so an
endpoint can show a single −20 against a score of 55. The reference behaves
the same way and does not explain it; the restored panel adds a line naming
the cap whenever a cap is what set the figure.

## D-043 — The inventory attributes are derived, not drawn

The approved Reports grid offers around eighty columns per report, and
twenty-nine of them were attributes the fixture did not keep: asset tag,
chassis, BIOS, TPM, Secure Boot, warranty, subnet, VPN, patch ring and the
rest. The reference synthesises every one of them when it enriches a device
row.

They are filled in by a roll-up from each device's own values rather than
drawn from the seed's random stream, for the two reasons D-042 gives: drawing
them would shift every figure seeded after the estate, and a multiplicative
hash through a large prime spreads them without the periodicity that `rowid %
n` produces.

The alternative was to serve the columns the estate already had and leave
thirty headers blank. A report column with nothing under it is worse than no
column: the grid's whole purpose is that it exports.

## D-044 — The report library's figures are cached for a minute

Each of the twenty cards carries the figure its report would return against
the estate now. Computing them sweeps every source — six hundred thousand
installations, five hundred thousand update results — and takes about five
seconds in total.

Those figures are identical for every reader, which is exactly what the
server's existing `TtlCache` is for, so the catalogue is computed once and
held for a minute. The starred state is per user and costs one indexed read,
so it stays outside the cache and is merged onto the cached cards.

The alternative was to roll the figures up at seed time, as the configuration
counts are (D-039). That would have been faster still, but the configuration
roll-up is there because the counts cannot be computed per request at all,
whereas these can — in five seconds once, rather than per reader. A cache is
the smaller mechanism, and it is the one the server already has.

## D-045 — One delivery model, shown four ways

The approved Aegis Zones page prints the same relationship five times: as a
WAN-saved percentage, a hit rate, a direct-download share, a donut and a
per-zone bar chart. The obvious way to build that is five queries, and the
obvious result is five figures that drift apart.

So the three quantities underneath are columns on `zones` — the seed copy a
zone pulls once, what its peers then serve locally, and what endpoints fetched
straight from central — and every percentage on the page divides two of them:

    hit rate     = local / (local + direct)
    direct share = direct / (local + direct)
    WAN saved    = 1 - (seed + direct) / (local + direct)

WAN saved sits below the hit rate by design: a zone that serves everything
locally still paid for one seed copy across the WAN. A contract assertion
checks both relationships hold, so the page cannot ship with a donut that
disagrees with the counter above it.

A zone with no peer cache serves nothing locally and therefore saves nothing.
Four of this estate's nine zones are in that position, and they report 0% with
"Not required" rather than being hidden — a branch of a thousand endpoints does
not warrant a cache node, and the page should say so rather than imply a fault.

## D-046 — The diagnosis is computed, where the reference hard-codes it

AEGIS Insight is the one page in v129 whose content is a literal. The root
cause `"High Memory Pressure + Low Disk Space + Application Instability"` and
the `"91%"` beside it are strings in the bundle, along with the five check
rows and the three recommendations; the preview returns the same answer for
every endpoint and every description typed into it.

Restoring that verbatim would have meant shipping a page that lies about the
endpoint on screen. So the layout is the reference's and the content is the
endpoint's: ten checks read stored measures — memory, CPU, boot time, free
disk, benchmark failures, open critical findings, outstanding updates, pending
restart, endpoint protection, disk encryption — and the root cause names the
three worst findings.

Confidence is the sum of the findings' severity weights, capped at 94:

    critical 34 · high 24 · medium 13 · low 5     confidence = min(94, Σ)

The cap is the honest part. A correlation across ten measures is not
certainty, and no run should print 100%. An endpoint whose every measure is
inside its threshold gets no root cause at all and an empty actions panel,
which the reference has no state for, because the reference never had to
consider one.

The problem description steers which family of checks is weighted — "slow" and
"boot" raise the performance checks, "crash" the stability ones — but it
cannot create a finding the measures do not support. A contract assertion
holds the line: the root cause may only name checks that failed.

## D-047 — A remediation is a job, not a session

**Run Remediation** submits work and returns a job id. It does not open a
shell, a remote desktop, or anything else interactive, and there is no
"watch it run" view — the result appears under Live Activity like any other
job, and the button reads "Remediation queued" afterwards.

This is the same boundary every other action in the console observes, and it
is the reason the recommendations carry an `expected` figure ("+5 DEX
points") rather than a progress bar: the page states what the action should
achieve and then hands it to the job pipeline.

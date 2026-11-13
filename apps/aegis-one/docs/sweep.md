# The side-by-side sweep

Step 5 of the brief: every page screenshotted in v129 and in the restored
build, at the same viewport, with the remaining differences listed.

- **Viewport**: 1680 × 1400, full page, Chrome.
- **Captures**: `screenshots/sweep/v129-<id>.png` and
  `screenshots/sweep/build-<id>.png`, plus `screenshots/sweep/build-signin.png`.
- **Comparison**: structural, not pixel. Each page's `h1`, panel headings,
  tabs, table columns and actions were extracted from both builds with the
  same script and diffed. A pixel diff would have reported every figure on
  every page, because the two estates are different sizes — v129 runs 32
  endpoints, this fixture runs 50,000.

## The result

**All nineteen pages match structurally.** Every page's title, panels, tabs
and table columns are present in the restored build, in the reference's own
wording.

Three real differences were found by this sweep and fixed before it was
written up:

| Page          | Difference                                                                     |
| ------------- | ------------------------------------------------------------------------------ |
| Device groups | The member grid was missing the reference's ninth column, **Manage**.          |
| Device groups | The group's kind badge read `dynamic` where the reference reads `Dynamic`.     |
| DEX           | The lowest-scores grid read `Disk free` where the reference reads `Disk Free`. |

## The SSO login screen cannot be compared

The brief asks for the SSO login screen alongside the pages. **v129 does not
contain one.** The reference is a signed-in console: there is no `login`,
`signin`, `sso` or `auth` page id, and `window.AegisApproved` exposes no
auth-related state at all.

So the build's sign-in screen — captured as `build-signin.png` — has no
approved design to be restored against. It was not designed from v129 and
cannot be verified against it. If an approved sign-in design exists
elsewhere, it has not been supplied; if it does not, the current screen is an
original and should be reviewed as one.

## What the diff reported that is not a difference

Four classes of noise, recorded so the next person running this does not
chase them:

- **Chrome outside `<main>`.** Back, Home, the breadcrumb and the avatar sit
  outside the main region in the restored build, so a `main`-scoped
  extraction misses them. They are present on every page.
- **Counters as buttons.** v129 renders its KPI tiles as `<button>`; the
  restored build renders them as `<div>` unless they filter something. Both
  print the same labels.
- **Figures.** Every number differs, because the estates differ: 32 endpoints
  against 50,000, 22 group members against 32,710. The sweep compares
  structure for exactly this reason.
- **Hidden strings.** v129's `<h1>` on Reports contains a `20` badge and on
  AEGIS Insight a `PREVIEW` badge, both `display: none`. The restored pages
  correctly omit them, so a text comparison of the `h1` reports a difference
  that is not one. The same applies to the four hidden strings on
  Administration, the hidden subtitle on Peer Cache, and the hidden footnote
  on Insight.

## One stale reading, worth recording

An intermediate run of the comparison reported the Vulnerabilities page as
carrying four unfamiliar panels — "Findings by Severity", "Risk Drivers",
"Findings", "Affected Endpoints" — none of which the restored build has. The
full-page capture shows the reference's Vulnerabilities dashboard carrying
exactly the six panels the restored build carries: Open Findings Trend, SLA
Status, Top Priorities, Vulnerability Age, Top Fixes Out of Compliance and
Threat Indicators.

The reading came from driving the reference through nineteen `setState` calls
in sequence without waiting long enough on that one. It is noted because a
future sweep will hit it again: give the reference a settle before reading it,
and trust the capture over the extraction.

## What this sweep does not cover

- **Sub-tabs and drawers.** Each page was captured in its default state. The
  tabbed pages — Patches, Configuration, Integrations, Administration, Live
  Activity, Vulnerabilities, Device groups — have their own per-tab captures
  in the page restoration notes beside this file.
- **Interactive states.** Dialogs, menus, empty states and error states are
  covered by the e2e suite rather than by screenshots.
- **Pixel fidelity.** Spacing, type scale and colour were matched by the
  stylesheet work and are checked by `scripts/check-colors.mjs`, which fails
  on any hex that is neither on the approved list nor present in v129.

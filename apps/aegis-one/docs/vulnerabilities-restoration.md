# Vulnerabilities — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the Risks
workspace (page id `vulns`).

|              |                                      |
| ------------ | ------------------------------------ |
| Reference    | `screenshots/vulns-v129.png`         |
| Findings     | `screenshots/vulns-findings.png`     |
| Devices      | `screenshots/vulns-devices.png`      |
| Remediations | `screenshots/vulns-remediations.png` |
| Projects     | `screenshots/vulns-projects.png`     |
| Scans        | `screenshots/vulns-scans.png`        |
| Drawer       | `screenshots/vulns-drawer.png`       |

## What was there before

One grid. `ResourceList` over `/vulnerabilities` with nine columns — CVE,
Title, Severity, CVSS, Open on, Remediated, Affects, Fixed by, Published —
two filters, and a drawer of seven definition-list rows.

The approved page is a summary line of four figures, six KPI cards, a
six-widget dashboard and five tabs. None of that existed.

## What the page is now

A head with the title and a summary line whose every figure is a button into
the grid below it, then:

**Six KPI cards**: Exposure Score (/1000 with its grade), Open Findings,
Critical & High, Known Exploited, SLA Overdue, Scan Coverage. Each one
filters the Findings grid to exactly the rows it counted, or opens the
Devices tab.

**Six dashboard widgets**, in the reference's own order and spans — two
columns, one, two, one, two, one:

| Widget                      | Form                                     |
| --------------------------- | ---------------------------------------- |
| Open Findings Trend         | twelve weeks, stacked by severity        |
| SLA Status                  | Within / Due soon / Overdue, bars        |
| Top Priorities              | six rows, highest Priority Rating first  |
| Vulnerability Age           | four buckets, columns                    |
| Top Fixes Out of Compliance | six rows, ranked by devices missing them |
| Threat Indicators           | the eight flags, bars                    |

**Five tabs** — Findings, Devices, Remediations, Projects, Scans — as five
equal bands with the active one inverted, matching Live Activity and the rest
of the restored console.

The **Findings** grid carries the reference's ten columns: Severity,
Priority, CVSS, Finding, Threats, Detection, Devices, Age, SLA, State. Above
it sit the search box, seven filters (Severity, Platform, Detection, Threat,
Status, SLA, State) and a row of threat chips with their own counts, then the
finding count. Clicking a row opens the drawer.

The **Devices** grid ranks the estate by exposure, with Device, IP Address,
Device Criticality, Exposure (0–1000), the four severity counts, Scan Method
and Last Scan. **Remediations** is a fix per row, not a CVE: Remediation,
Highest Severity, Findings Fixed, Devices, Risk Reduced, Fix Type.
**Projects** is a card per project with owner, due date and progress.
**Scans** is the nine-column history with New Scan above it.

## The contract already described all of it

As with the five pages before this one, the OpenAPI contract was modelled
from v129 in Phase 1 and already declared `/vulnerabilities/summary`,
`/findings`, `/findings/{id}`, `/devices`, `/remediations`, `/projects` and
`/scans` with its POST. The server served none of them: it served
`/vulnerabilities` as a flat table the contract does not mention, and the
page read that.

`VulnerabilitySummary` in particular declares `exposureScore`, `grade`,
`scanCoverage`, `trend`, `sla`, `age`, `topPriorities`, `topFixes` and
`threatIndicators` — the six KPI cards and the six widgets, named. Nothing
had been built to serve it.

## Additive schema changes

Five, all additive; nothing was removed or renamed in the contract.

- **`Finding`** gained `confidence`, `family`, `solution`, `fixType`, `port`,
  `firstDetectedAt`, `lastDetectedAt`, `slaDueAt`, `projectId` and
  `acceptedReason`; `detection` gained its three values and `threats` went
  from two indicators to the reference's eight.
- **`VulnerableDevicePage`** items gained `ip`, `site`, `criticality` and
  `scanMethod`.
- **`RemediationPage`** items gained `highestSeverity`, `fixType`,
  `riskReducedPct` and `cves`.
- **`Scan`** gained `name`, `template`, `schedule`, `durationLabel` and
  `findingsFixed`; the template enum moved into a shared `ScanTemplate`.
- **`VulnerabilitySummary.trend`** points gained per-severity counts, and
  **`VulnerabilityProject`** gained `dueInDays`.

## Judgement calls

Three, recorded in `decisions.md`:

- **D-036** — a device's exposure score is stored rather than summed per
  request. The reference computes it live over 32 devices; this estate has
  50,000 and the Devices tab ranks all of them by it.
- **D-037** — the grid sorts on the Priority Rating, not CVSS. They answer
  different questions, and the reference sorts on priority.
- **D-038** — "now" is the server's to know. Age, SLA state and days-to-due
  are derived server-side rather than from the clock during render.

## What is not restored

- **Accepting a risk.** The drawer's "Accept Risk (90 days)" and "Re-open
  Risk" are absent: nothing in the contract writes a finding's state, and a
  write would invalidate the stored exposure score. One finding is seeded as
  accepted so the State filter has something to show.
- **Remediating from this page.** The reference's Remediate dialog is Patch
  Management's deployment flow under another name. Each patchable
  remediation row links there instead of growing a second pipeline.
- **New Project and Add to project.** No endpoint is declared.
- **The column chooser and column resizing** on the Findings grid. The
  reference lets an administrator hide and drag-resize its ten columns and
  remembers that in local storage. The restored grid shows all ten.
- **The page-level Site and Platform scope bar.** It is defined in v129's own
  source and never rendered by its `render()`, so there was nothing to match.
- **The Customize Widgets dialog**, for the same reason: v129 builds the
  dialog and the sixteen-widget library, then renders a fixed six.
- **Export CSV.** The header's export button is not rebuilt; the console's
  own export lives on `DataTable`, and this grid is hand-drawn.
- **The per-widget view and chart-type selectors.** Each of the six widgets
  carries two dropdowns in the reference — a view (the trend's By Severity /
  By Platform / By Detection / Total, SLA's All / Critical only / High only,
  Top Priorities' severity, Top Fixes' platform) and a chart form (Column,
  Bar, Donut, Line). The restored widgets draw the default view in the
  default form. Three of those views also need series the summary does not
  carry: trend by platform and by detection are not in
  `VulnerabilitySummary`.

## Geometry read back from the reference

The first side-by-side showed five differences, all since corrected: the KPI
cards are six separate cards with 14px gaps, not one strip, and the Exposure
Score leads them on a dark card under a 3px gold rule; the tabs are
left-aligned with a 3px underline on the active one, not five inverted
bands; every grid and mini-table header is a near-black band with white
uppercase labels; each widget title carries a 3px gold rule and 12px of
padding, with a link out where the reference has one; and the severity ramp
on this page is red, dark amber, amber, slate — which is not the ramp the
restored Patch Management uses, because that page's own ramp in v129 is
different. The Vulnerability Age columns take the reference's four warm
steps, which added `sand` and `amber` to the shared figure tones.

## One deviation worth stating

In the trend chart the week's figure sits at the top of its column rather
than directly above the bar. The console forbids inline styles — geometry
goes into SVG attributes, so a stylesheet keeps sole say over the pixels —
and floating a label at a data-driven height is the one thing that rule
cannot express. The bars themselves are exact.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

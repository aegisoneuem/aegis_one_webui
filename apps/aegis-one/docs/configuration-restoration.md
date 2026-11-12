# Configuration Compliance — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the
Configuration workspace (page id `profiles`).

|                     |                                        |
| ------------------- | -------------------------------------- |
| Reference           | `screenshots/config-v129.png`          |
| Reference, Profiles | `screenshots/config-v129-profiles.png` |
| Overview            | `screenshots/config-overview.png`      |
| Checks              | `screenshots/config-checks.png`        |
| Devices             | `screenshots/config-devices.png`       |
| Exceptions          | `screenshots/config-exceptions.png`    |
| Benchmarks          | `screenshots/config-benchmarks.png`    |
| Profiles            | `screenshots/config-profiles.png`      |
| Drawer              | `screenshots/config-check-drawer.png`  |

## What was there before

One grid. `ResourceList` over `/profiles/checks` with seven columns — Check,
Benchmark, Severity, Platform, Passing, Failing, Exceptions — and two
filters. Behind it sat a `config_checks` table of 200 rows built by cycling a
list of 28 titles with a `(2)`, `(3)` suffix, each with a random pass count, a
random fail count and a single `benchmark` string.

Nothing tied a check to a device. The Devices tab, the per-check device list,
the exceptions, the benchmarks and the profiles did not exist, and neither did
the categories, the expected values or the framework mapping that three of the
reference's six tabs are built on.

## What the page is now

A head with the title and Evaluate Now, six tabs, and a filter bar of a search
box and six selects — Framework, Platform, Device Group, Category, Severity,
Result — with removable chips and Clear All beneath it.

**Five counters**: Overall Compliance, Checks in Scope, Failing Checks,
Non-Compliant Devices (count over the evaluated estate) and Exceptions. Four
of the five open the tab or the filtered grid they counted.

**Four widgets and a table**, in the reference's own spans — three across, then
one full width, then the grid:

| Widget                  | Form                                                   |
| ----------------------- | ------------------------------------------------------ |
| Compliance by Framework | four columns against a 90% target                      |
| Compliance by Platform  | three columns, with each platform's device count       |
| Device Compliance       | donut over the three bands, 90+ / 75–89 / below 75     |
| Compliance by Category  | twenty-one columns against the same target             |
| Top Failing Checks      | ten rows, high severity first, then by devices failing |

**Six tabs** — Overview, Checks, Devices, Exceptions, Benchmarks, Profiles —
as six equal bands with the active one inverted under a 3px gold rule.

The **Checks** grid carries the reference's columns: Check, Platform,
Severity, Expected, Frameworks, Pass, Fail, Exc., Compliance, paged fifty at a
time through the 200. Clicking a check, or its failure count, opens the
drawer.

The **Devices** grid ranks the estate worst-first with Device Name, OS,
Location, User, Compliance, Failed, High Failed, Exceptions and Last
Evaluated. **Exceptions** is the check, its scope, the reason, the expiry and
who granted it. **Benchmarks** is the six benchmarks with their checks,
assignment, devices and compliance. **Profiles** is the reference's second
screen: Security Posture over three control rings, the Configuration
Compliance donut, the Version History table, and the profile grid behind four
platform bands.

The **check drawer** carries the reference's six facts — Expected, Severity,
Compliance, Frameworks, Pass · Fail · Exception, Remediation — then the
devices evaluated against it with their actual values, failures first. The
**device drawer** carries its four figures and every check it fails.

## The contract already described all of it

As with the six pages before this one, the OpenAPI contract was modelled from
v129 in Phase 1 and already declared `/configuration/summary`, `/checks` with
its POST, `/devices`, `/exceptions` with its POST, `/benchmarks`, `/profiles`
with its POST and `/evaluate`. The server served none of them: it served
`/profiles/checks`, a flat table the contract does not mention, and the page
read that.

`ConfigurationSummary` names the five counters outright — `overallPct`,
`checksInScope`, `failingChecks`, `nonCompliantDevices`, `exceptions` — and
then `byFramework`, `byPlatform`, `deviceBands`, `byCategory`, `topFailing`
and `posture`, which are the four widgets, the table and the Profiles tab's
Security Posture. Nothing had been built to serve it.

## The check library is extracted, not retyped

The 200 checks — 120 Windows, 40 macOS, 40 Linux, which is the figure the
Checks in Scope counter reports — are pulled out of the reference by a script
and written to `mock-server/src/seed/config-catalog.ts`. So are the twenty-one
categories and the framework mapping each category carries, along with the
reference's own two derived rules: a high-severity check whose title names one
of the dozen critical controls is raised to STIG CAT I, and eight checks whose
fix cannot be pushed are marked manual.

Transcribing 200 rows by hand would have guaranteed drift. This cannot drift.

## Additive schema changes

Six, all additive; nothing was removed or renamed in the contract.

- **`ConfigCheck`** gained `expected`, `passing`, `exceptions` and
  `remediation` — the Expected column, the Pass and Exc. columns, and the
  drawer's Automatic or Manual.
- **`ConfigDevicePage`** items gained `os`, `site`, `user`, `highFailing` and
  `exceptions`, which are five of the Devices tab's nine columns.
- **`ConfigException`** gained `checkTitle` and `grantedAt`, and `expiresAt`
  became nullable for one granted with no expiry.
- **`Benchmark`** gained `platform` (null for one that applies to every
  platform), `assignedGroupId`, `assignedTo` and `devices`.
- **`ConfigurationSummary.posture`** gained `controls` and `evaluatedDevices`,
  which is the Security Posture panel's three rings and its denominator.
- Three detail paths were added: `GET /configuration/checks/{checkId}`,
  `/devices/{deviceId}` and `/profiles/{profileId}`, with
  `ConfigCheckDetail`, `ConfigDeviceDetail` and `ConfigProfileDetail`. The two
  drawers and the Version History panel had no endpoint to read.

## Judgement calls

Three, recorded in `decisions.md`:

- **D-039** — a device's result for a check is derived, and the counts are
  stored. The reference evaluates 32 computers live; this estate has 50,000
  and a library of 200. The same SQL expression rolls the counts up at seed
  time and lists the devices behind a check on demand, so a figure and the
  rows behind it cannot drift apart.
- **D-040** — the Device Group filter reads a materialised per-group roll-up.
  It narrows every figure on the page, not only the rows, and the counts
  cannot be decomposed from the estate-wide ones. A live aggregate over the
  largest group takes seven seconds; the roll-up costs 34 seconds once at seed
  time and answers in under a millisecond.
- **D-041** — `config_pass_pct` is now computed from the check library. It
  used to be a random figure, so the Devices grid, the device detail page and
  this page disagreed about the same device.

## What is not restored

- **Add Exception and + Custom Check.** The contract declares both POSTs, but
  a write would invalidate the stored roll-up — the estate-wide counts, the
  per-group counts and every device's `config_pass_pct` — and recomputing them
  takes a minute and a half. One exception is seeded instead, so the
  Exceptions tab and the Exc. column have something real to show.
- **The Checks tab's selection column and Remediate Selected.** The reference
  selects failing checks and opens a deployment of kind `remediate`. No
  endpoint accepts one, and this is Patch Management's pipeline under another
  name, as it was on the Vulnerabilities page.
- **+ Create Profile**, for the same reason: `POST /configuration/profiles` is
  declared and not served, and a profile that cannot be written is a button
  that cannot work.
- **Rollback to v7** on the Version History panel. Nothing writes a profile
  version.
- **The Benchmarks tab's Assigned To select.** The reference lets an
  administrator reassign a benchmark to a device group from the grid. The
  column shows the assignment; changing it has no endpoint.
- **Export and the header's overflow menu.** The reference collapses Export
  and + Custom Check behind a `…`; the console's own export lives on
  `DataTable`, and this grid is hand-drawn.

## Geometry read back from the reference

Every figure in `Configuration.module.css` was read from v129's computed
styles rather than guessed: the tab band is 52px with `inset 0 -3px 0` in the
gold highlight under the active one; the filter bar pads 12px/14px inside a
1px rule with a 10px gap and 11px uppercase labels over 36px selects; the five
counters sit on a 13px gap with a 13.5px sentence-case label over a 28px
figure; panels pad 18px/20px under a title with a 3px gold rule and 10px of
padding.

Two things differ from the restored Vulnerabilities page because the reference
itself differs:

- **The grid header is gold on near-black here**, not white on near-black.
  v129 computes this page's `th` colour to the gold highlight.
- **The counters are five plain white cards** with sentence-case labels. The
  Vulnerabilities page leads with a dark card and uppercase labels; this one
  does not.

A check also has no Critical step, so this page's severity ramp is three deep:
red, dark amber and blue. Blue reads as "recorded, not urgent" where a third
warm step would read as a milder warning.

## Two figures that are honest and flat

**Failing Checks reads 200 of 200.** On an estate of 50,000 endpoints every
check in the library fails somewhere — the smallest failure share in the
library still lands on hundreds of devices. The reference's 165 of 200 is an
artefact of evaluating 32 computers. The counter is truthful and uninformative
at this scale; the Device Group filter is what makes it mean something again
(the Pilot Ring's 400 devices give 191 of 200), and the per-check Compliance
column is the ranking that actually orders the work.

**Non-Compliant Devices reads 49,399 of 49,542.** A device is non-compliant
below 90%, and with about 120 applicable checks at roughly a 4-in-5 pass rate
almost every device fails something. The reference shows 28 of 32, which is
the same 88% shape; the concentration is what a larger sample does. The
informative figure is the band distribution in the Device Compliance donut,
not the counter.

Both are raised as handover questions 33 and 34 rather than tuned to look
better.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

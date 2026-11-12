# Patch Management — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, Patches page.

|           |                                  |
| --------- | -------------------------------- |
| Reference | `screenshots/patches-v129-*.png` |
| Restored  | `screenshots/patches-*.png`      |

## What the page is now

One page with eight tabs, in the reference's own order: **Overview**, **Patch
Policies**, **Windows**, **macOS**, **Linux**, **Third-Party Apps**,
**Drivers & BIOS**, **All Patches**. The tab lives in the URL, so a tab is a
link someone can paste into a ticket.

The heading carries the eyebrow, the title "Patch Management", the one-line
description and two actions — `Patch Policies`, which switches tab, and
`+ Patch critical (n)`, which counts _updates_ rather than endpoints: the same
update outstanding on 1,600 machines is still one update to approve.

### Overview tab

Four counters — Patch Compliance, Devices Missing Patches, Missing Critical,
Average Patch Age — then three charts (Compliance by OS Version, Missing by
Severity, Missing Patch Age) and two tables (Top Missing Patches, Devices
Needing Attention). Each chart carries the reference's own chart-type menu.

### The catalogue tabs

Each has its own four counters, the severity segmented control, Vendor and
Released filters, and the approved column set:

| Tab                                 | Columns                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Windows · macOS · Linux · 3rd-party | Update · Vendor · Severity · Released · Applicable · Remediated · Approval · ring |
| Drivers & BIOS                      | Update · Type · Severity · Released · Applicable · Installed · Approval           |
| All Patches                         | Update · Type · Severity · Released · Applicable · Remediated · Approval · ring   |

Windows and Linux also carry the OS-version chip row; Drivers & BIOS carries
All / BIOS & Firmware / Drivers / Awaiting Approval. All Patches carries seven
counters rather than four.

A superseded update is drawn in `--st-neutral` with "by KB…" under its state,
and offers no action: it is history, not work.

## Again: the contract already described this page

`/patches/summary`, `/patches`, `/patches/{id}/approval` and `/patch-policies`
were all declared and **none of them was served**. `/patches` existed only as a
generic row list. All four are implemented now.

### What the contract was missing, and what was added to it

The contract was modelled from v129 in Phase 1 but did not carry everything the
page shows. These were added rather than invented in the page:

| Added to                   | Field                                                                                                                                      | Why                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `Patch`                    | `subcategory` (bios/driver)                                                                                                                | The Drivers & BIOS tab splits the two         |
| `Patch`                    | `approval: superseded`, `supersededBy`                                                                                                     | v129 shows "Superseded by KB…" as a state     |
| `Patch`                    | `ring`                                                                                                                                     | The column is "Approval · ring"               |
| `Patch`                    | `remediated`, `zeroDay`                                                                                                                    | A grid column and an All Patches counter      |
| `PatchPolicy`              | `patchCount`                                                                                                                               | The Content cell reads "49 patches"           |
| `PatchSummary`             | `installed`, `missing`, `devicesTotal`, `devicesMissing`, `criticalDevices`, `criticalUpdates`, `averageAgeDays`, `devicesAwaitingRestart` | The four Overview counters and their sublines |
| `PatchSummary`             | `vendors`, `tabs`, `policies`                                                                                                              | The Vendor filter and the per-tab counters    |
| `PatchSummary.byOsVersion` | `platform`, `endpoints`                                                                                                                    | The OS-version chips carry a count            |
| `/patches`                 | `subcategory`, `vendor`, `osVersion`, `releasedAfter` parameters                                                                           | The tab's own filters                         |

`vendor` is the caller's name for `Patch.source`; `osVersion` is the only one
that is not a column at all — it asks for the updates outstanding on endpoints
running that build, which is a join, so it resolves to a list of ids before the
column allowlist sees it.

## The figures are rolled up at seed time

The device/patch join is half a million rows and the page wants it sliced five
ways. Computed on request it took **7.4 seconds**, and the browser abandoned it
before it answered.

`device_patches` is immutable at runtime, so it is sliced once while seeding
into two small tables — `patch_cells` (7,100 rows: pair counts by zone, OS
version, tab, vendor, severity and state, with the age buckets) and
`patch_device_counts` (359 rows: the distinct endpoint and update counts, which
cannot be added up from the cells because one endpoint appears in many). Both
carry `zone_id`, so a scoped caller's figures are the sum of their own zones'
rows — valid because a device belongs to exactly one zone.

The same request now takes **0.55 seconds**. Approval, which an operator does
change, is still read live from the 200-row `patches` table, so the two cannot
drift.

Ages are measured against the seed's own clock rather than the wall clock,
which also makes the age chart reproducible.

## The seed grew a real catalogue

The fixture had 31 patches with no vendor, no approval state and no
supersession. It now has 198: eight months of Windows cumulative updates per
servicing branch (each month superseding the one before), .NET, servicing-stack,
Defender and MSRT series, macOS point releases, Red Hat and Canonical
advisories, three versions of every third-party title, and six firmware updates.
139 are superseded, which is what gives the All Patches tab its counter.

Severities moved to the contract's `critical/high/medium/low`, which removes the
vendor-vocabulary mapping the Overview aggregate had been carrying.

Two further fixture corrections:

- **Patch lag per OS.** Every OS version read 95% compliant, because the seed
  drew outstanding patches at one flat rate. Servers wait for a change window
  and the older desktop builds are the ones nobody has got to; the rate is now
  multiplied per OS, and the estate reads 81%–95%. Without it the Compliance by
  OS Version chart said nothing.
- **One spelling per vendor.** The OS series said "Microsoft" while the software
  catalogue said "Microsoft Corporation", so the Vendor filter listed Microsoft
  twice.

## The primary button was the wrong colour, everywhere

v129's call-to-action — the page header's and the grid's `Deploy` alike —
computes to `linear-gradient(#24476b, #1b3a5a 55%, #15304c)`. The console's
`--ui-accent-strong` is gold, so every primary button in every restored page
was gold.

`packages/ui` gained `--ui-button-primary-bg`, `-fg` and `-hover`, each falling
back to the accent, and the console sets the fill to the approved `--ao-navy`.
Gradients are out under the hard rules, and flat navy sits inside that
gradient's range. This changes Overview and Devices too — both were reviewed
with the gold button. See `decisions.md` D-026.

## Present in v129, not in the restored build

| Missing                              | Why                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Global Settings` sub-tab contents   | **Closed.** All seven panels are restored, and `GET`/`PUT /patches/settings` is declared and served. See below.                                                                                   |
| Policy row `…` menu                  | Run now, suspend and edit. `/patch-policies` is read-only in the contract; rendering the menu would be three buttons that do nothing.                                                             |
| `New Policy` and `Open`              | **Closed.** Create, detail, suspend/resume and delete are declared and served; the row menu carries Suspend, Copy and Delete beside Open.                                                         |
| Remediated counts on superseded rows | v129 shows a superseded update still remediated on its estate. The fixture has no record of installs from before it was replaced, so these read 0 rather than a number nobody computed.           |
| The age spread                       | v129 spreads outstanding updates across the 8–14 and 15–30 day buckets. Ours concentrates in 0–7 d, because an update is outstanding only while it is current. The figures are the fixture's own. |

## Library changes this needed

- `--ui-button-primary-bg`, `-fg`, `-hover` on `Button`, all with fallbacks.
- `Donut` gained `stack`, which puts the legend under the ring. In a
  one-column panel there is no room beside it and the labels truncate.

The page-level tab strip and the severity segmented control are in the page's
own stylesheet rather than in `@aegis/ui`: only this page uses them so far, and
promoting either means adding to the token contract. If a second page asks for
the same strip, that is when it should move.

## Global Settings, restored

The third sub-tab under Patch Policies, with the reference's seven panels:
System Health Policy, Device Controls, Group Overrides, OS Versions &
Upgrades, Default Rings, Maintenance Window & Restarts, and Approval &
Third-Party Apps — about twenty-five controls in all.

Nothing was declared for any of it, so `PatchSettings` and
`GET`/`PUT /patches/settings` were added.

### The thresholds store a rule, not a verdict

The three numbers at the top of System Health Policy are the point of the
panel. They do not store "25 endpoints are highly vulnerable" — they store
_what makes_ an endpoint highly vulnerable, and the four counters beside them
are counted against the devices table every time the page is read. Change a
threshold, save, and the counters move. A contract assertion checks the three
bands add up to the fleet; lowering the thresholds in the check takes the
highly-vulnerable count from 1,131 to 20,876.

### A disagreement this surfaced

The **Highly Vulnerable** counter above the policies table read **14,107**
while the panel below it read **1,131**. Two figures with the same name on one
screen, computed from different rules: the counter came from a materialised
patch roll-up, the panel from these thresholds.

The panel defines the term, so the counter now follows it. A contract
assertion and an e2e test both require the two to match.

### What the reference does not settle, and what was decided

v129 says **"Saved in this browser (preview)"** under this sub-tab, twice. Its
settings persist nowhere — which is honest about a static mock and useless as
a product. These are saved on the server: a patch default that lives in one
administrator's browser is not an estate-wide default, and the next
administrator to open the page would see something else. Recorded as D-058.

### Three fixture corrections the panels forced

- **The rings targeted groups that did not exist.** The reference's own group
  ids belong to its fixture; every ring read "0 endpoints" until they pointed
  at this console's groups.
- **The OS lifecycle table joined nothing.** It was keyed on vendor names
  ("Windows 11", "Ubuntu") while every device reports `os_family` and
  `os_version` ("Windows", "24H2"), so the Vendor Support column was a column
  of dashes.
- **The exclusion and override pickers need real sources.** Excluded patches
  come from the catalogue and overrides from the device groups, so neither can
  name something the estate does not have.

### What is not restored

- **Group Overrides adds a row but has no editor.** `+ Add Override` appends a
  row with the estate default; the reference gives no form for choosing a
  window or a restart rule per group. See handover question 70.
- **Nothing acts on these settings yet.** They are stored and read back, and
  the health thresholds genuinely drive the counters — but no deployment
  consults the rings, the maintenance window or the approval policy. See
  handover question 71.

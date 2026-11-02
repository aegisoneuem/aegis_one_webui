# Devices — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, Devices page.

|                              |                                          |
| ---------------------------- | ---------------------------------------- |
| Reference                    | `screenshots/devices-v129-reference.png` |
| Restored                     | `screenshots/devices.png`                |
| Offline rows, scrolled right | `screenshots/devices-offline.png`        |

## What the page is now

Title and actions, four counts, the toolbar, the grid, its pager, and the
footnote — the reference's own order.

The grid header is inverted: the dark sidebar colour with gold uppercase
labels at 11px/650 and 0.6px tracking. That is not a Devices decision; v129
renders **every** list page's header that way (Patches, Deployments and Device
groups all compute to `#20272d` on `#ecc57c`), so it lives in the token
contract and every grid in the console picked it up.

Rows are 67px with 17px of vertical padding, and the first column is pinned
while the other nineteen scroll. An endpoint that has not checked in is drawn
in `--st-neutral`, so a stale row reads as stale rather than as current fact.

### The twenty columns, in the reference's order

Computer Name · OS · IP Address · Hostname · MAC Address · DNS Name ·
Location · User · Status · Last Seen · OS Version · Department ·
Computer Type · Manufacturer · Model · Serial Number · RAM (GB) · Last Boot ·
Agent Version · DNS Server

Nine more sit in the column chooser, off by default: Architecture, Enrolled,
Compliance, Missing Patches, Critical CVEs, Disk Encryption, Disk Free,
DEX Score, Config Pass, Processor. The reference labels its chooser
"Columns 20", which counts what is _visible_; the contract's own `Device`
record carries the posture fields and says the catalogue runs to 80.

## Again: the contract already described this page

`components.schemas.Device` is v129's column list almost exactly — `name`,
`os`, `ipAddress`, `hostname`, `macAddress`, `dnsName`, `location`, `user`,
`status`, `lastSeen`, `osVersion`, `department`, `computerType`,
`manufacturer`, `model`, `serialNumber`, `ramGb`, `lastBoot`, `agentVersion`,
`dnsServer`. `DevicesSummary` is the four counts above the grid, field for
field.

Five of those columns had nothing behind them, so the schema, the seed and the
column allowlist gained `dns_name`, `dns_server`, `architecture`,
`manufacturer` and `last_boot_at`. None is invented data: the DNS name is the
host's own name in the demo domain, the manufacturer is the first token of the
model (every catalogue entry is "Dell Latitude 5450", "HPE ProLiant…"),
architecture follows the processor, and a last boot is never later than the
last check-in.

`GET /devices/summary` was declared and unserved. It is implemented, and it
follows the grid's search term — a count that ignored the search would
contradict the list underneath it.

## Present in v129, not in the restored build

| Missing                                              | Why                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Advanced Filter`                                    | The contract declares `?filter=` as a JSON array of `{field, op, value}`. The server implements plain column equality only, and the builder UI is a page's worth of work in itself. |
| `All Groups`                                         | Needs device-to-group membership. Groups are rule metadata in the fixture; `groups.member_count` is a number, not a set.                                                            |
| `Saved Views` as a dropdown in the first toolbar row | The feature exists and works, rendered in the actions group rather than as its own control.                                                                                         |
| `Columns 20` count badge                             | The chooser button carries no count. The footnote reports visible-of-total instead.                                                                                                 |

## The field names are still the mock server's, not the contract's

The contract calls them `name`, `os`, `ipAddress`, `user`, `location`,
`lastSeen`, `computerType`, `serialNumber`, `processor`. The server projects
`hostname`, `osName`, `ip`, `primaryUserName`, `zoneName`, `lastSeenAt`,
`kind`, `serial`, `cpu`.

The five columns added here use the contract's names, because they are new and
nothing else reads them. The older ones are read by DeviceDetail, Dex,
PeerCache, DeploymentDetail, the load test and the ZAP plan, so renaming them
is a migration of its own rather than something to fold into a page
restoration.

One trap for whoever does it: the contract's `name` is the computer name and
its `hostname` is the DNS short name. The server's `hostname` currently means
the _computer_ name. A blind rename would silently swap two fields that both
exist and both hold a plausible-looking string.

## Library changes this needed

`packages/ui` gained four things, all of them generic:

- `--ui-table-head-bg`, `-fg`, `-fg-strong`, `-border`, `-height`, `-size`,
  `-weight`, `-tracking`. Every one falls back to the old look, so a console
  that sets none of them is unchanged.
- `rowClassName`, so a page can mark state the table has no opinion about.
- The virtualizer now reads `--ui-row-height` instead of hard-coding 34px. It
  had to: the two must agree or every row after the first is drawn at the
  wrong offset, and the token was already there to be changed.
- `AppShell`'s content area is a flex column, so a page that wants to fill the
  viewport and scroll its own grid can say so. Pages that simply grow are
  unaffected.

Header and row heights are deliberately **not** global: v129 runs 41px headers
on most grids and 57px on the inventory, with rows from 57px to 93px depending
on what a row carries. Devices sets its own on its wrapper and they inherit
down.

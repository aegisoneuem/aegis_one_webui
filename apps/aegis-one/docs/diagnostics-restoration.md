# Diagnostics — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the
Diagnostics workspace (page id `diagnostics`).

|           |                                    |
| --------- | ---------------------------------- |
| Reference | `screenshots/diagnostics-v129.png` |
| Restored  | `screenshots/diagnostics.png`      |

**The page is titled "System Health".** The nav entry and the breadcrumb read
Diagnostics; the page's own heading does not. That is the reference's own
split and the restored page keeps it, which is why the e2e smoke list now
expects `System Health` on `/diagnostics`.

## What was there before

Three cards — Component health, Zone relays and some counts — reading an
undeclared `/diagnostics` aggregate that returned services, zones and totals
together. It listed ten invented components ("Inventory ingest", "Audit
pipeline", "Report generation") with a random latency each, and no events at
all.

## What the page is now

**Four counters**, the first on the dark card: Services Healthy, Degraded,
Agents Connected, Warnings (24 h).

**The Services table** — Service / Status / Signal / Detail, over the
reference's seven services.

**Events, Last 24 Hours** — a column per hour with warnings under errors, the
"24 h ago / Now" axis, the two-key legend, and Warnings / Errors / Busiest
Hour beneath.

## The contract described it

`GET /diagnostics/health` was declared as a `Health` with a summary, the
services and the day's events — the counters, the table's four columns and
everything the chart needs. `POST /diagnostics/health-check` and
`POST /diagnostics/bundle` were declared for the two buttons. None of the
three was served; the undeclared `/diagnostics` was, and is now deleted.

`Errors` and `Busiest Hour` need no contract change: both are counted from
`events` in the page, because a count of a list the page already holds is not
a second fact to store.

## Three signals are counted from the estate

The Services table prints four kinds of signal — a latency, a ratio, an age
and a percentage — which is why `signal` is a string rather than a number. The
old table had a `latency_ms` column and so printed "31" with no unit for
everything.

Three of the seven are not stored at all:

| Service               | Counted from                                          |
| --------------------- | ----------------------------------------------------- |
| Agent Gateway         | online endpoints over total, from `devices`           |
| Peer Cache Controller | zones serving under 70% locally, as Aegis Zones bands |
| Notification Service  | deliveries still retrying, from the delivery log      |

The peer cache controller's **status** is derived too: a controller with
nothing below threshold is not degraded. A health page that reported "27/32
agents connected" while the Devices page said otherwise would be reporting two
different estates, so a contract assertion requires the gateway signal to
equal the estate it came from, and an e2e test requires the table and the
counter above it to agree.

## The events are stored, and shaped like a day

A warning is a thing that happened at a time, and bucketing counts into
twenty-four columns needs the times — so `health_events` holds a row per
event rather than a count per hour.

They cluster. Four hours of the day are busy and the rest are quiet, picked
from the hour index rather than drawn, so the chart's shape is stable for a
given seed. An even spread would have hidden the only thing the panel has to
say, which is _when_ something went wrong.

## A contract defect this page found

The diagnostic bundle is a **zip**, and `ExportFormat` — shared between what a
caller may request and what comes back — had only csv, xlsx, pdf and html.
Adding zip to the shared enum would have let someone request a zip report, so
`Export.format` now has its own wider enum and `ExportRequest.format` keeps
the narrow one. A format list that cannot name the one format a declared
endpoint produces is incomplete.

The licence upload found a second, in the same family: the contract declares
`application/octet-stream` and Fastify has no parser for it, so the declared
content type was answered with "Unsupported Media Type" before the handler ran.

## "Now" is the server's

`Health` carries `asOf`, the instant the checks ran, and the page buckets its
events against that rather than the browser's clock. A clock a few minutes
adrift would shift the whole chart by a column, and the console forbids
reading the clock during render anyway. Recorded as D-057.

## What the data says

Six of seven services healthy; the peer cache controller is degraded because
one zone is serving under 70% locally — the same zone Aegis Zones reports. 40
warnings and 4 errors in the day, with the busiest hour three hours ago.
45,303 of 50,000 agents connected, which is the Devices page's own figure.

## What is not restored

- **The counters' sub-labels.** The reference's markup carries "Checked 02:29
  AM", "Peer Cache Controller", "Right Now" and "4 errors" under the four
  counters, all with `display: none`. They do not render there and they are not
  on the restored page.
- **Neither button has a result view.** Run Health Check queues a job and
  Download Diagnostic Bundle queues an export, both as the contract declares —
  but there is nowhere to watch either finish, because the reference has no
  such view and no contract route polls a health check. See handover question 66.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

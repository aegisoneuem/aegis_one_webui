# Peer Cache — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the Peer
Cache workspace (page id `peercache`).

|           |                                  |
| --------- | -------------------------------- |
| Reference | `screenshots/peercache-v129.png` |
| Restored  | `screenshots/peercache.png`      |

## What was there before

Four counters — Cache nodes, Content served, Peers served, Cache in use —
over a `ResourceList` of cache _nodes_ with seven columns, reading
`/peercache/summary` and `/peercache/peers`.

It was at the wrong granularity and it contradicted the thing it described.
The approved page's own words, in markup the reference keeps hidden:

> No dedicated distribution servers. A regular endpoint agent is elected to
> cache content for its Aegis Zone or subnet, and can be re-elected at any
> time.

The fixture behind the old page invented appliances called `DEL-CACHE-01`,
`MUM-CACHE-02` and so on — exactly the dedicated distribution servers the
product does not have.

## What the page is now

A title and one table, which is all the reference has. One row per zone:

| Column             | What it is                                              |
| ------------------ | ------------------------------------------------------- |
| Aegis Zone         | the zone                                                |
| Current Peer Cache | the elected endpoint's hostname, linking to that device |
| Agent Health       | that endpoint's own agent state                         |
| Content Cached     | what the cache is holding, by name                      |
| Cache Size         | the cache's allocation                                  |
| Last Transfer      | when content last moved through it                      |
| Status             | Healthy, Warning or Disabled                            |

Each row offers **Re-elect**, with Disable and Activity behind the `⋯` — the
reference's own three actions.

No counters, no filter bar, no tabs: the reference has none, and a zone's
delivery figures already have a home on Aegis Zones, which prints them.

## The contract described it, at the right granularity

The thirteenth page in a row. `/peercache` was declared as an array of
`PeerCache` keyed by `zoneId`, with `/peercache/{zoneId}/elect` and
`/peercache/{zoneId}/state` beside it. None of the three was served. What was
served was `/peercache/summary` and `/peercache/peers` — an aggregate and a
flat node lister, neither in the contract, both now deleted along with the
peers table spec.

Two declared fields did not match what the reference prints, and were changed
rather than worked around:

- **`contentCached` was an integer.** The column prints names — "KB5071234,
  Chrome 145, Firefox 146" — so it is now an array of strings.
- **`status` was `active | idle | disabled`.** The column prints Healthy and
  Warning. The enum is now `healthy | warning | disabled`; `enabled` already
  carried the on/off state separately, so the lifecycle values were saying
  nothing the row did not already say.

`agentHealth` also became nullable, because a zone with nothing elected has no
agent to report on and should not be accused of being unreachable.

## The election is real

Every peer row now points at a device, and takes that device's hostname. The
candidate is the zone's steadiest endpoint — online, most free disk, then best
DEX score — and **the seed and the Re-elect route use the same rule**, so the
stored choice and the button cannot disagree about what a good cache is.

Re-electing moves the flag to the next-best candidate and clears the transfer
time, which means the new cache reports **Warning** until it has actually
served something. That is true, and the page says so rather than claiming
health it has not earned. Recorded as D-050.

## Content is derived, not drawn

`peer_cache_content` is materialised at seed time from the deployments that
actually reached devices in that zone: distinct packages from
`deployment_results` where the result succeeded, newest first, capped at four.
A deployment's package is a KB for a patch and a title for an application,
which is exactly the two forms the column prints.

Only the three payload-bearing deployment types count. An early pass included
every type and put `cleanup-temp.ps1` in the Content Cached column — a
kilobyte of PowerShell is not something a cache holds, and listing it
misdescribed what the cache was doing.

## Status is judged against the fixture's clock, not the wall clock

A cache whose last transfer is two hours behind the estate's newest is warned
about. "Behind the estate's newest" is deliberate: the fixture's "now" is
frozen at 2026-11-01 (`docs/seed.md`), so comparing against `Date.now()`
reported **every** cache in the estate as stale once the seed was a few hours
old — a fixture artefact presented as an estate-wide fault, which is what the
first restored build did. A real backend compares against now; in a fixture,
the newest row is now. Recorded as D-051.

## What the data says

Five of nine zones have an elected cache, four do not — the same five that
Aegis Zones reports as having peer caching. Each elected cache is a real
workstation or server from its own zone (`MUM-WS-0820`, `PUN-SRV-1014`), and
each holds three or four packages its zone actually received. The four
cacheless branches read "None elected" and "Disabled", with dashes rather
than invented health.

## What is not restored

- **The hidden subtitle stays hidden.** The reference's explanatory paragraph
  is in the markup with `display: none`, so it is not on the restored page
  either. Its content is recorded here and in the route's own comments
  instead, where it explains the model rather than decorating the page.
- **Zones without a cache are listed.** The reference shows three rows, all
  with caches, because its fixture has only three. Showing the other four as
  "Disabled" keeps Enable reachable and matches how Aegis Zones already
  reports them ("Not required"). This is a judgement, not a copy — see
  handover question 58.
- **Activity opens the device, not an activity view.** The reference's
  Activity action has nowhere to go either. The device page is the nearest
  real destination. See handover question 59.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

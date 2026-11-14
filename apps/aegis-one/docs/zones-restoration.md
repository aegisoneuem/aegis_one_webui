# Aegis Zones — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the Aegis
Zones workspace (page id `sites`).

|           |                              |
| --------- | ---------------------------- |
| Reference | `screenshots/zones-v129.png` |
| Restored  | `screenshots/zones.png`      |

## What was there before

A `ResourceList` over `/sites` with seven columns — Aegis Zone, City,
Endpoints, Relay, Peer cache, Link, Last sync — and nothing else. The page
listed zones; it did not say what they were for.

The approved page answers one question: where content comes from, and what
that saves. None of that was present.

## What the page is now

A head with the title and **Refresh Discovery**, then:

**Five counters**, the first on a dark card under a gold rule: WAN Saved, WAN
Avoided This Week, Peer Cache Hit Rate, Direct Downloads, Avg Local Delivery.

**Three panels**:

| Panel                          | Form                                             |
| ------------------------------ | ------------------------------------------------ |
| Delivery Distribution          | donut, local against direct, the share at centre |
| Aegis Zone Delivery Efficiency | one column per zone                              |
| Content Delivery Path          | the four hops, each with what it moved           |

**A row per zone**: Aegis Zone, Devices, Connectivity, Bandwidth, Peer Cache,
Last Sync, Status — with the city under the name, the reporting percentage
under the connectivity band, and the link speed under the bandwidth band, as
the reference prints them.

## The contract already described it

The tenth page in a row. `/zones` was declared as a `ZoneList` with `items`
and `delivery` — the latter carrying `distribution`, `efficiency` and `path`
by name, which is exactly the three panels. `Zone` declared `devices`,
`connectivityPct`, `bandwidthMbps`, `peerCache` as a three-value enum,
`lastSync` and `status`, which is the grid.

The server served none of it. It served `/sites` — a flat table of the zones
rows, a shape the contract does not mention — and the page read that.

## The /zones against /sites reconciliation is closed

This was carried as an open item from earlier pages. It is now resolved
rather than noted:

- `/zones` is served, as declared.
- The deployment wizard's zone picker reads `/zones` instead of `/sites`.
- The Diagnostics page declares its own zone row rather than borrowing the
  contract's `Zone`, because `/diagnostics` is its own aggregate and was only
  ever coincidentally shaped like a zone.
- `/sites` and its table spec are deleted.

## One model, four views

Content reaches a zone once as a seed copy, its peers then serve it locally,
and whatever an endpoint could not get locally it pulls from the central
repository. Those three figures are columns on `zones`, and every percentage
on the page divides two of them:

```
hit rate     = local / (local + direct)
direct share = direct / (local + direct)
WAN saved    = 1 - (seed + direct) / (local + direct)
```

That is why the counters, the donut, the per-zone bars and the delivery path
are the same arithmetic shown four ways and cannot disagree — which a contract
assertion now checks: the distribution must add to a hundred and equal the hit
rate, and WAN saved must sit at or below it.

**WAN saved is deliberately lower than the hit rate.** A zone that serves
everything locally still paid for one seed copy across the WAN. On this estate
that is 54% saved against a 55% hit rate.

## Fixture changes

Five columns on `zones`, all feeding a visible figure: `connectivity_pct`
(the share of the zone's endpoints that checked in), `seed_gb`, `direct_gb`,
`avoided_week_gb` and `local_mbps`. The local figure itself is summed from
the `peers` table, which already held `served_gb` per peer.

## What the data says

Five of nine zones have a peer cache; four small branches do not. Those four
report 0% local delivery and "Not required" — which is the honest reading,
not a fault: a branch of 976 endpoints does not warrant a cache node. The
estate's overall hit rate is 55%, which is mediocre rather than good, so most
of the efficiency bars are amber. That is what the data says; the bands are
the reference's own.

## What is not restored

- **Nothing of the layout.** The five counters, three panels, four hops and
  seven grid columns are all present.
- **Per-zone drill-through.** The reference's zone rows are not links either,
  so this matches — but a zone row that opened the Devices page filtered to
  that zone would be the obvious next thing, and there is no contract
  parameter for it (the same gap as handover question 39).

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

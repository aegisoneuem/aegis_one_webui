# Overview — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`.

Screenshots, both at 1680px wide:

|                            |                                           |
| -------------------------- | ----------------------------------------- |
| Reference                  | `screenshots/overview-v129-reference.png` |
| Restored                   | `screenshots/overview.png`                |
| Restored, every chart form | `screenshots/overview-chart-variants.png` |

## What the page is now

The layout is v129's: heading with eyebrow, title and clickable counts; a
scope bar; five KPIs; then six widgets in three rows, and the footnote.

| Row | Widgets                                                                                        |
| --- | ---------------------------------------------------------------------------------------------- |
| 1   | Managed Endpoints · Online Now · Patch Compliance · High-Risk Endpoints · Overall Health Score |
| 2   | Overall Health Score · Patch Compliance                                                        |
| 3   | Security Posture · Deployment Status · Expiring Soon                                           |
| 4   | Needs Attention · Recent Activity                                                              |

Geometry was read off the reference rather than guessed: panel head padding
`12px 22px 6px`, body `18px 22px 10px`, the 3px gold rule and 10px indent on
each `h2`, the 84px KPI tiles at 13px gaps, 16px/650 titles, 12px subtitles,
11.5px captions, the 0 / 70 / 85 / 100 health scale.

Colours are the approved tokens throughout. Where v129's own cascade uses a
near-miss of an approved value — `#dfe5ec` against the approved `#e5e9ed` for
the panel border, `#20272d` against `#202329` for the inverted KPI — the
approved value is used. `pnpm check:colors` passes.

## The contract was already right; the page and the server had drifted

`components.schemas.Overview` already described this page — `counts`, `health`
with weighted `measures`, `patchCompliance` with `missingBySeverity`,
`lastInstall` and `byOs`, `securityPosture`, `deploymentStatus`, `expiring`,
`attention`, `recentActivity`. It was modelled from v129 in Phase 1.

What had drifted was everything either side of it: the mock server returned
`endpoints / posture / byZone / byOs / patchState / topVulnerabilities /
recentDeployments / serviceHealth`, and the page rendered that. Neither shape
appears in the contract.

Both now return and read the declared shape. The zone, platform and department
query parameters the contract declares are implemented and narrow the
aggregate server-side; the caller's zone scope is ANDed with them, so choosing
a zone can only narrow what the role already allows.

## Present in v129, not in the restored build

| Missing                                                 | Why                                                                                                                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Setup 2 / 7` checklist button                          | `/setup/checklist` is declared in the contract but not served. A button that cannot report real progress is worse than no button.                                                              |
| `+ Custom Widget` and `Customize`                       | `/overview/layout` is declared but not served, so widget choices cannot persist. The per-widget view and chart-type menus work; they are page state, not saved layout.                         |
| `Ask Aegis` query box in the scope bar                  | Natural-language query over the estate. `/insight` exists but answers fixed diagnostics, not free text. Needs a contract addition.                                                             |
| Deployment Status → `Device Results` view               | Needs per-device latest result across all actions. `deploymentStatus` in the contract is per-action counts only.                                                                               |
| Patch Compliance → `Devices Needing Patches by OS` view | Needs device counts per OS family; the contract gives `compliantPct` per family.                                                                                                               |
| Panel icon chips                                        | v129 puts a small gold-tinted square with a glyph left of each title, as well as the gold rule. Only the rule is restored; the glyphs are assets that are not in the bundle as separate files. |

All six need either a contract change or an asset, so none was invented.

## Deliberately not restored

**Service health.** The outgoing page had a Service health card. v129's
Overview has none, and `components.schemas.Overview` has no field for it. It
is gone from here; `/diagnostics` still serves it and the Diagnostics page is
now its only reader.

**The gradient on the primary button.** v129 fills `New Action` with a
three-stop navy gradient. The brief's hard rules say no gradients, so it is
flat `--ao-navy`.

## Where the approved list and the reference disagree

Carried forward from the token work, still unresolved:

- The approved list gives the sidebar as `#202329`. v129's final cascade
  renders `#1b1f24`, with active `#343027` / `#f1d39d`. The list was followed.
- v129's computed status colours are the Tailwind 700 ramp — `#b91c1c`,
  `#a16207`, `#15803d` — and its muted text is `#475569`. The approved
  `--st-*` and `--ao-muted` values are used instead.

## Seed and schema changes this needed

- `devices.antivirus_ok` and `devices.firewall_ok`, with indexes. The
  contract's `securityPosture` names three controls; only disk encryption
  existed.
- Patch state weights per applicable patch went from 76/14/4/6 to
  880/35/8/77. A device draws roughly fourteen patch rows, so a 14% pending
  rate left one endpoint in twenty fully patched — 15% estate compliance,
  which contradicted the ~90% mean `compliance_pct` the same seed writes on
  each device. The estate now sits near 63% fully patched.
- Patch severity is stored with the vendor's names — critical / important /
  moderate / low. The contract's buckets are critical / high / medium / low.
  The middle two are mapped in the aggregate rather than left at zero.
- Peer health is `status = 'healthy'`, not `'online'`. The Content Delivery
  measure was reading a value that never occurs and scoring 0.

## Open, found while doing this

**The contract declares `/zones`; the server serves `/sites`.** Every console
caller uses `/sites` and gets a `Page<Zone>`. This page follows the existing
callers. Reconciling the two is a separate change that touches the contract,
the server, five pages, the load test and the ZAP plan.

**There is no facet endpoint for departments.** The department filter's
options are a constant in `Overview.tsx` matching the seed catalogue. The real
backend should return the distinct departments; see `handover-backend.md`.

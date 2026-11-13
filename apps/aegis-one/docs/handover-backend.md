# Handover to the backend team

The console is finished and runs today against a mock server. Your job is to
make `contracts/aegis-one.openapi.yaml` true in Go. When you do, the console
switches over by changing one environment variable.

---

## 1. The switch

```bash
# apps/aegis-one/.env
VITE_API_BASE_URL=https://aegis.example.co.in/api/v1
```

That is the whole integration. No code changes, no feature flags, no adapter
layer. Everything the console knows about the API lives behind
`src/api/client.ts`, and nothing in it knows or cares which implementation is
on the other end.

`VITE_OIDC_ISSUER` points at the identity provider, which in production is your
real IdP rather than the mock one.

If anything else needs to change for the console to talk to your service, that
is a bug in one of us — tell us rather than patching the console.

---

## 2. The contract is the agreement

126 operations in `contracts/aegis-one.openapi.yaml`. It lints clean with
`pnpm contract:lint`, and the console's TypeScript types are generated from it
with `pnpm contract:types`.

**Please propose changes to the spec rather than diverging from it.** We had
three drift incidents during this build, all caught by tests, all costing more
than agreeing the change would have:

- The deployment wizard invented `software-install` where the contract says
  `install-software`. Every submit failed validation after the user had filled
  in six steps.
- The seeded role matrix was a hand-maintained second copy of `x-roles`. It
  lost `overview:read` for the Auditor, so auditors got 403 on the landing
  page.
- The console checked `profiles:read` and `sites:read`; the contract says
  `config:read` and `zones:read`.

The lesson we took: anything expressed in the contract is read from the
contract, never restated. The mock server compiles its request schemas from the
spec and reads `x-roles` out of it at seed time.

### What the contract expects you to enforce

| Extension                     | Meaning                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `x-required-permission`       | The permission the caller must hold. Every operation has one.                    |
| `x-csrf: true`                | This operation must verify a CSRF token.                                         |
| `x-roles` (document root)     | Role → permission matrix. Treat it as the source of truth, not as documentation. |
| `additionalProperties: false` | On every request and response body. Reject unknown fields; do not ignore them.   |

---

## 3. Behaviour the console depends on

These are not stylistic preferences. The console will misbehave without them.

### Lists

- **Cursor pagination.** `page.nextCursor` is opaque to the client; it never
  constructs one. `page.total` is the count of the whole filtered set, not of
  the page.
- **Maximum 200 rows per page.** Clamp rather than erroring; the console asks
  for 50 by default and lets the user choose up to 200.
- **`?fields=` projection** must drop everything not asked for, except the
  identifying fields a row needs to be linkable.
- **Server-side sort and filter.** The console never sorts a page itself. If
  it did, page two would disagree with page one.
- **Reject unknown sort and field names** with 400. Do not silently ignore
  them — a sort that quietly does nothing looks like a bug in the UI.

### Errors

One envelope, every time:

```json
{
  "error": {
    "code": "forbidden",
    "message": "You do not have access to this.",
    "requestId": "7f3c9a1e-44b2-4c7d-9f10-2a6e8b1d0c55",
    "fields": { "name": "must not be empty" }
  }
}
```

`message` is shown to a person, so write it for one. Never put a stack trace,
a database message or an internal path in it — those go to your logs, keyed by
the same `requestId`, which you should also return in `x-request-id`.

### Authentication

- 15-minute access JWT, sent as a bearer token.
- Refresh token in an **httpOnly, Secure, SameSite=Strict** cookie scoped to
  `/api/v1/auth`. It must never appear in a response body.
- **Rotate the refresh token on every use**, and treat a superseded token as
  theft: revoke the whole session family, not just that token.

  We got this wrong first time. A replayed token was refused but the session
  survived, which means a thief who redeems a stolen token _first_ leaves the
  real user holding a dead one — and silently refusing the real user logs them
  out while the thief keeps working. Keep spent token hashes per session so you
  can tell a replay from a token that never existed.

- The console calls `/auth/refresh` **once** on load and shares one in-flight
  request across concurrent 401s, so you should not see two refreshes racing
  from one tab. If you do, something is wrong on our side — tell us.

### Access control

- **A record outside the caller's scope is 404, not 403.** A 403 confirms the
  id exists, which is how someone maps your estate from another tenant or
  zone.
- **Check sub-resources independently.** `/devices/{id}/software` must verify
  visibility itself. Checking only `/devices/{id}` leaves every tab open to
  anyone who guesses an id.
- **Resolve targets server-side.** The console sends a group, a zone or a
  filter — never a list of 12,480 ids. A client-supplied list is an assertion
  you have not checked, and a scoped role could name devices outside its zones.

### Remote control — read this one carefully

This section used to say the console had no remote control and must never
gain any. That changed: service desk support needs it. What has not changed
is why the rule existed, so the feature is narrow and the server is what
holds the line.

```
GET  /remote-control/policy              the estate-wide rules
PUT  /remote-control/policy              remote:configure only
GET  /remote-control/sessions            ?state=open | finished
POST /remote-control/sessions            request one; 409 if the endpoint has one
POST /remote-control/sessions/{id}       end one, with a reason
```

What a backend implementing this must do, not merely allow:

- **Read the policy on every start.** `consent: 'ask'` means the session is
  created `pending-consent` and nothing is shown until the end user accepts.
  `notify` is for unattended machines and still tells them. Do not add a
  third value.
- **Ignore the client on recording.** `recorded` comes from the policy, never
  from the request body. An operator cannot turn it off for their own
  session.
- **Keep the on-screen indicator unsettable.** It is reported in
  `RemotePolicy` so the console can draw it locked. There is no field to
  change it and there must not be one.
- **Require the reason when the policy says so**, and reject with 400 rather
  than storing an empty one.
- **One open session per endpoint.** Two operators on one screen, neither
  knowing, is the thing consent exists to prevent.
- **Three permissions:** `remote:read`, `remote:control`, `remote:configure`.
  Auditor gets only the first, so the log can be reviewed by someone who
  cannot connect.
- **TLS 1.3** for the session transport.

Remote script execution is still a different thing and is unchanged:

```
POST /liveops/script-jobs      submit a job, get a job id
GET  /liveops/script-jobs/{id} poll its status
GET  /liveops/script-jobs/{id}/results   per-endpoint output
DELETE /liveops/script-jobs/{id}         cancel
```

Model it as a **non-interactive job**: submit, poll, fetch. There is no
session to attach to, no socket, and no way to send a second command to a
running job. That distinction is the whole product rule.

Per-endpoint output is capped at 256 KiB and is plain text. Truncate
server-side — do not rely on the client to do it, and do not return anything
the console would have to render as markup.

---

## 4. Security the console assumes you provide

The console hides what a user cannot do, but **that is a courtesy, not a
control**. Every check below must exist on your side, because the UI can be
bypassed with a terminal.

| Control          | What we assume                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication   | Every route except the four auth routes requires a valid token.                                                                                   |
| Permissions      | From `x-required-permission`, on every request.                                                                                                   |
| Zone scoping     | Applied to every query, including sub-resources and aggregates.                                                                                   |
| CSRF             | On every operation marked `x-csrf`.                                                                                                               |
| Mass assignment  | `additionalProperties: false` enforced, not ignored.                                                                                              |
| Rate limiting    | Per session, with a tighter bucket on the auth routes.                                                                                            |
| Security headers | CSP without `unsafe-inline` or `unsafe-eval`, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.  |
| CORS             | An explicit origin list. `origin: *` or reflecting the request origin with credentials is the same as having no policy.                           |
| Logging          | Redact Authorization, Cookie and CSRF headers. Log query parameter _names_, not values — a search term can be a hostname, a username or a serial. |

`packages/mock-core/src` is a working reference for all of it. It is TypeScript
rather than Go, but the decisions are commented with the reasoning, and the
reasoning transfers.

---

## 5. Performance

Read `docs/perf-report.md` before sizing anything — its numbers come from a
single-process fixture server with a synchronous SQLite driver and **must not
be used to size your service**.

What is worth carrying over:

- **Global search is the slowest read.** `LOWER(col) LIKE '%term%'` across six
  columns cannot use a B-tree index. Decide deliberately: full-text
  (`MATCH ... AGAINST`, `tsvector`) or a trigram index.
- **Estate-wide aggregates are expensive.** Overview, DEX and the filter
  facets each sweep the device table. We cache them for 5 seconds keyed by the
  caller's zone scope. Key any cache by scope, never by user — and never let a
  narrower scope read a wider entry.
- **Index the GROUP BY columns.** `department`, `agent_version`, `kind`,
  `encrypted`, `(zone_id, compliance_pct)`, `(os_family, os_name)`. Adding
  these cut our facet p50 from 1,585 ms to 1 ms.
- **The budget**: p95 under 500 ms for lists, under 200 ms for details, error
  rate under 0.5 %. The k6 scenarios in `/loadtest` encode these as thresholds
  and are ready to run against your service — point `BASE_URL` at it.

---

## 6. Checking yourself against the console

Two suites run against any implementation of the contract, not just ours:

```bash
# 39 security and behaviour checks, straight HTTP
BASE_URL=https://your-service pnpm --filter @aegis/mock-server check:api

# 33 browser tests driving the real console
E2E_BASE_URL=https://your-console pnpm --filter @aegis/console e2e
```

The first is the faster signal. It covers the OIDC flow, CSRF, mass
assignment, RBAC denial, zone scoping with 404-not-403, SQL injection attempts
through sort and fields, cursor paging and page-size clamping.

Between them they caught, during this build: a CSP rule that broke sign-in
after the second factor, two React StrictMode races in token handling, a
cursor-pagination bug that broke page two, a wizard that lost its state, and
the session-replay gap described above. They will be at least as useful to
you.

---

## 7. Open questions for you

1. **Rate-limit budget.** Ours is 600 requests/minute per session, which is
   generous for a person and far too low for a load generator. Confirm what
   the real service should allow.
2. **Full-text search.** Which index, on which columns? It changes the shape
   of the `q=` parameter if you want prefix or phrase semantics.
3. **Aggregate freshness.** Is 5 seconds acceptable for Overview, or does the
   business want live counts? Live is affordable at your scale; ours was not.
4. **Audit retention.** The contract exposes the audit trail but says nothing
   about how long it is kept.
5. **Group membership.** Rule-based groups are fixture metadata here. The real
   service needs to decide whether membership is materialised or evaluated per
   query, which affects how fast a group target resolves.
6. **A facet endpoint for departments.** The Overview's department filter
   sends `?department=` as the contract declares, but nothing serves the list
   of distinct departments, so the console carries its own constant. That will
   drift from the real directory the day it ships. Something like
   `GET /devices/facets?field=department` returning the distinct values and
   their counts would also serve the Devices filters, which have the same gap.
7. **`/zones` or `/sites`.** The contract declares `GET /zones`; the mock
   server serves `/sites` and every console caller uses `/sites`. One of the
   two has to move. Our preference is the contract's `/zones`, since `sites`
   collides with the UI route name and means nothing in the domain language
   the rest of the contract uses ("Aegis Zones").
8. **Per-device deployment results, and devices-needing-patches by OS.** The
   approved Overview offers both as chart views. `deploymentStatus` in the
   contract is per-action counts, and `patchCompliance.byOs` is a percentage
   per family, so neither view can be built from what is declared. Both want
   an additional aggregate rather than a client-side derivation — the device
   counts are in the tens of thousands.
9. **Patch severity vocabulary.** The contract's `missingBySeverity` buckets
   are critical / high / medium / low; patch vendors publish critical /
   important / moderate / low. The fixture now normalises on import, so the
   aggregate no longer maps them. Confirm that is where you want it done, and
   that the contract's four are canonical.
10. **`/patches/summary` is a materialised view, not a query.** Slicing the
    device/patch join five ways on request took 7.4 seconds over 530,000 rows
    here, and the browser abandoned it. We roll it up at seed time into two
    small tables keyed by zone (see decisions.md D-027). At your scale this
    wants to be a real materialised view refreshed on a schedule, or an
    incremental rollup written as patch state changes. Decide which, and how
    fresh the figures have to be — the Overview tolerates minutes.
11. **Patch policies are read-only.** The contract declares `GET
/patch-policies` and nothing else. The approved design has New Policy, an
    Open detail view, run-now and suspend, and a Global Settings pane of
    estate-wide defaults (maintenance windows, restart behaviour, bandwidth
    limits). All of that needs endpoints before it can be built.
12. **Supersession history.** The contract now carries `approval: superseded`
    and `supersededBy`, which the catalogue needs. What it cannot express is
    how many endpoints had a superseded update installed before it was
    replaced — v129 shows that figure. Either the per-device patch record
    keeps history, or the Remediated column reads zero for superseded rows,
    which is what it does here.
13. **Are "example" deployments a real thing?** The approved design marks some
    actions as examples, shows "Example Record" as the trigger, and offers a
    Hide Examples toggle. `DeploymentSummary` declares nothing of the kind. If
    a saved preview action that never executes is a product concept, it needs
    a field on the schema and a filter on `GET /deployments`; if it is only
    the reference's fixture marking its own demo rows, nothing is needed. We
    have assumed the latter (decisions.md D-030).
14. **"With failures" at estate scale.** The counter counts actions with any
    recorded failure, which is what the contract's `withFailures` and the
    approved label both say. Against rollouts of thousands of endpoints that
    is almost every action — thirteen of fifteen in our fixture — so the tile
    stops separating anything. Confirm the intent: any failure, or a failure
    rate above a threshold the contract would have to state.
15. **The deployment detail's extra fields.** `completedAt`,
    `wakeOfflineFirst` and `notes` are served on a deployment and declared
    nowhere; `DeploymentSummary` is `additionalProperties: false`. They belong
    inside `Deployment`'s `schedule` / `network` / `options` objects, which are
    open. That is a change to make when the detail page is restored, and it is
    listed here so it is not lost.
16. **A group's patches and software.** The approved Device Groups detail pane
    has Patches and Software tabs beside Members. Nothing in the contract
    aggregates either per group: `/patches/summary` is estate-wide and
    `/software` is the catalogue. Both tabs want an endpoint of their own —
    probably `/groups/{groupId}/patches` and `/groups/{groupId}/software`,
    each returning counts plus a list. They are rendered disabled until then.
17. **Per-device patch exemption.** The reference's group member grid ends
    with a Manage column whose only action is "Exempt". No schema expresses a
    device being exempt from an update, and no endpoint sets one. If exemption
    is a product concept it needs a field on `Device` or a join of its own,
    plus the endpoint that grants and revokes it.
18. **Dynamic group membership at scale.** We materialise it at seed time
    (decisions.md D-031). A real dynamic group is a saved query whose
    membership changes as devices do, so the server has to decide between
    evaluating the rule on every read, keeping an index refreshed on a
    schedule, or maintaining membership incrementally as device attributes
    change. The five per-group figures make that choice visible: they are
    counted from membership, so whatever staleness membership has, they have.
19. **Four group writes are declared and unserved.** `POST /groups`,
    `PATCH /groups/{groupId}`, `POST /groups/import` (text/csv) and
    `POST /groups/directory-sync` (returns a `Job`). The approved design has a
    control for each; all four are rendered and disabled.
20. **`byPlatform` has three keys and the estate has four platforms.** The
    Enrollment chart declares windows, macos and linux. This estate also runs
    AIX, so the bars total 43,008 against 50,000 enrolled and the chart cannot
    be read as a breakdown of the whole. Either add the remaining platforms,
    add an `other` bucket, or state that the chart covers the three managed
    desktop platforms only.
21. **Two enrollment writes are declared and unserved.**
    `POST /enrollment/tokens` (returns `EnrollmentTokenCreated`, the only time
    the secret is ever returned) and `DELETE /enrollment/tokens/{tokenId}`.
    The approved page has a Create Token action; it is rendered and disabled.
    Note the one-time-secret contract: whatever serves the POST must return
    the secret once and store only its hash, which is what the seed does.
22. **Log settings are richer in the approved design than in the contract.**
    `LogSettings` had `retentionDays`, `emailBundles` and `recipients`; v129's
    Storage & Mail panel also sets a root path, a folder layout, a file-name
    pattern, a max bundle size, a send-as mode and an attachment limit. All
    six were added to `LogSettings`. `PUT /liveops/log-settings` is still
    unserved, so the panel is read-only (decisions.md D-035).
23. **`LogSchedule` lacked four of the Schedules grid's columns.** Runs,
    Delivery, Last Run and Enabled were added. Nothing serves
    `POST /liveops/log-schedules` or the delete, and nothing seeds a schedule,
    so the grid is empty and "Next Scheduled" reads "—" — which is what the
    reference shows too. A real schedule needs a runner, and the runner is
    what decides whether `runs` and `lastRunAt` are stored or derived.
24. **`DeviceDiagnostics.recentJobs` is declared as `LiveJob[]` and is not.**
    `/devices/{deviceId}/diagnostics` returns one row per job that touched
    _this_ endpoint, carrying that endpoint's own status, exit code and
    duration — which is what the device page needs and a `LiveJob` cannot
    express. Either the schema should become a per-endpoint shape (a
    `LiveJobResult` plus the job's title and kind) or the endpoint should
    return jobs and the page should fetch results per job. This predates the
    Live Activity work; the query was only renamed to the new columns.
25. **Three Live Activity writes are declared and unserved.**
    `POST /liveops/log-schedules`, `DELETE /liveops/log-schedules/{scheduleId}`
    and `PUT /liveops/log-settings`. The approved page has New Schedule,
    Collect Now and Save Settings; none is rendered as a working control.
26. **Cancel is served but the approved page's Cancel Task does not call it.**
    `DELETE /liveops/script-jobs/{jobId}` works and returns 204; the contract
    says it returns the job after cancellation. The button is rendered and
    permission-gated, and wiring it is held until the response shape is
    settled — a 204 gives the console nothing to re-render from.
27. **`Finding` carried ten of the grid's columns and none of the drawer's.**
    The contract had severity, CVSS, priority, devices, age, SLA and state.
    The approved page also shows the check id, the threat indicators, the
    detection status and its confidence, the check family, the solution in
    full, the fix type, the port the check reached, the first and last
    detection, the SLA due date, the owning project and the reason a risk was
    accepted. All were added. `threats` went from two values to the
    reference's eight.
28. **Nothing accepts a risk.** `Finding.acceptedReason` is now in the
    contract and one finding is seeded as accepted, so the State filter has
    something to show, but there is no endpoint that accepts or re-opens a
    risk. The approved drawer has "Accept Risk (90 days)" and "Re-open Risk";
    neither is rendered, because a button that cannot write is worse than no
    button. A write here also invalidates the stored exposure score
    (decisions.md D-036), so the two need designing together.
29. **Remediation is read-only.** `/vulnerabilities/remediations` lists the
    fixes ranked by the risk they remove, and nothing deploys one. The
    approved page has "Remediate" and "Create Project" per row and a
    Remediate dialog with target selection, schedule and restart policy —
    which is Patch Management's deployment flow under another name. The
    restored tab therefore links each patchable row to Patch Management
    rather than growing a second deployment pipeline. If remediation is to be
    driven from here, the cleanest contract is a
    `POST /deployments` with `type: remediate-finding`.
30. **Projects are read-only too.** `POST /vulnerabilities/projects` is not
    declared, so "New Project" and the drawer's "Add to project" are absent.
    `progressPct` is seeded rather than derived; deriving it needs a
    definition of "remediated" per project that the contract does not give.
31. **The estate looks implausibly clean.** The seed gives each device a
    10–16% chance of each applicable CVE, which over 16 CVEs leaves a mean of
    about half an open finding per device and an estate exposure score of 44
    out of 1,000 — Grade A. The figure is honest for the data, but a 50,000-
    endpoint estate with 15 distinct open findings is not a realistic
    fixture. Raising the catalogue or the applicability rate would move the
    Overview's own CVE counters, so it is left as it is and flagged here.
32. **The Scans grid sorts by Started, so a scheduled scan sorts first.**
    `vuln_scans.started_at` holds a future timestamp for a scan that has not
    run, which is what the reference's own data does. Sorted by that column
    the scheduled scan lands at the top. Either `Scan` needs a separate
    `nextRunAt`, or the grid needs a sort that puts what has run first.
33. **"Failing Checks" reads 200 of 200 and cannot do otherwise.** On 50,000
    endpoints every check in the library fails somewhere, so the counter is
    pinned at the library size. The reference's 165 of 200 comes from
    evaluating 32 computers. The counter is truthful and useless at this
    scale. Either it should count checks below a compliance threshold rather
    than checks with any failure at all, or it should report the share of
    devices failing the worst check. The current page leaves it as a literal
    count and leans on the per-check Compliance column for the ranking.
34. **"Non-Compliant Devices" reads 49,399 of 49,542** — a device is
    non-compliant below 90%, and with ~120 applicable checks at roughly a
    4-in-5 pass rate almost every device fails something. The same shape as
    the reference's 28 of 32, concentrated by the larger sample. The useful
    figure is the band distribution in the Device Compliance donut. If the
    counter is to stay, it needs a threshold that means something on a large
    estate.
35. **Nothing writes a check result, so nothing can grant an exception or add
    a custom check.** `POST /configuration/exceptions` and
    `POST /configuration/checks` are both declared and both unserved: a write
    invalidates the estate-wide roll-up, the per-group roll-up and every
    device's `config_pass_pct`, which together take about 95 seconds to
    rebuild. A real backend recomputes incrementally — an exception touches
    one check and one group — but the mock server has no incremental path.
    One exception is seeded so the tab is not empty.
36. **Benchmark assignment is read-only.** `config_benchmarks` carries an
    `assigned_group_id` and the contract carries `assignedGroupId`, but
    nothing sets it, so every benchmark reports "All devices". The reference
    lets an administrator reassign a benchmark from the grid. This needs a
    `PATCH /configuration/benchmarks/{id}` the contract does not declare.
37. **A profile's version history is seeded, not derived.** Only the
    most-revised profile carries one, and the Version History panel shows
    that profile because it is the one with settings stored. The reference
    hard-codes "Windows Security Profile". A real backend would keep a
    revision per change; the contract has no shape for one beyond
    `ConfigProfileDetail.settings`, and nothing writes a version, so
    "Rollback to v7" is absent.
38. **AIX endpoints have no checks.** The library covers Windows, macOS and
    Linux, matching the reference. The estate's 458 AIX servers are therefore
    absent from every configuration figure rather than counted as passing,
    which is the honest reading but means the Configuration page's device
    total (49,542) does not match the estate total (50,000) anywhere else in
    the console.
39. **The DEX figures cannot be drilled through.** In the reference every bar,
    donut slice and band counter on this page opens the Devices page filtered
    to exactly those endpoints, by passing a list of device ids to an in-page
    overlay. This console's Devices grid filters on device fields and the
    contract declares no way to pass an arbitrary id list, so the counters and
    bars are not clickable here. Either `listDevices` needs an `ids` filter
    (bounded, since a poor-band list is 6,375 ids long), or each figure needs
    a server-side saved selection to link to. This is the one thing on the
    page I would most like back.
40. **The three experience measures are a single sample, not a series.**
    `cpu_pct`, `memory_pct` and `boot_seconds` are one reading per device, so
    the page can say an endpoint is slow but not whether it is getting slower.
    The reference has the same limitation. A trend would need a
    `dex_samples` table and a `DexSummary.trend` the contract does not
    declare.
41. **AIX endpoints are scored.** Experience telemetry is platform-independent,
    so the estate's 458 AIX servers appear in the DEX figures — unlike the
    Configuration page, where they have no checks and are absent. The two
    pages therefore report different device totals (50,000 against 49,542),
    which is correct in both cases but worth knowing before the two are
    compared.
42. **A report cannot be narrowed by site or device group.** The reference's
    viewer carries Location and Group selects that narrow every figure and row
    on the report. The engine would support it — it is one more clause on the
    source — but `GET /reports/{reportId}/run` and the new
    `/reports/{reportId}/summary` declare no scope parameters, and these
    restorations do not invent query parameters. Either both paths need
    `zoneId` and `groupId`, or the console needs a saved-scope concept the
    contract does not have.
43. **Nothing schedules a standard report.** `CustomReportInput` carries no
    schedule either, so the viewer's Schedule button goes to the custom-report
    builder rather than opening a scheduling dialog. The reference schedules
    any of the twenty from the viewer. This needs a
    `PUT /reports/{reportId}/schedule`, or a schedule field on the report
    definition.
44. **Software entitlement is a fixture invention.** `software.seats` and
    `software.renews_at` were added so Software Licenses has something real to
    report; the estate had only the four Aegis One subscription licences,
    which are about this product, not about third-party titles. If the real
    backend tracks entitlement elsewhere, the Licenses report should read it
    rather than the catalogue.
45. **The USB event log is thirty days and 1,200 rows.** It covers the first
    four hundred endpoints by hostname rather than the whole estate, which is
    enough for the report to be real but means USB Activity is not a
    whole-estate figure the way the other nineteen are.
46. **The device row is now wide enough to matter.** Restoring the Reports
    grid added twenty-nine inventory columns to `devices`, which took a
    `SELECT *` page of fifty from under a millisecond to about seven, and a
    full scan from 11ms to 65ms. An index on the grid's default sort brings
    the page back to 2ms and is in the schema; the scan cost is inherent to
    the width. If this becomes a problem the inventory attributes belong in a
    `device_inventory` side table joined only when a report asks for them —
    the twenty pages that scan the estate never read them.
47. **The seed copy is a fixture assumption, not a measurement.** `zones.seed_gb`
    is a flat 420 GB for any zone with a cache, which is what makes WAN saved
    sit just below the hit rate. A real backend measures what each zone
    actually pulled; the figure is the one number on this page that is modelled
    rather than counted, and it is the only input to WAN saved that the
    estate's own tables could not supply.
48. **`/sites` is gone.** The flat zones lister the contract never described
    has been removed, along with its table spec, and its two readers — the
    deployment wizard's zone picker and the Diagnostics aggregate — now read
    `/zones` and their own shape respectively. This closes the
    `/zones`-against-`/sites` item carried since the Overview work.
49. **A zone row does not drill through.** The reference's rows are not links
    either, so this is faithful, but a zone that opened the Devices page
    filtered to it is the obvious next step and needs the same bounded id
    filter as handover question 39.
50. **Saved descriptions can be written but not read back.** v129 offers
    **Save Diagnostic Template** and no picker to load one, so the restored
    page matches it: `POST /insight/templates` stores a description and
    `GET /insight/templates` serves the three seeded ones, but nothing in the
    approved layout reads them. Either the reference is missing a control or
    the templates are meant for somewhere else — this needs a design answer
    before the GET has a purpose.
51. **The checks panel prints less than the server knows.** Each check carries
    a `detail` ("Memory is at 80%") and a pass/fail result, and the reference
    prints neither — its rows are a name and a severity, and it lists only
    findings. The detail is carried as the row's `title` and the passing
    checks are dropped. Whether the approved design wants the detail line and
    a count of what passed is a question for the design owner, not a guess.
52. **Nothing scopes `/devices` to a form factor.** The page opens on the
    worst-scoring endpoint, which on this estate is a Windows Server. Insight
    is a service-desk tool for user-reported problems, so the sensible default
    is the worst-scoring _user_ endpoint — but `chassis` is a stored column
    with no declared query parameter, and `platform` only separates
    windows/macos/linux. The same bounded-filter gap as handover question 39.
53. **A run is not persisted beyond its id.** `insight_runs` records the id,
    the endpoint, the description, the status and who ran it — not the checks
    or the recommendations, which are computed in the response and then
    discarded. There is no route to fetch a past run, so nothing reads what
    is missing and nothing is broken; but the moment one exists it must
    return the measures that produced the original answer rather than
    re-diagnosing against today's, which means snapshotting the checks at
    submit time.
54. **Third-party logos are missing on the Connectors cards.** v129 prints the
    ServiceNow, Splunk, Teams, Slack and Entra marks; those assets are not in
    this repository and the brief forbids redrawing a logo, so all three card
    grids use the monogram tile the reference itself uses on its SIEM and
    Notifications cards. Shipping real vendor marks is a licensing question
    as much as a design one, and needs an answer from both sides. The
    `Connector.logoUrl` field is declared and always null.
55. **Configure and Set Up have no dialog.** Both buttons are on every card,
    permission-gated, with `PUT /integrations/connectors/{id}`,
    `/siem/{id}` and `/channels/{id}` served behind them — but the reference
    is a preview and its own buttons open nothing, so there is no approved
    form to restore. What fields each kind of target needs (an endpoint and a
    token for an HEC, a host and port for syslog, a webhook URL for chat) is a
    design question, not a guess.
56. **The delivery log cannot be exported.** The reference has an Export
    button; the contract has no export route for `/integrations/deliveries`,
    and the reports export pipeline is keyed to report ids rather than
    arbitrary queries. The button is present and disabled rather than wired
    to something invented.
57. **~~Relative timestamps age out of the fixture.~~ Answered: the clock now
    follows the seed run (D-054).** What follows is the original note.
    **Relative timestamps age out of the fixture.** The seed's "now" is frozen
    at `2026-11-01T09:30:00+05:30` for determinism (`docs/seed.md`), and
    `relative()` falls back to an absolute date past seven days. So every
    "2 min ago" and "Just Now" the reference prints reads as "01 Nov 2026"
    once the fixture is more than a week old — on this page's Last Sync and
    Last Sent, and on every other relative column in the console. Either the
    seed's clock follows the run date (losing byte-for-byte determinism) or
    the screenshots must be taken against a fresh seed. This one is worth
    settling before the full screenshot sweep.
58. **Zones without a cache are listed here as a judgement, not a copy.** The
    reference's table has three rows, all with elected caches, because its
    fixture has only three; it does not settle what a cacheless zone looks
    like on this page. The restored page lists all nine, showing the four
    without a cache as "None elected" and "Disabled" — which keeps Enable
    reachable and matches how Aegis Zones already reports them ("Not
    required"). If the approved design means this page to list only zones that
    have a cache, the Enable action needs a home somewhere else.
59. **Activity has nowhere of its own to go.** The row menu's Activity action
    opens the elected endpoint's device page, because the reference's own
    Activity opens nothing and no contract route describes a per-cache
    activity feed. What it should show — transfers served, peers fed, bytes
    avoided over time — exists per zone on Aegis Zones but not per cache.
60. **~~Nothing in the console can revoke an API token any more.~~ Answered:
    API access is back as a fifth tab.** v129 has no API-token surface on any
    of its nineteen pages, so the restoration removed the tab — which left a
    leaked token revocable only through the API. The owner's instruction was
    to add it back, so Administration carries five tabs and the fifth is a
    deliberate departure from the approved design, recorded in
    `administration-restoration.md`. What remains open is the design
    question, not the capability: if API access is meant to exist, it should
    appear in the approved design so the next restoration does not remove it
    again.
61. **Agent enrollment settings are served and unreachable.**
    `GET`/`PUT /admin/agent-enrollment` returns `requireToken`,
    `autoAssignGroup` and `tokenMaxAgeDays`, as declared. The approved Agent
    Enrollment tab is a roster of endpoints, not a settings form, so nothing
    reads them. Either the tab is meant to carry both, or the settings belong
    on the Enrollment page, which already owns enrollment tokens.
62. **Five buttons on this page open nothing.** Configure, Add user, Create
    role, Edit Access and Register endpoint are all present, permission-gated
    and backed by served routes — but the reference's own buttons open
    nothing, so there is no approved dialog to restore. What each form needs
    is a design question: an issuer and a client secret for a provider, an
    email and a role for a user, and for a role, a permission picker that can
    express "not more than the creator holds".
63. **A device's status is drawn independently of its last check-in.** The
    Agent Enrollment table sorts by most recently seen, and a handful of
    `offline` devices carry the newest `last_seen_at` in the estate — the seed
    picks the two independently. Within the fixture's one-hour check-in window
    the overlap is small, but an endpoint that was seen a minute ago and
    reports Offline reads as a contradiction. Nothing on this page is wrong;
    the fixture is.
64. **The declared token input and lister were both wrong, and nobody noticed
    because the page called an undeclared path.** `ApiTokenInput` required
    `expiresAt`, so the old create flow — which never sent it — would have
    been refused by the declared schema; `expiresAt` is now optional with a
    documented one-year default applied by the server. `GET /admin/api-tokens`
    declared a bare array where the server returns the standard
    `{items, page}` envelope; the contract now declares `ApiTokenPage`. Worth
    a sweep of the remaining list endpoints for the same bare-array slip.
65. **Upload License opens no file picker.** The button is present and
    permission-gated, and `PUT /licensing/file` is served — but it refuses
    every upload, because the contract says the signature is verified
    server-side and this fixture has no issuer key. A dialog that accepted a
    file and then always failed would be worse than a button that says so.
    What a real implementation needs is the issuer public key and a decision
    about what happens to seats already over the new limit.
66. **Neither System Health button has a result view.** Run Health Check
    queues a job and Download Diagnostic Bundle queues an export, both as
    declared, but there is nowhere to watch either finish: the reference has
    no such view, no contract route polls a health check, and the bundle's
    export id is not something any page reads. The bundle could reasonably
    land in the same export list the reports use.
67. **The licence term is a fixture constant, not a fact.** `license.plan`,
    `seats_total` and the term dates are seeded; everything else on the page
    is counted. That is the right split for a fixture — an estate cannot
    compute what it was sold — but it means the one thing a licensing page
    exists to enforce, the seat ceiling, is the one number nothing checks
    against reality. Nothing in the console refuses an enrolment because the
    licence is full.
68. **The software catalogue has two names for the same two fields.** The
    contract's `SoftwarePackage` declares `name` and `version`; the shared
    resource lister serves `title` and `latestVersion`, which is what the
    table columns are called. The page reads the catalogue's spelling and the
    write routes accept the contract's, so both work — but a consumer reading
    the contract and then calling the list gets neither field. One spelling
    should win, and the contract's is the one to keep.
69. **Import Icons needs an asset store, not an endpoint.** The button is
    disabled with a title saying no icon store is configured. Wiring it needs
    somewhere to put the icons, a same-origin path to serve them from, and a
    rule for matching a bundle's files to catalogue titles — none of which the
    contract or the fixture describes. `logoUrl` is already read, so a card
    shows an icon the moment one exists.
70. **Group Overrides has no editor.** `+ Add Override` appends a row carrying
    the estate default, and the row is then read-only: the reference gives no
    form for choosing a window or a restart rule per group, so there was
    nothing to restore. The shape is declared (`PatchGroupOverride`), so a
    form is all that is missing.
71. **Nothing acts on the patch settings yet.** They are stored, read back and
    validated, and the health thresholds really do drive the counters — but no
    deployment consults the rings, the maintenance window, the postpone
    allowance or the approval policy. The settings describe an intent the
    deployment pipeline does not yet honour, which is worth closing before
    anyone relies on a maintenance window to protect working hours.
72. **The e2e suite is sensitive to machine load.** A run during this work
    reported six scattered failures and took 26 minutes rather than 11; each
    failure passed when run alone, and all tests passed on a quiet machine.
    The cause was orphaned node processes from repeated server restarts. Check
    the wall time before trusting a red run, and check for stray `tsx` and
    `vite` processes.
73. **ZAP's AJAX spider cannot run on this machine.** Its bundled chromedriver
    is 143 against Chrome 156, with SeleniumManager offline, so it reports
    `spiderAjax found 0 URLs` and the plan completes anyway. The passive
    baseline in `docs/vapt-checklist.md` was produced by proxy-crawling the
    bundle instead (`pnpm scan:zap:crawl`). Fixing the driver would let the
    packaged plan stand on its own; until then, check the message count before
    trusting a baseline.
74. **The authenticated active scan has not been re-run since the design
    restoration.** Roughly twenty endpoints were added across Insight,
    Integrations, Peer Cache, Administration, Licensing, Diagnostics and patch
    settings, and none of them has seen active attack traffic. The passive
    baseline covers them; `pnpm scan:zap:active` does not yet.

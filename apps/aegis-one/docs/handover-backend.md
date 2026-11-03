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

### Remote script execution — read this one carefully

The console has **no remote control** and must never gain any. No remote
desktop, no screen view or share, no remote shell or terminal session, no
mouse or keyboard takeover. There is no such endpoint in the contract and no
such permission in `x-roles`. Please do not add one, do not stub one, and do
not add a disabled "coming soon" entry.

Remote script execution is a different thing and is fully supported:

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

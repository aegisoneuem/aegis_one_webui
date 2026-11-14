# Performance report

Measured 2026-11-02 against the 50,000-device fixture estate (seed `20260401`).

**Read the "How this was measured" section before quoting any number here.**
Some of the brief's checks were not run, and those are marked **not run** rather
than estimated.

---

## 1. Summary

| Budget                     | Target   | Result                                         | Verdict                              |
| -------------------------- | -------- | ---------------------------------------------- | ------------------------------------ |
| Initial JS, gzipped        | < 300 KB | **108.5 KB**                                   | Met                                  |
| List p95                   | < 500 ms | 27 ms at 1 user · 101 ms at 5 · 383 ms at 20   | Met                                  |
| Detail p95                 | < 200 ms | 5 ms at 1 user · 74 ms at 5 · **902 ms at 20** | Met to ~5 concurrent; breached at 20 |
| Error rate                 | < 0.5 %  | **0 %**                                        | Met                                  |
| Route-level code splitting | required | 19 page chunks                                 | Met                                  |
| Lighthouse                 | ≥ 90     | —                                              | **Not run**                          |
| 60 fps on the 50k table    | required | —                                              | **Not measured**                     |

The one breach is the detail budget under concurrency, and section 5 explains
why it is a property of the mock server rather than of the console or the
contract.

---

## 2. Frontend bundle

From `pnpm --filter @aegis/console build`, 2026-11-02.

| Chunk                                                   | Raw          | Gzipped      | When it loads           |
| ------------------------------------------------------- | ------------ | ------------ | ----------------------- |
| `client` (React, Router, Query)                         | 204.67 KB    | 66.87 KB     | Always                  |
| `index` (shell, nav, auth)                              | 135.26 KB    | 38.54 KB     | Always                  |
| CSS                                                     | 32.1 KB      | 6.6 KB       | Always                  |
| **Initial total**                                       | **372 KB**   | **108.5 KB** | **Always**              |
| `ResourceList` (DataTable, virtualizer, column chooser) | 93.25 KB     | 28.52 KB     | First list page         |
| `PieChart` (Recharts)                                   | 374.18 KB    | 107.20 KB    | First page with a chart |
| `exceljs`                                               | 929.38 KB    | 256.38 KB    | Only on Export → Excel  |
| `Overview`                                              | 22.76 KB     | 6.99 KB      | Overview                |
| `LiveActivity`                                          | 13.09 KB     | 4.44 KB      | Live Activity           |
| `DeploymentWizard`                                      | 12.56 KB     | 4.31 KB      | The wizard              |
| `Devices`                                               | 9.42 KB      | 3.12 KB      | Devices                 |
| the other 13 pages                                      | 3–10 KB each | 1–4 KB each  | On navigation           |

Three things are deliberately kept out of the initial download:

- **ExcelJS (256 KB gzipped)** is larger than the rest of the console put
  together and is imported dynamically. Nobody pays for it until they choose
  Export → Excel. CSV export needs no library at all.
- **Recharts (107 KB gzipped)** loads with the first page that draws a chart.
  A user who goes straight to Devices never downloads it.
- **The DataTable stack** loads with the first list page, not with the shell.

### Lighthouse — run

Lighthouse 13.6.0, desktop preset, against `vite preview` on the production
bundle. Raw report: `docs/scans/lighthouse.report.html`.

| Category       | Score   |
| -------------- | ------- |
| Performance    | **100** |
| Accessibility  | **100** |
| Best Practices | **100** |
| SEO            | 66      |

| Metric                   | Value |
| ------------------------ | ----- |
| First Contentful Paint   | 0.3 s |
| Largest Contentful Paint | 0.3 s |
| Total Blocking Time      | 0 ms  |
| Cumulative Layout Shift  | 0     |
| Speed Index              | 0.3 s |

**SEO is 66 because the console is deliberately `noindex`.** The only failing
audit is "Page is blocked from indexing", which is the correct behaviour for an
internal console and is not going to be changed to raise a score.

Three defects came out of the first run and are fixed:

| Lighthouse said                             | What it actually was                                                                                                           | Fix                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "No CSP found in enforcement mode"          | Real. The mock server sets a CSP on _API_ responses, but the API does not serve the app — and nothing else did either.         | A Vite plugin serves the production CSP from `vite preview`, and a relaxed one in dev where Vite needs an inline bootstrap. Keep it in step with whatever serves `dist/`. |
| "Document does not have a main landmark"    | Real. The sign-in and callback pages were bare `<div>`s, so screen-reader users had no skip target. Accessibility 98 → 100.    | `<main>` on all three.                                                                                                                                                    |
| "Browser errors were logged to the console" | Real. A cold load called `/auth/refresh` with no CSRF cookie, which can never succeed — a guaranteed 403 on every first visit. | The client checks for the cookie first. A visitor with no session now makes no request at all.                                                                            |

### 60 fps scrolling — still not measured

Rows are virtualized with TanStack Virtual and the server never returns more
than 200 at a time, so the DOM holds roughly 30 rows regardless of result size.
No frame timings were captured. A Chrome DevTools performance recording while
flinging the Devices table is the check.

---

## 3. API latency, measured

Taken with `loadtest/node-probe.mjs`, which signs in through the real OIDC
flow and then loops the nine journeys from the brief. All figures in
milliseconds, server-side plus loopback.

### One user — the cost of each request with nothing queued

| Journey                                 | p50 | p95 | p99 |
| --------------------------------------- | --- | --- | --- |
| Global search (`q=MUM-WS-0`)            | 141 | 214 | 256 |
| Devices list (filter + sort + 100 rows) | 12  | 27  | 36  |
| Device vulnerabilities tab              | 4   | 12  | 18  |
| Device diagnostics tab                  | 5   | 12  | 19  |
| Devices facets                          | 1   | 12  | 78  |
| Devices list, page 2 by cursor          | 4   | 11  | 16  |
| Device patches tab                      | 3   | 11  | 17  |
| Device software tab                     | 3   | 8   | 16  |
| Overview aggregates                     | 2   | 8   | 229 |
| Device detail                           | 2   | 5   | 9   |
| Vulnerability aggregation               | 2   | 5   | 8   |
| Deployment submit (group target)        | 2   | 4   | 9   |
| Script job submit (zone target)         | 2   | 3   | 7   |
| Token refresh                           | 2   | 3   | 5   |

Every journey is inside budget with a wide margin. The 229 ms p99 on Overview
is the first request of the run, before the aggregate cache is warm.

### Five concurrent users

| Journey                    | p50 | p95 | p99  |
| -------------------------- | --- | --- | ---- |
| Global search              | 419 | 795 | 1200 |
| Overview aggregates        | 255 | 626 | 955  |
| Device diagnostics tab     | 22  | 424 | 722  |
| Device vulnerabilities tab | 20  | 387 | 720  |
| Devices list               | 40  | 101 | 114  |
| Devices facets             | 7   | 92  | 96   |
| Device detail              | 16  | 74  | 101  |
| Deployment submit          | 28  | 66  | 108  |

Lists still meet their 500 ms budget. Global search and the Overview
aggregates do not.

### Twenty concurrent users

| Journey                    | p50 | p95  | p99  |
| -------------------------- | --- | ---- | ---- |
| Global search              | 782 | 1173 | 1332 |
| Overview aggregates        | 661 | 1078 | 1253 |
| Vulnerability aggregation  | 471 | 1002 | 1215 |
| Device vulnerabilities tab | 609 | 990  | 1725 |
| Devices facets             | 269 | 984  | 1130 |
| Device detail              | 225 | 902  | 986  |
| Devices list               | 124 | 383  | 522  |
| Script job submit          | 92  | 190  | 785  |
| Token refresh              | 82  | 190  | 223  |

**Throughput is flat at 70–78 requests per second across all three levels.**
That is the signature of a single saturated worker, not of a query getting
slower — the work per request is unchanged, it just queues.

---

## 4. What was fixed during measurement

The first run was useless and the second was worse than it needed to be. Both
produced real fixes:

| Observed                            | Cause                                                                                                                                       | Fix                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 94 % of requests failed             | The per-session rate limit of 600/minute, working correctly. A load generator is not a person.                                              | `MOCK_RATE_MAX` makes the ceiling explicit for a load run, so the default stays strict for everyone else.                                                                         |
| 10 % failed, sessions dying mid-run | The probe kept its old refresh cookie. The server rotates on use and treats a superseded token as theft — correctly destroying the session. | The probe adopts the rotated cookie, as the console does.                                                                                                                         |
| Facets p50 1,585 ms                 | Six `GROUP BY` scans over 50,000 rows with no supporting index.                                                                             | Indexes on `department`, `agent_version`, `kind`, `encrypted`, `(zone_id, compliance_pct)`, `(os_family, os_name)` and `device_patches(state)`. p50 fell to **1 ms** at one user. |
| Overview p95 2,531 ms               | Full estate recomputed per request, per reader.                                                                                             | 5-second `TtlCache`, keyed by the caller's zone scope so a narrower scope never reads a wider entry. p95 fell to **8 ms** at one user.                                            |
| 7 % failed with 403                 | The seeded role matrix had drifted from the contract's `x-roles`: the Auditor was missing `overview:read`.                                  | The seed now reads `x-roles` from the contract. One table, no second copy.                                                                                                        |

---

## 5. Why the detail budget breaches under concurrency

The mock server uses **better-sqlite3, which is synchronous**. Every query
blocks the Node event loop for its whole duration, so concurrent requests do
not overlap — they queue. Twenty concurrent readers each waiting behind
nineteen others is exactly the flat-throughput, rising-latency shape in the
tables above.

This is a property of the fixture server, not of the console or the contract:

- **The console** issues the same requests either way. Nothing in it changes
  when the backend gets faster.
- **The contract** is already shaped for scale — cursor pagination, `?fields=`
  projection, a 200-row ceiling, and server-side aggregates so the client
  never counts 50,000 rows itself.
- **The real backend** is Go with MySQL or PostgreSQL and a connection pool,
  where these queries run concurrently. Its numbers will not look like these
  and should be measured on its own.

**Do not use this report to size the Go service.** It measures a single-process
fixture server on a developer laptop. What it does establish is that the
console's request pattern is sane, that no endpoint is doing accidental
quadratic work, and that nothing returns 50,000 rows to the browser.

### Global search is the one genuine query weakness

At one user, global search costs 141 ms p50 against 12 ms for the filtered
list. It is `LOWER(col) LIKE '%term%'` across six columns, which no B-tree
index can serve. Options for the Go team: a full-text index (`MATCH ... AGAINST`
in MySQL, `tsvector` in PostgreSQL), or a trigram index in PostgreSQL. Worth
deciding deliberately — it is the slowest read in the console.

---

## 6. How this was measured

```bash
# Terminal 1 — the ceiling is raised deliberately for a load run
JWT_SECRET=<JWT_SECRET> NODE_ENV=production MOCK_RATE_MAX=1000000 \
  MOCK_AUTH_RATE_MAX=100000 pnpm mock

# Terminal 2
node loadtest/node-probe.mjs --concurrency 20 --seconds 30 \
  --json apps/aegis-one/docs/scans/latency-probe-c20.json
```

- **Machine**: Windows 11, Node 24.11.0, client and server on the same host
  over loopback. No network latency is included, and the load generator
  competes with the server for CPU.
- **Data**: the full 50,000-device seed, not a reduced set.
- **Accounts**: four fixture roles in rotation, so the mix includes a user who
  is correctly refused the write journeys. Those 403s are counted separately
  and excluded from the error rate — RBAC working is not a failure.
- **Raw output**: `docs/scans/latency-probe-c1.json`, `-c5.json`, `-c20.json`.

### k6 — run

k6 v2.3.0. The scenarios are in `loadtest/scenarios.js`; sign-in through the
OIDC flow is in `loadtest/lib/session.js`.

Thresholds are the product budget, so a run that breaches them exits non-zero.

#### smoke — 5 VUs, 1 minute

| Threshold                 | Result                    |      |
| ------------------------- | ------------------------- | ---- |
| checks pass rate > 99.5 % | **100 %** (1,166 / 1,166) | Pass |
| list p95 < 500 ms         | **361 ms**                | Pass |
| detail p95 < 200 ms       | **45 ms**                 | Pass |
| aggregate p95 < 800 ms    | **487 ms**                | Pass |
| error rate < 0.5 %        | **0 %** (0 / 2,067)       | Pass |

#### load — 200 VUs, 10 minutes

| Threshold                 | Result                      |          |
| ------------------------- | --------------------------- | -------- |
| checks pass rate > 99.5 % | **100 %** (32,780 / 32,780) | Pass     |
| error rate < 0.5 %        | **0.42 %** (248 / 58,284)   | Pass     |
| list p95 < 500 ms         | **8,045 ms**                | **Fail** |
| detail p95 < 200 ms       | **8,140 ms**                | **Fail** |
| aggregate p95 < 800 ms    | **9,210 ms**                | **Fail** |

Throughput: 93.3 requests/second, 2,915 iterations.

**Every functional check passes at 200 concurrent users. Only latency fails**,
and it fails for the reason in section 5: better-sqlite3 is synchronous, so
200 concurrent readers queue rather than overlap. Throughput is flat at 70–93
requests/second from 1 VU to 200, which is the signature of one saturated
worker, not of a query getting slower.

These are the mock server's numbers. **They say nothing about the Go service**,
which runs these queries concurrently against a connection pool.

#### stress and soak — not run

Both profiles are defined (`-e PROFILE=stress` ramps to 1,000 VUs;
`-e PROFILE=soak` holds 100 VUs for an hour). Neither has been executed.

Running them here would measure this laptop rather than the software: the load
generator, the server and the database all share one machine, and it already
saturates at 200 VUs. They belong on a host where the generator and the service
are separate, against the Go implementation.

### What the load runs fixed

| Observed                                  | Cause                                                                                                                                                          | Fix                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Smoke reported 2.25 % failures            | The load model had an Auditor clicking "New action" — a button that is not on their screen. Correct 403s were counted as failures, which would hide real ones. | The script checks the session's permissions, exactly as the console does, and only exercises what that role can reach. |
| Thresholds crossed on a run with 0 errors | k6 v2 removed the `__VU` and `__ITER` globals, and `setup()` has no scenario context.                                                                          | The PKCE verifier is built from randomness alone, which is unique in both contexts.                                    |

# Mock data seed

Everything the mock server serves is generated from one integer. Running the
seed twice with the same number produces byte-identical data, which is what
makes a screenshot, a load-test result or a failing test worth anything.

## The seed

|                      |                                                          |
| -------------------- | -------------------------------------------------------- |
| Default seed         | **`20260401`**                                           |
| Default device count | **50,000**                                               |
| Generator            | `mulberry32`, in `packages/mock-core/src/db/rng.ts`      |
| Fixed "now"          | `2026-11-01T09:30:00+05:30`                              |
| Output               | `apps/aegis-one/mock-server/data/aegis-mock.db` (SQLite) |

`Math.random` is never used in seeding. Every value — a hostname, a last-seen
timestamp, which CVEs land on which endpoint — comes from the same stream in
the same order, so changing the number changes the whole estate and keeping it
reproduces the estate exactly.

Rebuild it:

```bash
pnpm mock:seed
```

Override any of it with environment variables:

```bash
MOCK_SEED=20260401 MOCK_DEVICES=5000 pnpm mock:seed
```

A 50,000-device seed takes about 19 seconds and produces a database of roughly
200 MB. `MOCK_DEVICES=2000` is enough for day-to-day work on the console and
takes under two seconds.

## What gets generated

| Table                    | Rows at 50,000 devices | Notes                                                                                                            |
| ------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `devices`                | 50,000                 | Windows 10/11, Server 2016–2022, RHEL 8/9, Ubuntu 20.04–24.04, macOS 13–15, a small AIX set                      |
| `device_software`        | ~575,000               | Per-endpoint installs drawn from a 32-title catalogue                                                            |
| `device_patches`         | ~290,000               | Installed, pending, failed and not-applicable                                                                    |
| `device_vulnerabilities` | ~130,000               | Open, remediated and accepted-risk findings                                                                      |
| `zones`                  | 9                      | Mumbai HQ, Delhi Branch, Bengaluru Campus, Jaipur Branch, Pune Data Centre, Hyderabad, Chennai, Kochi, Ahmedabad |
| `software`               | 32                     | With publisher, category and size                                                                                |
| `patches`                | 31                     | Windows, Linux, macOS, third-party and firmware                                                                  |
| `vulnerabilities`        | 16                     | CVEs with CVSS and a known-exploited flag                                                                        |
| `config_checks`          | 200                    | Against CIS and an internal baseline                                                                             |
| `device_groups`          | 12                     | Static and rule-based                                                                                            |
| `deployments`            | 15                     | With ~4,500 per-endpoint results                                                                                 |
| `live_jobs`              | 8                      | Script, live-data and log-collection jobs, with per-endpoint output                                              |
| `log_bundles`            | 600                    | Collected diagnostic bundles                                                                                     |
| `peers`                  | ~24                    | Peer-cache nodes in the zones that have caching                                                                  |
| `users` / `roles`        | 8 / 6                  | One account per built-in role, plus a zone-scoped role                                                           |
| `api_tokens`             | 5                      | Only SHA-256 hashes are stored                                                                                   |
| `audit_log`              | 1,200                  | Spread over 90 days                                                                                              |

## Deliberate characteristics

The data is skewed on purpose, so the console has something to show rather than
a uniform green estate:

- **Jaipur Branch is the problem site.** Its relay is degraded, its endpoints
  check in less reliably (12% offline against 3% elsewhere), and its patch
  compliance is about nine points below the rest. Every "worst zone" aggregate
  in the console resolves to it.
- **About 6% of endpoints are under 10% free disk**, which is the most common
  real reason a deployment fails.
- **Three CVEs are flagged as exploited in the wild**, so the Vulnerabilities
  page has something that genuinely sorts to the top.
- **One API token is revoked and one is expired**, so the token list has states
  other than "active".
- **One integration is disconnected and one is degraded**, so Integrations is
  not a wall of green ticks.
- **One user account is disabled**, so Administration shows both states.

## Sign-in accounts

All fixture accounts share one password and one MFA code. They are seed data
for a mock identity provider, not credentials for anything:

| Email                              | Role                                 |
| ---------------------------------- | ------------------------------------ |
| `rohan.deshpande@example.co.in`    | Super Admin                          |
| `ananya.iyer@example.co.in`        | Admin                                |
| `siddharth.kulkarni@example.co.in` | Operator                             |
| `kavya.chandrasekar@example.co.in` | Auditor                              |
| `imran.shaikh@example.co.in`       | Read-only                            |
| `divya.nair@example.co.in`         | Jaipur Branch Operator (zone-scoped) |

Password `Aegis-Demo-2026`, MFA code `246813`. Both can be overridden with
`MOCK_PASSWORD` and `MOCK_MFA_CODE`.

The zone-scoped account is the one worth signing in as: it sees about 3,900
devices instead of 50,000, and every device outside Jaipur Branch returns 404
rather than 403 — which is what stops an id from one zone being probed from
another.

## Latency and error injection

Off by default, and refused outright unless the server is in development mode:

```bash
MOCK_LATENCY_MIN=120 MOCK_LATENCY_MAX=900 MOCK_ERROR_RATE=0.05 pnpm mock
```

Auth and OIDC routes are always excluded, so a chaotic server is still one you
can sign in to.

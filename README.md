# Aegis One

An enterprise Unified Endpoint Management console: React 18, TypeScript strict,
and a mock API server that serves a deterministic 50,000-device estate.

This is the first of three sibling consoles. The component library and the
mock-server core here are built to be reused by the next two, so neither
contains a brand value.

---

## Running it

Two terminals.

```bash
pnpm install
cp .env.example .env     # set JWT_SECRET to 32+ characters
```

The mock server reads that `.env` from the repo root. The console does not
need it: it defaults to `http://localhost:8080`.

```bash
pnpm mock                # terminal 1 — seeds 50,000 devices on first run (~2-3 min)
```

```bash
pnpm dev                 # terminal 2 — http://localhost:5173
```

Sign in as any fixture account; they all use password `Aegis-Demo-2026` and MFA
code `246813`. The interesting ones:

| Account                         | Role                   | What it shows                      |
| ------------------------------- | ---------------------- | ---------------------------------- |
| `rohan.deshpande@example.co.in` | Super Admin            | Everything                         |
| `imran.shaikh@example.co.in`    | Read-only              | Write actions hidden _and_ refused |
| `divya.nair@example.co.in`      | Jaipur Branch Operator | ~3,900 devices instead of 50,000   |

The full list is in [`apps/aegis-one/docs/seed.md`](apps/aegis-one/docs/seed.md).

---

## Layout

```
packages/ui          27 components + Storybook. No brand value anywhere.
packages/mock-core   Fastify factory, security, OIDC mock, SQLite query layer.
apps/aegis-one       This console: routes, pages, tokens, brand, seed, server.
contracts/           The OpenAPI contract. The single source of truth.
loadtest/            k6 scenarios and a Node latency probe.
```

---

## Verifying it

```bash
pnpm -r typecheck                            # strict, no any, no @ts-ignore
pnpm lint                                    # ESLint + security plugin + Prettier
pnpm test                                    # 53 unit tests
pnpm contract:lint                           # OpenAPI, 126 operations
pnpm --filter @aegis/mock-server check:api   # 41 live security checks
pnpm --filter @aegis/console e2e             # 33 browser tests (needs both servers)
pnpm audit --audit-level high
```

Load, performance and security scans — see `loadtest/` and [`security/README.md`](security/README.md):

```bash
pnpm load:smoke                              # k6, 5 VUs
pnpm perf:lighthouse                         # against a production build
pnpm scan:semgrep
pnpm scan:zap:baseline
node security/run-active-scan.mjs            # authenticated ZAP active scan
```

The two integration suites are the ones that matter. They caught, during this
build: a CSP rule that broke sign-in after the second factor, two React
StrictMode races in token handling, a cursor-pagination bug that broke page
two of every list, a wizard that lost its state between steps, and a
session-replay gap where a stolen refresh token was refused but the session
survived.

---

## Documentation

|                                                                  |                                             |
| ---------------------------------------------------------------- | ------------------------------------------- |
| [Feature inventory](apps/aegis-one/docs/feature-inventory.md)    | What the reference build does, page by page |
| [Decisions](apps/aegis-one/docs/decisions.md)                    | Why things are the way they are             |
| [Seed](apps/aegis-one/docs/seed.md)                              | The fixture estate and how to rebuild it    |
| [Performance report](apps/aegis-one/docs/perf-report.md)         | Measured numbers, and what was not run      |
| [Security review](apps/aegis-one/docs/vapt-checklist.md)         | OWASP Top 10, scan results, accepted risks  |
| [Backend handover](apps/aegis-one/docs/handover-backend.md)      | For the Go team implementing the contract   |
| [Building a sibling console](docs/building-a-sibling-console.md) | For Saleos One and the third console        |

---

## Two things worth knowing

**Switching to the real backend is one environment variable.**
`VITE_API_BASE_URL`. Nothing else in the console knows which implementation is
on the other end.

**There is no remote control, and there must not be.** No remote desktop, no
screen view or share, no remote shell or terminal session. The contract has no
such endpoint and `x-roles` has no such permission. Remote script execution is
supported and is a different thing: a non-interactive job you submit, poll and
read results from, with no session to attach to.

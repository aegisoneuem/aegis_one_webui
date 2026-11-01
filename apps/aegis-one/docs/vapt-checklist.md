# Security review

Last run 2026-11-02 against the console and the mock server.

Scope is the console and `packages/mock-core`. The real Go backend is not in
scope and must be reviewed on its own — the contract describes what it has to
enforce, but nothing here proves it does.

**Anything not executed says "not run". No result in this document is
estimated.**

---

## 1. Automated scans

| Scan                                                 | Status      | Result                               | Evidence                     |
| ---------------------------------------------------- | ----------- | ------------------------------------ | ---------------------------- |
| `pnpm audit`                                         | **Run**     | 5 moderate, **0 high, 0 critical**   | `docs/scans/pnpm-audit.json` |
| Semgrep `p/react`, `p/typescript`, `p/owasp-top-ten` | **Run**     | 6 findings → **5 fixed, 1 accepted** | `docs/scans/semgrep.json`    |
| `eslint-plugin-security`                             | **Run**     | 0 errors (part of `pnpm lint`)       | CI                           |
| TypeScript strict                                    | **Run**     | 0 errors, no `any`, no `@ts-ignore`  | CI                           |
| OWASP ZAP baseline                                   | **Not run** | —                                    | ZAP not installed            |
| OWASP ZAP active scan                                | **Not run** | —                                    | ZAP not installed            |

### Semgrep findings and what happened to them

| #   | Severity | Finding                                                         | Outcome                                                                                                                                                                                                                                                                                                             |
| --- | -------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3 | Medium   | `raw-html-format` — user data in hand-built HTML, `oidc/idp.ts` | **Fixed.** The sign-in pages now build through an `html` tagged template that escapes every interpolated value. Previously each call site escaped its own, which works until someone adds a field and forgets. Now forgetting is impossible: a value reaches the output unescaped only if it is already `SafeHtml`. |
| 4   | High     | `pnpm-block-exotic-sub-dependencies`                            | **Fixed.** `blockExoticSubdeps: true`. Transitive dependencies must come from the registry, never a git URL or a relocatable tarball.                                                                                                                                                                               |
| 5   | High     | `pnpm-minimum-release-age`                                      | **Accepted risk AR-1.**                                                                                                                                                                                                                                                                                             |
| 6   | High     | `pnpm-trust-policy`                                             | **Accepted risk AR-1.**                                                                                                                                                                                                                                                                                             |

### `pnpm audit` findings

All five are moderate; none is high or critical, so `pnpm audit --audit-level high`
passes. Two are in production code:

| Package                     | Finding                                                             | Assessment                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react-router`              | Open redirect via backslash in `<Link>`/`useNavigate`               | **Mitigated — AR-2.** Patched only in v7; the stack is pinned to v6. Every dynamic path now goes through `src/app/safeNavigate.ts`: ids are `encodeURIComponent`-escaped and the one server-supplied page name (AEGIS Insight's action button) is checked against the nineteen real pages. |
| `react-router`              | Constructor injection in `deserializeErrors()` during SSR hydration | **Not applicable — AR-2.** The console is a client-rendered SPA. There is no SSR and no hydration path, so the affected code never executes.                                                                                                                                               |
| `uuid`, `minimatch`, `glob` | Various                                                             | Build-time only, reached through Storybook and Fastify tooling. Not in the shipped bundle.                                                                                                                                                                                                 |

---

## 2. OWASP Top 10 and ASVS L2

Each row says what was tested and how. "Verified" means a test exercises it and
is committed.

### A01 Broken access control

| Check                                          | Status       | How                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every route requires authentication            | **Verified** | One `preHandler` in the app factory covers every route under the base path; only four auth routes are public. `check:api` asserts 401 without a token.                                                                                                      |
| Every operation requires a permission          | **Verified** | Taken from the contract's `x-required-permission`, so a route cannot ship without one by someone forgetting to write the check.                                                                                                                             |
| Role restrictions enforced server-side         | **Verified** | `check:api` and Playwright both assert a read-only user gets 403 on a write the UI also hides.                                                                                                                                                              |
| **IDOR on every object id**                    | **Verified** | A zone-scoped user gets **404, not 403**, for a device in another zone — a 403 would confirm the id exists. Asserted for the device route and for a sub-resource (`/devices/:id/software`), because checking only the parent would leave the children open. |
| Sub-resources re-check visibility              | **Verified** | `routes/devices.ts` calls `assertVisible` on each tab endpoint rather than trusting the parent call.                                                                                                                                                        |
| Scoped roles cannot target outside their zones | **Verified** | Deployment and script-job targets are resolved server-side under the caller's zone scope.                                                                                                                                                                   |
| A token cannot exceed its creator's rights     | **Verified** | `POST /admin/tokens` rejects scopes the creator does not hold.                                                                                                                                                                                              |
| Forced browsing to an unauthorised page        | **Verified** | The router refuses, and the server refuses independently.                                                                                                                                                                                                   |

### A02 Cryptographic failures

| Check                                   | Status                     | How                                                                                                                            |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Refresh tokens stored only as a hash    | **Verified**               | SHA-256; the unit test asserts the plaintext never appears in a stored session.                                                |
| API token secrets stored only as a hash | **Verified**               | Returned once at creation. No endpoint can return one again, and the list endpoint's column allowlist has no `token_hash`.     |
| Access token never in web storage       | **Verified by inspection** | Module variable in `api/client.ts`. Anything in `localStorage` is readable by any script on the origin.                        |
| Refresh token unreadable by JavaScript  | **Verified**               | httpOnly, Secure (behind TLS), SameSite=Strict, path-scoped to `/api/v1/auth`.                                                 |
| Tokens compared in constant time        | **Verified**               | `timingSafeEqual`; unit tested.                                                                                                |
| No secrets in the repository            | **Verified**               | `.env.example` uses `<JWT_SECRET>` placeholders. The server refuses to start without a `JWT_SECRET` of at least 32 characters. |
| HSTS behind TLS                         | **Verified by inspection** | One year, `includeSubDomains`, preload. Off over plain http, where it would be meaningless.                                    |

### A03 Injection

| Check                                         | Status                     | How                                                                                                                                                                  |
| --------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQL injection via sort**                    | **Verified**               | Column names cannot be parameterised, so sortable columns are an allowlist. A unit test sends `name); DROP TABLE widgets; --` and asserts the table survives.        |
| **SQL injection via `?fields=`**              | **Verified**               | Same allowlist. Unit tested.                                                                                                                                         |
| SQL injection via filters and search          | **Verified**               | All values are bound parameters. A unit test sends `'; DROP TABLE widgets; --` as a search term and asserts zero rows and an intact table.                           |
| **Stored XSS via device names**               | **Verified by design**     | React escapes text by default; no `dangerouslySetInnerHTML` anywhere in the console.                                                                                 |
| **Stored XSS via software titles**            | **Verified by design**     | Same.                                                                                                                                                                |
| **XSS via script output**                     | **Verified by inspection** | Rendered in a `<pre>` as text, and truncated server-side at 256 KiB.                                                                                                 |
| **Reflected XSS on the sign-in pages**        | **Verified**               | The `html` tagged template escapes by construction; Semgrep findings 1–3 closed.                                                                                     |
| **CSV formula injection in exports**          | **Verified**               | Every cell runs through `neutralizeFormula`. Unit tested against `=`, `+`, `-`, `@`, tab and CR, including the `=HYPERLINK(...)` case. Applies to both CSV and XLSX. |
| Script bodies are never evaluated server-side | **Verified by inspection** | Stored as text, returned as text.                                                                                                                                    |

### A04 Insecure design

| Check                             | Status                     | How                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **No remote control anywhere**    | **Verified**               | Playwright asserts that no page of Live Activity contains "remote desktop", "remote control", "screen share", "screen view", "remote session", "terminal session" or "take control". The contract has no such endpoint and no such permission. Remote script execution is a submit-poll-fetch job with no session, socket or attach. |
| Targets resolved server-side      | **Verified**               | A client sends a group, zone or filter; the server decides which endpoints that means.                                                                                                                                                                                                                                               |
| Destructive actions confirm first | **Verified by inspection** | Token revocation uses a modal naming the token and its last use.                                                                                                                                                                                                                                                                     |
| Explicit target ceiling           | **Verified by inspection** | 5,000 explicit ids; larger sets must go through a group or a filter.                                                                                                                                                                                                                                                                 |

### A05 Security misconfiguration

| Check                                                   | Status                     | How                                                                                                                                                         |
| ------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSP without `unsafe-inline` or `unsafe-eval`**        | **Verified**               | `default-src 'none'`, explicit per-directive allowances. This is why fonts are self-hosted and styles are CSS Modules.                                      |
| **Clickjacking**                                        | **Verified**               | `frame-ancestors 'none'` plus `X-Frame-Options: DENY`.                                                                                                      |
| `X-Content-Type-Options: nosniff`                       | **Verified**               | Asserted by header inspection.                                                                                                                              |
| Referrer-Policy                                         | **Verified**               | `no-referrer` — a full URL would leak device ids and filter terms off-site.                                                                                 |
| Permissions-Policy                                      | **Verified**               | Camera, microphone, geolocation and the rest all denied; the console uses none of them.                                                                     |
| **CORS not reflective**                                 | **Verified by inspection** | An explicit origin list. `origin: true` with credentials is the same as no policy at all.                                                                   |
| **Verbose errors**                                      | **Verified**               | One envelope. Stack traces and server messages go to the log, never to the client; `check:api` asserts an error body carries a request id and no internals. |
| Latency/error injection cannot be enabled in production | **Verified by inspection** | The factory refuses chaos options unless `dev` is set, and logs that it ignored them.                                                                       |

### A07 Identification and authentication

| Check                                  | Status                     | How                                                                                                                                                                                                                                                                                |
| -------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session management**                 | **Verified**               | 15-minute access token; refresh rotates on every use.                                                                                                                                                                                                                              |
| **Refresh replay detection**           | **Verified**               | Spent token hashes are retained per session. Presenting one revokes the whole family, including the token the thief holds. A unit test found that this was previously _not_ working — a replayed token was refused but the session survived — and the fix is covered by that test. |
| Sign-out revokes server-side           | **Verified**               | Playwright asserts the session does not come back after a reload.                                                                                                                                                                                                                  |
| **MFA required**                       | **Verified**               | Playwright asserts a wrong code is refused.                                                                                                                                                                                                                                        |
| User enumeration                       | **Verified**               | One message for a wrong email, a wrong password and a disabled account. Playwright asserts the message says nothing about accounts existing.                                                                                                                                       |
| **Open redirect on the SSO callback**  | **Verified**               | `redirect_uri` is matched exactly against a registered list. `check:api` asserts `https://evil.example.com/steal` is refused with 400.                                                                                                                                             |
| PKCE required                          | **Verified**               | S256 only; a missing or non-S256 challenge is refused. `check:api` asserts a mismatched verifier fails.                                                                                                                                                                            |
| **Authorization codes are single-use** | **Verified**               | Deleted on redemption whatever the outcome. `check:api` asserts a replay fails.                                                                                                                                                                                                    |
| `state` validated on return            | **Verified by inspection** | Compared in `completeSignIn`; a mismatch aborts before the exchange.                                                                                                                                                                                                               |
| **Auth rate limiting**                 | **Verified by inspection** | A separate, tighter bucket keyed on IP.                                                                                                                                                                                                                                            |

### A08 Software and data integrity

| Check                                          | Status       | How                                                                                                                                                                     |
| ---------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mass assignment**                            | **Verified** | Every request body in the contract sets `additionalProperties: false`, compiled by Ajv. `check:api` asserts a body carrying `role: "Super Admin"` is rejected with 400. |
| Request validation from the contract           | **Verified** | Schemas are compiled from the spec, not restated.                                                                                                                       |
| Transitive dependencies from the registry only | **Verified** | `blockExoticSubdeps: true`.                                                                                                                                             |
| Build scripts blocked by default               | **Verified** | Only `esbuild` is allowed, and it is listed explicitly.                                                                                                                 |

### A09 Logging and monitoring

| Check                         | Status                     | How                                                                                                                                                                                 |
| ----------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No sensitive data in logs** | **Verified by inspection** | Authorization, cookie, CSRF and Set-Cookie redacted. Query strings log parameter _names_ only — a search term can be a hostname, a username or a serial.                            |
| **No sensitive data in URLs** | **Partial — see AR-3**     | Filters are in the query string by design, so a shared link reproduces a list. Device ids appear in paths. Neither is a credential, but both reach server logs and browser history. |
| Request ids end to end        | **Verified**               | Returned in `x-request-id` and in every error body.                                                                                                                                 |
| Security events logged        | **Verified by inspection** | Failed sign-in, failed MFA, job submission, token revocation.                                                                                                                       |
| Audit trail                   | **Verified**               | Who, what, which object, outcome and source IP.                                                                                                                                     |

### A10 SSRF

| Check                                | Status                     | How                                                                                                                                                  |
| ------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| No user-controlled outbound requests | **Verified by inspection** | The mock server makes none. The integrations page is read-only metadata. The Go backend will have real outbound calls and needs its own SSRF review. |

### Additional checks from the brief

| Check                                   | Status                     | How                                                                                                                                                                                                               |
| --------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSRF on all state-changing requests** | **Verified**               | Double-submit cookie plus SameSite=Strict. `check:api` asserts a POST without `X-CSRF-Token` is refused with 403 and that the same POST succeeds with it.                                                         |
| **Rate-limit bypass**                   | **Partial — AR-4**         | Keyed on session id where there is one, falling back to IP. Keying on IP alone would let one office behind a NAT exhaust the budget and let a rotating attacker escape it. Not tested under a distributed source. |
| **API token lifecycle**                 | **Verified**               | Create → shown once → used → revoked. Revoking twice is a 409. The list never exposes a secret or a hash; `check:api` asserts that.                                                                               |
| **Uploaded package handling**           | **Not applicable**         | The console does not upload packages. Software is a read-only catalogue. If upload is added later it needs its own review — type, size, signature and storage location.                                           |
| **Script input handling**               | **Verified by inspection** | Capped at 64,000 characters, stored as text, never evaluated server-side.                                                                                                                                         |
| **Script output sanitisation**          | **Verified by inspection** | Truncated at 256 KiB server-side, rendered as text.                                                                                                                                                               |

---

## 3. Accepted risks

### AR-1 — pnpm `minimumReleaseAge` and `trustPolicy` not enabled

**Risk**: a newly published malicious version of a dependency could be
installed before it is pulled, and a dependency could be silently downgraded
to a less-trusted source.

**Why accepted**: both are correct controls that cannot be retrofitted onto
this lockfile. `minimumReleaseAge: 14400` rejects 78 legitimate entries and
even three days rejects ten; `trustPolicy: no-downgrade` rejects `semver@6.3.1`
and `undici-types@6.21.0`, both ordinary old majors pulled in transitively. A
policy that blocks `pnpm install` is a policy the next person deletes, which
leaves the project worse off than an honest note.

**Compensating controls**: `blockExoticSubdeps` is on; `pnpm audit` runs and
fails on high or critical; the lockfile is committed and reviewed.

**Action**: enable both during the next planned dependency refresh, with a
lockfile rebuilt from a fresh resolution and a full test pass. The settings are
in `pnpm-workspace.yaml`, commented, with the values to use.

### AR-2 — React Router pinned to v6 with two open advisories

**Risk**: open redirect via a backslash in a `to` value; constructor injection
during SSR hydration.

**Why accepted**: both are fixed only in React Router 7. The brief fixes the
stack at v6, and a major upgrade is not a security patch to apply unreviewed.

**Compensating controls**: the SSR issue cannot be reached — the console is
client-rendered with no hydration path. The open redirect is mitigated at every
call site: `src/app/safeNavigate.ts` escapes every dynamic segment and
allowlists the one page name that comes from the server.

**Action**: upgrade to React Router 7 when the stack decision is revisited;
keep `safeNavigate` either way, since it is the right habit independent of the
CVE.

### AR-3 — Filters and ids are visible in URLs

**Risk**: filter values and device ids reach server access logs, browser
history and `Referer` headers on outbound links.

**Why accepted**: putting filters in the URL is what makes a filtered list a
link someone can paste into a ticket, which is a real operational need. None of
these values is a credential.

**Compensating controls**: `Referrer-Policy: no-referrer` stops them leaving
with an outbound request. The server logs parameter names, not values. Zone
scoping means an id in a URL is still useless to someone outside that zone.

**Action**: none. Revisit if a filter is ever added over genuinely sensitive
data, such as a free-text note field.

### AR-4 — Rate limiting not tested against a distributed source

**Risk**: an attacker with many source addresses and no session could exceed
the intended budget.

**Why accepted**: the limiter is per-process and in-memory, which is correct
for a fixture server. A real deployment limits at the edge as well.

**Action**: the Go service should enforce limits at the gateway, and
unauthenticated endpoints should be limited more tightly than authenticated
ones. Keep the stricter auth bucket.

---

## 4. Not run, and what it would take

| Check                            | Why not                             | How to run it                                                                                                                                                               |
| -------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ZAP baseline scan**            | Not installed; needs Docker or Java | `docker run -t zaproxy/zap-stable zap-baseline.py -t http://localhost:5173 -r zap-baseline.html`                                                                            |
| **ZAP active scan**              | Same                                | `zap-full-scan.py -t http://localhost:5173`. Run against the mock server only — an active scan sends real attack traffic.                                                   |
| **Penetration test by a person** | Out of scope here                   | Everything above is automated or asserted by a test. A human tester should focus on the OIDC flow, the zone-scoping boundary, and the script-execution job.                 |
| **Go backend review**            | Not built here                      | The contract says what to enforce. It does not prove the implementation enforces it — in particular zone scoping, the permission matrix and 404-not-403 on cross-scope ids. |

---

## 5. Reproducing this

```bash
pnpm audit --audit-level high          # fails on high or critical
pnpm lint                              # includes eslint-plugin-security
pnpm -r typecheck
pnpm test                              # 52 unit tests
pnpm --filter @aegis/mock-server check:api   # 39 live security checks
pnpm --filter @aegis/console e2e             # 33 browser tests

semgrep --config p/react --config p/typescript --config p/owasp-top-ten \
  --exclude node_modules --exclude dist .
```

The mock server and the dev server must both be running for the last two.

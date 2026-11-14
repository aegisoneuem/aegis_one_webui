# Security scanning

Scan configurations and the helper that gets a scanner a session.

| File                  | What it does                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `zap-baseline.yaml`   | Passive crawl of the console and API. Sends no attack traffic.                             |
| `zap-active-api.yaml` | Authenticated active scan of the API from the OpenAPI contract. Sends real attack traffic. |
| `get-token.mjs`       | Signs in through the OIDC flow and prints a bearer and CSRF token.                         |

Results land in `apps/aegis-one/docs/scans/`. Findings and their dispositions
are written up in `apps/aegis-one/docs/vapt-checklist.md`.

---

## Running them

ZAP is not a dependency of this repo. Install it separately:

```bash
winget install ZAP.ZAP          # Windows
brew install --cask zap         # macOS
```

Then make `zap.bat` (or `zap.sh`) reachable on `PATH`.

### Passive baseline

Safe anywhere. Start the console and the mock server first.

```bash
pnpm scan:zap:baseline
```

The plan uses ZAP's **AJAX spider** as well as the traditional one. The console
is a single-page app: a traditional spider sees one HTML file and stops, so a
baseline without the AJAX spider reports almost nothing and looks like a pass.

#### If the AJAX spider finds 0 URLs, do not accept the report

Check the log for `spiderAjax found 0 URLs`. On this machine the AJAX spider
could not start a browser at all: ZAP 2.17 bundles chromedriver 143, the
installed Chrome is 156, and SeleniumManager had no network to fetch a match.
The plan still completed and still wrote a report — over 35 messages.

The fallback drives the built bundle through ZAP as a plain proxy, which needs
no chromedriver. Start ZAP as a daemon:

```bash
zap.bat -daemon -host 127.0.0.1 -port 8099 -config api.disablekey=true
```

Then, with the preview server on 4173 and the mock server on 8080:

```bash
pnpm scan:zap:crawl
```

It signs in, walks all 19 routes plus 9 tabbed views, and **exits non-zero if
it reached fewer views than it set out to** — a partial crawl is a partial
scan. The reference run covered 28 views and 953 messages.

Write the report from the daemon when the crawl is done:

```bash
curl "http://127.0.0.1:8099/OTHER/core/other/htmlreport/" -o apps/aegis-one/docs/scans/zap-baseline.html
```

Two things to know when reading a proxy-crawled report. Totals include **every
host the browser touched**, so fonts, analytics and other third-party traffic
appear as findings against their own domains — judge only `localhost:4173` and
`localhost:8080`. And the crawl signs in: an unauthenticated one reaches the
sign-in screen and nothing else, which also looks like a pass.

### Authenticated active scan

**Run this against the mock server only.** It sends injection payloads,
traversal attempts and tampered requests, and it will create and modify data.

```bash
eval "$(pnpm scan:token)"       # sets ZAP_TOKEN and ZAP_CSRF
pnpm scan:zap:active
```

Scanning only the unauthenticated surface would miss nearly everything that
matters here — every injection sink, every object id and the whole permission
model sit behind a bearer token. The plan injects the headers into every
request with ZAP's replacer so the scanner tests the API as a signed-in user.

Two endpoints are excluded on purpose:

- `/auth/logout` — ending the session mid-scan makes every later request a 401,
  and the scan then reports nothing while appearing to have run.
- `/auth/refresh` — it rotates the refresh token, and a scanner replaying it
  trips the replay detection and destroys the session.

The access token lasts 15 minutes and a full active scan outlives that. Take a
fresh token immediately before starting.

### Scanning as a lower-privileged user

The default is Super Admin so the scan reaches every endpoint. To check the
permission model holds under attack traffic rather than only under polite
requests:

```bash
eval "$(node security/get-token.mjs --email imran.shaikh@example.co.in --export)"
pnpm scan:zap:active
```

Every write should come back 403, and every object outside scope should come
back 404 rather than 403.

---

## The other scans

```bash
pnpm audit --audit-level high   # fails on high or critical
pnpm lint                       # includes eslint-plugin-security
pnpm scan:semgrep               # p/react, p/typescript, p/owasp-top-ten
```

Semgrep installs with `pip install --user semgrep`.

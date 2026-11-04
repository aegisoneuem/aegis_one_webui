/**
 * End-to-end check of the mock server: sign-in through the OIDC flow, then
 * the security controls and the data endpoints. Prints a pass/fail line per
 * check and exits non-zero if any failed.
 */
import { createHash } from 'node:crypto';

// Override when the server under test is not on its default port.
const BASE = process.env['MOCK_BASE'] ?? 'http://localhost:8080';
const API = `${BASE}/api/v1`;
// Must match a redirect URI the server has registered, which follows
// APP_ORIGIN. Override when the console is served from somewhere else.
const REDIRECT = process.env['E2E_REDIRECT_URI'] ?? 'http://localhost:5173/auth/callback';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const jar = new Map();
function saveCookies(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const [k, v] = pair.split('=');
    if (v === '') jar.delete(k);
    else jar.set(k, v);
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function signIn(email, password) {
  const verifier = 'verifier-0123456789abcdefghijklmnopqrstuvwxyz-ABC';
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const authorize = await fetch(
    `${BASE}/oidc/authorize?client_id=aegis-one-console&redirect_uri=${encodeURIComponent(REDIRECT)}&state=s1&code_challenge=${challenge}&code_challenge_method=S256`,
  );
  saveCookies(authorize);
  const html = await authorize.text();
  const loginId = /name="login_id" value="([^"]+)"/.exec(html)?.[1];
  const formCsrf = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1];

  // The sign-in flow is bound to an httpOnly cookie set at /authorize, so a
  // non-browser client has to carry it the way a browser would.
  const login = await fetch(`${BASE}/oidc/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
    body: new URLSearchParams({ login_id: loginId, csrf_token: formCsrf, email, password }),
  });
  saveCookies(login);

  const mfa = await fetch(`${BASE}/oidc/mfa`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
    body: new URLSearchParams({ login_id: loginId, csrf_token: formCsrf, code: '246813' }),
    redirect: 'manual',
  });
  saveCookies(mfa);
  const code = new URL(mfa.headers.get('location')).searchParams.get('code');

  const tokenRes = await fetch(`${API}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: REDIRECT }),
  });
  saveCookies(tokenRes);
  return { body: await tokenRes.json(), code, verifier };
}

const authed = (token, extra = {}) => ({
  authorization: `Bearer ${token}`,
  cookie: cookieHeader(),
  ...extra,
});

const run = async () => {
  // --- Sign-in -------------------------------------------------------------
  const {
    body: session,
    code,
    verifier,
  } = await signIn('rohan.deshpande@example.co.in', 'Aegis-Demo-2026');
  const token = session.accessToken;
  check('sign-in returns an access token', typeof token === 'string' && token.length > 100);
  check('refresh token is not in the response body', !JSON.stringify(session).includes('aegis_rt'));
  check('refresh cookie is httpOnly and scoped to /auth', jar.has('aegis_rt'));
  check(
    'csrf token is issued',
    typeof session.csrfToken === 'string' && session.csrfToken.length > 20,
  );
  check(
    'role and permissions are returned',
    session.user.role === 'Super Admin' && session.user.permissions.length > 0,
  );
  check('access token expires in 15 minutes', session.expiresIn === 900, `${session.expiresIn}s`);

  const replay = await fetch(`${API}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: REDIRECT }),
  });
  check('authorization code is single-use', replay.status === 400, `HTTP ${replay.status}`);

  // --- Lists ---------------------------------------------------------------
  const listRes = await fetch(
    `${API}/devices?limit=3&fields=hostname,status,zoneName,compliancePct&sort=compliancePct&order=asc`,
    { headers: authed(token) },
  );
  const list = await listRes.json();
  check('devices list returns a page', Array.isArray(list.items) && list.items.length === 3);
  check('total counts the whole filtered set', list.page.total === 50000, String(list.page.total));
  check('cursor is returned for the next page', typeof list.page.nextCursor === 'string');
  // `id` and `hostname` are the spec's alwaysFields: the client needs them to
  // build a row link whatever else it asked for.
  check(
    'fields projection drops everything not asked for',
    Object.keys(list.items[0]).sort().join(',') === 'compliancePct,hostname,id,status,zoneName',
    Object.keys(list.items[0]).join(','),
  );

  const page2 = await fetch(
    `${API}/devices?limit=3&fields=hostname&cursor=${encodeURIComponent(list.page.nextCursor)}&sort=compliancePct&order=asc`,
    {
      headers: authed(token),
    },
  ).then((r) => r.json());
  check('cursor paging advances', page2.items[0].hostname !== list.items[0].hostname);

  const clamped = await fetch(`${API}/devices?limit=5000&fields=id`, {
    headers: authed(token),
  }).then((r) => r.json());
  check('page size is clamped to 200', clamped.items.length === 200, String(clamped.items.length));

  const badSort = await fetch(`${API}/devices?sort=hostname);DROP TABLE devices;--`, {
    headers: authed(token),
  });
  check('unknown sort column is rejected', badSort.status === 400, `HTTP ${badSort.status}`);

  const badField = await fetch(`${API}/devices?fields=hostname,token_hash`, {
    headers: authed(token),
  });
  check('undeclared field is rejected', badField.status === 400, `HTTP ${badField.status}`);

  const search = await fetch(`${API}/devices?q=MUM-WS-01&limit=2&fields=hostname`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'server-side search narrows the set',
    search.page.total > 0 && search.page.total < 50000,
    String(search.page.total),
  );

  // --- Aggregates ----------------------------------------------------------
  const overview = await fetch(`${API}/overview`, { headers: authed(token) }).then((r) => r.json());
  // The Overview restoration moved these into the contract's `Overview`:
  // `counts`, `health` and `patchCompliance`, not endpoints/posture/byZone.
  check(
    'overview counts 50,000 endpoints',
    overview.counts.managedEndpoints === 50000,
    String(overview.counts.managedEndpoints),
  );
  check('overview scores estate health', typeof overview.health.score === 'number');
  check(
    'overview breaks patch compliance down by OS',
    overview.patchCompliance.byOs.length > 0,
    String(overview.patchCompliance.byOs.length),
  );

  // --- Vulnerabilities -----------------------------------------------------
  const vulnSummary = await fetch(`${API}/vulnerabilities/summary`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'vulnerability summary grades the estate',
    vulnSummary.exposureScore >= 0 &&
      vulnSummary.exposureScore <= 1000 &&
      'ABCDF'.includes(vulnSummary.grade),
    `${vulnSummary.exposureScore} / grade ${vulnSummary.grade}`,
  );
  check(
    'the summary carries all six dashboard series',
    vulnSummary.trend.length === 12 &&
      vulnSummary.age.length === 4 &&
      vulnSummary.topPriorities.length > 0 &&
      vulnSummary.topFixes.length > 0 &&
      vulnSummary.threatIndicators.length > 0 &&
      typeof vulnSummary.sla.overdue === 'number',
  );

  // The counter above the grid and the rows inside it are the same query.
  const openFindings = await fetch(`${API}/vulnerabilities/findings?state=open&limit=100`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'open findings total matches the summary counter',
    openFindings.page.total === vulnSummary.openFindings,
    `${openFindings.page.total} vs ${vulnSummary.openFindings}`,
  );

  const exploited = await fetch(
    `${API}/vulnerabilities/findings?state=open&threat=known-exploited&limit=100`,
    { headers: authed(token) },
  ).then((r) => r.json());
  check(
    'the known-exploited filter matches its counter',
    exploited.page.total === vulnSummary.knownExploited,
    `${exploited.page.total} vs ${vulnSummary.knownExploited}`,
  );
  check(
    'every finding carries the drawer fields the contract declares',
    openFindings.items.every(
      (f) =>
        typeof f.family === 'string' &&
        typeof f.solution === 'string' &&
        ['patch', 'workaround'].includes(f.fixType) &&
        ['within', 'due-soon', 'overdue'].includes(f.sla) &&
        Array.isArray(f.threats),
    ),
  );

  const vulnDevices = await fetch(`${API}/vulnerabilities/devices?limit=5`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'devices are ranked by exposure, worst first',
    vulnDevices.items.length === 5 &&
      vulnDevices.items.every((d, i) => i === 0 || d.exposure <= vulnDevices.items[i - 1].exposure),
  );

  const remediations = await fetch(`${API}/vulnerabilities/remediations`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'remediations rank fixes by the risk they remove',
    remediations.items.length > 0 &&
      remediations.items.every(
        (r) => r.riskReducedPct >= 0 && r.riskReducedPct <= 100 && r.cves.length > 0,
      ),
  );

  const scanRes = await fetch(`${API}/vulnerabilities/scans`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({
      name: 'Contract check scan',
      template: 'critical-and-exploited-quick',
      targets: {},
      schedule: 'now',
      authenticated: true,
    }),
  });
  // Accepted for later, like every other job the console submits.
  check('a scan is accepted with a CSRF header', scanRes.status === 202, `HTTP ${scanRes.status}`);

  const insight = await fetch(`${API}/insight`, { headers: authed(token) }).then((r) => r.json());
  check('insight returns findings', insight.findings.length >= 5);

  // --- Device detail -------------------------------------------------------
  const firstId = (
    await fetch(`${API}/devices?limit=1&fields=id`, { headers: authed(token) }).then((r) =>
      r.json(),
    )
  ).items[0].id;
  const detail = await fetch(`${API}/devices/${firstId}`, { headers: authed(token) }).then((r) =>
    r.json(),
  );
  check('device detail resolves', detail.id === firstId);
  const sw = await fetch(`${API}/devices/${firstId}/software`, { headers: authed(token) }).then(
    (r) => r.json(),
  );
  check('device software tab returns rows', sw.items.length > 0, `${sw.items.length} titles`);
  const diag = await fetch(`${API}/devices/${firstId}/diagnostics`, {
    headers: authed(token),
  }).then((r) => r.json());
  check('device diagnostics tab returns posture', typeof diag.posture.diskFreePct === 'number');

  const missing = await fetch(`${API}/devices/dev-does-not-exist`, { headers: authed(token) });
  check('unknown device id is 404', missing.status === 404, `HTTP ${missing.status}`);

  // --- CSRF ----------------------------------------------------------------
  const jobBody = {
    kind: 'script',
    name: 'Verify firewall state',
    script: {
      language: 'powershell',
      body: 'Get-NetFirewallProfile | Select-Object Name, Enabled',
    },
    targets: { zone: 'zn-jai-br' },
  };

  const noCsrf = await fetch(`${API}/liveops/script-jobs`, {
    method: 'POST',
    headers: authed(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(jobBody),
  });
  check(
    'state-changing request without a CSRF header is refused',
    noCsrf.status === 403,
    `HTTP ${noCsrf.status}`,
  );

  const withCsrf = await fetch(`${API}/liveops/script-jobs`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify(jobBody),
  });
  const job = await withCsrf.json();
  check(
    // 202, not 201: the contract says accepted-for-later, because the agent
    // runs the payload when it next checks in.
    'script job is accepted with a CSRF header',
    withCsrf.status === 202,
    `HTTP ${withCsrf.status}`,
  );
  check(
    'script job resolves its targets server-side',
    job.targetCount > 0,
    `${job.targetCount} endpoints`,
  );
  check('script job is queued, not a session', job.status === 'queued');

  // --- Mass assignment -----------------------------------------------------
  const extraField = await fetch(`${API}/liveops/script-jobs`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ ...jobBody, role: 'Super Admin', isAdmin: true }),
  });
  check('unknown body fields are rejected', extraField.status === 400, `HTTP ${extraField.status}`);

  // --- RBAC ----------------------------------------------------------------
  jar.clear();
  const readonly = await signIn('imran.shaikh@example.co.in', 'Aegis-Demo-2026');
  check('read-only user signs in', readonly.body.user.role === 'Read-only');

  const roRead = await fetch(`${API}/devices?limit=1&fields=id`, {
    headers: authed(readonly.body.accessToken),
  });
  check('read-only user can read devices', roRead.status === 200, `HTTP ${roRead.status}`);

  const roWrite = await fetch(`${API}/liveops/script-jobs`, {
    method: 'POST',
    headers: authed(readonly.body.accessToken, {
      'content-type': 'application/json',
      'x-csrf-token': readonly.body.csrfToken,
    }),
    body: JSON.stringify(jobBody),
  });
  check(
    'read-only user cannot submit a script job',
    roWrite.status === 403,
    `HTTP ${roWrite.status}`,
  );

  // --- Zone scoping --------------------------------------------------------
  jar.clear();
  const scoped = await signIn('divya.nair@example.co.in', 'Aegis-Demo-2026');
  const scopedList = await fetch(`${API}/devices?limit=1&fields=zoneName`, {
    headers: authed(scoped.body.accessToken),
  }).then((r) => r.json());
  check(
    'scoped role sees only its own zone',
    scopedList.items.every((d) => d.zoneName === 'Jaipur Branch'),
  );
  check(
    'scoped role total is below the estate total',
    scopedList.page.total < 50000,
    String(scopedList.page.total),
  );

  const otherZoneDevice = await fetch(`${API}/devices?limit=1&fields=id&zoneId=zn-mum-hq`, {
    headers: authed(token),
  }).then((r) => r.json());
  const idor = await fetch(`${API}/devices/${otherZoneDevice.items[0].id}`, {
    headers: authed(scoped.body.accessToken),
  });
  check('a device outside the scope is 404, not 403', idor.status === 404, `HTTP ${idor.status}`);

  const idorSub = await fetch(`${API}/devices/${otherZoneDevice.items[0].id}/software`, {
    headers: authed(scoped.body.accessToken),
  });
  check(
    'sub-resource of an out-of-scope device is also 404',
    idorSub.status === 404,
    `HTTP ${idorSub.status}`,
  );

  // --- Tokens --------------------------------------------------------------
  const tokenList = await fetch(`${API}/admin/tokens?limit=5`, { headers: authed(token) }).then(
    (r) => r.json(),
  );
  check(
    'api token list never returns a secret or a hash',
    !JSON.stringify(tokenList).match(/token_?hash|secret/i),
  );

  // --- Failure modes -------------------------------------------------------
  // Both of these came back as 500 until a ZAP scan produced thousands of them.
  const unknownPath = await fetch(`${API}/no-such-endpoint`, { headers: authed(token) });
  check(
    'an unknown path is 404, not 500',
    unknownPath.status === 404,
    `HTTP ${unknownPath.status}`,
  );

  const unknownBody = await unknownPath.json();
  check(
    'a 404 still uses the error envelope',
    unknownBody.error?.code === 'not_found' && Boolean(unknownBody.error?.requestId),
  );

  const bad = await fetch(`${API}/devices`, {
    headers: { authorization: 'Bearer not-a-real-token' },
  });
  check('a forged bearer token is refused', bad.status === 401, `HTTP ${bad.status}`);

  const errBody = await bad.json();
  check(
    'error envelope carries a request id and no internals',
    Boolean(errBody.error.requestId) && !JSON.stringify(errBody).includes('at '),
  );

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

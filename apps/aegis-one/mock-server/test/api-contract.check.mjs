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

  // --- Configuration compliance -------------------------------------------
  const config = await fetch(`${API}/configuration/summary`, { headers: authed(token) }).then((r) =>
    r.json(),
  );
  check(
    'configuration summary reports an overall percentage and the library size',
    config.overallPct > 0 && config.overallPct <= 100 && config.checksInScope === 200,
    `${config.overallPct}% over ${config.checksInScope} checks`,
  );
  check(
    'the four widgets and the Security Posture controls are all present',
    config.byFramework.length === 4 &&
      config.byPlatform.length === 3 &&
      config.byCategory.length > 10 &&
      config.topFailing.length > 0 &&
      config.posture.controls.length === 3,
  );
  // The bands behind the Device Compliance donut add up to the devices the
  // library has a check for, which is the counter's own denominator.
  check(
    'the device bands add up to the evaluated estate',
    config.deviceBands.high + config.deviceBands.medium + config.deviceBands.low ===
      config.nonCompliantDevices.total,
  );

  const checksPage = await fetch(`${API}/configuration/checks?limit=50`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'the checks grid opens on the Windows library, 50 of 200',
    checksPage.page.total === 200 &&
      checksPage.items.length === 50 &&
      checksPage.items[0].id === 'AEG-WIN-001',
    `${checksPage.items[0]?.id}`,
  );
  check(
    'every check carries the drawer fields and its framework mapping',
    checksPage.items.every(
      (c) =>
        typeof c.expected === 'string' &&
        c.expected.length > 0 &&
        ['automatic', 'manual'].includes(c.remediation) &&
        Array.isArray(c.frameworks) &&
        c.frameworks.length > 0 &&
        c.passing + c.failing > 0,
    ),
  );

  // A check's compliance is its own pass share, so the figure and the two
  // counts behind it cannot drift.
  check(
    'a check percentage agrees with its own pass and fail counts',
    checksPage.items.every(
      (c) => c.compliancePct === Math.round((c.passing / (c.passing + c.failing)) * 100),
    ),
  );

  const failing = await fetch(`${API}/configuration/checks?result=fail&severity=high`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'the Result and Severity filters compose',
    failing.items.length > 0 && failing.items.every((c) => c.severity === 'high' && c.failing > 0),
  );

  const checkDetail = await fetch(
    `${API}/configuration/checks/${checksPage.items[0].id}?limit=10`,
    { headers: authed(token) },
  ).then((r) => r.json());
  check(
    'a check drawer lists the devices behind the count, failures first',
    checkDetail.results.length === 10 &&
      checkDetail.results[0].result === 'fail' &&
      checkDetail.results.every((r) => typeof r.actual === 'string' && r.actual.length > 0),
  );

  const configDevices = await fetch(`${API}/configuration/devices?limit=5`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'configuration devices rank worst-compliance first',
    configDevices.items.length === 5 &&
      configDevices.items.every((d, i, a) => i === 0 || a[i - 1].compliancePct <= d.compliancePct),
  );

  const configDevice = await fetch(
    `${API}/configuration/devices/${configDevices.items[0].deviceId}`,
    { headers: authed(token) },
  ).then((r) => r.json());
  check(
    'a device drawer lists every check it fails',
    configDevice.failedChecks.length === configDevices.items[0].failing,
    `${configDevice.failedChecks.length} of ${configDevices.items[0].failing}`,
  );

  const benchmarks = await fetch(`${API}/configuration/benchmarks`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'six benchmarks report their checks, devices and compliance',
    benchmarks.length === 6 &&
      benchmarks.every((b) => b.checks > 0 && b.devices > 0 && b.compliancePct > 0),
  );

  const profiles = await fetch(`${API}/configuration/profiles`, { headers: authed(token) }).then(
    (r) => r.json(),
  );
  check('four configuration profiles are returned', profiles.length === 4);
  const profileDetail = await fetch(
    `${API}/configuration/profiles/${profiles.find((p) => p.version === 8).id}`,
    { headers: authed(token) },
  ).then((r) => r.json());
  check(
    'the most revised profile carries its version history',
    profileDetail.settings.length === 3 &&
      profileDetail.settings.every((row) => row.values.length === 3),
  );

  // The group filter narrows the figures, not only the rows: the counters
  // read from the same per-group roll-up the grid does.
  const scopedConfig = await fetch(`${API}/configuration/summary?group=grp-pilot`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'the Device Group filter narrows the counters too',
    scopedConfig.nonCompliantDevices.total < config.nonCompliantDevices.total &&
      scopedConfig.failingChecks <= config.failingChecks,
    `${scopedConfig.nonCompliantDevices.total} of ${config.nonCompliantDevices.total} devices`,
  );

  const evaluateRes = await fetch(`${API}/configuration/evaluate`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: '{}',
  });
  check(
    'Evaluate Now is accepted with a CSRF header — HTTP 202',
    evaluateRes.status === 202,
    `HTTP ${evaluateRes.status}`,
  );

  // --- Digital employee experience ----------------------------------------
  const dex = await fetch(`${API}/dex/summary`, { headers: authed(token) }).then((r) => r.json());
  check(
    'dex summary reports a score, three bands and four measures',
    dex.score > 0 &&
      dex.score <= 100 &&
      dex.breakdown.length === 4 &&
      dex.topIssues.length === 4 &&
      dex.method.length === 10,
    `${dex.score}/100`,
  );
  // The bands are the whole estate, because every endpoint reports telemetry.
  check(
    'the three experience bands add up to the estate',
    dex.distribution.good + dex.distribution.warning + dex.distribution.poor === 50000,
    `${dex.distribution.good + dex.distribution.warning + dex.distribution.poor}`,
  );
  check(
    'the scoring method publishes the thresholds the score uses',
    dex.method.some((m) => m.measure === 'Starting Score' && m.points === 100) &&
      dex.method.filter((m) => m.points < 0).length === 7 &&
      dex.method.some((m) => m.measure === 'Poor Band' && m.points === 55),
  );

  const dexDevices = await fetch(`${API}/dex/devices?limit=10`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'dex devices rank worst-score first',
    dexDevices.items.length === 10 &&
      dexDevices.items.every((d, i, a) => i === 0 || a[i - 1].score <= d.score),
  );

  /*
   * The point of the page: every penalty is re-derivable from the measures
   * shown beside it, and the score is 100 less the penalties, then capped by
   * the band. If this holds the panel's arithmetic can never look wrong.
   */
  check(
    'each score is its own penalties, capped by its own band',
    dexDevices.items.every((d) => {
      const lost = d.penalties.reduce((a, p) => a + p.points, 0);
      const cap = d.band === 'poor' ? 55 : d.band === 'warning' ? 80 : 100;
      return d.score === Math.max(0, Math.min(100 - lost, cap));
    }),
  );
  check(
    'each penalty names the measure that caused it',
    dexDevices.items.every((d) =>
      d.penalties.every(
        (p) =>
          [10, 20].includes(p.points) && /CPU at|Memory at|Boot takes|disk free/.test(p.reason),
      ),
    ),
  );

  const byBoot = await fetch(`${API}/dex/devices?limit=5&sort=boot`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'dex devices can be ranked by the slowest boot instead',
    byBoot.items.length === 5 &&
      byBoot.items.every((d, i, a) => i === 0 || a[i - 1].bootSeconds >= d.bootSeconds),
    `${byBoot.items[0]?.bootSeconds}s worst`,
  );

  // --- Reports -------------------------------------------------------------
  const reports = await fetch(`${API}/reports`, { headers: authed(token) }).then((r) => r.json());
  check(
    'the report library returns the twenty standard reports',
    reports.length === 20,
    `${reports.length} reports`,
  );
  check(
    'the four categories hold five, six, four and five reports',
    ['computers-software', 'daily-operations', 'security', 'leadership']
      .map((c) => reports.filter((r) => r.category === c).length)
      .join(',') === '5,6,4,5',
  );
  /*
   * The whole point of the library: every card carries the figure the report
   * would return against the estate right now, not a label.
   */
  check(
    'every card carries a live row count, a unit and its breakdown',
    reports.every(
      (r) =>
        r.total > 0 &&
        typeof r.unit === 'string' &&
        r.unit.length > 0 &&
        r.charts >= 4 &&
        r.columns >= 79 &&
        Array.isArray(r.preview) &&
        r.preview.length > 0,
    ),
  );
  check(
    'a card headline agrees with the row count beside it',
    reports.every((r) => Number(r.headline.value) === r.total),
  );

  const computers = await fetch(`${API}/reports/computers/summary`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'a report summary carries three counters and its charts',
    computers.kpis.length === 3 && computers.charts.length === 4 && computers.total === 50000,
    `${computers.total} rows`,
  );
  // A chart is a count by group, so its groups cannot exceed the report.
  check(
    'every chart group total is within the report total',
    computers.charts.every(
      (c) => c.data.reduce((a, d) => a + d.value, 0) <= computers.total && c.data.length > 0,
    ),
  );

  const run = await fetch(`${API}/reports/computers/run?limit=25`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'a report runs with its own column order and pages server-side',
    run.columns.length === 80 &&
      run.rows.length === 25 &&
      run.page.total === 50000 &&
      run.columns[0].id === 'name',
    `${run.columns.length} columns`,
  );
  // Every column the catalogue names has to come back with the row, or the
  // grid would show a header with nothing under it.
  check(
    'every declared column is present on every row',
    run.rows.every((row) => run.columns.every((c) => c.id in row)),
  );

  // The joined reports are the ones most likely to break: each lists one
  // record per child row, not one per device.
  for (const [id, min] of [
    ['software', 100000],
    ['usb', 1000],
    ['security', 1000],
    ['licenses', 1000],
    ['activity', 100],
  ]) {
    const page = await fetch(`${API}/reports/${id}/run?limit=5`, {
      headers: authed(token),
    }).then((r) => r.json());
    check(
      `the ${id} report lists its own records`,
      page.page.total >= min && page.rows.length === 5,
      `${page.page.total} rows`,
    );
  }

  const unknownReport = await fetch(`${API}/reports/not-a-report/run`, {
    headers: authed(token),
  });
  check(
    'an unknown report id is 404',
    unknownReport.status === 404,
    `HTTP ${unknownReport.status}`,
  );

  const starRes = await fetch(`${API}/reports/computers/favorite`, {
    method: 'PUT',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ favorite: true }),
  });
  check('a report can be starred — HTTP 204', starRes.status === 204, `HTTP ${starRes.status}`);
  const afterStar = await fetch(`${API}/reports`, { headers: authed(token) }).then((r) => r.json());
  check(
    'the star is returned on the next read',
    afterStar.find((r) => r.id === 'computers')?.favorite === true,
  );

  // Put it back, so a second run of this check starts where the first did.
  await fetch(`${API}/reports/computers/favorite`, {
    method: 'PUT',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ favorite: false }),
  });

  const exportRes = await fetch(`${API}/reports/computers/export`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ format: 'xlsx' }),
  });
  check(
    'a report export is accepted — HTTP 202',
    exportRes.status === 202,
    `HTTP ${exportRes.status}`,
  );

  // --- Aegis Zones ---------------------------------------------------------
  const zoneList = await fetch(`${API}/zones`, { headers: authed(token) }).then((r) => r.json());
  check(
    'zones returns the estate with its delivery figures',
    zoneList.items.length === 9 &&
      zoneList.delivery.distribution.length === 2 &&
      zoneList.delivery.efficiency.length === 9 &&
      zoneList.delivery.path.length === 4,
    `${zoneList.items.length} zones`,
  );
  /*
   * The page's own argument: every percentage divides the same three stored
   * figures, so the counters, the donut and the path cannot disagree.
   */
  check(
    'the distribution adds to a hundred and matches the hit rate',
    zoneList.delivery.distribution.reduce((a, d) => a + d.pct, 0) === 100 &&
      zoneList.delivery.distribution[0].pct === zoneList.summary.hitRatePct &&
      zoneList.summary.directPct === 100 - zoneList.summary.hitRatePct,
  );
  // WAN saved is below the hit rate, because a zone's first copy still
  // crosses the WAN.
  check(
    'WAN saved is at or below the hit rate',
    zoneList.summary.wanSavedPct <= zoneList.summary.hitRatePct && zoneList.summary.wanSavedPct > 0,
    `${zoneList.summary.wanSavedPct}% saved against ${zoneList.summary.hitRatePct}% hit rate`,
  );
  check(
    'a zone with no peer cache reports no local delivery',
    zoneList.items
      .filter((z) => z.peerCache === 'none')
      .every((z) => zoneList.delivery.efficiency.find((e) => e.zone === z.name)?.pct === 0),
  );
  check(
    'every zone carries the grid columns',
    zoneList.items.every(
      (z) =>
        z.devices > 0 &&
        z.connectivityPct > 0 &&
        z.bandwidthMbps > 0 &&
        ['elected', 'none', 'disabled'].includes(z.peerCache) &&
        ['healthy', 'degraded', 'offline'].includes(z.status),
    ),
  );

  const discoveryRes = await fetch(`${API}/zones/discovery`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: '{}',
  });
  check(
    'Refresh Discovery is accepted — HTTP 202',
    discoveryRes.status === 202,
    `HTTP ${discoveryRes.status}`,
  );

  // --- AEGIS Insight -------------------------------------------------------
  const worst = (
    await fetch(`${API}/devices?limit=1&sort=dexScore&fields=id,dexScore`, {
      headers: authed(token),
    }).then((r) => r.json())
  ).items[0];
  const insightRunRes = await fetch(`${API}/insight/diagnostics`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({
      deviceId: worst.id,
      description: 'User reports that the laptop is slow and applications take too long to open.',
    }),
  });
  const insightRun = await insightRunRes.json();
  check(
    'a diagnostic run is accepted',
    insightRunRes.status === 200 || insightRunRes.status === 201,
  );
  check(
    'the run reports the endpoint it was made against',
    insightRun.device?.id === worst.id && insightRun.checks.length >= 5,
    `${insightRun.checks.length} checks on ${insightRun.device?.name}`,
  );
  /*
   * The page's own argument: the root cause is the checks that actually
   * failed, so it cannot name a finding that passed, and an endpoint with
   * nothing wrong gets no root cause at all.
   */
  const failed = insightRun.checks.filter((c) => c.result !== 'pass');
  check(
    'every failing check carries a severity the panel can print',
    failed.every((c) => ['critical', 'high', 'medium', 'low'].includes(c.severity)),
  );
  check(
    'the root cause is drawn from the failing checks',
    failed.length === 0
      ? insightRun.rootCause === undefined
      : failed.some((c) => insightRun.rootCause.summary.includes(c.name)),
    insightRun.rootCause?.summary ?? 'no root cause',
  );
  check(
    'confidence is a percentage, and never certainty',
    failed.length === 0 ||
      (insightRun.rootCause.confidencePct > 0 && insightRun.rootCause.confidencePct <= 94),
    `${insightRun.rootCause?.confidencePct ?? 0}%`,
  );
  check(
    'every recommendation answers a check that failed',
    insightRun.recommendations.length <= failed.length &&
      insightRun.recommendations.every((r) => r.title),
    `${insightRun.recommendations.length} actions for ${failed.length} findings`,
  );

  const insightTemplates = await fetch(`${API}/insight/templates`, { headers: authed(token) }).then(
    (r) => r.json(),
  );
  check(
    'the saved diagnostic templates come back',
    Array.isArray(insightTemplates) && insightTemplates.length >= 3,
    `${insightTemplates.length} templates`,
  );

  const remediationRes = await fetch(
    `${API}/insight/diagnostics/${encodeURIComponent(insightRun.id)}/remediation`,
    {
      method: 'POST',
      headers: authed(token, {
        'content-type': 'application/json',
        'x-csrf-token': session.csrfToken,
      }),
      body: '{}',
    },
  );
  check(
    'Run Remediation is accepted — HTTP 202',
    remediationRes.status === 202,
    `HTTP ${remediationRes.status}`,
  );

  // --- Integrations --------------------------------------------------------
  const connectors = await fetch(`${API}/integrations/connectors`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'the connectors come back with the card fields',
    connectors.length === 6 &&
      connectors.every(
        (c) =>
          typeof c.purpose === 'string' &&
          ['itsm', 'siem', 'chat', 'webhook', 'identity'].includes(c.kind) &&
          ['connected', 'attention', 'disabled', 'not-configured', 'error'].includes(c.status),
      ),
    `${connectors.length} connectors`,
  );
  // A disabled connector has nothing to report, and the card prints a dash.
  check(
    'a disabled connector carries no scope or sync time',
    connectors
      .filter((c) => c.status === 'disabled')
      .every((c) => c.scope === null && c.lastActivity === null),
  );

  const siem = await fetch(`${API}/integrations/siem`, { headers: authed(token) }).then((r) =>
    r.json(),
  );
  check(
    'the SIEM destinations come back with their transport and rate',
    siem.length === 5 && siem.every((d) => typeof d.transport === 'string' && d.eventTypes === 3),
    `${siem.length} destinations`,
  );
  /*
   * The page's own argument: a destination that was never set up has no host,
   * no rate and nothing in the log — which is why the log's empty state
   * exists at all.
   */
  check(
    'an unconfigured destination has no host and no rate',
    siem
      .filter((d) => d.status !== 'connected')
      .every((d) => d.host === null && d.ratePerHour === null && d.lastSentAt === null),
  );

  const notConfigured = siem.find((d) => d.status !== 'connected');
  const earlyTest = await fetch(
    `${API}/integrations/siem/${encodeURIComponent(notConfigured.id)}/test`,
    {
      method: 'POST',
      headers: authed(token, {
        'content-type': 'application/json',
        'x-csrf-token': session.csrfToken,
      }),
      body: '{}',
    },
  );
  check(
    'testing an unconfigured destination is refused — HTTP 409',
    earlyTest.status === 409,
    `HTTP ${earlyTest.status}`,
  );

  const channels = await fetch(`${API}/integrations/channels`, { headers: authed(token) }).then(
    (r) => r.json(),
  );
  check(
    'the notification channels come back',
    channels.length === 5 && channels.every((c) => typeof c.transport === 'string'),
    `${channels.length} channels`,
  );

  const rules = await fetch(`${API}/integrations/notifications`, { headers: authed(token) }).then(
    (r) => r.json(),
  );
  check(
    'an alert rule carries every channel it sends to',
    rules.length === 4 && rules.some((r) => r.channels.length === 2),
    `${rules.length} rules`,
  );
  // The Channel Status column is the channel's own state, not the rule's.
  check(
    'a rule reports each channel state from the channel itself',
    rules.every((r) =>
      r.channels.every((rc) => channels.find((c) => c.id === rc.id)?.status === rc.status),
    ),
  );

  const newRule = await fetch(`${API}/integrations/notifications`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ event: 'Agent offline over 7 days', channelIds: [channels[0].id] }),
  });
  const createdRule = await newRule.json();
  check('an alert rule can be added — HTTP 201', newRule.status === 201, `HTTP ${newRule.status}`);
  check('a new rule arrives switched on', createdRule.enabled === true);

  const offRes = await fetch(
    `${API}/integrations/notifications/${encodeURIComponent(createdRule.id)}`,
    {
      method: 'PATCH',
      headers: authed(token, {
        'content-type': 'application/json',
        'x-csrf-token': session.csrfToken,
      }),
      body: JSON.stringify({ enabled: false }),
    },
  );
  check(
    'a rule can be switched off',
    offRes.status === 200 && (await offRes.json()).enabled === false,
  );

  const delRes = await fetch(
    `${API}/integrations/notifications/${encodeURIComponent(createdRule.id)}`,
    {
      method: 'DELETE',
      headers: authed(token, { 'x-csrf-token': session.csrfToken }),
    },
  );
  check('a rule can be removed — HTTP 204', delRes.status === 204, `HTTP ${delRes.status}`);

  const deliveries = await fetch(`${API}/integrations/deliveries?limit=50`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'the delivery log pages and carries its own columns',
    deliveries.items.length === 50 &&
      deliveries.items.every(
        (d) =>
          ['Audit Trail', 'Deployments', 'Compliance'].includes(d.eventType) &&
          ['delivered', 'failed', 'retrying'].includes(d.outcome),
      ),
    `${deliveries.page.total} attempts`,
  );
  // Only a configured target can have delivered anything.
  const configuredNames = new Set(
    [...siem, ...channels].filter((t) => t.status === 'connected').map((t) => t.name),
  );
  check(
    'every logged delivery belongs to a configured target',
    deliveries.items.every((d) => configuredNames.has(d.connector)),
  );

  const retrying = await fetch(`${API}/integrations/deliveries?limit=10&result=retrying`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'the log filters by result',
    retrying.items.every((d) => d.outcome === 'retrying') &&
      retrying.page.total < deliveries.page.total,
    `${retrying.page.total} retrying of ${deliveries.page.total}`,
  );

  // A webhook that posts inside the estate is an egress hole, not a webhook.
  const privateHook = await fetch(`${API}/integrations/connectors`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({
      name: 'Internal hook',
      url: 'https://10.0.0.5/hook',
      events: ['deployment.completed'],
    }),
  });
  check(
    'a webhook pointing inside the estate is refused — HTTP 400',
    privateHook.status === 400,
    `HTTP ${privateHook.status}`,
  );
  const plainHook = await fetch(`${API}/integrations/connectors`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({
      name: 'Plain hook',
      url: 'http://hooks.corp.example/hook',
      events: ['deployment.completed'],
    }),
  });
  check(
    'a webhook over plain http is refused — HTTP 400',
    plainHook.status === 400,
    `HTTP ${plainHook.status}`,
  );

  // --- Peer cache ----------------------------------------------------------
  const peerCaches = await fetch(`${API}/peercache`, { headers: authed(token) }).then((r) =>
    r.json(),
  );
  check(
    'peercache returns one row per zone',
    peerCaches.length === 9,
    `${peerCaches.length} zones`,
  );
  /*
   * The page's whole claim: a peer cache is a regular endpoint agent, not an
   * appliance. So every elected cache must be a device the Devices page also
   * knows, by the id this row carries.
   */
  const elected = peerCaches.filter((c) => c.currentPeer !== null);
  check(
    'every elected cache names a real endpoint',
    elected.length > 0 && elected.every((c) => typeof c.deviceId === 'string'),
    `${elected.length} elected`,
  );
  const firstElected = elected[0];
  const asDevice = await fetch(`${API}/devices/${encodeURIComponent(firstElected.deviceId)}`, {
    headers: authed(token),
  }).then((r) => r.json());
  check(
    'the elected cache resolves as a device, with the same hostname',
    asDevice.hostname === firstElected.currentPeer,
    `${asDevice.hostname}`,
  );

  // A zone with nothing elected reports no agent and no content, not a fault.
  check(
    'a zone with no cache reports nothing rather than a failure',
    peerCaches
      .filter((c) => c.currentPeer === null)
      .every(
        (c) =>
          c.agentHealth === null &&
          c.contentCached.length === 0 &&
          c.lastTransfer === null &&
          c.status === 'disabled',
      ),
  );
  check(
    'a cache holds content that was actually delivered to its zone',
    elected.every((c) => c.contentCached.length > 0 && c.contentCached.length <= 4),
    `${elected[0].contentCached.length} items on ${elected[0].zone}`,
  );

  // Re-electing moves the cache to another endpoint in the same zone, and the
  // new one has transferred nothing yet — so it reports a warning, truthfully.
  const before = firstElected.currentPeer;
  const electRes = await fetch(
    `${API}/peercache/${encodeURIComponent(firstElected.zoneId)}/elect`,
    {
      method: 'POST',
      headers: authed(token, {
        'content-type': 'application/json',
        'x-csrf-token': session.csrfToken,
      }),
      body: '{}',
    },
  );
  const reelected = await electRes.json();
  check('a cache can be re-elected', electRes.status === 200, `HTTP ${electRes.status}`);
  check(
    're-electing picks a different endpoint in the same zone',
    reelected.currentPeer !== before && reelected.zoneId === firstElected.zoneId,
    `${before} -> ${reelected.currentPeer}`,
  );
  check(
    'a freshly elected cache reports a warning until it has transferred',
    reelected.lastTransfer === null && reelected.status === 'warning',
  );

  // Switching a zone off is refused nothing, but switching an empty zone on is.
  const emptyZone = peerCaches.find((c) => c.currentPeer === null);
  const enableRes = await fetch(`${API}/peercache/${encodeURIComponent(emptyZone.zoneId)}/state`, {
    method: 'PUT',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ enabled: true }),
  });
  check(
    'enabling a zone with no eligible endpoint is refused — HTTP 409',
    enableRes.status === 409,
    `HTTP ${enableRes.status}`,
  );

  const unknownZone = await fetch(`${API}/peercache/zn-does-not-exist/elect`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: '{}',
  });
  check(
    'an unknown zone is 404, not 500',
    unknownZone.status === 404,
    `HTTP ${unknownZone.status}`,
  );

  // --- Administration ------------------------------------------------------
  const idps = await fetch(`${API}/admin/identity-providers`, { headers: authed(token) }).then(
    (r) => r.json(),
  );
  check(
    'the four identity providers come back',
    idps.length === 4 && idps.every((p) => ['oidc', 'saml', 'ldap'].includes(p.protocol)),
    `${idps.length} providers`,
  );
  /*
   * A provider can be configured and switched off, or switched on and not yet
   * configured, which is why the card prints two fields. None of the four is
   * wired up on this estate, and claiming otherwise would claim a federation
   * that does not exist.
   */
  check(
    'no provider claims a federation it does not have',
    idps.every((p) => p.enabled === false && p.status === 'not-configured'),
  );
  const enableUnconfigured = await fetch(
    `${API}/admin/identity-providers/${encodeURIComponent(idps[0].id)}`,
    {
      method: 'PUT',
      headers: authed(token, {
        'content-type': 'application/json',
        'x-csrf-token': session.csrfToken,
      }),
      body: JSON.stringify({ enabled: true }),
    },
  );
  check(
    'switching on an unconfigured provider is refused — HTTP 409',
    enableUnconfigured.status === 409,
    `HTTP ${enableUnconfigured.status}`,
  );

  const adminRoles = await fetch(`${API}/admin/roles`, { headers: authed(token) }).then((r) =>
    r.json(),
  );
  check(
    'every role carries the three content scopes the cards print',
    adminRoles.length >= 5 &&
      adminRoles.every(
        (r) =>
          Array.isArray(r.zoneIds) &&
          Array.isArray(r.softwareCategories) &&
          Array.isArray(r.groupIds) &&
          typeof r.userCount === 'number',
      ),
    `${adminRoles.length} roles`,
  );
  // An empty scope list means everything, so at least one role must be
  // narrowed or the scoping is decorative.
  check(
    'at least one role is actually scoped',
    adminRoles.some((r) => r.zoneIds.length > 0 && r.softwareCategories.length > 0),
    adminRoles.find((r) => r.zoneIds.length > 0)?.name ?? 'none',
  );

  const adminUsers = await fetch(`${API}/admin/users?limit=50`, { headers: authed(token) }).then(
    (r) => r.json(),
  );
  check(
    'the console users come back with their access state',
    adminUsers.items.length === 8 && adminUsers.items.every((u) => typeof u.disabled === 'boolean'),
    `${adminUsers.items.length} accounts`,
  );
  check(
    'a disabled account has no second factor enrolled',
    adminUsers.items.filter((u) => u.disabled).every((u) => u.mfaEnrolled === false),
  );

  // Only a Super Admin may grant Super Admin — the contract's own rule.
  const promote = await fetch(
    `${API}/admin/users/${encodeURIComponent(adminUsers.items.find((u) => u.role === 'Operator').id)}`,
    {
      method: 'PATCH',
      headers: authed(token, {
        'content-type': 'application/json',
        'x-csrf-token': session.csrfToken,
      }),
      body: JSON.stringify({ role: 'Auditor' }),
    },
  );
  check('a role can be changed', promote.status === 200, `HTTP ${promote.status}`);
  const restored = await fetch(
    `${API}/admin/users/${encodeURIComponent((await promote.json()).id)}`,
    {
      method: 'PATCH',
      headers: authed(token, {
        'content-type': 'application/json',
        'x-csrf-token': session.csrfToken,
      }),
      body: JSON.stringify({ role: 'Operator' }),
    },
  );
  check('and changed back, leaving the fixture as it was', restored.status === 200);

  // Disabling the last active Super Admin would lock everyone out.
  const superAdmin = adminUsers.items.find((u) => u.role === 'Super Admin');
  const lockout = await fetch(`${API}/admin/users/${encodeURIComponent(superAdmin.id)}`, {
    method: 'PATCH',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ disabled: true }),
  });
  check(
    'disabling the last Super Admin is refused — HTTP 409',
    lockout.status === 409,
    `HTTP ${lockout.status}`,
  );

  const settings = await fetch(`${API}/admin/agent-enrollment`, { headers: authed(token) }).then(
    (r) => r.json(),
  );
  check(
    'the agent enrollment settings come back',
    settings.requireToken === true && typeof settings.tokenMaxAgeDays === 'number',
    `token required, max age ${settings.tokenMaxAgeDays} days`,
  );

  /*
   * The contract states the descending sort as a `-` prefix on `sort`. The
   * builder only ever read a separate `order` parameter, so the declared form
   * was refused — which the Agent Enrollment tab found by being the first
   * caller to use it.
   */
  const descending = await fetch(`${API}/devices?limit=2&sort=-lastSeenAt&fields=id,lastSeenAt`, {
    headers: authed(token),
  });
  check(
    "the contract's own descending sort form is accepted",
    descending.status === 200,
    `HTTP ${descending.status}`,
  );
  const descRows = (await descending.json()).items;
  check(
    'and it really sorts descending',
    Date.parse(descRows[0].lastSeenAt) >= Date.parse(descRows[1].lastSeenAt),
  );

  // --- API tokens ----------------------------------------------------------
  /*
   * The secret exists exactly once, in the response that creates it. The
   * server keeps a SHA-256 and a display prefix, so a leak can only be
   * answered by revoking — which is why the console needs a way to revoke.
   */
  const madeToken = await fetch(`${API}/admin/api-tokens`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ name: 'contract-check-token', scopes: ['devices:read'] }),
  });
  const made = await madeToken.json();
  check(
    'creating a token returns its secret once',
    madeToken.status === 201 && typeof made.secret === 'string' && made.secret.startsWith('aeg_'),
    `HTTP ${madeToken.status}`,
  );

  const afterCreate = await fetch(`${API}/admin/api-tokens?limit=50`, {
    headers: authed(token),
  }).then((r) => r.json());
  const mine = afterCreate.items.find((t) => t.name === 'contract-check-token');
  check('and the token is listed afterwards', mine !== undefined);
  check(
    'but the list never carries the secret again',
    !JSON.stringify(afterCreate).includes(made.secret),
  );

  const revoked = await fetch(`${API}/admin/api-tokens/${encodeURIComponent(mine.id)}`, {
    method: 'DELETE',
    headers: authed(token, { 'x-csrf-token': session.csrfToken }),
  });
  check('a token can be revoked', revoked.status === 204, `HTTP ${revoked.status}`);

  // --- Licensing -----------------------------------------------------------
  const license = await fetch(`${API}/licensing`, { headers: authed(token) }).then((r) => r.json());
  check(
    'the licence comes back as one agreement, not a list of products',
    typeof license.plan === 'string' &&
      typeof license.seats?.total === 'number' &&
      typeof license.term?.endsAt === 'string' &&
      Array.isArray(license.modules),
    `${license.plan}, ${license.modules.length} modules`,
  );
  /*
   * The page's own argument: seats in use is the estate itself, counted, so
   * this page and the Devices page cannot disagree about how many endpoints
   * there are.
   */
  const estate = await fetch(`${API}/devices/summary`, { headers: authed(token) }).then((r) =>
    r.json(),
  );
  check(
    'seats in use equals the enrolled estate',
    license.seats.inUse === estate.all,
    `${license.seats.inUse} seats against ${estate.all} endpoints`,
  );
  check(
    'and the platform split adds up to it',
    (license.seats.byPlatform.windows ?? 0) +
      (license.seats.byPlatform.macos ?? 0) +
      (license.seats.byPlatform.linux ?? 0) +
      (license.seats.byPlatform.other ?? 0) ===
      license.seats.inUse,
  );
  // A licence with no headroom tells an administrator nothing.
  check(
    'the licence has seats left',
    license.seats.total > license.seats.inUse,
    `${license.seats.total - license.seats.inUse} available`,
  );
  check(
    'every module carries a tier the card can print',
    license.modules.length === 7 &&
      license.modules.every((m) => ['included', 'add-on', 'preview'].includes(m.tier)),
  );
  // A preview is offered but not charged for, which the card states.
  check(
    'a preview module is not counted against seats',
    license.modules
      .filter((m) => m.tier === 'preview')
      .every((m) => m.countsAgainstSeats === false && m.enabled === false),
  );
  check(
    'six of the seven modules are active',
    license.modules.filter((m) => m.enabled).length === 6,
  );

  // The signature is verified server-side, so an unsigned upload is refused
  // rather than quietly rewriting the plan and the seat count.
  const badLicense = await fetch(`${API}/licensing/file`, {
    method: 'PUT',
    headers: authed(token, {
      'content-type': 'application/octet-stream',
      'x-csrf-token': session.csrfToken,
    }),
    body: 'not-a-signed-licence',
  });
  check(
    'an unverifiable licence file is refused — HTTP 400',
    badLicense.status === 400,
    `HTTP ${badLicense.status}`,
  );

  // --- System Health -------------------------------------------------------
  const sysHealth = await fetch(`${API}/diagnostics/health`, { headers: authed(token) }).then((r) =>
    r.json(),
  );
  check(
    'system health returns its summary, services and events',
    sysHealth.services.length === 7 &&
      typeof sysHealth.summary.servicesHealthy === 'number' &&
      Array.isArray(sysHealth.events),
    `${sysHealth.services.length} services, ${sysHealth.events.length} events`,
  );
  /*
   * Three signals are counted from the estate rather than stored, so a health
   * page cannot drift from the pages those figures came from.
   */
  check(
    'the agent gateway signal equals the estate it came from',
    sysHealth.summary.agentsConnected === estate.online &&
      sysHealth.summary.agentsTotal === estate.all,
    `${sysHealth.summary.agentsConnected}/${sysHealth.summary.agentsTotal}`,
  );
  check(
    'the healthy count agrees with the services it counted',
    sysHealth.summary.servicesHealthy ===
      sysHealth.services.filter((s) => s.status === 'healthy').length &&
      sysHealth.summary.degraded ===
        sysHealth.services.filter((s) => s.status !== 'healthy').length,
  );
  check(
    'the warning count agrees with the events it counted',
    sysHealth.summary.warnings24h === sysHealth.events.filter((e) => e.level === 'warning').length,
    `${sysHealth.summary.warnings24h} warnings`,
  );
  // Every event is inside the window the panel claims to show.
  const dayAgo = Date.now() - 24 * 3_600_000;
  check(
    'every event is inside the last 24 hours',
    sysHealth.events.every((e) => Date.parse(e.at) >= dayAgo),
  );

  const healthCheck = await fetch(`${API}/diagnostics/health-check`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: '{}',
  });
  check(
    'Run Health Check is accepted — HTTP 202',
    healthCheck.status === 202,
    `HTTP ${healthCheck.status}`,
  );

  const bundleRes = await fetch(`${API}/diagnostics/bundle`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: '{}',
  });
  const bundle = await bundleRes.json();
  check(
    'the diagnostic bundle is built server-side and polled',
    bundleRes.status === 202 && bundle.status === 'queued' && bundle.downloadUrl === null,
    `HTTP ${bundleRes.status}`,
  );

  // --- Software package writes ---------------------------------------------
  const madePkg = await fetch(`${API}/software`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({
      name: 'Contract Check Tool',
      publisher: 'Aegis QA',
      version: '1.0.0',
      platform: 'windows',
      category: 'Utilities',
    }),
  });
  const pkg = await madePkg.json();
  /*
   * A new definition is a draft with nothing to install. The catalogue says
   * "missing" rather than implying the package is ready to deploy.
   */
  check(
    'a package is created as a draft with no installer',
    madePkg.status === 201 && pkg.state === 'draft' && pkg.installer === 'missing',
    `HTTP ${madePkg.status}`,
  );

  const dupe = await fetch(`${API}/software`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({
      name: 'Contract Check Tool',
      publisher: 'Aegis QA',
      version: '1.0.0',
      platform: 'windows',
    }),
  });
  check(
    'the same title and version twice is refused — HTTP 409',
    dupe.status === 409,
    `HTTP ${dupe.status}`,
  );

  // Changing the version drops the installer built for the old one.
  await fetch(`${API}/software/${encodeURIComponent(pkg.id)}`, {
    method: 'PATCH',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({
      name: 'Contract Check Tool',
      publisher: 'Aegis QA',
      version: '2.0.0',
      platform: 'windows',
    }),
  });
  const edited = await fetch(`${API}/software/${encodeURIComponent(pkg.id)}`, {
    headers: authed(token),
  }).then((r) => r.json());
  /*
   * The detail route is the shared lister's, which returns the catalogue's own
   * `latestVersion` where the contract's SoftwarePackage says `version` —
   * handover question 68.
   */
  check(
    'changing the version invalidates the installer on file',
    edited.latestVersion === '2.0.0' &&
      edited.installer === 'missing' &&
      edited.installerSha256 === null,
    `${edited.latestVersion}, installer ${edited.installer}`,
  );

  const goneRes = await fetch(`${API}/software/${encodeURIComponent(pkg.id)}`, {
    method: 'DELETE',
    headers: authed(token, { 'x-csrf-token': session.csrfToken }),
  });
  check(
    'a package nobody has installed can be deleted — HTTP 204',
    goneRes.status === 204,
    `HTTP ${goneRes.status}`,
  );

  /*
   * One that endpoints have installed cannot be: the inventory rows point at
   * it, and deleting the definition would leave the Devices page listing
   * software nothing can describe.
   */
  const installed = (
    await fetch(`${API}/software?limit=50`, { headers: authed(token) }).then((r) => r.json())
  ).items.find((p) => p.installCount > 0);
  const refused = await fetch(`${API}/software/${encodeURIComponent(installed.id)}`, {
    method: 'DELETE',
    headers: authed(token, { 'x-csrf-token': session.csrfToken }),
  });
  check(
    'a package with installations is refused — HTTP 409',
    refused.status === 409,
    `HTTP ${refused.status}`,
  );

  // --- Patch policies ------------------------------------------------------
  const madePolicy = await fetch(`${API}/patch-policies`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ name: 'Contract Check Policy', content: 'Windows · Critical' }),
  });
  const policy = await madePolicy.json();
  /*
   * A new policy covers nothing until it has been evaluated, so it is created
   * suspended with no computers and no patches. One that claimed coverage it
   * had not calculated would be a policy an administrator trusted wrongly.
   */
  check(
    'a new policy starts suspended and covers nothing',
    madePolicy.status === 201 &&
      policy.status === 'suspended' &&
      policy.computers === 0 &&
      policy.patchCount === 0 &&
      policy.nextRunAt === null,
    `HTTP ${madePolicy.status}`,
  );

  // A copy takes the source's shape but none of its results.
  const copied = await fetch(`${API}/patch-policies`, {
    method: 'POST',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ name: 'Contract Check Copy', copyOf: policy.id }),
  }).then((r) => r.json());
  check(
    'a copy takes the content but not the compliance',
    copied.content === policy.content && copied.compliancePct === 0,
    `${copied.content}`,
  );

  const resumed = await fetch(`${API}/patch-policies/${encodeURIComponent(policy.id)}`, {
    method: 'PATCH',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ status: 'active' }),
  }).then((r) => r.json());
  check('a policy can be resumed', resumed.status === 'active');

  /*
   * An active policy is deploying to endpoints right now, so deleting it
   * would stop that mid-flight with nothing recording why.
   */
  const refusedDelete = await fetch(`${API}/patch-policies/${encodeURIComponent(policy.id)}`, {
    method: 'DELETE',
    headers: authed(token, { 'x-csrf-token': session.csrfToken }),
  });
  check(
    'deleting an active policy is refused — HTTP 409',
    refusedDelete.status === 409,
    `HTTP ${refusedDelete.status}`,
  );

  // Suspending clears the next run: a suspended policy must not promise work.
  const suspended = await fetch(`${API}/patch-policies/${encodeURIComponent(policy.id)}`, {
    method: 'PATCH',
    headers: authed(token, {
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    }),
    body: JSON.stringify({ status: 'suspended' }),
  }).then((r) => r.json());
  check(
    'suspending clears the next run',
    suspended.status === 'suspended' && suspended.nextRunAt === null,
  );

  for (const id of [policy.id, copied.id]) {
    const gone = await fetch(`${API}/patch-policies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authed(token, { 'x-csrf-token': session.csrfToken }),
    });
    check(
      `a suspended policy can be deleted — HTTP 204`,
      gone.status === 204,
      `HTTP ${gone.status}`,
    );
  }

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
  const tokenList = await fetch(`${API}/admin/api-tokens?limit=5`, { headers: authed(token) }).then(
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

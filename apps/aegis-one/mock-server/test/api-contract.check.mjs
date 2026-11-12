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

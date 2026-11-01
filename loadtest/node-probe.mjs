/**
 * Latency probe in plain Node.
 *
 * This is NOT a substitute for the k6 scenarios in this folder — it has no VU
 * model, no ramping and no thresholds, and it runs on the same machine as the
 * server. It exists because k6 was not installed where this was built, and a
 * perf report with no measured numbers at all is worth less than one with
 * modest numbers that say exactly how they were taken.
 *
 *   node loadtest/node-probe.mjs --concurrency 20 --seconds 20
 *
 * Reports p50, p95 and p99 per journey, plus the error rate.
 */
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:8080' },
    concurrency: { type: 'string', default: '20' },
    seconds: { type: 'string', default: '20' },
    json: { type: 'string' },
  },
});

const BASE = values.base;
const API = `${BASE}/api/v1`;
const REDIRECT = 'http://localhost:5173/auth/callback';
const CONCURRENCY = Number(values.concurrency);
const SECONDS = Number(values.seconds);

const samples = new Map();
let errors = 0;
let requests = 0;

let denied = 0;

function record(name, ms, ok, expectedDenial = false) {
  requests++;
  // A 403 on a write from the Auditor account is RBAC working, not a failure.
  // Counting it as an error would make the error rate meaningless.
  if (!ok && expectedDenial) denied++;
  else if (!ok) errors++;
  let list = samples.get(name);
  if (!list) {
    list = [];
    samples.set(name, list);
  }
  list.push(ms);
}

async function timed(name, fn, { mayBeDenied = false } = {}) {
  const started = performance.now();
  try {
    const res = await fn();
    record(name, performance.now() - started, res.ok, mayBeDenied && res.status === 403);
    return res.ok ? res : null;
  } catch {
    record(name, performance.now() - started, false);
    return null;
  }
}

async function signIn(email) {
  const verifier = `verifier-${Math.random().toString(36).slice(2)}-${Date.now()}-padding`;
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const authorize = await fetch(
    `${BASE}/oidc/authorize?client_id=aegis-one-console&redirect_uri=${encodeURIComponent(REDIRECT)}&state=s&code_challenge=${challenge}&code_challenge_method=S256`,
  );
  const loginId = /name="login_id" value="([^"]+)"/.exec(await authorize.text())?.[1];

  await fetch(`${BASE}/oidc/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ login_id: loginId, email, password: 'Aegis-Demo-2026' }),
  });

  const mfa = await fetch(`${BASE}/oidc/mfa`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ login_id: loginId, code: '246813' }),
    redirect: 'manual',
  });
  const code = new URL(mfa.headers.get('location')).searchParams.get('code');

  const res = await fetch(`${API}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: REDIRECT }),
  });
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const body = await res.json();
  return {
    headers: {
      authorization: `Bearer ${body.accessToken}`,
      'content-type': 'application/json',
      'x-csrf-token': body.csrfToken,
      cookie: cookies,
    },
  };
}

const ACCOUNTS = [
  'rohan.deshpande@example.co.in',
  'ananya.iyer@example.co.in',
  'siddharth.kulkarni@example.co.in',
  'kavya.chandrasekar@example.co.in',
];
const ZONES = ['zn-mum-hq', 'zn-del-br', 'zn-blr-cmp', 'zn-jai-br', 'zn-pun-dc'];
const SORTS = ['hostname', 'compliancePct', 'lastSeenAt', 'criticalVulns'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

async function journey(session) {
  const { headers } = session;

  const list = await timed('devices list (filter + sort + 100 rows)', () =>
    fetch(
      `${API}/devices?limit=100&sort=${pick(SORTS)}&order=desc&zoneId=${pick(ZONES)}&fields=id,hostname,status,osName,zoneName,compliancePct,criticalVulns,lastSeenAt`,
      { headers },
    ),
  );

  const page = list ? await list.json().catch(() => null) : null;
  if (page?.page?.nextCursor) {
    await timed('devices list (page 2 by cursor)', () =>
      fetch(
        `${API}/devices?limit=100&cursor=${encodeURIComponent(page.page.nextCursor)}&fields=id,hostname`,
        { headers },
      ),
    );
  }

  const id = page?.items?.[0]?.id;
  if (id) {
    await timed('device detail', () => fetch(`${API}/devices/${id}`, { headers }));
    await Promise.all([
      timed('device software tab', () => fetch(`${API}/devices/${id}/software`, { headers })),
      timed('device patches tab', () => fetch(`${API}/devices/${id}/patches`, { headers })),
      timed('device vulnerabilities tab', () =>
        fetch(`${API}/devices/${id}/vulnerabilities`, { headers }),
      ),
      timed('device diagnostics tab', () => fetch(`${API}/devices/${id}/diagnostics`, { headers })),
    ]);
  }

  await timed('global search', () =>
    fetch(`${API}/devices?q=MUM-WS-0&limit=25&fields=id,hostname,zoneName`, { headers }),
  );
  await timed('overview aggregates', () => fetch(`${API}/overview`, { headers }));
  await timed('vulnerability aggregation', () =>
    fetch(`${API}/vulnerabilities?limit=50&sort=cvss&order=desc`, { headers }),
  );
  await timed('devices facets', () => fetch(`${API}/devices/facets`, { headers }));

  const groups = await timed('groups list', () =>
    fetch(`${API}/groups?limit=5&fields=id`, { headers }),
  );
  const groupId = groups ? (await groups.json().catch(() => null))?.items?.[0]?.id : null;

  if (groupId) {
    await timed(
      'deployment submit (group target)',
      () =>
        fetch(`${API}/deployments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'install-software',
            name: `probe ${Date.now()}`,
            content: { packageId: 'sw-chrome' },
            targets: { groupIds: [groupId] },
            schedule: { mode: 'now' },
          }),
        }),
      { mayBeDenied: true },
    );
  }

  const job = await timed(
    'script job submit (zone target)',
    () =>
      fetch(`${API}/liveops/script-jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind: 'script',
          name: `probe ${Date.now()}`,
          targets: { zone: pick(ZONES) },
          outputLimitKb: 64,
          script: { language: 'powershell', body: 'Get-NetFirewallProfile' },
        }),
      }),
    { mayBeDenied: true },
  );
  const jobId = job ? (await job.json().catch(() => null))?.id : null;
  if (jobId) {
    await timed('script job results poll', () =>
      fetch(`${API}/liveops/script-jobs/${jobId}/results?limit=50`, { headers }),
    );
  }

  await timed('reports list', () => fetch(`${API}/reports?limit=50`, { headers }));
  // The refresh token rotates on use, so the probe has to adopt the new
  // cookie. A client that keeps the old one presents a spent token on its
  // next refresh, and the server correctly destroys the session for replay.
  const refreshed = await timed('token refresh', () =>
    fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'x-csrf-token': headers['x-csrf-token'], cookie: headers.cookie },
    }),
  );
  if (refreshed?.ok) {
    const set = refreshed.headers.getSetCookie?.() ?? [];
    if (set.length) headers.cookie = set.map((c) => c.split(';')[0]).join('; ');
    const body = await refreshed.json().catch(() => null);
    if (body?.accessToken) {
      headers.authorization = `Bearer ${body.accessToken}`;
      headers['x-csrf-token'] = body.csrfToken;
    }
  }
}

const percentile = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const started = Date.now();
process.stdout.write(`warming up ${CONCURRENCY} workers…\n`);

const workers = Array.from({ length: CONCURRENCY }, async () => {
  // Each worker signs in once, as a person would, then loops.
  const session = await signIn(pick(ACCOUNTS));
  while (Date.now() - started < SECONDS * 1000) {
    await journey(session);
  }
});

await Promise.all(workers);

const elapsed = (Date.now() - started) / 1000;
const rows = [...samples.entries()]
  .map(([name, list]) => ({
    name,
    n: list.length,
    p50: Math.round(percentile(list, 50)),
    p95: Math.round(percentile(list, 95)),
    p99: Math.round(percentile(list, 99)),
    max: Math.round(Math.max(...list)),
  }))
  .sort((a, b) => b.p95 - a.p95);

const summary = {
  takenAt: new Date().toISOString(),
  concurrency: CONCURRENCY,
  seconds: Number(elapsed.toFixed(1)),
  requests,
  errors,
  deniedByRbac: denied,
  errorRate: Number(((errors / requests) * 100).toFixed(3)),
  requestsPerSecond: Number((requests / elapsed).toFixed(1)),
  journeys: rows,
};

process.stdout.write(
  `\n${requests} requests over ${elapsed.toFixed(1)}s at ${CONCURRENCY} concurrent ` +
    `(${summary.requestsPerSecond}/s), ${errors} errors (${summary.errorRate}%)\n\n`,
);
process.stdout.write(
  `${'journey'.padEnd(46)}${'n'.padStart(7)}${'p50'.padStart(8)}${'p95'.padStart(8)}${'p99'.padStart(8)}${'max'.padStart(8)}\n`,
);
for (const row of rows) {
  process.stdout.write(
    `${row.name.padEnd(46)}${String(row.n).padStart(7)}${String(row.p50).padStart(8)}${String(row.p95).padStart(8)}${String(row.p99).padStart(8)}${String(row.max).padStart(8)}\n`,
  );
}

if (values.json) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(values.json, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`\nwritten to ${values.json}\n`);
}

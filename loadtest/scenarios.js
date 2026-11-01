import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { ACCOUNTS, API, refresh, signIn } from './lib/session.js';

/**
 * The nine journeys the brief asks for, against the 50,000-device estate.
 *
 * Run one profile at a time:
 *
 *   k6 run -e PROFILE=smoke  loadtest/scenarios.js
 *   k6 run -e PROFILE=load   loadtest/scenarios.js
 *   k6 run -e PROFILE=stress loadtest/scenarios.js
 *   k6 run -e PROFILE=soak   loadtest/scenarios.js
 *
 * Thresholds are the budget from the brief, so a run that breaches them exits
 * non-zero and fails CI rather than producing a report nobody reads.
 */

const PROFILES = {
  smoke: { vus: 5, duration: '1m' },
  load: { vus: 200, duration: '10m' },
  stress: {
    stages: [
      { duration: '2m', target: 200 },
      { duration: '3m', target: 600 },
      { duration: '3m', target: 1000 },
      { duration: '2m', target: 0 },
    ],
  },
  soak: { vus: 100, duration: '1h' },
};

const profile = PROFILES[__ENV.PROFILE || 'smoke'];

export const options = {
  ...profile,
  thresholds: {
    // From the brief: p95 under 500 ms for lists, 200 ms for details,
    // and under half a percent of requests failing.
    'http_req_duration{kind:list}': ['p(95)<500'],
    'http_req_duration{kind:detail}': ['p(95)<200'],
    'http_req_duration{kind:aggregate}': ['p(95)<800'],
    http_req_failed: ['rate<0.005'],
    checks: ['rate>0.995'],
  },
  // Sign-in is a redirect flow; let k6 follow it the way a browser would.
  maxRedirects: 4,
  insecureSkipTLSVerify: false,
};

const wizardSubmit = new Trend('wizard_submit_ms', true);
const scriptJobSubmit = new Trend('script_job_submit_ms', true);

const ZONES = ['zn-mum-hq', 'zn-del-br', 'zn-blr-cmp', 'zn-jai-br', 'zn-pun-dc'];
const SORTS = ['hostname', 'compliancePct', 'lastSeenAt', 'criticalVulns', 'dexScore'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function setup() {
  // One sign-in up front proves the fixture data is seeded before the run.
  const session = signIn(ACCOUNTS[0]);
  const health = http.get(`${API}/health`);
  check(health, { 'server is up': (r) => r.status === 200 });
  return { ok: Boolean(session.accessToken) };
}

export default function scenarios() {
  const session = signIn(pick(ACCOUNTS));
  const headers = session.headers;

  group('1. devices list with filters, sort and paging', () => {
    const list = http.get(
      `${API}/devices?limit=100&sort=${pick(SORTS)}&order=desc&zoneId=${pick(ZONES)}` +
        `&fields=id,hostname,status,osName,zoneName,compliancePct,criticalVulns,lastSeenAt`,
      { headers, tags: { kind: 'list', name: 'devices list' } },
    );
    check(list, {
      'devices returned': (r) => r.status === 200 && r.json('items.0.id') !== undefined,
    });

    const cursor = list.json('page.nextCursor');
    if (cursor) {
      const next = http.get(
        `${API}/devices?limit=100&cursor=${encodeURIComponent(cursor)}&fields=id,hostname`,
        { headers, tags: { kind: 'list', name: 'devices page 2' } },
      );
      check(next, { 'second page returned': (r) => r.status === 200 });
    }
  });

  group('2. device detail and its tabs', () => {
    const first = http.get(`${API}/devices?limit=1&fields=id`, {
      headers,
      tags: { kind: 'list', name: 'devices pick one' },
    });
    const id = first.json('items.0.id');
    if (!id) return;

    const detail = http.get(`${API}/devices/${id}`, {
      headers,
      tags: { kind: 'detail', name: 'device detail' },
    });
    check(detail, { 'device detail': (r) => r.status === 200 });

    http.batch([
      [
        'GET',
        `${API}/devices/${id}/software`,
        null,
        { headers, tags: { kind: 'detail', name: 'device software' } },
      ],
      [
        'GET',
        `${API}/devices/${id}/patches`,
        null,
        { headers, tags: { kind: 'detail', name: 'device patches' } },
      ],
      [
        'GET',
        `${API}/devices/${id}/vulnerabilities`,
        null,
        { headers, tags: { kind: 'detail', name: 'device vulns' } },
      ],
      [
        'GET',
        `${API}/devices/${id}/diagnostics`,
        null,
        { headers, tags: { kind: 'detail', name: 'device diagnostics' } },
      ],
    ]);
  });

  group('3. global search', () => {
    const search = http.get(`${API}/devices?q=MUM-WS-0&limit=25&fields=id,hostname,zoneName`, {
      headers,
      tags: { kind: 'list', name: 'search' },
    });
    check(search, { 'search returned': (r) => r.status === 200 });
  });

  group('4. overview aggregates', () => {
    const overview = http.get(`${API}/overview`, {
      headers,
      tags: { kind: 'aggregate', name: 'overview' },
    });
    check(overview, {
      'overview computed': (r) => r.status === 200 && r.json('endpoints.total') > 0,
    });
  });

  group('5. vulnerability aggregation', () => {
    const vulns = http.get(`${API}/vulnerabilities?limit=50&sort=cvss&order=desc`, {
      headers,
      tags: { kind: 'list', name: 'vulnerabilities' },
    });
    check(vulns, { 'vulnerabilities returned': (r) => r.status === 200 });
  });

  group('6. deployment wizard submit against 500 devices', () => {
    const group500 = http.get(`${API}/groups?limit=5&fields=id,memberCount`, {
      headers,
      tags: { kind: 'list', name: 'groups' },
    });
    const groupId = group500.json('items.0.id');
    if (!groupId) return;

    const res = http.post(
      `${API}/deployments`,
      JSON.stringify({
        type: 'install-software',
        name: `Load test action ${__VU}-${__ITER}`,
        content: { packageId: 'sw-chrome' },
        targets: { groupIds: [groupId] },
        schedule: { mode: 'now' },
        network: { wakeOfflineFirst: false },
      }),
      { headers, tags: { kind: 'write', name: 'create deployment' } },
    );
    wizardSubmit.add(res.timings.duration);
    check(res, { 'deployment created': (r) => r.status === 201 });
  });

  group('7. script execution job on a zone', () => {
    const res = http.post(
      `${API}/liveops/script-jobs`,
      JSON.stringify({
        kind: 'script',
        name: `Load test script ${__VU}-${__ITER}`,
        targets: { zone: pick(ZONES) },
        outputLimitKb: 64,
        script: {
          language: 'powershell',
          body: 'Get-NetFirewallProfile | Select-Object Name, Enabled',
        },
      }),
      { headers, tags: { kind: 'write', name: 'submit script job' } },
    );
    scriptJobSubmit.add(res.timings.duration);
    check(res, { 'job queued': (r) => r.status === 201 });

    const jobId = res.json('id');
    if (jobId) {
      // Poll once, the way the console does. There is no socket to hold open.
      const results = http.get(`${API}/liveops/script-jobs/${jobId}/results?limit=50`, {
        headers,
        tags: { kind: 'list', name: 'job results' },
      });
      check(results, { 'results readable': (r) => r.status === 200 });
    }
  });

  group('8. report export page', () => {
    const reports = http.get(`${API}/reports?limit=50`, {
      headers,
      tags: { kind: 'list', name: 'reports' },
    });
    check(reports, { 'reports returned': (r) => r.status === 200 });
  });

  group('9. token refresh mid-session', () => {
    refresh(session);
  });

  // A real operator reads between clicks.
  sleep(Math.random() * 2 + 1);
}

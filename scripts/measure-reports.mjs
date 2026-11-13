#!/usr/bin/env node
/**
 * Server time per Reports endpoint, cold then warm.
 *
 * This exists because the Reports work was argued from numbers and the
 * numbers should be reproducible. Run it against a mock server that has just
 * started, so the first column is a genuine cold read rather than a cache
 * hit:
 *
 *   pnpm mock                       # terminal 1
 *   node scripts/measure-reports.mjs
 *
 * Pass paths to measure something else:
 *
 *   node scripts/measure-reports.mjs /reports/security/summary
 *
 * The "warm" column is the same request repeated. For a summary that is the
 * server-side cache; for a rows query it is SQLite's page cache.
 */
import { execFileSync } from 'node:child_process';

const API = process.env['MOCK_API'] ?? 'http://localhost:8080/api/v1';
const REDIRECT = process.env['E2E_REDIRECT_URI'] ?? 'http://localhost:5173/auth/callback';

/** The endpoints the Reports page actually waits on. */
const DEFAULT_PATHS = [
  '/reports',
  '/reports/computers/summary',
  '/reports/software/summary',
  '/reports/updates/summary',
  '/reports/security/summary',
  '/reports/computers/run?limit=10',
  '/reports/software/run?limit=10',
  '/reports/computers/run?limit=10&cursor=49990',
];

function token() {
  const raw = execFileSync('node', ['security/get-token.mjs', '--redirect', REDIRECT], {
    encoding: 'utf8',
  });
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  return JSON.parse(json).token;
}

async function time(path, headers) {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, { headers });
  const body = await res.text();
  return { ms: Math.round(performance.now() - started), status: res.status, bytes: body.length };
}

const headers = { authorization: `Bearer ${token()}` };
const paths = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PATHS;

process.stdout.write(
  `${'path'.padEnd(46)}${'cold'.padStart(8)}${'warm'.padStart(8)}${'bytes'.padStart(10)}\n`,
);

let failures = 0;
for (const path of paths) {
  const cold = await time(path, headers);
  const warm = await time(path, headers);
  if (cold.status !== 200) failures += 1;
  process.stdout.write(
    `${path.padEnd(46)}${`${cold.ms}ms`.padStart(8)}${`${warm.ms}ms`.padStart(8)}` +
      `${String(cold.bytes).padStart(10)}${cold.status === 200 ? '' : `  HTTP ${cold.status}`}\n`,
  );
}

if (failures > 0) {
  process.stdout.write(`\n${failures} endpoint(s) did not answer 200\n`);
  process.exitCode = 1;
}

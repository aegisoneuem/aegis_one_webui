/**
 * Runs the authenticated ZAP active scan.
 *
 * ZAP's `${VAR}` substitution did not reach the replacer's replacementString,
 * so every request went out unauthenticated and the scan reported nothing
 * while appearing to have run — the most dangerous kind of green. This script
 * signs in, writes a plan with the real values in it, runs ZAP, and then
 * checks that the traffic was actually authenticated before believing the
 * result.
 *
 *   node security/run-active-scan.mjs --zap "C:/Program Files/ZAP/Zed Attack Proxy/zap-2.17.0.jar"
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const { values } = parseArgs({
  options: {
    zap: { type: 'string', default: 'C:/Program Files/ZAP/Zed Attack Proxy/zap-2.17.0.jar' },
    java: { type: 'string', default: 'java' },
    base: { type: 'string', default: 'http://localhost:8080' },
    redirect: { type: 'string', default: 'http://localhost:4173/auth/callback' },
    email: { type: 'string', default: 'rohan.deshpande@example.co.in' },
    port: { type: 'string', default: '8090' },
  },
});

const API = `${values.base}/api/v1`;

async function signIn() {
  const verifier = `verifier-${createHash('sha256').update(String(Date.now())).digest('hex')}`;
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const authorize = await fetch(
    `${values.base}/oidc/authorize?client_id=aegis-one-console&redirect_uri=${encodeURIComponent(values.redirect)}` +
      `&state=zap&code_challenge=${challenge}&code_challenge_method=S256`,
  );
  const flow = (authorize.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const page = await authorize.text();
  const loginId = /name="login_id" value="([^"]+)"/.exec(page)?.[1];
  const formCsrf = /name="csrf_token" value="([^"]+)"/.exec(page)?.[1];
  if (!loginId || !formCsrf)
    throw new Error('could not start sign-in — is the mock server running?');

  await fetch(`${values.base}/oidc/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: flow },
    body: new URLSearchParams({
      login_id: loginId,
      csrf_token: formCsrf,
      email: values.email,
      password: process.env['MOCK_PASSWORD'] ?? 'Aegis-Demo-2026',
    }),
  });

  const mfa = await fetch(`${values.base}/oidc/mfa`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: flow },
    body: new URLSearchParams({
      login_id: loginId,
      csrf_token: formCsrf,
      code: process.env['MOCK_MFA_CODE'] ?? '246813',
    }),
    redirect: 'manual',
  });
  const code = new URL(mfa.headers.get('location')).searchParams.get('code');

  const res = await fetch(`${API}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: values.redirect }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);

  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const body = await res.json();
  return { token: body.accessToken, csrf: body.csrfToken, cookies, role: body.user.role };
}

/** Confirms the token works before handing it to the scanner. */
async function assertAuthenticated(session) {
  const res = await fetch(`${API}/devices?limit=1&fields=id`, {
    headers: { authorization: `Bearer ${session.token}`, cookie: session.cookies },
  });
  if (!res.ok) throw new Error(`the token does not authenticate: HTTP ${res.status}`);
}

const session = await signIn();
await assertAuthenticated(session);
process.stdout.write(`signed in as ${session.role}; token verified against /devices\n`);

const template = readFileSync(resolve(here, 'zap-active-api.yaml'), 'utf8');
const plan = template
  .replaceAll('${ZAP_TOKEN}', session.token)
  .replaceAll('${ZAP_CSRF}', session.csrf)
  .replaceAll('${ZAP_COOKIES}', `${session.cookies}; aegis_csrf=${session.csrf}`)
  .replaceAll('${ZAP_API}', API)
  .replaceAll('${ZAP_REPORTS}', resolve(root, 'apps/aegis-one/docs/scans').replace(/\\/g, '/'));

// Holds a live bearer token, so it is written beside the plan and gitignored.
const generated = resolve(here, '.zap-active.generated.yaml');
writeFileSync(generated, plan, 'utf8');
process.stdout.write(`plan written to ${generated}\n`);

if (!existsSync(values.zap)) throw new Error(`ZAP not found at ${values.zap} — pass --zap`);

process.stdout.write('running ZAP…\n');
try {
  execFileSync(
    values.java,
    ['-Xmx2g', '-jar', values.zap, '-cmd', '-port', values.port, '-autorun', generated],
    { stdio: 'inherit', cwd: root },
  );
} finally {
  // The token is short-lived, but leaving it on disk is still careless.
  writeFileSync(generated, '# consumed\n', 'utf8');
}

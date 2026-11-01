/**
 * Signs in through the OIDC flow and prints the tokens a scanner needs.
 *
 *   node security/get-token.mjs
 *   node security/get-token.mjs --export      # shell exports
 *
 * Scanning only the unauthenticated surface of this API would miss almost
 * everything worth finding: every injection sink, every object id and the
 * whole permission model sit behind a bearer token.
 *
 * Signs in as the Super Admin on purpose — a scan should reach every endpoint.
 * Use a lower-privileged fixture account to check that the permission model
 * holds under attack traffic rather than only under polite requests.
 */
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:8080' },
    email: { type: 'string', default: 'rohan.deshpande@example.co.in' },
    redirect: { type: 'string', default: 'http://localhost:5173/auth/callback' },
    export: { type: 'boolean', default: false },
  },
});

const BASE = values.base;
const API = `${BASE}/api/v1`;

const verifier = `verifier-${createHash('sha256').update(String(Date.now())).digest('hex')}`;
const challenge = createHash('sha256').update(verifier).digest('base64url');

const authorize = await fetch(
  `${BASE}/oidc/authorize?client_id=aegis-one-console&redirect_uri=${encodeURIComponent(values.redirect)}` +
    `&state=zap&code_challenge=${challenge}&code_challenge_method=S256`,
);
const page = await authorize.text();
const loginId = /name="login_id" value="([^"]+)"/.exec(page)?.[1];
// The sign-in form is a double-submit pair: this field has to match the cookie.
const formCsrf = /name="csrf_token" value="([^"]+)"/.exec(page)?.[1];
if (!loginId || !formCsrf) throw new Error('could not start sign-in — is the mock server running?');

// The sign-in flow is bound to an httpOnly cookie, so carry it like a browser.
const flow = (authorize.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

await fetch(`${BASE}/oidc/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: flow },
  body: new URLSearchParams({
    login_id: loginId,
    csrf_token: formCsrf,
    email: values.email,
    password: process.env['MOCK_PASSWORD'] ?? 'Aegis-Demo-2026',
  }),
});

const mfa = await fetch(`${BASE}/oidc/mfa`, {
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

const body = await res.json();

if (values.export) {
  process.stdout.write(`export ZAP_TOKEN='${body.accessToken}'\n`);
  process.stdout.write(`export ZAP_CSRF='${body.csrfToken}'\n`);
} else {
  process.stdout.write(
    `${JSON.stringify({ token: body.accessToken, csrf: body.csrfToken, role: body.user.role }, null, 2)}\n`,
  );
}

// The access token lasts 15 minutes. A long active scan outlives it, so take a
// fresh one immediately before starting rather than reusing an old one.
process.stderr.write(`\n# role: ${body.user.role}; token expires in ${body.expiresIn}s\n`);

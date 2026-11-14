import http from 'k6/http';
import { check, fail } from 'k6';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

/**
 * Signs in through the real OIDC flow, so the numbers include what a user
 * actually pays to get a session — not just the cost of a pre-minted token.
 */

const BASE = __ENV.BASE_URL || 'http://localhost:8080';
export const API = `${BASE}/api/v1`;
const REDIRECT = __ENV.REDIRECT_URI || 'http://localhost:5173/auth/callback';
const PASSWORD = __ENV.MOCK_PASSWORD || 'Aegis-Demo-2026';
const MFA_CODE = __ENV.MOCK_MFA_CODE || '246813';

export const ACCOUNTS = [
  'rohan.deshpande@example.co.in',
  'ananya.iyer@example.co.in',
  'siddharth.kulkarni@example.co.in',
  'kavya.chandrasekar@example.co.in',
];

function base64url(bytes) {
  return encoding.b64encode(bytes, 'rawurl');
}

export function signIn(email) {
  // PKCE needs 43 or more unreserved characters and nothing else; randomness
  // alone gives uniqueness, and it works in setup() as well as in a VU, where
  // scenario context is not available.
  const verifier = `v-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}-${Date.now()}-pad`;
  const challenge = base64url(crypto.sha256(verifier, 'binary'));

  const authorize = http.get(
    `${BASE}/oidc/authorize?client_id=aegis-one-console&redirect_uri=${encodeURIComponent(REDIRECT)}` +
      `&state=s&code_challenge=${challenge}&code_challenge_method=S256`,
    { tags: { name: 'oidc authorize' } },
  );
  const loginId = (/name="login_id" value="([^"]+)"/.exec(authorize.body) || [])[1];
  // Double-submit pair: this field has to match the cookie k6 is holding.
  const formCsrf = (/name="csrf_token" value="([^"]+)"/.exec(authorize.body) || [])[1];
  if (!loginId || !formCsrf) fail('could not start sign-in');

  http.post(
    `${BASE}/oidc/login`,
    { login_id: loginId, csrf_token: formCsrf, email, password: PASSWORD },
    { tags: { name: 'oidc password' } },
  );

  const mfa = http.post(
    `${BASE}/oidc/mfa`,
    { login_id: loginId, csrf_token: formCsrf, code: MFA_CODE },
    { redirects: 0, tags: { name: 'oidc mfa' } },
  );
  const location = mfa.headers['Location'] || '';
  const code = (/[?&]code=([^&]+)/.exec(location) || [])[1];
  if (!code) fail('no authorization code returned');

  const token = http.post(
    `${API}/auth/token`,
    JSON.stringify({ code, codeVerifier: verifier, redirectUri: REDIRECT }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'auth token' } },
  );
  check(token, { 'signed in': (r) => r.status === 200 });

  const body = token.json();
  const permissions = body.user.permissions || [];
  return {
    accessToken: body.accessToken,
    csrfToken: body.csrfToken,
    role: body.user.role,
    permissions,
    /**
     * Mirrors the console's own check. A load profile that has an Auditor
     * clicking "New action" is not modelling anything real — the button is
     * not on their screen — and it turns correct 403s into a failure rate
     * that hides genuine ones.
     */
    can: (permission) =>
      permissions.includes('*') ||
      permissions.includes(permission) ||
      permissions.includes(`${permission.split(':')[0]}:*`),
    headers: {
      Authorization: `Bearer ${body.accessToken}`,
      'Content-Type': 'application/json',
      'X-CSRF-Token': body.csrfToken,
    },
  };
}

export function refresh(session) {
  const res = http.post(`${API}/auth/refresh`, null, {
    headers: { 'X-CSRF-Token': session.csrfToken },
    tags: { name: 'auth refresh' },
  });
  check(res, { refreshed: (r) => r.status === 200 });
  if (res.status === 200) {
    const body = res.json();
    session.accessToken = body.accessToken;
    session.csrfToken = body.csrfToken;
    session.headers.Authorization = `Bearer ${body.accessToken}`;
    session.headers['X-CSRF-Token'] = body.csrfToken;
  }
  return session;
}

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
  const verifier = `v-${__VU}-${__ITER}-${Math.random().toString(36).slice(2)}-padpadpadpadpad`;
  const challenge = base64url(crypto.sha256(verifier, 'binary'));

  const authorize = http.get(
    `${BASE}/oidc/authorize?client_id=aegis-one-console&redirect_uri=${encodeURIComponent(REDIRECT)}` +
      `&state=s&code_challenge=${challenge}&code_challenge_method=S256`,
    { tags: { name: 'oidc authorize' } },
  );
  const loginId = (/name="login_id" value="([^"]+)"/.exec(authorize.body) || [])[1];
  if (!loginId) fail('could not start sign-in');

  http.post(
    `${BASE}/oidc/login`,
    { login_id: loginId, email, password: PASSWORD },
    { tags: { name: 'oidc password' } },
  );

  const mfa = http.post(
    `${BASE}/oidc/mfa`,
    { login_id: loginId, code: MFA_CODE },
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
  return {
    accessToken: body.accessToken,
    csrfToken: body.csrfToken,
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

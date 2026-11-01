import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { badRequest, unauthorized } from '../errors';
import { newOpaqueToken, safeEqual } from '../security/tokens';

/**
 * Mock OIDC identity provider with an MFA step.
 *
 * It behaves like the real thing in the ways that matter to the console and to
 * a security test: authorization-code flow with PKCE, an exact-match redirect
 * allowlist, single-use codes with a short lifetime, and a second factor. It
 * is not a real IdP — passwords are compared against seeded fixtures — and the
 * console reaches the production IdP by changing one base URL.
 */

export interface MockUser {
  id: string;
  email: string;
  name: string;
  /** Fixture password. Never a real credential, and never logged. */
  password: string;
  role: string;
  permissions: string[];
  zoneIds: string[];
  /** Six digits. A real IdP would do TOTP; the shape of the flow is the point. */
  mfaCode: string;
  disabled?: boolean;
}

export interface IdpOptions {
  /** Exactly matched. Anything else is refused — this is the open-redirect control. */
  redirectUris: readonly string[];
  users: readonly MockUser[];
  /** Mounted under this prefix, e.g. `/oidc`. */
  prefix: string;
  issuer: string;
  clientId: string;
}

interface PendingLogin {
  state: string;
  redirectUri: string;
  codeChallenge: string;
  userId?: string;
  createdAt: number;
}

export interface AuthCode {
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  expiresAt: number;
}

const LOGIN_TTL_MS = 5 * 60_000;
const CODE_TTL_MS = 60_000;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/**
 * Tagged template that escapes every interpolated value.
 *
 * The sign-in pages are built by hand because they must work with a CSP that
 * forbids inline script, which rules out a client-side renderer. Escaping each
 * value at the call site works right up until someone adds a field and forgets;
 * here, forgetting is not possible — nothing reaches the output unescaped
 * unless it is already `SafeHtml`.
 */
class SafeHtml {
  constructor(readonly value: string) {}
}

function html(parts: TemplateStringsArray, ...values: (string | SafeHtml)[]): SafeHtml {
  let out = parts[0] ?? '';
  values.forEach((value, i) => {
    out += value instanceof SafeHtml ? value.value : escapeHtml(String(value));
    out += parts[i + 1] ?? '';
  });
  return new SafeHtml(out);
}

function page(title: string, body: SafeHtml): string {
  // No inline script and no inline style: the CSP forbids both, and a login
  // page is exactly where an injected script would be worth the most.
  return html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="idp.css"></head>
<body><main class="card">${body}</main></body></html>`.value;
}

export interface IdpStore {
  codes: Map<string, AuthCode>;
}

export function registerMockIdp(app: FastifyInstance, options: IdpOptions, store: IdpStore): void {
  const logins = new Map<string, PendingLogin>();

  const sweep = () => {
    const now = Date.now();
    for (const [key, login] of logins) if (now - login.createdAt > LOGIN_TTL_MS) logins.delete(key);
    for (const [key, code] of store.codes) if (now > code.expiresAt) store.codes.delete(key);
  };

  app.get(`${options.prefix}/.well-known/openid-configuration`, async () => ({
    issuer: options.issuer,
    authorization_endpoint: `${options.issuer}${options.prefix}/authorize`,
    token_endpoint: `${options.issuer}/api/v1/auth/token`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
  }));

  app.get(`${options.prefix}/idp.css`, async (_request, reply) => {
    reply.type('text/css');
    return IDP_CSS;
  });

  app.get(`${options.prefix}/authorize`, async (request: FastifyRequest, reply: FastifyReply) => {
    sweep();
    const q = request.query as Record<string, string | undefined>;
    const redirectUri = q['redirect_uri'] ?? '';
    const state = q['state'] ?? '';
    const challenge = q['code_challenge'] ?? '';

    // Checked before anything is rendered or redirected. An open redirect here
    // would hand an attacker the authorization code.
    if (!options.redirectUris.includes(redirectUri)) {
      throw badRequest('That redirect URI is not registered for this client.');
    }
    if (q['client_id'] !== options.clientId) throw badRequest('Unknown client.');
    if (!challenge || q['code_challenge_method'] !== 'S256') {
      throw badRequest('PKCE with S256 is required.');
    }

    const loginId = randomUUID();
    logins.set(loginId, { state, redirectUri, codeChallenge: challenge, createdAt: Date.now() });

    reply.type('text/html');
    return page(
      'Sign in',
      html`<h1>Sign in</h1>
<p class="muted">Use your organisation account to continue to the console.</p>
<form method="post" action="login">
  <input type="hidden" name="login_id" value="${loginId}">
  <label for="email">Work email</label>
  <input id="email" name="email" type="email" autocomplete="username" required>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Continue</button>
</form>`,
    );
  });

  app.post(`${options.prefix}/login`, async (request: FastifyRequest, reply: FastifyReply) => {
    sweep();
    const form = request.body as Record<string, string | undefined>;
    const login = logins.get(form['login_id'] ?? '');
    if (!login) throw badRequest('That sign-in attempt has expired. Start again.');

    const user = options.users.find(
      (u) => u.email.toLowerCase() === (form['email'] ?? '').toLowerCase().trim(),
    );

    // One message for a wrong email, a wrong password and a disabled account,
    // so the form cannot be used to find out which addresses exist.
    const ok = user && !user.disabled && safeEqual(user.password, form['password'] ?? '');
    if (!ok || !user) {
      request.log.warn({ event: 'login_failed' }, 'sign-in rejected');
      reply.type('text/html').status(401);
      return page(
        'Sign in',
        html`<h1>Sign in</h1>
<p class="error" role="alert">That email and password did not match.</p>
<form method="post" action="login">
  <input type="hidden" name="login_id" value="${form['login_id'] ?? ''}">
  <label for="email">Work email</label>
  <input id="email" name="email" type="email" autocomplete="username" required>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Continue</button>
</form>`,
      );
    }

    login.userId = user.id;

    reply.type('text/html');
    return page(
      'Two-step verification',
      html`<h1>Two-step verification</h1>
<p class="muted">Enter the six-digit code from your authenticator app.</p>
<form method="post" action="mfa">
  <input type="hidden" name="login_id" value="${form['login_id'] ?? ''}">
  <label for="code">Verification code</label>
  <input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
  <button type="submit">Verify</button>
</form>`,
    );
  });

  app.post(`${options.prefix}/mfa`, async (request: FastifyRequest, reply: FastifyReply) => {
    sweep();
    const form = request.body as Record<string, string | undefined>;
    const loginId = form['login_id'] ?? '';
    const login = logins.get(loginId);
    if (!login?.userId) throw badRequest('That sign-in attempt has expired. Start again.');

    const user = options.users.find((u) => u.id === login.userId);
    if (!user) throw unauthorized();

    if (!safeEqual(user.mfaCode, (form['code'] ?? '').trim())) {
      request.log.warn({ event: 'mfa_failed', userId: user.id }, 'second factor rejected');
      reply.type('text/html').status(401);
      return page(
        'Two-step verification',
        html`<h1>Two-step verification</h1>
<p class="error" role="alert">That code was not correct.</p>
<form method="post" action="mfa">
  <input type="hidden" name="login_id" value="${loginId}">
  <label for="code">Verification code</label>
  <input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
  <button type="submit">Verify</button>
</form>`,
      );
    }

    logins.delete(loginId);
    const code = newOpaqueToken();
    store.codes.set(code, {
      userId: user.id,
      codeChallenge: login.codeChallenge,
      redirectUri: login.redirectUri,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    const target = new URL(login.redirectUri);
    target.searchParams.set('code', code);
    if (login.state) target.searchParams.set('state', login.state);
    return reply.redirect(target.toString(), 303);
  });
}

/** Verifies the PKCE verifier and burns the code. Codes are single-use. */
export function redeemAuthCode(
  store: IdpStore,
  code: string,
  verifier: string,
  redirectUri: string,
): string {
  const entry = store.codes.get(code);
  // Deleted whatever happens: a replayed code must not get a second chance.
  store.codes.delete(code);

  if (!entry || Date.now() > entry.expiresAt)
    throw badRequest('That sign-in code has expired. Start again.');
  if (entry.redirectUri !== redirectUri) throw badRequest('Redirect URI mismatch.');

  const expected = createHash('sha256').update(verifier).digest('base64url');
  if (!safeEqual(expected, entry.codeChallenge)) throw badRequest('PKCE verification failed.');

  return entry.userId;
}

const IDP_CSS = `:root{color-scheme:light}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f5f6f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1b2430}
.card{width:min(380px,calc(100vw - 32px));padding:28px;background:#fff;border:1px solid #e5e8eb;border-radius:10px;
box-shadow:0 4px 12px rgb(16 24 40 / 10%)}
h1{margin:0 0 6px;font-size:19px}
.muted{margin:0 0 20px;color:#47607a;font-size:13px;line-height:1.5}
.error{margin:0 0 16px;padding:8px 10px;background:#fcebec;color:#c0262d;border-radius:6px;font-size:13px}
label{display:block;margin:14px 0 5px;font-size:12.5px;font-weight:500}
input{width:100%;box-sizing:border-box;height:34px;padding:0 10px;border:1px solid #e5e8eb;border-radius:6px;font:inherit;font-size:13.5px}
input:focus{outline:none;border-color:#7f6038;box-shadow:0 0 0 3px rgb(127 96 56 / 18%)}
button{width:100%;height:36px;margin-top:20px;border:0;border-radius:6px;background:#7f6038;color:#fff;
font:inherit;font-size:13.5px;font-weight:500;cursor:pointer}
button:hover{background:#6b5030}`;

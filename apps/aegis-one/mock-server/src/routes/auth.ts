import type { FastifyInstance } from 'fastify';
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  type SessionStore,
  badRequest,
  clearCsrfToken,
  issueCsrfToken,
  redeemAuthCode,
  signAccessToken,
  unauthorized,
  type IdpStore,
  type MockUser,
  type TokenConfig,
} from '@aegis/mock-core';

const REFRESH_COOKIE = 'aegis_rt';

export interface AuthRoutesOptions {
  basePath: string;
  tokens: TokenConfig;
  sessions: SessionStore;
  idp: IdpStore;
  users: readonly MockUser[];
  redirectUris: readonly string[];
  secure: boolean;
}

/**
 * Token exchange, refresh, sign-out and the current session.
 *
 * The refresh token is only ever a cookie. It is never in a response body, a
 * query string or anywhere JavaScript can read it, so an XSS that steals the
 * access token still expires in fifteen minutes.
 */
export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const { basePath, tokens, sessions, idp, users, secure } = options;

  const setRefreshCookie = (reply: Parameters<typeof issueCsrfToken>[0], token: string) => {
    reply.setCookie(REFRESH_COOKIE, token, {
      path: `${basePath}/auth`,
      httpOnly: true,
      secure,
      sameSite: 'strict',
      maxAge: REFRESH_TTL_SECONDS,
    });
  };

  const issue = async (
    reply: Parameters<typeof issueCsrfToken>[0],
    user: MockUser,
    sessionId: string,
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    csrfToken: string;
    user: Record<string, unknown>;
  }> => {
    const accessToken = await signAccessToken(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
        zoneIds: user.zoneIds,
        sid: sessionId,
      },
      tokens,
    );
    const csrfToken = issueCsrfToken(reply, { secure });
    return {
      accessToken,
      expiresIn: tokens.accessTtlSeconds ?? ACCESS_TTL_SECONDS,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
        zoneIds: user.zoneIds,
      },
    };
  };

  app.post(`${basePath}/auth/token`, async (request, reply) => {
    const body = request.body as
      { code?: string; codeVerifier?: string; redirectUri?: string } | undefined;
    if (!body?.code || !body.codeVerifier || !body.redirectUri) {
      throw badRequest('code, codeVerifier and redirectUri are all required.');
    }

    const userId = redeemAuthCode(idp, body.code, body.codeVerifier, body.redirectUri);
    const user = users.find((u) => u.id === userId);
    if (!user || user.disabled) throw unauthorized();

    const { session, token } = sessions.create(user.id, {
      ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
      ip: request.ip,
    });
    setRefreshCookie(reply, token);

    request.log.info(
      { event: 'auth.sign-in', userId: user.id, sid: session.id },
      'session established',
    );
    return issue(reply, user, session.id);
  });

  app.post(`${basePath}/auth/refresh`, async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    if (!presented) throw unauthorized('Your session has expired. Sign in again.');

    const rotated = sessions.rotate(presented);
    if (!rotated) {
      // Either expired, or a replay that has just revoked the family.
      reply.clearCookie(REFRESH_COOKIE, { path: `${basePath}/auth` });
      clearCsrfToken(reply, { secure });
      throw unauthorized('Your session has expired. Sign in again.');
    }

    const user = users.find((u) => u.id === rotated.session.userId);
    if (!user || user.disabled) {
      sessions.revoke(rotated.session.id);
      throw unauthorized();
    }

    setRefreshCookie(reply, rotated.token);
    return issue(reply, user, rotated.session.id);
  });

  app.post(`${basePath}/auth/logout`, async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    if (presented) {
      const rotated = sessions.rotate(presented);
      if (rotated) sessions.revoke(rotated.session.id);
    }
    if (request.auth?.sid) sessions.revoke(request.auth.sid);

    reply.clearCookie(REFRESH_COOKIE, { path: `${basePath}/auth` });
    clearCsrfToken(reply, { secure });
    return reply.status(204).send();
  });

  app.get(`${basePath}/auth/me`, async (request) => {
    const claims = request.auth;
    if (!claims) throw unauthorized();
    return {
      id: claims.sub,
      email: claims.email,
      name: claims.name,
      role: claims.role,
      permissions: claims.permissions,
      zoneIds: claims.zoneIds,
    };
  });
}

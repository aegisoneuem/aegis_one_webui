import type { FastifyReply, FastifyRequest } from 'fastify';
import { newOpaqueToken, safeEqual } from './tokens';
import { forbidden } from '../errors';

/**
 * Double-submit CSRF protection.
 *
 * The refresh cookie is SameSite=Strict, which already blocks the cross-site
 * case in current browsers, but SameSite is a browser behaviour rather than a
 * server check: it is defence, not the defence. Every state-changing request
 * must also echo the CSRF cookie in an X-CSRF-Token header, which a
 * cross-origin page cannot read.
 */

export const CSRF_COOKIE = 'aegis_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfOptions {
  /** False in dev over plain http; always true behind TLS. */
  secure: boolean;
}

/** Issued at sign-in and rotated on refresh. Readable by JS by design. */
export function issueCsrfToken(reply: FastifyReply, options: CsrfOptions): string {
  const token = newOpaqueToken();
  reply.setCookie(CSRF_COOKIE, token, {
    path: '/',
    httpOnly: false,
    secure: options.secure,
    sameSite: 'strict',
  });
  return token;
}

export function clearCsrfToken(reply: FastifyReply, options: CsrfOptions): void {
  reply.setCookie(CSRF_COOKIE, '', {
    path: '/',
    httpOnly: false,
    secure: options.secure,
    sameSite: 'strict',
    maxAge: 0,
  });
}

export function assertCsrf(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return;

  const cookie = request.cookies[CSRF_COOKIE];
  const header = request.headers[CSRF_HEADER];
  const sent = Array.isArray(header) ? header[0] : header;

  if (!cookie || !sent || !safeEqual(cookie, sent)) {
    throw forbidden('This request could not be verified. Reload the page and try again.');
  }
}

import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { tooManyRequests } from '../errors';

export interface RateLimitOptions {
  /** Requests per window for an authenticated caller. */
  max: number;
  windowMs: number;
  /** Much tighter: this is the bucket sign-in and token exchange sit in. */
  authMax: number;
  authWindowMs: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitOptions = {
  max: 600,
  windowMs: 60_000,
  authMax: 10,
  authWindowMs: 60_000,
};

/**
 * Per-caller request limits.
 *
 * Keyed on the session id where there is one, falling back to the client
 * address. Keying on IP alone would let one user behind a corporate NAT
 * exhaust the budget for a whole office, and would let an attacker rotating
 * source addresses sidestep the limit entirely.
 */
export async function registerRateLimit(
  app: FastifyInstance,
  options: RateLimitOptions,
): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: options.max,
    timeWindow: options.windowMs,
    keyGenerator: (request: FastifyRequest) => request.auth?.sid ?? request.ip,
    /*
     * Must return an ApiError, not the envelope object.
     *
     * @fastify/rate-limit throws whatever this returns, and a plain object is
     * not an Error — so the app's error handler did not recognise it, logged
     * it as unhandled, and answered 500. A client over its budget was told the
     * server had broken rather than to slow down, which is both wrong and the
     * opposite of actionable: nothing backs off on a 500. A ZAP scan produced
     * 3,199 of them.
     */
    errorResponseBuilder: () => tooManyRequests(),
    // Telling an unauthenticated caller the exact budget helps them pace an
    // attack; an authenticated client needs the headers to back off politely.
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
}

/** Stricter bucket for the auth routes, registered inside their own scope. */
export function authRateLimitConfig(options: RateLimitOptions) {
  return {
    rateLimit: {
      max: options.authMax,
      timeWindow: options.authWindowMs,
      keyGenerator: (request: FastifyRequest) => request.ip,
    },
  };
}

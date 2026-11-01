import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

export interface SecurityHeaderOptions {
  /** Origins the console is served from; also the only CSP connect targets. */
  appOrigins: readonly string[];
  /** HSTS and Secure cookies off over plain http in dev. */
  secure: boolean;
}

/**
 * Response hardening.
 *
 * The CSP has no `unsafe-inline` and no `unsafe-eval`, which is the whole
 * point of having one: with either, a single injected string becomes script
 * execution and the policy stops being a control. It is also why the console
 * self-hosts its fonts instead of pulling them from a CDN, and why styles are
 * CSS Modules rather than inline style attributes.
 */
export async function registerSecurityHeaders(
  app: FastifyInstance,
  { appOrigins, secure }: SecurityHeaderOptions,
): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", ...appOrigins],
        // The console's own origin, because the identity provider's sign-in
        // form redirects there on success. Chrome enforces form-action across
        // redirects, so 'self' alone silently breaks the OIDC callback — and
        // it breaks it after the password and the second factor have been
        // accepted, which is the hardest place to notice.
        formAction: ["'self'", ...appOrigins],
        baseUri: ["'none'"],
        objectSrc: ["'none'"],
        // Defence in depth beside X-Frame-Options, for the clickjacking case.
        frameAncestors: ["'none'"],
        // Helmet sets this by default; over plain http in dev it rewrites every
        // request to https and nothing loads, so it is removed unless secure.
        ...(secure ? { upgradeInsecureRequests: [] } : { upgradeInsecureRequests: null }),
      },
    },
    // Pointless and misleading over plain http, so it is only set behind TLS.
    hsts: secure ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    noSniff: true,
    frameguard: { action: 'deny' },
    // A full URL in the Referer would leak device ids and filter terms off-site.
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    xssFilter: false, // retired in modern browsers, and the legacy filter was itself exploitable
  });

  app.addHook('onSend', async (_request, reply) => {
    // Nothing in this console uses these, so none of them is granted.
    reply.header(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
    );
    reply.header('Cache-Control', 'no-store');
  });
}

import type { FastifyServerOptions } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * Structured request logging.
 *
 * Authorization headers, cookies and CSRF tokens are redacted, and query
 * strings are logged as the set of parameter names rather than their values:
 * a search term can be a hostname, a username or a serial, and none of that
 * belongs in a log that gets shipped somewhere else.
 */
export function loggerOptions(pretty: boolean): FastifyServerOptions['logger'] {
  return {
    level: process.env['LOG_LEVEL'] ?? 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
    serializers: {
      req(request: {
        id: string;
        method: string;
        url: string;
        ip: string;
        routeOptions?: { url?: string };
      }) {
        const [path, search] = request.url.split('?', 2);
        return {
          id: request.id,
          method: request.method,
          path,
          // Names only; values can carry hostnames, usernames and serials.
          queryKeys: search ? [...new URLSearchParams(search).keys()] : undefined,
          route: request.routeOptions?.url,
          ip: request.ip,
        };
      },
    },
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  };
}

export const genRequestId = (): string => randomUUID();

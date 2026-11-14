import type { FastifyInstance } from 'fastify';
import { ApiError } from './errors';

/**
 * Artificial latency and failures, for testing the console's loading and error
 * paths against something other than a server that always answers in 2 ms.
 *
 * Off unless explicitly configured, and the factory refuses to enable it when
 * the server is not in development mode — a production build that could be
 * told to fail one request in twenty would be a denial-of-service switch.
 */
export interface ChaosOptions {
  /** Uniform extra delay, in milliseconds. */
  latencyMinMs?: number;
  latencyMaxMs?: number;
  /** 0 to 1. Each matching request fails with 500 at this rate. */
  errorRate?: number;
  /** Paths to leave alone, e.g. the auth routes. */
  exclude?: readonly RegExp[];
}

export function registerChaos(app: FastifyInstance, options: ChaosOptions): void {
  const min = options.latencyMinMs ?? 0;
  const max = Math.max(min, options.latencyMaxMs ?? min);
  const errorRate = options.errorRate ?? 0;
  if (max === 0 && errorRate === 0) return;

  const exclude = options.exclude ?? [];

  app.addHook('onRequest', async (request) => {
    if (exclude.some((re) => re.test(request.url))) return;

    if (max > 0) {
      const delay = min + Math.random() * (max - min);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (errorRate > 0 && Math.random() < errorRate) {
      request.log.warn({ injected: true }, 'chaos: injected failure');
      throw new ApiError(500, 'internal_error', 'Something went wrong on our side.');
    }
  });

  app.log.warn({ latency: [min, max], errorRate }, 'chaos injection is enabled');
}

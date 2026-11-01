import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { ApiError, toErrorBody, unauthorized } from './errors';
import { genRequestId, loggerOptions } from './logging';
import { registerSecurityHeaders } from './security/headers';
import {
  DEFAULT_RATE_LIMITS,
  registerRateLimit,
  type RateLimitOptions,
} from './security/rateLimit';
import { assertCsrf } from './security/csrf';
import { assertPermission } from './security/rbac';
import { verifyAccessToken, type AccessClaims, type TokenConfig } from './security/tokens';
import { assertValidBody, loadContract, routeKey, type LoadedContract } from './openapi/validate';
import { registerChaos, type ChaosOptions } from './chaos';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set once the bearer token has been verified. */
    auth?: AccessClaims;
  }
}

export interface MockServerOptions {
  /** Where the API is mounted, e.g. `/api/v1`. */
  basePath: string;
  /** Path to the OpenAPI contract this server implements. */
  contractPath: string;
  /** Browser origins allowed to call the API. No wildcards. */
  appOrigins: readonly string[];
  tokens: TokenConfig;
  /** Routes under basePath that do not need a bearer token. */
  publicPaths?: readonly string[];
  rateLimits?: RateLimitOptions;
  /** Ignored unless `dev` is true. */
  chaos?: ChaosOptions;
  dev?: boolean;
  /** Behind TLS: enables HSTS and Secure cookies. */
  secure?: boolean;
  prettyLogs?: boolean;
}

export interface MockServer {
  app: FastifyInstance;
  contract: LoadedContract;
}

/**
 * Builds the Fastify app every console's mock server shares: security headers,
 * CORS, rate limits, cookies, request ids, the single error envelope, and the
 * contract-driven validation, permission and CSRF checks.
 *
 * Nothing in here knows about devices, patches or any other resource — a
 * sibling console passes its own contract and registers its own routes.
 */
export async function createMockServer(options: MockServerOptions): Promise<MockServer> {
  const {
    basePath,
    contractPath,
    appOrigins,
    tokens,
    publicPaths = [],
    rateLimits = DEFAULT_RATE_LIMITS,
    dev = false,
    secure = false,
    prettyLogs = dev,
  } = options;

  const contract = loadContract(contractPath, basePath);

  const app = Fastify({
    logger: loggerOptions(prettyLogs),
    genReqId: genRequestId,
    // A hostile client should not be able to make the server allocate 100 MB.
    bodyLimit: 1_048_576,
    trustProxy: true,
    // Unknown query parameters are ignored rather than rejected, but repeated
    // ones arrive as arrays so a filter cannot be smuggled past a scalar check.
    querystringParser: (search) => Object.fromEntries(new URLSearchParams(search)),
  });

  await registerSecurityHeaders(app, { appOrigins, secure });

  await app.register(cors, {
    // An explicit list: `origin: true` reflects whatever the caller sends,
    // which with credentials enabled is the same as having no CORS policy.
    origin: [...appOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', 'x-csrf-token'],
    maxAge: 600,
  });

  await app.register(cookie, {});
  // The mock IdP posts real HTML forms.
  await app.register(formbody, {});
  await registerRateLimit(app, rateLimits);

  if (dev && options.chaos) {
    registerChaos(app, {
      ...options.chaos,
      exclude: [/\/auth\//, /\/oidc\//, ...(options.chaos.exclude ?? [])],
    });
  } else if (options.chaos) {
    app.log.warn('chaos options were supplied but ignored: the server is not in development mode');
  }

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', String(request.id));
  });

  /**
   * One hook for authentication, permission, CSRF and body validation, driven
   * by the contract rather than repeated in every handler — a route cannot be
   * added without a permission by forgetting to write the check.
   */
  app.addHook('preHandler', async (request) => {
    const url = request.routeOptions.url ?? request.url;
    if (!url.startsWith(basePath)) return;

    const isPublic = publicPaths.some(
      (p) => url === `${basePath}${p}` || url.startsWith(`${basePath}${p}/`),
    );
    const schema = contract.operations.get(routeKey(request.method, url));

    if (!isPublic) {
      const header = request.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
      if (!token) throw unauthorized();
      request.auth = await verifyAccessToken(token, tokens);
    }

    if (schema?.csrf) assertCsrf(request);
    if (schema?.permission && request.auth) assertPermission(request.auth, schema.permission);
    if (schema?.validateBody) assertValidBody(schema, request.body);
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = String(request.id);

    if (error instanceof ApiError) {
      // 4xx is the client's own doing and is logged quietly; 5xx is ours.
      request.log[error.status >= 500 ? 'error' : 'info']({ code: error.code }, error.message);
      return reply.status(error.status).send(toErrorBody(error, requestId));
    }

    // Fastify's own 4xx (unparseable JSON, rate limit, bad content type).
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status < 500) {
      return reply
        .status(status)
        .send(
          toErrorBody(
            new ApiError(status, 'bad_request', 'That request could not be handled.'),
            requestId,
          ),
        );
    }

    // The real message and stack go to the log, never to the client: they name
    // internal paths, libraries and sometimes the data that caused the failure.
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send(
        toErrorBody(
          new ApiError(500, 'internal_error', 'Something went wrong on our side.'),
          requestId,
        ),
      );
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(toErrorBody(new ApiError(404, 'not_found', 'Not found.'), String(request.id))),
  );

  /*
   * Fastify gives the not-found handler its own encapsulation context with its
   * own error handler, so the one above does not cover this path. Both are set,
   * or a failure here leaves through Fastify's default handler and loses the
   * envelope every client is written against.
   */
  app.setErrorHandler((error, request, reply) => {
    const requestId = String(request.id);
    if (error instanceof ApiError) {
      return reply.status(error.status).send(toErrorBody(error, requestId));
    }
    request.log.error({ err: error }, 'unhandled error on the not-found path');
    return reply
      .status(500)
      .send(
        toErrorBody(
          new ApiError(500, 'internal_error', 'Something went wrong on our side.'),
          requestId,
        ),
      );
  });

  return { app, contract };
}

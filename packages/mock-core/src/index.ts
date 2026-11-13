/**
 * @aegis/mock-core — reusable mock-server infrastructure.
 *
 * Everything here is console-agnostic: the app factory, the security layer,
 * the contract-driven validation, the OIDC mock and the SQLite helpers. A
 * console supplies its own OpenAPI contract, its own seed and its own routes.
 */

export { createMockServer } from './createMockServer';
export type { MockServer, MockServerOptions } from './createMockServer';

export {
  ApiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooManyRequests,
  internal,
  toErrorBody,
} from './errors';
export type { ErrorBody } from './errors';

export { loggerOptions, genRequestId } from './logging';
export { registerChaos } from './chaos';
export { TtlCache } from './cache';
export type { CacheOptions } from './cache';
export type { ChaosOptions } from './chaos';

export { loadContract, routeKey, assertValidBody } from './openapi/validate';
export type { LoadedContract, OperationSchema } from './openapi/validate';

export { registerSecurityHeaders } from './security/headers';
export { registerRateLimit, authRateLimitConfig, DEFAULT_RATE_LIMITS } from './security/rateLimit';
export type { RateLimitOptions } from './security/rateLimit';
export {
  issueCsrfToken,
  clearCsrfToken,
  assertCsrf,
  CSRF_COOKIE,
  CSRF_HEADER,
} from './security/csrf';
export { hasPermission, assertPermission, zoneScope } from './security/rbac';
export type { RoleDefinition } from './security/rbac';
export {
  signAccessToken,
  verifyAccessToken,
  newOpaqueToken,
  hashToken,
  safeEqual,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} from './security/tokens';
export type { AccessClaims, TokenConfig } from './security/tokens';
export { SessionStore } from './security/sessions';
export type { Session } from './security/sessions';

export { registerMockIdp, redeemAuthCode } from './oidc/idp';
export type { IdpOptions, IdpStore, MockUser, AuthCode } from './oidc/idp';

export { openDb, bulkInsert } from './db/sqlite';
export type { Db, OpenDbOptions } from './db/sqlite';
export { createRng } from './db/rng';
export type { Rng } from './db/rng';
export { listRows, countBy, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from './db/query';
export type {
  TableSpec,
  ColumnSpec,
  ListQuery,
  PageResult,
  PageInfo,
  FilterOp,
  ListOptions,
  WhereClause,
} from './db/query';

/**
 * One error envelope for the whole API, matching the contract's `Error`
 * schema. Every failure leaves through here, so a client never has to guess
 * whether a body is an error or a result.
 */
export interface ErrorBody {
  error: {
    /** Stable machine-readable code, e.g. `forbidden`. */
    code: string;
    /** One sentence for a person. Never a stack trace or a database message. */
    message: string;
    /** Echoed back so a report can be tied to a log line. */
    requestId: string;
    /** Per-field validation detail. Absent unless the failure is a bad request. */
    fields?: Record<string, string>;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | undefined;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new ApiError(400, 'bad_request', message, fields);

export const unauthorized = (message = 'Sign in to continue.') => new ApiError(401, 'unauthorized', message);

/**
 * Deliberately vague. Saying which permission is missing tells an attacker
 * what the permission list looks like and confirms the object exists.
 */
export const forbidden = (message = 'You do not have access to this.') => new ApiError(403, 'forbidden', message);

/**
 * Used both for "no such id" and for "exists but not yours". Returning 403 for
 * the second leaks the existence of objects in other tenants and zones.
 */
export const notFound = (message = 'Not found.') => new ApiError(404, 'not_found', message);

export const conflict = (message: string) => new ApiError(409, 'conflict', message);

export const tooManyRequests = (message = 'Too many requests. Slow down and try again.') =>
  new ApiError(429, 'rate_limited', message);

export const internal = (message = 'Something went wrong on our side.') =>
  new ApiError(500, 'internal_error', message);

export function toErrorBody(err: ApiError, requestId: string): ErrorBody {
  return {
    error: {
      code: err.code,
      message: err.message,
      requestId,
      ...(err.fields ? { fields: err.fields } : {}),
    },
  };
}

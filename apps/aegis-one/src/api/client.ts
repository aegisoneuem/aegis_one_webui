/**
 * The one place the console talks to the API.
 *
 * Switching from the mock server to the real Go backend is a change to
 * VITE_API_BASE_URL and nothing else — no code path here knows or cares which
 * is on the other end.
 */

const BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080/api/v1';

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string; fields?: Record<string, string> };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Quote this to support; it ties the failure to a server log line. */
  readonly requestId: string;
  readonly fields: Record<string, string> | undefined;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.requestId = body.requestId;
    this.fields = body.fields;
  }
}

/**
 * The access token lives in a module variable, never in localStorage or
 * sessionStorage. Anything in web storage is readable by any script on the
 * origin, so an XSS would hand over a token that works from anywhere; a token
 * in memory dies with the tab.
 */
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Called when a refresh fails, so the app can send the user back to sign-in. */
export function setSessionLostHandler(handler: () => void): void {
  onSessionLost = handler;
}

/** The CSRF cookie is readable by design; the point is that a cross-origin page cannot. */
function csrfToken(): string | null {
  const match = /(?:^|;\s*)aegis_csrf=([^;]+)/.exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface RequestOptions {
  method?: string;
  /** Serialised as JSON. */
  body?: unknown;
  /** Appended as a query string; undefined and empty values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null | readonly string[]>;
  signal?: AbortSignal;
}

export function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (accessToken) headers['authorization'] = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (UNSAFE.has(method)) {
    const csrf = csrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;
  }

  return fetch(`${BASE_URL}${path}${buildQuery(options.query)}`, {
    method,
    headers,
    // Needed for the refresh cookie; the server's CORS list is explicit, so
    // this does not open the API to arbitrary origins.
    credentials: 'include',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/** Refreshes once per 401 and retries, so an expired token is invisible to the caller. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  // Several requests failing at once must not fire several refreshes: the
  // server rotates the token on each, and the second would look like a replay.
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers all see this attempt.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body.error?.code) return new ApiError(res.status, body.error);
  } catch {
    // A non-JSON failure (a proxy, a gateway) still has to look like an ApiError.
  }
  return new ApiError(res.status, {
    code: 'unexpected',
    message: 'The server returned something we could not read.',
    requestId: res.headers.get('x-request-id') ?? 'unknown',
  });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options);

  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      res = await send(path, options);
    } else {
      onSessionLost?.();
      throw await toError(res);
    }
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(path, { ...(query ? { query } : {}), ...(signal ? { signal } : {}) }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Shape every list endpoint returns. */
export interface Page<T> {
  items: T[];
  page: { nextCursor: string | null; total: number };
}

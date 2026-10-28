/**
 * HTTP transport for the TRACE API.
 *
 * - The access token lives only in module memory; the refresh token is the HttpOnly `trace_refresh`
 *   cookie, sent because every request uses `credentials: 'include'`. Nothing touches Web Storage.
 * - On a 401 from a non-auth endpoint the request is retried once after a refresh. Refreshes are
 *   single-flight within a tab (one shared promise) and serialised across tabs with the
 *   `trace-refresh` Web Lock: tabs share one cookie jar, so a tab that waits for the lock presents
 *   the cookie the previous tab already rotated and is never mistaken for refresh-token reuse.
 * - A definitive refresh rejection (401/403) ends the session: token cleared, `{type: 'logout'}`
 *   broadcast to other tabs, `onAuthFailure` listeners notified — once per refresh attempt.
 */

const DEFAULT_API_BASE_URL = '/fastapi-proxy';
const REFRESH_PATH = '/api/auth/refresh';
const REFRESH_LOCK_NAME = 'trace-refresh';
/** Endpoints whose 401 means "bad credentials/session", never "access token expired". */
const NO_REFRESH_PATHS = new Set(['/api/auth/login', REFRESH_PATH, '/api/auth/logout']);

export const SYNC_CHANNEL_NAME = 'trace-sync';
export type SyncMessage = { type: 'invalidate' } | { type: 'logout' };

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  responseType?: 'json' | 'blob';
  skipAuthRetry?: boolean;
}

/** Body of `POST /api/auth/login` and `POST /api/auth/refresh`. */
export interface SessionPayload {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: unknown;
}

export class ApiClientError extends Error {
  status: number;
  detail: string;
  fieldErrors: Record<string, string>;
  errorId?: string;
  body: unknown;
  /** The API path that was requested (without the base URL). */
  endpoint: string;

  constructor(init: {
    status: number;
    detail: string;
    fieldErrors?: Record<string, string>;
    errorId?: string;
    body?: unknown;
    endpoint: string;
  }) {
    super(init.detail);
    this.name = 'ApiClientError';
    this.status = init.status;
    this.detail = init.detail;
    this.fieldErrors = init.fieldErrors ?? {};
    this.errorId = init.errorId;
    this.body = init.body;
    this.endpoint = init.endpoint;
  }
}

// ---------------------------------------------------------------------------
// Configuration & token state
// ---------------------------------------------------------------------------

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  const base =
    typeof configured === 'string' && configured.trim() ? configured.trim() : DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, '');
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

const authFailureListeners = new Set<() => void>();

/** Subscribe to session loss (failed refresh here, or logout in another tab). Returns unsubscribe. */
export function onAuthFailure(cb: () => void): () => void {
  authFailureListeners.add(cb);
  return () => {
    authFailureListeners.delete(cb);
  };
}

/** Drop the in-memory token and notify `onAuthFailure` listeners. Does not broadcast. */
export function endLocalSession(): void {
  accessToken = null;
  for (const cb of [...authFailureListeners]) {
    try {
      cb();
    } catch (err) {
      console.error('onAuthFailure listener threw', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Cross-tab channel (shared with cacheSync.ts)
// ---------------------------------------------------------------------------

let syncChannel: BroadcastChannel | null | undefined;

/**
 * The tab's single `trace-sync` channel, or null where BroadcastChannel is unavailable. Posting and
 * listening share one instance, so a tab never receives its own messages.
 */
export function getSyncChannel(): BroadcastChannel | null {
  if (syncChannel === undefined) {
    syncChannel =
      typeof BroadcastChannel === 'function' ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;
  }
  return syncChannel;
}

/** Post a sync message; the payload is rebuilt so only `type` can ever leave the tab. */
export function postSyncMessage(message: SyncMessage): void {
  try {
    getSyncChannel()?.postMessage({ type: message.type });
  } catch {
    // Channel closed or unavailable: cross-tab sync is best-effort.
  }
}

// ---------------------------------------------------------------------------
// Refresh (single-flight in-tab, Web-Lock-serialised across tabs)
// ---------------------------------------------------------------------------

let refreshInFlight: Promise<SessionPayload | null> | null = null;

/**
 * Rotate the refresh cookie once for every concurrent caller in this tab. Resolves with the new
 * session (token already stored), or null when the server rejected the refresh (session ended).
 * Network and server errors reject without ending the session.
 */
export function refreshSessionShared(): Promise<SessionPayload | null> {
  if (!refreshInFlight) {
    refreshInFlight = withRefreshLock(performRefresh).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function refreshAccessToken(): Promise<string | null> {
  const session = await refreshSessionShared();
  return session ? session.access_token : null;
}

function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks && typeof locks.request === 'function') {
    return locks.request(REFRESH_LOCK_NAME, fn) as Promise<T>;
  }
  return fn();
}

async function performRefresh(): Promise<SessionPayload | null> {
  const res = await fetch(`${getApiBaseUrl()}${REFRESH_PATH}`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) {
    endLocalSession();
    postSyncMessage({ type: 'logout' });
    return null;
  }
  if (!res.ok) throw await toApiClientError(res, REFRESH_PATH);
  const session = (await res.json()) as SessionPayload;
  accessToken = session.access_token;
  return session;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function normalisePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function send(url: string, opts: ApiRequestOptions, token: string | null): Promise<Response> {
  const headers = new Headers();
  headers.set('Accept', opts.responseType === 'blob' ? '*/*' : 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData; // the browser sets the multipart boundary header itself
  } else if (opts.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(opts.body);
  }

  return fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body,
    credentials: 'include',
    signal: opts.signal,
  });
}

export async function apiRequest<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
  const endpoint = normalisePath(path);
  const url = `${getApiBaseUrl()}${endpoint}`;

  const tokenUsed = accessToken;
  let res = await send(url, opts, tokenUsed);

  const pathOnly = endpoint.split(/[?#]/, 1)[0];
  if (res.status === 401 && !opts.skipAuthRetry && !NO_REFRESH_PATHS.has(pathOnly)) {
    // If another request already refreshed while this one was in flight, reuse that token.
    const fresh =
      accessToken && accessToken !== tokenUsed ? accessToken : await refreshAccessToken();
    if (fresh) res = await send(url, opts, fresh);
  }

  if (!res.ok) throw await toApiClientError(res, endpoint);
  return (await parseSuccess(res, opts.responseType)) as T;
}

async function parseSuccess(res: Response, responseType: ApiRequestOptions['responseType']) {
  if (responseType === 'blob') return res.blob();
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Error mapping (spec §8)
// ---------------------------------------------------------------------------

async function readErrorBody(res: Response): Promise<unknown> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return undefined;
  }
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** FastAPI 422 `detail[]` → `{lastLocSegment: msg}` (first message wins per field). */
function mapValidationErrors(items: unknown[]): { fieldErrors: Record<string, string>; messages: string[] } {
  const fieldErrors: Record<string, string> = {};
  const messages: string[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const msg = typeof item.msg === 'string' ? item.msg : 'Invalid value';
    messages.push(msg);
    const loc = Array.isArray(item.loc) ? item.loc : [];
    if (loc.length > 0) {
      const key = String(loc[loc.length - 1]);
      if (!(key in fieldErrors)) fieldErrors[key] = msg;
    }
  }
  return { fieldErrors, messages };
}

async function toApiClientError(res: Response, endpoint: string): Promise<ApiClientError> {
  const body = await readErrorBody(res);
  const fallback = res.statusText || `Request failed with status ${res.status}`;
  let detail = fallback;
  let fieldErrors: Record<string, string> = {};
  let errorId: string | undefined;

  if (isRecord(body)) {
    const raw = body.detail;
    if (typeof raw === 'string' && raw) {
      detail = raw;
    } else if (Array.isArray(raw)) {
      const mapped = mapValidationErrors(raw);
      fieldErrors = mapped.fieldErrors;
      if (mapped.messages.length) detail = mapped.messages.join('; ');
    }
    if (typeof body.error_id === 'string') errorId = body.error_id;
  } else if (typeof body === 'string') {
    // Plain-text bodies (e.g. a proxy's "Bad Gateway") are shown; HTML error pages are not.
    const text = body.trim();
    if (text && text.length <= 200 && !text.startsWith('<')) detail = text;
  }

  return new ApiClientError({ status: res.status, detail, fieldErrors, errorId, body, endpoint });
}

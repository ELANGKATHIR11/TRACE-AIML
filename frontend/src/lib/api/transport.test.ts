import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBroadcastChannel } from '../../test/fakeBroadcastChannel';

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

import {
  ApiClientError,
  apiRequest,
  getAccessToken,
  getApiBaseUrl,
  onAuthFailure,
  refreshAccessToken,
  setAccessToken,
} from './transport';

const BASE = '/fastapi-proxy';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function refreshOk(token: string): Response {
  return jsonResponse(200, {
    access_token: token,
    token_type: 'bearer',
    expires_in: 900,
    user: { id: 1, role: 'reviewer' },
  });
}

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function urlOf(call: Parameters<typeof fetch>): string {
  return String(call[0]);
}

function headersOf(call: Parameters<typeof fetch>): Headers {
  return new Headers(call[1]?.headers);
}

/** Await a rejection that must be an ApiClientError. */
async function apiError(p: Promise<unknown>): Promise<ApiClientError> {
  const err = await p.then(
    () => {
      throw new Error('expected the request to reject');
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiClientError);
  return err as ApiClientError;
}

function refreshCalls(mock: FetchMock) {
  return mock.mock.calls.filter((c) => urlOf(c).endsWith('/api/auth/refresh'));
}

let fetchMock: FetchMock;
let setItemSpy: ReturnType<typeof vi.spyOn>;
let getItemSpy: ReturnType<typeof vi.spyOn>;
const unsubscribers: Array<() => void> = [];

beforeAll(() => {
  setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
});

afterAll(() => {
  expect(setItemSpy).not.toHaveBeenCalled();
  expect(getItemSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken(null);
  FakeBroadcastChannel.reset();
});

afterEach(() => {
  while (unsubscribers.length) unsubscribers.pop()!();
});

describe('apiRequest basics', () => {
  it('uses the build-time base URL default', () => {
    expect(getApiBaseUrl()).toBe(BASE);
  });

  it('attaches the bearer token and includes credentials', async () => {
    setAccessToken('t');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(apiRequest('/api/applications')).resolves.toEqual({ ok: true });

    const call = fetchMock.mock.calls[0];
    expect(urlOf(call)).toBe(`${BASE}/api/applications`);
    expect(call[1]?.credentials).toBe('include');
    expect(headersOf(call).get('Authorization')).toBe('Bearer t');
  });

  it('omits Authorization when no token is held', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await apiRequest('/api/applications');
    expect(headersOf(fetchMock.mock.calls[0]).has('Authorization')).toBe(false);
  });

  it('JSON-encodes body with Content-Type, but sets no Content-Type for FormData', async () => {
    setAccessToken('t');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/api/applications', { method: 'POST', body: { a: 1 } });
    const jsonCall = fetchMock.mock.calls[0];
    expect(jsonCall[1]?.method).toBe('POST');
    expect(jsonCall[1]?.body).toBe('{"a":1}');
    expect(headersOf(jsonCall).get('Content-Type')).toBe('application/json');

    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'x.pdf');
    await apiRequest('/api/applications/1/documents', { method: 'POST', formData: fd });
    const formCall = fetchMock.mock.calls[1];
    expect(formCall[1]?.body).toBe(fd);
    expect(headersOf(formCall).has('Content-Type')).toBe(false);
    expect(headersOf(formCall).get('Authorization')).toBe('Bearer t');
  });

  it('returns undefined for 204 and a Blob for responseType blob', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiRequest('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(
      new Response('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    );
    const blob = await apiRequest<Blob>('/api/documents/1/preview', { responseType: 'blob' });
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.text()).toBe('%PDF');
  });
});

describe('401 handling and single-flight refresh', () => {
  it('two parallel 401s trigger exactly one refresh; both retry once and resolve', async () => {
    setAccessToken('old');
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) return refreshOk('new');
      const auth = new Headers(init?.headers).get('Authorization');
      if (auth === 'Bearer new') return jsonResponse(200, { url });
      return jsonResponse(401, { detail: 'Not authenticated' });
    });

    const [a, b] = await Promise.all([
      apiRequest('/api/applications'),
      apiRequest('/api/dashboard/metrics'),
    ]);

    expect(a).toEqual({ url: `${BASE}/api/applications` });
    expect(b).toEqual({ url: `${BASE}/api/dashboard/metrics` });
    const refreshes = refreshCalls(fetchMock);
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0][1]?.method).toBe('POST');
    expect(refreshes[0][1]?.credentials).toBe('include');
    // 2 originals + 1 refresh + 2 retries
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(getAccessToken()).toBe('new');
  });

  it('retries only once: a second 401 after a successful refresh rejects', async () => {
    setAccessToken('old');
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/api/auth/refresh')
        ? refreshOk('new')
        : jsonResponse(401, { detail: 'Not authenticated' }),
    );

    await expect(apiRequest('/api/applications')).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls(fetchMock)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('refresh 401 clears the token, fires onAuthFailure once, broadcasts logout, rejects 401', async () => {
    setAccessToken('old');
    const onFail = vi.fn();
    unsubscribers.push(onAuthFailure(onFail));
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/api/auth/refresh')
        ? jsonResponse(401, { detail: 'Invalid refresh token' })
        : jsonResponse(401, { detail: 'Not authenticated' }),
    );

    const err = await apiError(apiRequest('/api/applications'));

    expect(err.status).toBe(401);
    expect(err.endpoint).toBe('/api/applications');
    expect(getAccessToken()).toBeNull();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(FakeBroadcastChannel.posted).toEqual([{ type: 'logout' }]);
    expect(refreshCalls(fetchMock)).toHaveLength(1);
  });

  it('parallel 401s with a failing refresh fire onAuthFailure only once', async () => {
    setAccessToken('old');
    const onFail = vi.fn();
    unsubscribers.push(onAuthFailure(onFail));
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/api/auth/refresh')
        ? jsonResponse(401, { detail: 'Invalid refresh token' })
        : jsonResponse(401, { detail: 'Not authenticated' }),
    );

    const results = await Promise.allSettled([
      apiRequest('/api/applications'),
      apiRequest('/api/dashboard/metrics'),
    ]);

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(refreshCalls(fetchMock)).toHaveLength(1);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('onAuthFailure returns an unsubscribe function', async () => {
    const onFail = vi.fn();
    onAuthFailure(onFail)();
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid refresh token' }));
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(onFail).not.toHaveBeenCalled();
  });

  it('a refresh server error rejects without logging the user out', async () => {
    setAccessToken('old');
    const onFail = vi.fn();
    unsubscribers.push(onAuthFailure(onFail));
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/api/auth/refresh')
        ? jsonResponse(500, { detail: 'Internal server error', error_id: 'e1' })
        : jsonResponse(401, { detail: 'Not authenticated' }),
    );

    await expect(apiRequest('/api/applications')).rejects.toMatchObject({ status: 500 });
    expect(onFail).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('old');
    expect(FakeBroadcastChannel.posted).toEqual([]);
  });

  it.each(['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'])(
    '%s never triggers a refresh',
    async (path) => {
      fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Incorrect email or password' }));
      await expect(apiRequest(path, { method: 'POST', body: {} })).rejects.toMatchObject({
        status: 401,
        detail: 'Incorrect email or password',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('skipAuthRetry disables the refresh', async () => {
    setAccessToken('t');
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Not authenticated' }));
    await expect(apiRequest('/api/auth/me', { skipAuthRetry: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('error mapping', () => {
  it('maps FastAPI 422 detail[] to fieldErrors keyed by last loc segment', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        detail: [
          { loc: ['body', 'declared_data', 'total_intake'], msg: 'too big', type: 'value_error' },
          { loc: ['body', 'institution_id'], msg: 'Field required', type: 'missing' },
        ],
      }),
    );

    const err = await apiError(apiRequest('/api/applications', {
      method: 'POST',
      body: {},
    }));

    expect(err.status).toBe(422);
    expect(err.fieldErrors.total_intake).toBe('too big');
    expect(err.fieldErrors.institution_id).toBe('Field required');
    expect(err.detail).toContain('too big');
    expect(err.message).toBe(err.detail);
  });

  it('exposes error_id from a 500 body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { detail: 'Internal server error', error_id: 'abc' }),
    );
    const err = await apiError(apiRequest('/api/applications'));
    expect(err.status).toBe(500);
    expect(err.detail).toBe('Internal server error');
    expect(err.errorId).toBe('abc');
    expect(err.fieldErrors).toEqual({});
  });

  it('keeps 409 extras reachable via body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        detail: 'Required documents missing',
        current_status: 'DRAFT',
        missing_document_types: ['AFFIDAVIT'],
      }),
    );
    const err = await apiError(apiRequest('/api/applications/1/submit', {
      method: 'POST',
    }));
    expect(err.status).toBe(409);
    expect(err.detail).toBe('Required documents missing');
    expect(err.endpoint).toBe('/api/applications/1/submit');
    expect(err.body).toMatchObject({
      current_status: 'DRAFT',
      missing_document_types: ['AFFIDAVIT'],
    });
  });

  it('falls back to a status message for a non-JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));
    const err = await apiError(apiRequest('/api/applications'));
    expect(err.status).toBe(502);
    expect(err.detail).toBe('Bad Gateway');
    expect(err.body).toBe('Bad Gateway');
  });
});

describe('cross-tab refresh serialisation (Review Focus 1)', () => {
  type Tab = typeof import('./transport');

  async function loadTab(): Promise<Tab> {
    vi.resetModules();
    return import('./transport');
  }

  function deferredRefreshFetch(log: string[]) {
    const pending: Array<() => void> = [];
    let n = 0;
    const mock = vi.fn<typeof fetch>(async () => {
      const id = ++n;
      log.push(`start${id}`);
      await new Promise<void>((resolve) => pending.push(resolve));
      log.push(`end${id}`);
      return refreshOk(`tok${id}`);
    });
    return { mock, releaseNext: () => pending.shift()?.() };
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    delete (navigator as unknown as { locks?: unknown }).locks;
  });

  it('with navigator.locks, two tabs refresh strictly one after the other', async () => {
    let tail: Promise<unknown> = Promise.resolve();
    const lockNames: string[] = [];
    const fakeLocks = {
      request: (name: string, cb: () => Promise<unknown>) => {
        lockNames.push(name);
        const run = tail.then(() => cb());
        tail = run.catch(() => undefined);
        return run;
      },
    };
    Object.defineProperty(navigator, 'locks', { value: fakeLocks, configurable: true });

    const log: string[] = [];
    const { mock, releaseNext } = deferredRefreshFetch(log);
    vi.stubGlobal('fetch', mock);

    const tabA = await loadTab();
    const tabB = await loadTab();
    expect(tabA).not.toBe(tabB);

    const pA = tabA.refreshAccessToken();
    const pB = tabB.refreshAccessToken();
    await flush();
    expect(log).toEqual(['start1']);

    releaseNext();
    await flush();
    expect(log).toEqual(['start1', 'end1', 'start2']);

    releaseNext();
    await expect(Promise.all([pA, pB])).resolves.toEqual(['tok1', 'tok2']);
    expect(log).toEqual(['start1', 'end1', 'start2', 'end2']);
    expect(lockNames).toEqual(['trace-refresh', 'trace-refresh']);
    expect(tabA.getAccessToken()).toBe('tok1');
    expect(tabB.getAccessToken()).toBe('tok2');
  });

  it('without navigator.locks, falls back to in-tab single-flight only', async () => {
    expect('locks' in navigator).toBe(false);
    const log: string[] = [];
    const { mock, releaseNext } = deferredRefreshFetch(log);
    vi.stubGlobal('fetch', mock);

    const tab = await loadTab();
    const p1 = tab.refreshAccessToken();
    const p2 = tab.refreshAccessToken();
    await flush();
    expect(log).toEqual(['start1']);
    releaseNext();
    await expect(Promise.all([p1, p2])).resolves.toEqual(['tok1', 'tok1']);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

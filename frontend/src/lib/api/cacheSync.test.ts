import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBroadcastChannel } from '../../test/fakeBroadcastChannel';

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

import { broadcastLogout, initCrossTabSync, invalidateAllAppQueries } from './cacheSync';
import { getAccessToken, onAuthFailure, setAccessToken } from './transport';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Another tab: a separate channel instance with the same name. */
function otherTab() {
  return new FakeBroadcastChannel('trace-sync');
}

let setItemSpy: ReturnType<typeof vi.spyOn>;
let getItemSpy: ReturnType<typeof vi.spyOn>;
const cleanups: Array<() => void> = [];

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
  FakeBroadcastChannel.reset();
  setAccessToken(null);
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('cross-tab sync', () => {
  it('a logout message from another tab clears the token and calls onAuthFailure', async () => {
    const qc = new QueryClient();
    cleanups.push(initCrossTabSync(qc));
    const onFail = vi.fn();
    cleanups.push(onAuthFailure(onFail));
    setAccessToken('t');

    otherTab().postMessage({ type: 'logout' });
    await flush();

    expect(getAccessToken()).toBeNull();
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('an invalidate message from another tab invalidates all queries', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    cleanups.push(initCrossTabSync(qc));

    otherTab().postMessage({ type: 'invalidate' });
    await flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith();
  });

  it('ignores unknown or malformed messages', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    cleanups.push(initCrossTabSync(qc));
    const onFail = vi.fn();
    cleanups.push(onAuthFailure(onFail));
    setAccessToken('t');

    const tab = otherTab();
    tab.postMessage({ type: 'something-else' });
    tab.postMessage('logout');
    tab.postMessage(null);
    await flush();

    expect(spy).not.toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('t');
  });

  it('cleanup stops listening', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    initCrossTabSync(qc)();

    otherTab().postMessage({ type: 'invalidate' });
    await flush();

    expect(spy).not.toHaveBeenCalled();
  });

  it('invalidateAllAppQueries invalidates locally and broadcasts only {type}', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    cleanups.push(initCrossTabSync(qc));
    const remote = otherTab();
    const received: unknown[] = [];
    remote.onmessage = (ev) => received.push(ev.data);

    invalidateAllAppQueries(qc, { applicationId: 'app-42', reason: 'DOCUMENT_UPLOADED' });
    await flush();

    // Local tab invalidates exactly once (it does not hear its own broadcast).
    expect(spy).toHaveBeenCalledTimes(1);
    expect(received).toEqual([{ type: 'invalidate' }]);
  });

  it('broadcastLogout posts only {type: "logout"} and does not log out the sending tab', async () => {
    const qc = new QueryClient();
    cleanups.push(initCrossTabSync(qc));
    const onFail = vi.fn();
    cleanups.push(onAuthFailure(onFail));
    setAccessToken('t');

    broadcastLogout();
    await flush();

    expect(FakeBroadcastChannel.posted).toEqual([{ type: 'logout' }]);
    expect(onFail).not.toHaveBeenCalled();
  });

  it('messages never carry record data', async () => {
    const qc = new QueryClient();
    cleanups.push(initCrossTabSync(qc));
    invalidateAllAppQueries(qc, { applicationId: 'app-1', reason: 'APPLICATION_CREATED' });
    invalidateAllAppQueries(qc);
    broadcastLogout();
    await flush();

    expect(FakeBroadcastChannel.posted.length).toBe(3);
    for (const msg of FakeBroadcastChannel.posted) {
      expect(typeof msg).toBe('object');
      expect(Object.keys(msg as object).every((k) => k === 'type')).toBe(true);
    }
  });

  it('works without BroadcastChannel', async () => {
    vi.resetModules();
    vi.stubGlobal('BroadcastChannel', undefined);
    try {
      const sync = await import('./cacheSync');
      const qc = new QueryClient();
      const spy = vi.spyOn(qc, 'invalidateQueries');
      const cleanup = sync.initCrossTabSync(qc);
      sync.invalidateAllAppQueries(qc);
      sync.broadcastLogout();
      cleanup();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    }
  });
});

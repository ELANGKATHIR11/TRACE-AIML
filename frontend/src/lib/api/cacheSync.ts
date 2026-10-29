/**
 * Cross-tab cache and session sync over the `trace-sync` BroadcastChannel.
 *
 * Messages are only `{type: 'invalidate'}` or `{type: 'logout'}` — never record data or tokens;
 * receiving tabs refetch through their own authenticated requests. Where BroadcastChannel is
 * unavailable every function degrades to its local effect.
 */
import type { QueryClient } from '@tanstack/react-query';
import { endLocalSession, getSyncChannel, postSyncMessage } from './transport';

/** Optional context from call sites; deliberately never broadcast. */
export type InvalidationMeta = Readonly<Record<string, unknown>>;

export function initCrossTabSync(qc: QueryClient): () => void {
  const channel = getSyncChannel();
  if (!channel) return () => {};

  const onMessage = (ev: MessageEvent) => {
    const data: unknown = ev.data;
    if (typeof data !== 'object' || data === null) return;
    const type = (data as { type?: unknown }).type;
    if (type === 'invalidate') {
      void qc.invalidateQueries();
    } else if (type === 'logout') {
      endLocalSession();
    }
  };

  channel.addEventListener('message', onMessage);
  return () => channel.removeEventListener('message', onMessage);
}

export function invalidateAllAppQueries(qc: QueryClient, _meta?: InvalidationMeta): void {
  void qc.invalidateQueries();
  postSyncMessage({ type: 'invalidate' });
}

export function broadcastLogout(): void {
  postSyncMessage({ type: 'logout' });
}

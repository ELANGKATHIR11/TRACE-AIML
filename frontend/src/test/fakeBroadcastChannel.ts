/**
 * In-memory BroadcastChannel stand-in with browser semantics: a message posted on one instance is
 * delivered asynchronously to every *other* open instance with the same name (never to itself).
 * Every posted payload is recorded in `FakeBroadcastChannel.posted` for assertions.
 */
export class FakeBroadcastChannel extends EventTarget {
  static instances: FakeBroadcastChannel[] = [];
  static posted: unknown[] = [];

  readonly name: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  private closed = false;

  constructor(name: string) {
    super();
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    FakeBroadcastChannel.posted.push(data);
    for (const other of FakeBroadcastChannel.instances) {
      if (other === this || other.closed || other.name !== this.name) continue;
      queueMicrotask(() => other.deliver(data));
    }
  }

  close(): void {
    this.closed = true;
  }

  private deliver(data: unknown): void {
    if (this.closed) return;
    const ev = new MessageEvent('message', { data });
    this.onmessage?.(ev);
    this.dispatchEvent(ev);
  }

  static reset(): void {
    FakeBroadcastChannel.posted = [];
  }
}

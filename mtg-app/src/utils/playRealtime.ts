import { pb } from '../services/pocketbase';

const POLL_MS = 1500;

/** Private SDK field: cap EventSource retries on broken HTTP/2 proxies. */
const realtimeClient = pb.realtime as unknown as { maxReconnectAttempts: number };
realtimeClient.maxReconnectAttempts = 2;

let realtimeUnavailable = false;

export function isRealtimeUnavailable(): boolean {
  return realtimeUnavailable;
}

function markRealtimeUnavailable(): void {
  if (realtimeUnavailable) return;
  realtimeUnavailable = true;
  void pb.realtime.unsubscribe().catch(() => {});
}

export function swallowRealtimeError(err: unknown): void {
  const status = (err as { status?: number } | null)?.status;
  const message = String((err as { message?: string } | null)?.message || '');
  const expected =
    realtimeUnavailable ||
    status === 404 ||
    status === 0 ||
    /Failed to establish realtime connection/i.test(message) ||
    /autocancelled/i.test(message);
  if (!expected) console.warn('PocketBase realtime', err);
  markRealtimeUnavailable();
}

export function safeRealtimeUnsub(run: () => unknown): void {
  try {
    const result = run();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).catch(swallowRealtimeError);
    }
  } catch (err) {
    swallowRealtimeError(err);
  }
}

/** Realtime when the SDK/server agree; polling so a PB 0.22 host still reaches the table. */
export function watchWithPoll(onChange: () => void, subscribe: () => () => void): () => void {
  let cancelled = false;
  const stopSubscribe = subscribe();
  const timer = window.setInterval(() => {
    if (!cancelled) onChange();
  }, POLL_MS);
  return () => {
    cancelled = true;
    window.clearInterval(timer);
    stopSubscribe();
  };
}

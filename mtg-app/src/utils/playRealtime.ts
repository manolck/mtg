const POLL_MS = 1500;

export function swallowRealtimeError(err: unknown): void {
  const status = (err as { status?: number } | null)?.status;
  if (status === 404) return;
  console.warn('PocketBase realtime', err);
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

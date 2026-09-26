import type { SyncedPlayAction } from './playSyncProtocol';

const MAX_BUFFER = 64;

type BufferEntry = SyncedPlayAction & { skipApply?: boolean };

/**
 * Apply remote actions in strict seq order. Out-of-order entries wait in a buffer.
 * `acknowledge` advances seq for locally-applied (optimistic) actions without re-applying.
 * Returns 'reload' when a gap is too large.
 */
export function createSeqActionBuffer(options?: {
  maxBuffer?: number;
  onApply: (entry: SyncedPlayAction) => void;
}): {
  lastSeq: number;
  reset: (seq: number) => void;
  push: (entry: SyncedPlayAction) => 'ok' | 'reload';
  acknowledge: (seq: number, actionId: string) => 'ok' | 'reload';
  pendingCount: () => number;
} {
  const maxBuffer = options?.maxBuffer ?? MAX_BUFFER;
  const onApply = options?.onApply;
  let lastSeq = 0;
  const pending = new Map<number, BufferEntry>();

  function tooFar(): boolean {
    if (pending.size > maxBuffer) return true;
    for (const seq of pending.keys()) {
      if (seq > lastSeq + maxBuffer) return true;
    }
    return false;
  }

  function flush(): 'ok' | 'reload' {
    while (pending.has(lastSeq + 1)) {
      const next = pending.get(lastSeq + 1)!;
      pending.delete(lastSeq + 1);
      lastSeq = next.seq;
      if (!next.skipApply) onApply?.(next);
    }
    return tooFar() ? 'reload' : 'ok';
  }

  return {
    get lastSeq() {
      return lastSeq;
    },
    reset(seq: number) {
      lastSeq = Math.max(0, Math.floor(seq));
      pending.clear();
    },
    push(entry: SyncedPlayAction) {
      if (entry.seq <= lastSeq) return 'ok';
      if (entry.seq === lastSeq + 1) {
        lastSeq = entry.seq;
        onApply?.(entry);
        return flush();
      }
      pending.set(entry.seq, entry);
      return flush();
    },
    acknowledge(seq: number, actionId: string) {
      if (seq <= lastSeq) return 'ok';
      if (seq === lastSeq + 1) {
        lastSeq = seq;
        return flush();
      }
      pending.set(seq, {
        seq,
        actionId,
        userId: '',
        action: { type: 'passTurn' },
        created: '',
        skipApply: true,
      });
      return flush();
    },
    pendingCount() {
      return pending.size;
    },
  };
}

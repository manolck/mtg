import { useCallback, useEffect, useRef } from 'react';
import { isCoarsePointer } from '../utils/coarsePointer';

/** Delay before showing enlarge preview on touch — wait to see if a second tap arrives. */
export const MOBILE_DOUBLE_TAP_GUARD_MS = 500;

/**
 * On mobile (coarse pointer): wait `delayMs` after the first tap before calling
 * `onSingleTap`. A second tap within that window cancels enlarge and calls
 * `onDoubleTap` instead.
 * On desktop: `onSingleTap` runs immediately.
 */
export function useDeferredSingleTap(
  onSingleTap: () => void,
  options?: {
    delayMs?: number;
    onDoubleTap?: () => void;
    /** When false, always defer (even on desktop). Default: only coarse pointer. */
    onlyCoarsePointer?: boolean;
  }
): () => void {
  const delayMs = options?.delayMs ?? MOBILE_DOUBLE_TAP_GUARD_MS;
  const onlyCoarse = options?.onlyCoarsePointer !== false;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSingleRef = useRef(onSingleTap);
  const onDoubleRef = useRef(options?.onDoubleTap);
  onSingleRef.current = onSingleTap;
  onDoubleRef.current = options?.onDoubleTap;

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return useCallback(() => {
    const defer = !onlyCoarse || isCoarsePointer();
    if (!defer) {
      onSingleRef.current();
      return;
    }

    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      onDoubleRef.current?.();
      return;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onSingleRef.current();
    }, delayMs);
  }, [delayMs, onlyCoarse]);
}

/**
 * Deferred mobile preview (enlarge) for lists of cards.
 * Same item tapped twice within the guard window cancels the preview.
 */
export function useDeferredMobilePreview<T>(
  showPreview: (value: T) => void,
  getKey: (value: T) => string,
  delayMs: number = MOBILE_DOUBLE_TAP_GUARD_MS
): (value: T) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const showRef = useRef(showPreview);
  const keyRef = useRef(getKey);
  showRef.current = showPreview;
  keyRef.current = getKey;

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (value: T) => {
      if (!isCoarsePointer()) {
        showRef.current(value);
        return;
      }
      const key = keyRef.current(value);
      if (timerRef.current != null && pendingKeyRef.current === key) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        pendingKeyRef.current = null;
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingKeyRef.current = key;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingKeyRef.current = null;
        showRef.current(value);
      }, delayMs);
    },
    [delayMs]
  );
}

/**
 * Imperative helper for places that cannot use the hook easily.
 * Call `dispose` on unmount.
 */
export function createDeferredSingleTapHandler(
  onSingleTap: () => void,
  options?: {
    delayMs?: number;
    onDoubleTap?: () => void;
    onlyCoarsePointer?: boolean;
  }
): { handleTap: () => void; dispose: () => void } {
  const delayMs = options?.delayMs ?? MOBILE_DOUBLE_TAP_GUARD_MS;
  const onlyCoarse = options?.onlyCoarsePointer !== false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    handleTap() {
      const defer = !onlyCoarse || isCoarsePointer();
      if (!defer) {
        onSingleTap();
        return;
      }
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
        options?.onDoubleTap?.();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        onSingleTap();
      }, delayMs);
    },
    dispose() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export type PlaymatDropRow = 'lands' | 'battlefield' | 'enchantments';

export interface PlayDropTarget {
  row: PlaymatDropRow;
  x: number;
  y: number;
  cardId?: string;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(4, Math.min(96, value));
}

export function playDropAt(
  clientX: number,
  clientY: number,
  ignoreIds?: Iterable<string>,
): PlayDropTarget | null {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return null;
  const ignored = new Set(ignoreIds || []);
  const stack = document.elementsFromPoint(clientX, clientY);
  let cardId: string | undefined;
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue;
    const id = node.dataset.playCardId;
    if (id && !cardId && !ignored.has(id)) cardId = id;
    const row = node.dataset.playDrop;
    if (row === 'lands' || row === 'battlefield' || row === 'enchantments') {
      const rect = node.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
      const y = ((clientY - rect.top) / Math.max(1, rect.height)) * 100;
      return { row, x: clampPercent(x), y: clampPercent(y), cardId };
    }
  }
  return null;
}

export function isOverHandFan(clientX: number, clientY: number, fan: HTMLElement | null): boolean {
  if (!fan) return false;
  const stack = document.elementsFromPoint(clientX, clientY);
  return stack.some((node) => node instanceof Node && fan.contains(node));
}

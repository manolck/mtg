export type PlayDropZone = 'battlefield' | 'library' | 'graveyard' | 'exile' | 'command';

export interface PlayDropTarget {
  zone: PlayDropZone;
  x?: number;
  y?: number;
  cardId?: string;
  boardUserId?: string;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(4, Math.min(96, value));
}

const PILE_ZONES: PlayDropZone[] = ['library', 'graveyard', 'exile', 'command'];

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
    const pile = node.dataset.playDrop;
    if (pile && PILE_ZONES.includes(pile as PlayDropZone)) {
      return {
        zone: pile as PlayDropZone,
        cardId,
        boardUserId: node.dataset.playBoardUserId || undefined,
      };
    }
    if (node.dataset.playDrop === 'battlefield') {
      const rect = node.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
      const y = ((clientY - rect.top) / Math.max(1, rect.height)) * 100;
      return {
        zone: 'battlefield',
        x: clampPercent(x),
        y: clampPercent(y),
        cardId,
        boardUserId: node.dataset.playBoardUserId || undefined,
      };
    }
  }
  return null;
}

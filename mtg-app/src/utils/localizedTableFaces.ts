import type { MTGCard } from '../types/card';
import type { TableCard } from '../types/play';

export interface LocalizedTableFace {
  name: string;
  imageUrl?: string;
  backImageUrl?: string;
  backName?: string;
}

const cache = new Map<string, LocalizedTableFace | null>();
const inflight = new Map<string, Promise<void>>();

function fromMtg(card: MTGCard): LocalizedTableFace | null {
  if (!card.name && !card.imageUrl) return null;
  return {
    name: card.name,
    imageUrl: card.imageUrl,
    backImageUrl: card.backImageUrl,
    backName: card.backName,
  };
}

export function applyLocalizedTableCard(card: TableCard, loc?: LocalizedTableFace | null): TableCard {
  if (!loc) return card;
  const nameChanged = Boolean(loc.name && loc.name !== card.name);
  return {
    ...card,
    ...(nameChanged ? { oracleName: card.oracleName || card.name, name: loc.name } : {}),
    imageUrl: loc.imageUrl || card.imageUrl,
    backImageUrl: loc.backImageUrl || card.backImageUrl,
    backName: loc.backName || card.backName,
  };
}

async function loadOne(id: string): Promise<void> {
  if (cache.has(id)) return;
  const pending = inflight.get(id);
  if (pending) {
    await pending;
    return;
  }
  const task = (async () => {
    try {
      const { searchCardByScryfallId } = await import('../services/scryfallApi');
      const card = await searchCardByScryfallId(id, true);
      cache.set(id, card ? fromMtg(card) : null);
    } catch {
      cache.set(id, null);
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, task);
  await task;
}

export async function fetchLocalizedTableFaces(ids: string[]): Promise<Record<string, LocalizedTableFace>> {
  const unique = [...new Set(ids.filter(Boolean))];
  await Promise.all(unique.map((id) => loadOne(id)));
  const result: Record<string, LocalizedTableFace> = {};
  for (const id of unique) {
    const value = cache.get(id);
    if (value) result[id] = value;
  }
  return result;
}

import type { MTGCard } from '../types/card';
import type { TableCard } from '../types/play';

export interface LocalizedTableFace {
  name: string;
  imageUrl?: string;
  backImageUrl?: string;
  backName?: string;
  typeLine?: string;
}

/** Zones / panels that currently show card faces on the play table. */
export interface VisibleLocalizationInput {
  hand: TableCard[];
  battlefield: TableCard[];
  command: TableCard[];
  graveyard: TableCard[];
  exile: TableCard[];
  library: TableCard[];
  browseZone: 'graveyard' | 'exile' | null;
  libraryOpen: boolean;
  lookMode: boolean;
  revealLibraryTop: boolean;
}

const LIBRARY_LOOK_PREFETCH = 7;

const cache = new Map<string, LocalizedTableFace | null>();
const inflight = new Map<string, Promise<void>>();

function fromMtg(card: MTGCard): LocalizedTableFace | null {
  if (!card.name && !card.imageUrl) return null;
  return {
    name: card.name,
    imageUrl: card.imageUrl,
    backImageUrl: card.backImageUrl,
    backName: card.backName,
    typeLine: card.type,
  };
}

function pushId(ids: string[], card: TableCard | undefined | null, opts?: { allowFacedown?: boolean }) {
  if (!card?.scryfallId) return;
  if (card.facedown && !opts?.allowFacedown) return;
  ids.push(card.scryfallId);
}

/**
 * Scryfall FR lookups are expensive (id + multilingual search).
 * Only request faces the player can actually see right now.
 */
export function collectVisibleLocalizationIds(input: VisibleLocalizationInput): string[] {
  const ids: string[] = [];
  const addFaceUp = (cards: TableCard[]) => {
    for (const card of cards) pushId(ids, card);
  };

  addFaceUp(input.hand);
  addFaceUp(input.battlefield);
  addFaceUp(input.command);

  // Pile UI shows the top face when not facedown.
  pushId(ids, input.graveyard[input.graveyard.length - 1]);
  pushId(ids, input.exile[input.exile.length - 1]);

  if (input.browseZone === 'graveyard') addFaceUp(input.graveyard);
  if (input.browseZone === 'exile') addFaceUp(input.exile);

  if (input.libraryOpen) {
    for (const card of input.library) pushId(ids, card, { allowFacedown: true });
  } else if (input.lookMode) {
    for (const card of input.library.slice(0, LIBRARY_LOOK_PREFETCH)) {
      pushId(ids, card, { allowFacedown: true });
    }
  } else if (input.revealLibraryTop) {
    pushId(ids, input.library[0], { allowFacedown: true });
  }

  return [...new Set(ids)];
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
    typeLine: loc.typeLine || card.typeLine,
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
      // Table FR faces use Scryfall only — never auto-fetch MagicCorporation JSON (20MB / often missing in prod).
      const card = await searchCardByScryfallId(id, true, { magicCorporation: false });
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
  // Sequential: scryfallQueue already limits concurrency; avoid flooding it with a full-deck burst.
  for (const id of unique) {
    await loadOne(id);
  }
  const result: Record<string, LocalizedTableFace> = {};
  for (const id of unique) {
    const value = cache.get(id);
    if (value) result[id] = value;
  }
  return result;
}

// src/services/deckService.ts
import { pb } from './pocketbase';
import { pbEqual } from '../utils/pocketbaseFilter';
import type {
  Deck,
  DeckCardsPayload,
  DeckEntry,
  DeckFormat,
  DeckVisibility,
  DeckZone,
} from '../types/deck';
import { emptyDeckCards, DECK_FORMATS } from '../types/deck';

function cleanForPocketBase(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanForPocketBase(item));
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanForPocketBase(value);
      }
    }
    return cleaned;
  }
  return obj;
}

function isDeckEntry(value: unknown): value is DeckEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as DeckEntry;
  return (
    typeof e.name === 'string' &&
    e.name.length > 0 &&
    typeof e.quantity === 'number' &&
    e.quantity > 0 &&
    (typeof e.scryfallId === 'string' || typeof (e as { cardId?: string }).cardId === 'string')
  );
}

function normalizeEntry(raw: unknown): DeckEntry | null {
  if (!isDeckEntry(raw)) return null;
  const e = raw as DeckEntry & { cardId?: string };
  return {
    scryfallId: e.scryfallId || e.cardId || '',
    name: e.name,
    setCode: e.setCode,
    collectorNumber: e.collectorNumber,
    quantity: e.quantity,
    cmc: e.cmc,
    typeLine: e.typeLine,
    manaCost: e.manaCost,
    rarity: e.rarity,
    colors: e.colors,
    colorIdentity: e.colorIdentity,
    imageUrl: e.imageUrl,
    backImageUrl: e.backImageUrl,
    backName: e.backName,
    legalities: e.legalities,
  };
}

function normalizeEntryList(raw: unknown): DeckEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEntry).filter((e): e is DeckEntry => e !== null && !!e.scryfallId);
}

/**
 * PocketBase treats [], {}, null and "" as blank for a required JSON field.
 * Support both legacy flat arrays and new zoned payload.
 */
export function normalizeDeckCardsPayload(cards: unknown): DeckCardsPayload {
  if (!cards) return emptyDeckCards();

  // New zoned shape
  if (typeof cards === 'object' && !Array.isArray(cards)) {
    const obj = cards as Record<string, unknown>;
    if ('mainboard' in obj || 'sideboard' in obj || 'maybeboard' in obj) {
      return {
        mainboard: normalizeEntryList(obj.mainboard),
        sideboard: normalizeEntryList(obj.sideboard),
        maybeboard: normalizeEntryList(obj.maybeboard),
      };
    }
    // Legacy empty sentinel { items: [] }
    if (Array.isArray(obj.items)) {
      const legacy = normalizeEntryList(obj.items);
      // Legacy { cardId } without name → drop; or treat cardId-only as unresolved
      return { mainboard: legacy, sideboard: [], maybeboard: [] };
    }
  }

  // Legacy flat array of { cardId, quantity } or DeckEntry
  if (Array.isArray(cards)) {
    const entries: DeckEntry[] = [];
    for (const item of cards) {
      if (!item || typeof item !== 'object') continue;
      const anyItem = item as Record<string, unknown>;
      if (typeof anyItem.name === 'string' && anyItem.name) {
        const n = normalizeEntry(item);
        if (n) entries.push(n);
      } else if (typeof anyItem.cardId === 'string') {
        // Unresolved legacy collection_item id — keep as placeholder for migration UI
        entries.push({
          scryfallId: `legacy:${anyItem.cardId}`,
          name: `Carte non migrée (${String(anyItem.cardId).slice(0, 8)})`,
          quantity: typeof anyItem.quantity === 'number' ? anyItem.quantity : 1,
        });
      }
    }
    return { mainboard: entries, sideboard: [], maybeboard: [] };
  }

  return emptyDeckCards();
}

function serializeDeckCards(cards: DeckCardsPayload): DeckCardsPayload {
  return {
    mainboard: cards.mainboard || [],
    sideboard: cards.sideboard || [],
    maybeboard: cards.maybeboard || [],
  };
}

function parseFormat(value: unknown): DeckFormat {
  if (typeof value === 'string' && (DECK_FORMATS as string[]).includes(value)) {
    return value as DeckFormat;
  }
  return 'modern';
}

function parseVisibility(value: unknown): DeckVisibility {
  if (value === 'public' || value === 'unlisted' || value === 'private') return value;
  return 'private';
}

export function recordToDeck(record: any): Deck {
  return {
    id: record.id,
    userId: typeof record.userId === 'string' ? record.userId : record.userId?.id || record.userId,
    name: record.name,
    description: record.description || undefined,
    format: parseFormat(record.format),
    visibility: parseVisibility(record.visibility),
    cards: normalizeDeckCardsPayload(record.cards),
    commanders: normalizeEntryList(record.commanders),
    sourceDeckId:
      typeof record.sourceDeckId === 'string'
        ? record.sourceDeckId
        : record.sourceDeckId?.id || undefined,
    isValidForFormat: Boolean(record.isValidForFormat),
    tags: Array.isArray(record.tags) ? record.tags.filter((t: unknown) => typeof t === 'string') : undefined,
    createdAt: new Date(record.created),
    updatedAt: record.updated ? new Date(record.updated) : undefined,
  };
}

function getErrorMessage(err: unknown): string {
  const body =
    err && typeof err === 'object'
      ? ((err as { data?: unknown }).data ?? (err as { response?: unknown }).response)
      : undefined;

  if (body && typeof body === 'object') {
    const payload = body as { message?: string; data?: Record<string, { message?: string }> };
    if (payload.data && typeof payload.data === 'object') {
      const first = Object.values(payload.data).find((v) => v && typeof v === 'object' && 'message' in v);
      const fieldMsg =
        first && typeof (first as { message?: string }).message === 'string'
          ? (first as { message: string }).message
          : null;
      if (fieldMsg) return fieldMsg;
    }
    if (typeof payload.message === 'string' && payload.message && payload.message !== 'Something went wrong.') {
      return payload.message;
    }
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }
  return '';
}

export async function getDecks(userId: string): Promise<Deck[]> {
  const records = await pb.collection('decks').getFullList({
    filter: pbEqual('userId', userId),
    sort: '-created',
  });
  return records.map(recordToDeck);
}

export async function getPublicDecks(options?: {
  format?: DeckFormat;
  search?: string;
}): Promise<Deck[]> {
  const filters = ['visibility = "public"'];
  if (options?.format) {
    filters.push(pbEqual('format', options.format));
  }
  const records = await pb.collection('decks').getFullList({
    filter: filters.join(' && '),
    sort: '-created',
  });
  let decks = records.map(recordToDeck);
  if (options?.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    decks = decks.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q) ||
        (d.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }
  return decks;
}

export async function getDeckById(deckId: string): Promise<Deck> {
  const record = await pb.collection('decks').getOne(deckId);
  return recordToDeck(record);
}

export interface CreateDeckInput {
  name: string;
  format: DeckFormat;
  description?: string;
  visibility?: DeckVisibility;
  tags?: string[];
}

export async function createDeck(
  _userId: string,
  nameOrInput: string | CreateDeckInput,
  format: DeckFormat = 'modern'
): Promise<Deck> {
  const input: CreateDeckInput =
    typeof nameOrInput === 'string'
      ? { name: nameOrInput, format }
      : nameOrInput;

  const deckName = typeof input.name === 'string' ? input.name.trim() : '';
  if (!deckName) {
    throw new Error('Le nom du deck ne peut pas être vide');
  }
  if (!pb.authStore.isValid || !pb.authStore.model?.id) {
    throw new Error('Session expirée ou invalide. Reconnectez-vous pour créer un deck.');
  }
  const uid = pb.authStore.model.id as string;

  const deckData = cleanForPocketBase({
    userId: uid,
    name: deckName,
    format: input.format || 'modern',
    description: input.description?.trim() || '',
    visibility: input.visibility || 'private',
    cards: serializeDeckCards(emptyDeckCards()),
    commanders: [] as DeckEntry[],
    tags: input.tags || [],
    isValidForFormat: false,
  });

  try {
    const record = await pb.collection('decks').create(deckData);
    return recordToDeck(record);
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    const message =
      typeof msg === 'string' && msg.length > 0 && msg !== 'Something went wrong.'
        ? msg
        : 'Impossible de créer le deck. Vérifiez votre connexion et les droits.';
    throw new Error(message);
  }
}

export async function updateDeck(
  deckId: string,
  updates: Partial<{
    name: string;
    description: string;
    format: DeckFormat;
    visibility: DeckVisibility;
    cards: DeckCardsPayload;
    commanders: DeckEntry[];
    tags: string[];
    isValidForFormat: boolean;
    sourceDeckId: string | null;
  }>
): Promise<Deck> {
  const updateData = cleanForPocketBase({
    name: updates.name,
    description: updates.description,
    format: updates.format,
    visibility: updates.visibility,
    cards: updates.cards !== undefined ? serializeDeckCards(updates.cards) : undefined,
    commanders: updates.commanders,
    tags: updates.tags,
    isValidForFormat: updates.isValidForFormat,
    sourceDeckId: updates.sourceDeckId === null ? '' : updates.sourceDeckId,
  });

  const record = await pb.collection('decks').update(deckId, updateData);
  return recordToDeck(record);
}

export async function deleteDeck(deckId: string): Promise<void> {
  await pb.collection('decks').delete(deckId);
}

function mergeEntryIntoList(list: DeckEntry[], entry: DeckEntry): DeckEntry[] {
  const idx = list.findIndex((c) => c.scryfallId === entry.scryfallId);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], quantity: next[idx].quantity + entry.quantity };
    return next;
  }
  return [...list, { ...entry }];
}

export async function addEntryToDeck(
  deckId: string,
  entry: DeckEntry,
  zone: DeckZone = 'mainboard'
): Promise<Deck> {
  const deck = recordToDeck(await pb.collection('decks').getOne(deckId));
  if (zone === 'commanders') {
    const commanders = mergeEntryIntoList(deck.commanders, { ...entry, quantity: 1 });
    // Commander slots: keep max 2
    return updateDeck(deckId, { commanders: commanders.slice(0, 2).map((c) => ({ ...c, quantity: 1 })) });
  }
  const cards = { ...deck.cards, [zone]: mergeEntryIntoList(deck.cards[zone], entry) };
  return updateDeck(deckId, { cards });
}

/** @deprecated Prefer addEntryToDeck with DeckEntry */
export async function addCardToDeck(
  deckId: string,
  cardIdOrEntry: string | DeckEntry,
  quantity: number = 1,
  zone: DeckZone = 'mainboard'
): Promise<Deck> {
  if (typeof cardIdOrEntry === 'string') {
    return addEntryToDeck(
      deckId,
      {
        scryfallId: cardIdOrEntry,
        name: 'Unknown',
        quantity,
      },
      zone
    );
  }
  return addEntryToDeck(deckId, { ...cardIdOrEntry, quantity: cardIdOrEntry.quantity || quantity }, zone);
}

export async function removeEntryFromDeck(
  deckId: string,
  scryfallId: string,
  zone: DeckZone = 'mainboard'
): Promise<Deck> {
  const deck = recordToDeck(await pb.collection('decks').getOne(deckId));
  if (zone === 'commanders') {
    return updateDeck(deckId, {
      commanders: deck.commanders.filter((c) => c.scryfallId !== scryfallId),
    });
  }
  const cards = {
    ...deck.cards,
    [zone]: deck.cards[zone].filter((c) => c.scryfallId !== scryfallId),
  };
  return updateDeck(deckId, { cards });
}

export async function removeCardFromDeck(
  deckId: string,
  cardId: string,
  zone: DeckZone = 'mainboard'
): Promise<Deck> {
  return removeEntryFromDeck(deckId, cardId, zone);
}

export async function updateEntryQuantityInDeck(
  deckId: string,
  scryfallId: string,
  quantity: number,
  zone: DeckZone = 'mainboard'
): Promise<Deck> {
  if (quantity < 1) {
    return removeEntryFromDeck(deckId, scryfallId, zone);
  }
  const deck = recordToDeck(await pb.collection('decks').getOne(deckId));
  if (zone === 'commanders') {
    return updateDeck(deckId, {
      commanders: deck.commanders.map((c) =>
        c.scryfallId === scryfallId ? { ...c, quantity: 1 } : c
      ),
    });
  }
  const cards = {
    ...deck.cards,
    [zone]: deck.cards[zone].map((c) =>
      c.scryfallId === scryfallId ? { ...c, quantity } : c
    ),
  };
  return updateDeck(deckId, { cards });
}

export async function updateCardQuantityInDeck(
  deckId: string,
  cardId: string,
  quantity: number,
  zone: DeckZone = 'mainboard'
): Promise<Deck> {
  return updateEntryQuantityInDeck(deckId, cardId, quantity, zone);
}

/**
 * Replace one printing with another in a zone, preserving quantity.
 * If the new scryfallId already exists in the zone, merge quantities and remove the old.
 */
export async function replaceEntryInDeck(
  deckId: string,
  zone: DeckZone,
  oldScryfallId: string,
  newEntry: DeckEntry
): Promise<Deck> {
  const deck = recordToDeck(await pb.collection('decks').getOne(deckId));
  const qty = newEntry.quantity || 1;

  if (zone === 'commanders') {
    const withoutOld = deck.commanders.filter((c) => c.scryfallId !== oldScryfallId);
    const existing = withoutOld.find((c) => c.scryfallId === newEntry.scryfallId);
    const commanders = existing
      ? withoutOld.map((c) =>
          c.scryfallId === newEntry.scryfallId ? { ...newEntry, quantity: 1 } : c
        )
      : [...withoutOld, { ...newEntry, quantity: 1 }].slice(0, 2);
    return updateDeck(deckId, { commanders });
  }

  const list = deck.cards[zone] || [];
  const old = list.find((c) => c.scryfallId === oldScryfallId);
  const keepQty = old?.quantity ?? qty;
  const withoutOld = list.filter((c) => c.scryfallId !== oldScryfallId);
  const existingIdx = withoutOld.findIndex((c) => c.scryfallId === newEntry.scryfallId);
  let next: DeckEntry[];
  if (existingIdx >= 0) {
    next = withoutOld.map((c, i) =>
      i === existingIdx
        ? { ...newEntry, quantity: c.quantity + keepQty }
        : c
    );
  } else {
    next = [...withoutOld, { ...newEntry, quantity: keepQty }];
  }

  return updateDeck(deckId, {
    cards: { ...deck.cards, [zone]: next },
  });
}

export async function setDeckVisibility(
  deckId: string,
  visibility: DeckVisibility,
  isValidForFormat?: boolean
): Promise<Deck> {
  return updateDeck(deckId, {
    visibility,
    isValidForFormat: isValidForFormat ?? visibility === 'public',
  });
}

export async function forkDeck(sourceDeckId: string): Promise<Deck> {
  if (!pb.authStore.isValid || !pb.authStore.model?.id) {
    throw new Error('Session expirée ou invalide.');
  }
  const uid = pb.authStore.model.id as string;
  const source = await getDeckById(sourceDeckId);

  const deckData = cleanForPocketBase({
    userId: uid,
    name: `${source.name} (copie)`,
    description: source.description || '',
    format: source.format,
    visibility: 'private',
    cards: serializeDeckCards(source.cards),
    commanders: source.commanders,
    tags: source.tags || [],
    sourceDeckId: source.id,
    isValidForFormat: false,
  });

  const record = await pb.collection('decks').create(deckData);
  return recordToDeck(record);
}

export function mtgCardToDeckEntry(
  card: {
    id?: string;
    name: string;
    set?: string;
    number?: string;
    cmc?: number;
    type?: string;
    manaCost?: string;
    rarity?: string;
    colors?: string[];
    imageUrl?: string;
  },
  quantity: number = 1,
  extras?: Partial<DeckEntry>
): DeckEntry {
  return {
    scryfallId: card.id || extras?.scryfallId || '',
    name: card.name,
    setCode: card.set || extras?.setCode,
    collectorNumber: card.number || extras?.collectorNumber,
    quantity,
    cmc: card.cmc,
    typeLine: card.type,
    manaCost: card.manaCost,
    rarity: card.rarity,
    colors: card.colors,
    imageUrl: card.imageUrl,
    backImageUrl: (card as { backImageUrl?: string }).backImageUrl,
    backName: extras?.backName,
    ...extras,
  };
}

import type { DeckEntry } from '../types/deck';

/** One physical card in a shuffled library (quantity expanded). */
export interface SampleCard {
  scryfallId: string;
  name: string;
  imageUrl?: string;
  manaCost?: string;
  typeLine?: string;
  cmc?: number;
}

export interface SampleHandState {
  library: SampleCard[];
  hand: SampleCard[];
  mulliganCount: number;
  openingHandSize: number;
}

function expandPool(entries: DeckEntry[]): SampleCard[] {
  const pool: SampleCard[] = [];
  for (const e of entries) {
    const qty = Math.max(0, e.quantity || 0);
    for (let i = 0; i < qty; i++) {
      pool.push({
        scryfallId: e.scryfallId,
        name: e.name,
        imageUrl: e.imageUrl,
        manaCost: e.manaCost,
        typeLine: e.typeLine,
        cmc: e.cmc,
      });
    }
  }
  return pool;
}

/** Fisher–Yates shuffle. */
export function shuffleCards<T>(cards: T[], random: () => number = Math.random): T[] {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a sample hand from mainboard only (commanders stay in the command zone).
 */
export function createSampleHand(
  mainboard: DeckEntry[],
  options?: {
    handSize?: number;
    random?: () => number;
  }
): SampleHandState {
  const handSize = options?.handSize ?? 7;
  const library = shuffleCards(expandPool(mainboard), options?.random);
  const hand = library.splice(0, Math.min(handSize, library.length));
  return {
    library,
    hand,
    mulliganCount: 0,
    openingHandSize: handSize,
  };
}

/**
 * London mulligan: shuffle hand back into library, draw openingHandSize,
 * then put N cards on the bottom (auto: highest CMC) where N = mulligan count.
 */
export function mulliganSampleHand(
  state: SampleHandState,
  options?: { random?: () => number }
): SampleHandState {
  const nextMulligan = state.mulliganCount + 1;
  const combined = shuffleCards([...state.hand, ...state.library], options?.random);
  const drawn = combined.splice(0, Math.min(state.openingHandSize, combined.length));

  const toBottom = Math.min(nextMulligan, drawn.length);
  const byCmcDesc = [...drawn].sort((a, b) => (b.cmc ?? 0) - (a.cmc ?? 0));
  const putBottom = byCmcDesc.slice(0, toBottom);
  const keepSet = new Map<string, number>();
  for (const c of drawn) {
    const k = c.scryfallId;
    keepSet.set(k, (keepSet.get(k) || 0) + 1);
  }
  for (const c of putBottom) {
    const k = c.scryfallId;
    keepSet.set(k, (keepSet.get(k) || 0) - 1);
  }
  const hand: SampleCard[] = [];
  for (const c of drawn) {
    const k = c.scryfallId;
    const n = keepSet.get(k) || 0;
    if (n > 0) {
      hand.push(c);
      keepSet.set(k, n - 1);
    }
  }

  return {
    library: [...combined, ...putBottom],
    hand,
    mulliganCount: nextMulligan,
    openingHandSize: state.openingHandSize,
  };
}

/** Draw one card from library into hand. */
export function drawSampleCard(state: SampleHandState): SampleHandState {
  if (state.library.length === 0) return state;
  const [drawn, ...rest] = state.library;
  return {
    ...state,
    library: rest,
    hand: [...state.hand, drawn],
  };
}

export function redrawSampleHand(
  mainboard: DeckEntry[],
  options?: { handSize?: number; random?: () => number }
): SampleHandState {
  return createSampleHand(mainboard, options);
}

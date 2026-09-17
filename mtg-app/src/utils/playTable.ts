import type { DeckEntry, DeckFormat } from '../types/deck';
import type {
  DeckSnapshot,
  MatchState,
  PlayAction,
  PlayerTableState,
  PlaySeat,
  TableCard,
  ZoneName,
} from '../types/play';
import { shuffleCards } from './sampleHand';

const STARTING_HAND = 7;

function isCommanderFormat(format: string | undefined): boolean {
  return (format || '').toLowerCase() === 'commander';
}

function expandEntries(entries: DeckEntry[] | undefined, prefix: string): TableCard[] {
  const cards: TableCard[] = [];
  let i = 0;
  for (const entry of entries || []) {
    const qty = Math.max(0, entry.quantity || 0);
    for (let q = 0; q < qty; q++) {
      cards.push({
        instanceId: `${prefix}-${entry.scryfallId}-${i++}`,
        scryfallId: entry.scryfallId,
        name: entry.name,
        imageUrl: entry.imageUrl,
        manaCost: entry.manaCost,
        typeLine: entry.typeLine,
        cmc: entry.cmc,
        tapped: false,
        facedown: false,
      });
    }
  }
  return cards;
}

function cardsOf(player: PlayerTableState, zone: ZoneName): TableCard[] {
  return player[zone];
}

function withZone(player: PlayerTableState, zone: ZoneName, cards: TableCard[]): PlayerTableState {
  return { ...player, [zone]: cards };
}

function findPlayer(state: MatchState, userId: string): PlayerTableState | undefined {
  return state.players.find((p) => p.userId === userId);
}

function replacePlayer(state: MatchState, nextPlayer: PlayerTableState): MatchState {
  return {
    ...state,
    version: state.version + 1,
    players: state.players.map((p) => (p.userId === nextPlayer.userId ? nextPlayer : p)),
  };
}

export function snapshotFromDeck(input: {
  id: string;
  name: string;
  format: DeckFormat;
  cards: { mainboard: DeckEntry[] };
  commanders?: DeckEntry[];
}): DeckSnapshot {
  return {
    deckId: input.id,
    name: input.name,
    format: input.format,
    mainboard: input.cards?.mainboard || [],
    commanders: input.commanders || [],
  };
}

export function createPlayerFromSnapshot(
  seat: Pick<PlaySeat, 'userId' | 'seatIndex' | 'displayName' | 'deckSnapshot'>,
  options?: { random?: () => number }
): PlayerTableState {
  const snapshot = seat.deckSnapshot;
  const format = snapshot?.format || 'commander';
  const commander = isCommanderFormat(format);
  const libraryPool = shuffleCards(expandEntries(snapshot?.mainboard, `${seat.userId}-lib`), options?.random);
  const hand = libraryPool.splice(0, Math.min(STARTING_HAND, libraryPool.length));
  return {
    userId: seat.userId,
    seatIndex: seat.seatIndex,
    displayName: seat.displayName,
    life: commander ? 40 : 20,
    poison: 0,
    library: libraryPool,
    hand,
    battlefield: [],
    graveyard: [],
    exile: [],
    command: expandEntries(snapshot?.commanders, `${seat.userId}-cmd`),
  };
}

export function createInitialMatchState(
  seats: Array<Pick<PlaySeat, 'userId' | 'seatIndex' | 'displayName' | 'deckSnapshot'>>,
  format: DeckFormat | string,
  options?: { random?: () => number }
): MatchState {
  const ordered = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
  return {
    version: 1,
    turnSeatIndex: ordered[0]?.seatIndex ?? 0,
    format,
    players: ordered.map((seat) => createPlayerFromSnapshot(seat, options)),
  };
}

function drawOne(player: PlayerTableState): PlayerTableState {
  if (player.library.length === 0) return player;
  const [drawn, ...rest] = player.library;
  return { ...player, library: rest, hand: [...player.hand, drawn] };
}

function moveCard(
  player: PlayerTableState,
  instanceId: string,
  from: ZoneName,
  to: ZoneName,
  facedown?: boolean,
  toTop?: boolean
): PlayerTableState {
  const source = cardsOf(player, from);
  const idx = source.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return player;
  const card = {
    ...source[idx],
    tapped: to === 'battlefield' ? source[idx].tapped : false,
    facedown: facedown ?? (to === 'library' ? true : false),
  };
  if (to !== 'battlefield') {
    card.tapped = false;
  }
  const nextSource = [...source.slice(0, idx), ...source.slice(idx + 1)];
  const dest = to === from ? nextSource : cardsOf(player, to);
  const nextDest = toTop ? [card, ...dest] : [...dest, card];
  let next = withZone(player, from, nextSource);
  next = withZone(next, to, nextDest);
  return next;
}

function toggleTap(player: PlayerTableState, instanceId: string): PlayerTableState {
  const idx = player.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return player;
  const battlefield = player.battlefield.map((c, i) =>
    i === idx ? { ...c, tapped: !c.tapped } : c
  );
  return { ...player, battlefield };
}

function toggleFlip(player: PlayerTableState, instanceId: string): PlayerTableState {
  const zones: ZoneName[] = ['battlefield', 'hand', 'exile', 'command', 'graveyard'];
  for (const zone of zones) {
    const list = cardsOf(player, zone);
    const idx = list.findIndex((c) => c.instanceId === instanceId);
    if (idx >= 0) {
      const next = list.map((c, i) => (i === idx ? { ...c, facedown: !c.facedown } : c));
      return withZone(player, zone, next);
    }
  }
  return player;
}

function mulligan(player: PlayerTableState, random?: () => number): PlayerTableState {
  const combined = shuffleCards([...player.hand, ...player.library], random);
  const hand = combined.splice(0, Math.min(STARTING_HAND, combined.length));
  return { ...player, library: combined, hand };
}

export function applyMatchAction(
  state: MatchState,
  action: PlayAction,
  options?: { random?: () => number }
): MatchState {
  if (action.type === 'passTurn') {
    const seats = state.players.map((p) => p.seatIndex).sort((a, b) => a - b);
    if (seats.length === 0) return state;
    const currentIdx = seats.indexOf(state.turnSeatIndex);
    const nextSeat = seats[(currentIdx + 1) % seats.length];
    return { ...state, version: state.version + 1, turnSeatIndex: nextSeat };
  }

  const player = findPlayer(state, action.userId);
  if (!player) return state;

  let nextPlayer = player;
  switch (action.type) {
    case 'draw':
      nextPlayer = drawOne(player);
      break;
    case 'shuffleLibrary':
      nextPlayer = { ...player, library: shuffleCards(player.library, options?.random) };
      break;
    case 'moveCard':
      nextPlayer = moveCard(
        player,
        action.instanceId,
        action.from,
        action.to,
        action.facedown,
        action.toTop
      );
      break;
    case 'searchLibrary': {
      const taken = moveCard(
        player,
        action.instanceId,
        'library',
        action.to,
        action.to === 'library' ? true : false,
        action.toTop
      );
      nextPlayer =
        action.shuffle && action.to !== 'library'
          ? { ...taken, library: shuffleCards(taken.library, options?.random) }
          : taken;
      break;
    }
    case 'tap':
      nextPlayer = toggleTap(player, action.instanceId);
      break;
    case 'flip':
      nextPlayer = toggleFlip(player, action.instanceId);
      break;
    case 'setLife':
      nextPlayer = { ...player, life: player.life + action.delta };
      break;
    case 'setPoison':
      nextPlayer = { ...player, poison: Math.max(0, player.poison + action.delta) };
      break;
    case 'mulligan':
      nextPlayer = mulligan(player, options?.random);
      break;
    default:
      return state;
  }

  if (nextPlayer === player) return state;
  return replacePlayer(state, nextPlayer);
}

export function zoneCount(player: PlayerTableState, zone: ZoneName): number {
  return cardsOf(player, zone).length;
}

export function filterLibraryCards(cards: TableCard[], query: string): TableCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((card) => {
    const haystack = [card.name, card.typeLine, card.manaCost]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function isPlaymatLand(card: Pick<TableCard, 'name' | 'typeLine'>): boolean {
  const firstFace = (card.typeLine || '').split('//')[0].trim();
  if (/\bland\b/i.test(firstFace)) return true;
  const firstName = (card.name || '').split('//')[0].trim().toLowerCase();
  return (
    firstName === 'plains' ||
    firstName === 'island' ||
    firstName === 'swamp' ||
    firstName === 'mountain' ||
    firstName === 'forest' ||
    firstName === 'wastes'
  );
}

export function splitBattlefield(cards: TableCard[]): { lands: TableCard[]; other: TableCard[] } {
  const lands: TableCard[] = [];
  const other: TableCard[] = [];
  for (const card of cards) {
    if (isPlaymatLand(card)) lands.push(card);
    else other.push(card);
  }
  return { lands, other };
}

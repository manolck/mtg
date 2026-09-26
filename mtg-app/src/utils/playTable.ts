import type { DeckEntry, DeckFormat } from '../types/deck';
import type {
  DeckSnapshot,
  MatchState,
  PlayAction,
  PlayerTableState,
  PlaySeat,
  RevealAudience,
  TableCard,
  TokenBlueprint,
  ZoneName,
} from '../types/play';
import { REVEAL_ALL, ZONE_NAMES } from '../types/play';
import { normalizeCounterId } from '../data/mtgCounters';
import { shuffleCards } from './sampleHand';

const STARTING_HAND = 7;

function isCommanderFormat(format: string | undefined): boolean {
  return (format || '').toLowerCase() === 'commander';
}

/** Deck owner for a card (explicit field, or inferred from instanceId). */
export function deckOwnerId(card: TableCard): string | undefined {
  if (card.ownerUserId) return card.ownerUserId;
  const id = card.instanceId;
  for (const marker of ['-lib-', '-cmd-', '-tok-'] as const) {
    const idx = id.indexOf(marker);
    if (idx > 0) return id.slice(0, idx);
  }
  return undefined;
}

function expandEntries(entries: DeckEntry[] | undefined, prefix: string, ownerUserId?: string): TableCard[] {
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
        backImageUrl: entry.backImageUrl,
        backName: entry.backName,
        manaCost: entry.manaCost,
        typeLine: entry.typeLine,
        cmc: entry.cmc,
        tapped: false,
        facedown: false,
        transformed: false,
        ownerUserId,
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

function replacePlayers(state: MatchState, nextPlayers: PlayerTableState[]): MatchState {
  if (nextPlayers.length === 0) return state;
  const byId = new Map(nextPlayers.map((player) => [player.userId, player]));
  return {
    ...state,
    version: state.version + 1,
    players: state.players.map((player) => byId.get(player.userId) || player),
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
  const libraryPool = shuffleCards(
    expandEntries(snapshot?.mainboard, `${seat.userId}-lib`, seat.userId),
    options?.random,
  );
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
    command: expandEntries(snapshot?.commanders, `${seat.userId}-cmd`, seat.userId),
    shownHandTo: [],
    shownHandCards: [],
    chosenHandCards: [],
    libraryTopRevealedTo: [],
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
    actionSeq: 0,
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

function insertIntoLibrary(library: TableCard[], card: TableCard, toTop?: boolean, libraryPosition?: number): TableCard[] {
  if (libraryPosition != null && Number.isFinite(libraryPosition)) {
    const n = Math.max(1, Math.floor(libraryPosition));
    if (n > library.length) return [...library, card];
    const idx = n - 1;
    return [...library.slice(0, idx), card, ...library.slice(idx)];
  }
  if (toTop) return [card, ...library];
  return [...library, card];
}

function audienceIncludes(audience: RevealAudience | undefined, viewerId: string): boolean {
  if (!audience || audience.length === 0) return false;
  return audience.includes(REVEAL_ALL) || audience.includes(viewerId);
}

export function canSeePlayerHand(owner: PlayerTableState, viewerId: string): boolean {
  if (owner.userId === viewerId) return true;
  return audienceIncludes(owner.shownHandTo, viewerId);
}

export function canSeeHandCard(owner: PlayerTableState, card: TableCard, viewerId: string): boolean {
  if (canSeePlayerHand(owner, viewerId)) return true;
  const entry = (owner.shownHandCards || []).find((item) => item.instanceId === card.instanceId);
  return entry ? audienceIncludes(entry.to, viewerId) : false;
}

export function canSeeLibraryTop(owner: PlayerTableState, viewerId: string): boolean {
  const to = owner.libraryTopRevealedTo;
  if (!to || to.length === 0) return false;
  if (owner.userId === viewerId) return true;
  return audienceIncludes(to, viewerId);
}

export function visibleOpponentHand(owner: PlayerTableState, viewerId: string): TableCard[] {
  if (owner.userId === viewerId) return owner.hand;
  if (canSeePlayerHand(owner, viewerId)) return owner.hand;
  return owner.hand.filter((card) => canSeeHandCard(owner, card, viewerId));
}

function pruneHandReveals(player: PlayerTableState): PlayerTableState {
  const ids = new Set(player.hand.map((card) => card.instanceId));
  const shownHandCards = (player.shownHandCards || []).filter((item) => ids.has(item.instanceId));
  const chosenHandCards = (player.chosenHandCards || []).filter((item) => ids.has(item.instanceId));
  return { ...player, shownHandCards, chosenHandCards };
}

export function isHandCardChosen(player: PlayerTableState, instanceId: string, byUserId?: string): boolean {
  return (player.chosenHandCards || []).some(
    (item) => item.instanceId === instanceId && (byUserId == null || item.by === byUserId),
  );
}

export function handCardChoosers(player: PlayerTableState, instanceId: string): string[] {
  const ids: string[] = [];
  for (const item of player.chosenHandCards || []) {
    if (item.instanceId !== instanceId) continue;
    if (!ids.includes(item.by)) ids.push(item.by);
  }
  return ids;
}

function toggleHandChoice(state: MatchState, action: { userId: string; ownerId: string; instanceId: string }): MatchState {
  if (action.userId === action.ownerId) return state;
  const owner = findPlayer(state, action.ownerId);
  if (!owner) return state;
  if (!owner.hand.some((card) => card.instanceId === action.instanceId)) return state;
  const current = owner.chosenHandCards || [];
  const already = current.some((item) => item.instanceId === action.instanceId && item.by === action.userId);
  const chosenHandCards = already
    ? current.filter((item) => !(item.instanceId === action.instanceId && item.by === action.userId))
    : [...current, { instanceId: action.instanceId, by: action.userId }];
  return replacePlayer(state, { ...owner, chosenHandCards });
}

function clearHandChoices(state: MatchState, action: { userId: string; ownerId: string }): MatchState {
  const owner = findPlayer(state, action.ownerId);
  if (!owner) return state;
  const current = owner.chosenHandCards || [];
  if (!current.length) return state;
  // Owner clears everyone's picks on their hand; a chooser clears only their own.
  const chosenHandCards =
    action.userId === action.ownerId ? [] : current.filter((item) => item.by !== action.userId);
  if (chosenHandCards.length === current.length) return state;
  return replacePlayer(state, { ...owner, chosenHandCards });
}

function reorderHandCards(player: PlayerTableState, instanceId: string, toIndex: number): PlayerTableState {
  const from = player.hand.findIndex((card) => card.instanceId === instanceId);
  if (from < 0) return player;
  const next = [...player.hand];
  const [card] = next.splice(from, 1);
  const clamped = Math.max(0, Math.min(Math.trunc(toIndex), next.length));
  if (clamped === from) return player;
  next.splice(clamped, 0, card);
  return { ...player, hand: next };
}

function transferCardBetweenPlayers(
  state: MatchState,
  action: {
    fromUserId: string;
    toUserId: string;
    instanceId: string;
    from: ZoneName;
    to: ZoneName;
    playmatX?: number;
    playmatY?: number;
    playmatRow?: 'lands' | 'battlefield' | 'enchantments' | null;
  },
): MatchState {
  if (action.fromUserId === action.toUserId) {
    const player = findPlayer(state, action.fromUserId);
    if (!player) return state;
    const next = moveCard(player, action.instanceId, action.from, action.to, undefined, undefined, undefined, {
      playmatX: action.playmatX,
      playmatY: action.playmatY,
      playmatRow: action.playmatRow,
    });
    if (next === player) return state;
    return pruneOrphanAttachments(replacePlayer(state, pruneTokensOffBattlefield(next)));
  }

  const fromPlayer = findPlayer(state, action.fromUserId);
  const toPlayer = findPlayer(state, action.toUserId);
  if (!fromPlayer || !toPlayer) return state;

  const source = cardsOf(fromPlayer, action.from);
  const idx = source.findIndex((card) => card.instanceId === action.instanceId);
  if (idx < 0) return state;
  const moving = source[idx];
  const attachments =
    action.from === 'battlefield'
      ? fromPlayer.battlefield.filter((card) => card.attachedTo === moving.instanceId)
      : [];
  const removeIds = new Set([moving.instanceId, ...attachments.map((card) => card.instanceId)]);

  if (moving.isToken && action.to !== 'battlefield') {
    let nextFrom = fromPlayer;
    if (action.from === 'battlefield') {
      nextFrom = {
        ...fromPlayer,
        battlefield: fromPlayer.battlefield.filter((card) => !removeIds.has(card.instanceId)),
      };
    } else {
      nextFrom = withZone(fromPlayer, action.from, source.filter((_, i) => i !== idx));
      if (action.from === 'hand') nextFrom = pruneHandReveals(nextFrom);
    }
    return pruneOrphanAttachments(replacePlayers(state, [pruneTokensOffBattlefield(nextFrom)]));
  }

  const prepareCard = (card: TableCard, isHost: boolean): TableCard | null => {
    if (card.isToken && action.to !== 'battlefield') return null;
    const next: TableCard = {
      ...card,
      ownerUserId: card.ownerUserId || deckOwnerId(card) || action.fromUserId,
    };
    if (action.to === 'battlefield') {
      if (isHost) {
        next.attachedTo = undefined;
        if (action.playmatX != null) next.playmatX = clampPlaymat(action.playmatX);
        if (action.playmatY != null) next.playmatY = clampPlaymat(action.playmatY);
        if (action.playmatRow !== undefined) next.playmatRow = action.playmatRow || undefined;
      } else {
        next.playmatX = undefined;
        next.playmatY = undefined;
        next.playmatRow = undefined;
      }
    } else {
      next.tapped = false;
      next.attachedTo = undefined;
      next.playmatX = undefined;
      next.playmatY = undefined;
      next.playmatRow = undefined;
      next.facedown = action.to === 'library';
      if (action.to === 'library') next.transformed = false;
    }
    return next;
  };

  const prepared = [prepareCard(moving, true), ...attachments.map((card) => prepareCard(card, false))].filter(
    (card): card is TableCard => Boolean(card),
  );

  let nextFrom: PlayerTableState;
  if (action.from === 'battlefield') {
    nextFrom = {
      ...fromPlayer,
      battlefield: fromPlayer.battlefield.filter((card) => !removeIds.has(card.instanceId)),
    };
  } else {
    nextFrom = withZone(fromPlayer, action.from, source.filter((_, i) => i !== idx));
    if (action.from === 'hand') nextFrom = pruneHandReveals(nextFrom);
  }

  let nextTo = withZone(toPlayer, action.to, [...cardsOf(toPlayer, action.to), ...prepared]);
  if (action.from === 'hand' || action.to === 'hand') nextTo = pruneHandReveals(nextTo);

  return pruneOrphanAttachments(
    replacePlayers(state, [pruneTokensOffBattlefield(nextFrom), pruneTokensOffBattlefield(nextTo)]),
  );
}

function moveCard(
  player: PlayerTableState,
  instanceId: string,
  from: ZoneName,
  to: ZoneName,
  facedown?: boolean,
  toTop?: boolean,
  libraryPosition?: number,
  playmat?: {
    playmatX?: number;
    playmatY?: number;
    playmatRow?: 'lands' | 'battlefield' | 'enchantments' | null;
  },
): PlayerTableState {
  const source = cardsOf(player, from);
  const idx = source.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return player;
  if (source[idx].isToken && to !== 'battlefield') {
    const nextSource = [...source.slice(0, idx), ...source.slice(idx + 1)];
    let next = withZone(player, from, nextSource);
    if (from === 'hand') next = pruneHandReveals(next);
    return next;
  }
  const card: TableCard = {
    ...source[idx],
    tapped: to === 'battlefield' ? source[idx].tapped : false,
    facedown: facedown ?? (to === 'library' ? true : false),
    transformed: to === 'library' ? false : source[idx].transformed,
    attachedTo: to === 'battlefield' ? source[idx].attachedTo : undefined,
    playmatRow: to === 'battlefield' ? source[idx].playmatRow : undefined,
    playmatX: to === 'battlefield' ? source[idx].playmatX : undefined,
    playmatY: to === 'battlefield' ? source[idx].playmatY : undefined,
  };
  if (to === 'battlefield' && playmat) {
    if (playmat.playmatX != null) card.playmatX = clampPlaymat(playmat.playmatX);
    if (playmat.playmatY != null) card.playmatY = clampPlaymat(playmat.playmatY);
    if (playmat.playmatRow !== undefined) card.playmatRow = playmat.playmatRow || undefined;
  }
  if (to !== 'battlefield') {
    card.tapped = false;
    card.attachedTo = undefined;
    card.playmatRow = undefined;
    card.playmatX = undefined;
    card.playmatY = undefined;
  }
  const nextSource = [...source.slice(0, idx), ...source.slice(idx + 1)];
  let next = withZone(player, from, nextSource);
  const dest = to === from ? cardsOf(next, to) : cardsOf(next, to);
  const nextDest =
    to === 'library'
      ? insertIntoLibrary(dest, card, toTop, libraryPosition)
      : toTop
        ? [card, ...dest]
        : [...dest, card];
  next = withZone(next, to, nextDest);
  if (from === 'hand' || to === 'hand') next = pruneHandReveals(next);
  return next;
}

function clampPlaymat(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(4, Math.min(96, value));
}

const TOKEN_STACK_CELL = 8;

export function tokenStackCell(x?: number | null, y?: number | null): string {
  if (x == null || y == null) return 'flow';
  return `${Math.round(x / TOKEN_STACK_CELL)}_${Math.round(y / TOKEN_STACK_CELL)}`;
}

export function offsetOffTokenStack(
  fromX: number,
  fromY: number,
  preferX?: number,
  preferY?: number,
): { x: number; y: number } {
  const origin = tokenStackCell(fromX, fromY);
  const candidates: Array<[number, number]> = [
    [preferX ?? fromX + 12, preferY ?? fromY],
    [fromX + 12, fromY],
    [fromX - 12, fromY],
    [fromX + 12, fromY + 8],
    [fromX - 12, fromY + 8],
    [fromX, fromY + 12],
  ];
  for (const [rawX, rawY] of candidates) {
    const x = clampPlaymat(rawX);
    const y = clampPlaymat(rawY);
    if (tokenStackCell(x, y) !== origin) return { x, y };
  }
  return { x: clampPlaymat(fromX + 16), y: clampPlaymat(fromY + 16) };
}

function toggleTap(player: PlayerTableState, instanceIds: string[]): PlayerTableState {
  const ids = new Set(instanceIds.filter(Boolean));
  if (ids.size === 0) return player;
  const targets = player.battlefield.filter((card) => ids.has(card.instanceId));
  if (targets.length === 0) return player;
  const tap = targets.some((card) => !card.tapped);
  return {
    ...player,
    battlefield: player.battlefield.map((card) => (ids.has(card.instanceId) ? { ...card, tapped: tap } : card)),
  };
}

function setPlaymatRow(
  player: PlayerTableState,
  instanceId: string,
  row: 'lands' | 'battlefield' | 'enchantments' | null,
): PlayerTableState {
  const idx = player.battlefield.findIndex((card) => card.instanceId === instanceId);
  if (idx < 0) return player;
  const nextRow = row || undefined;
  if (player.battlefield[idx].playmatRow === nextRow) return player;
  return {
    ...player,
    battlefield: player.battlefield.map((card, index) =>
      index === idx ? { ...card, playmatRow: nextRow } : card,
    ),
  };
}

function setPlaymatPos(
  player: PlayerTableState,
  instanceIds: string[],
  x: number,
  y: number,
  row?: 'lands' | 'battlefield' | 'enchantments' | null,
): PlayerTableState {
  const ids = new Set(instanceIds.filter(Boolean));
  if (ids.size === 0) return player;
  const nextX = clampPlaymat(x);
  const nextY = clampPlaymat(y);
  let changed = false;
  const battlefield = player.battlefield.map((card) => {
    if (!ids.has(card.instanceId)) return card;
    const nextRow = row === undefined ? card.playmatRow : row || undefined;
    if (card.playmatX === nextX && card.playmatY === nextY && card.playmatRow === nextRow) return card;
    changed = true;
    return { ...card, playmatX: nextX, playmatY: nextY, playmatRow: nextRow };
  });
  return changed ? { ...player, battlefield } : player;
}

function toggleFlip(
  player: PlayerTableState,
  instanceId: string,
  backImageUrl?: string,
  backName?: string,
  backTypeLine?: string,
): PlayerTableState {
  const zones: ZoneName[] = ['battlefield', 'hand', 'exile', 'command', 'graveyard'];
  for (const zone of zones) {
    const list = cardsOf(player, zone);
    const idx = list.findIndex((c) => c.instanceId === instanceId);
    if (idx >= 0) {
      const card = list[idx];
      const resolvedBack = card.backImageUrl || backImageUrl;
      if (!resolvedBack) return player;
      const next = list.map((c, i) =>
        i === idx
          ? {
              ...c,
              backImageUrl: resolvedBack,
              backName: c.backName || backName,
              backTypeLine: c.backTypeLine || backTypeLine,
              transformed: !c.transformed,
            }
          : c,
      );
      return withZone(player, zone, next);
    }
  }
  return player;
}

export function isDoubleFacedCard(card: Pick<TableCard, 'backImageUrl'>): boolean {
  return Boolean(card.backImageUrl);
}

export function visibleCardFace(card: TableCard): { imageUrl?: string; name: string } {
  if (card.transformed && card.backImageUrl) {
    return { imageUrl: card.backImageUrl, name: card.backName || card.name };
  }
  return { imageUrl: card.imageUrl, name: card.name };
}

function mulligan(player: PlayerTableState, random?: () => number): PlayerTableState {
  const combined = shuffleCards([...player.hand, ...player.library], random);
  const hand = combined.splice(0, Math.min(STARTING_HAND, combined.length));
  return {
    ...player,
    library: combined,
    hand,
    shownHandTo: [],
    shownHandCards: [],
    chosenHandCards: [],
    libraryTopRevealedTo: [],
  };
}

export const DUMMY_USER_PREFIX = 'dummy:';

export function isDummyUserId(userId: string): boolean {
  return userId.startsWith(DUMMY_USER_PREFIX);
}

export function dummyUserIdForSeat(seatIndex: number): string {
  return `${DUMMY_USER_PREFIX}${seatIndex}`;
}

function cloneCardsForDummy(cards: TableCard[], prefix: string, ownerUserId: string): TableCard[] {
  return cards
    .filter((card) => !card.isToken)
    .map((card, index) => ({
      ...card,
      instanceId: `${prefix}-${index}`,
      ownerUserId,
      tapped: false,
      facedown: false,
      attachedTo: undefined,
    }));
}

export function addDummyPlayer(
  state: MatchState,
  actorUserId: string,
  options?: { seatIndex?: number; displayName?: string; random?: () => number }
): MatchState {
  const actor = findPlayer(state, actorUserId);
  if (!actor) return state;
  if (state.players.length >= 4) return state;
  const taken = new Set(state.players.map((player) => player.seatIndex));
  const seatIndex =
    options?.seatIndex != null && !taken.has(options.seatIndex)
      ? options.seatIndex
      : [0, 1, 2, 3].find((index) => !taken.has(index));
  if (seatIndex == null) return state;
  const userId = dummyUserIdForSeat(seatIndex);
  if (state.players.some((player) => player.userId === userId)) return state;

  const commander = isCommanderFormat(state.format);
  const pool = cloneCardsForDummy(
    [...actor.library, ...actor.hand, ...actor.battlefield, ...actor.graveyard, ...actor.exile],
    `${userId}-lib`,
    userId,
  );
  const shuffled = shuffleCards(pool, options?.random);
  const hand = shuffled.splice(0, Math.min(STARTING_HAND, shuffled.length));
  const dummy: PlayerTableState = {
    userId,
    seatIndex,
    displayName: options?.displayName || `Siège ${seatIndex + 1}`,
    life: commander ? 40 : 20,
    poison: 0,
    library: shuffled,
    hand,
    battlefield: [],
    graveyard: [],
    exile: [],
    command: cloneCardsForDummy(actor.command, `${userId}-cmd`, userId),
    shownHandTo: [],
    shownHandCards: [],
    chosenHandCards: [],
    libraryTopRevealedTo: [],
  };
  return {
    ...state,
    version: state.version + 1,
    players: [...state.players, dummy],
  };
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
    const incoming = state.players.find((player) => player.seatIndex === nextSeat);
    const nextPlayers = incoming
      ? state.players.map((player) => (player.userId === incoming.userId ? beginTurn(incoming) : player))
      : state.players;
    return { ...state, version: state.version + 1, turnSeatIndex: nextSeat, players: nextPlayers };
  }

  if (action.type === 'setTurn') {
    const target = state.players.find((player) => player.seatIndex === action.seatIndex);
    if (!target) return state;
    return { ...state, version: state.version + 1, turnSeatIndex: action.seatIndex };
  }

  if (action.type === 'addSeat') {
    return addDummyPlayer(state, action.userId, {
      seatIndex: action.seatIndex,
      displayName: action.displayName,
      random: options?.random,
    });
  }

  if (action.type === 'chooseHandCard') {
    return toggleHandChoice(state, action);
  }

  if (action.type === 'clearHandChoices') {
    return clearHandChoices(state, action);
  }

  if (action.type === 'transferCard') {
    return transferCardBetweenPlayers(state, action);
  }

  const rawPlayer = findPlayer(state, action.userId);
  if (!rawPlayer) return state;

  const player = pruneTokensOffBattlefield(rawPlayer);
  let nextPlayer = player;
  switch (action.type) {
    case 'draw':
      nextPlayer = drawOne(player);
      break;
    case 'shuffleLibrary':
      nextPlayer = {
        ...player,
        library: shuffleCards(player.library, options?.random),
        libraryTopRevealedTo: [],
      };
      break;
    case 'moveCard':
      nextPlayer = moveCard(
        player,
        action.instanceId,
        action.from,
        action.to,
        action.facedown,
        action.toTop,
        action.libraryPosition,
        {
          playmatX: action.playmatX,
          playmatY: action.playmatY,
          playmatRow: action.playmatRow,
        },
      );
      break;
    case 'searchLibrary': {
      const taken = moveCard(
        player,
        action.instanceId,
        'library',
        action.to,
        action.facedown ?? (action.to === 'library'),
        action.toTop,
        action.libraryPosition
      );
      nextPlayer =
        action.shuffle && action.to !== 'library'
          ? { ...taken, library: shuffleCards(taken.library, options?.random), libraryTopRevealedTo: [] }
          : taken;
      break;
    }
    case 'showHand':
      nextPlayer = { ...player, shownHandTo: action.viewerIds };
      break;
    case 'hideHand':
      nextPlayer = { ...player, shownHandTo: [] };
      break;
    case 'showHandCard': {
      if (!player.hand.some((card) => card.instanceId === action.instanceId)) return state;
      const rest = (player.shownHandCards || []).filter((item) => item.instanceId !== action.instanceId);
      nextPlayer = {
        ...player,
        shownHandCards: [...rest, { instanceId: action.instanceId, to: action.viewerIds }],
      };
      break;
    }
    case 'hideHandCard':
      nextPlayer = {
        ...player,
        shownHandCards: (player.shownHandCards || []).filter((item) => item.instanceId !== action.instanceId),
      };
      break;
    case 'revealLibraryTop':
      if (player.library.length === 0) return state;
      nextPlayer = { ...player, libraryTopRevealedTo: action.viewerIds };
      break;
    case 'hideLibraryTop':
      nextPlayer = { ...player, libraryTopRevealedTo: [] };
      break;
    case 'tap':
      nextPlayer = toggleTap(player, action.instanceIds?.length ? action.instanceIds : [action.instanceId]);
      break;
    case 'flip':
      nextPlayer = toggleFlip(player, action.instanceId, action.backImageUrl, action.backName, action.backTypeLine);
      break;
    case 'setPlaymatRow':
      nextPlayer = setPlaymatRow(player, action.instanceId, action.row);
      break;
    case 'setPlaymatPos':
      nextPlayer = setPlaymatPos(player, action.instanceIds, action.x, action.y, action.row);
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
    case 'setFacedown':
      nextPlayer = setCardFacedown(player, action.instanceId, action.facedown);
      break;
    case 'attachCard':
      return attachCardToHost(state, action);
    case 'setCounter':
      nextPlayer = setCardCounter(player, action.instanceId, action.counterId, action.delta);
      break;
    case 'addToken':
      nextPlayer = addTokens(player, action.card, action.quantity, {
        playmatX: action.playmatX,
        playmatY: action.playmatY,
        playmatRow: action.playmatRow,
      });
      break;
    case 'removeToken':
      nextPlayer = removeTokenCard(player, action.instanceId);
      break;
    case 'mill':
      nextPlayer = millCards(player, action.count);
      break;
    case 'scry':
      nextPlayer = applyLibraryLook(player, action.count, action.onTop, action.onBottom, 'bottom');
      break;
    case 'surveil':
      nextPlayer = applyLibraryLook(player, action.count, action.onTop, action.toGraveyard, 'graveyard');
      break;
    case 'reorderHand':
      nextPlayer = reorderHandCards(player, action.instanceId, action.toIndex);
      break;
    default:
      return state;
  }

  if (nextPlayer === rawPlayer) return state;
  return pruneOrphanAttachments(replacePlayer(state, pruneTokensOffBattlefield(nextPlayer)));
}

export function zoneCount(player: PlayerTableState, zone: ZoneName): number {
  return cardsOf(player, zone).length;
}

export function filterLibraryCards(cards: TableCard[], query: string): TableCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((card) => {
    const haystack = [card.name, card.oracleName, card.typeLine, card.manaCost, card.backName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function canSeeGraveOrExileFace(ownerId: string, card: Pick<TableCard, 'facedown'>, viewerId: string): boolean {
  if (!card.facedown) return true;
  return ownerId === viewerId;
}

export function filterPublicZoneCards(
  cards: TableCard[],
  query: string,
  ownerId: string,
  viewerId: string,
): TableCard[] {
  if (!query.trim()) return cards;
  return filterLibraryCards(
    cards.filter((card) => canSeeGraveOrExileFace(ownerId, card, viewerId)),
    query,
  );
}

function applyLibraryLook(
  player: PlayerTableState,
  count: number,
  onTopIds: string[],
  otherIds: string[],
  otherZone: 'bottom' | 'graveyard',
): PlayerTableState {
  const n = Math.min(Math.max(0, Math.floor(count)), player.library.length);
  if (n === 0) return player;
  const looked = player.library.slice(0, n);
  const rest = player.library.slice(n);
  const byId = new Map(looked.map((card) => [card.instanceId, card]));
  const used = new Set<string>();
  const take = (ids: string[]) => {
    const cards: TableCard[] = [];
    for (const id of ids) {
      const card = byId.get(id);
      if (!card || used.has(id)) continue;
      used.add(id);
      cards.push(card);
    }
    return cards;
  };
  const onTop = take(onTopIds);
  const other = take(otherIds);
  const leftover = looked.filter((card) => !used.has(card.instanceId));
  const top = [...onTop, ...leftover];
  if (otherZone === 'graveyard') {
    return {
      ...player,
      library: [...top, ...rest],
      graveyard: [...player.graveyard, ...other],
      libraryTopRevealedTo: [],
    };
  }
  return {
    ...player,
    library: [...top, ...rest, ...other],
    libraryTopRevealedTo: [],
  };
}

function addTokens(
  player: PlayerTableState,
  blueprint: TokenBlueprint,
  quantity?: number,
  playmat?: {
    playmatX?: number;
    playmatY?: number;
    playmatRow?: 'lands' | 'battlefield' | 'enchantments' | null;
  },
): PlayerTableState {
  const name = (blueprint?.name || '').trim();
  const scryfallId = (blueprint?.scryfallId || '').trim();
  if (!name || !scryfallId) return player;
  const qty = Math.min(12, Math.max(1, Math.trunc(quantity ?? 1)));
  const used = new Set(ZONE_NAMES.flatMap((zone) => cardsOf(player, zone).map((card) => card.instanceId)));
  const battlefield = [...player.battlefield];
  let serial = battlefield.filter((card) => card.isToken && card.scryfallId === scryfallId).length;
  for (let i = 0; i < qty; i++) {
    let instanceId = `${player.userId}-tok-${scryfallId}-${serial}`;
    while (used.has(instanceId)) {
      serial += 1;
      instanceId = `${player.userId}-tok-${scryfallId}-${serial}`;
    }
    used.add(instanceId);
    serial += 1;
    battlefield.push({
      instanceId,
      scryfallId,
      name,
      imageUrl: blueprint.imageUrl,
      backImageUrl: blueprint.backImageUrl,
      backName: blueprint.backName,
      manaCost: blueprint.manaCost,
      typeLine: blueprint.typeLine,
      cmc: blueprint.cmc,
      tapped: false,
      facedown: false,
      transformed: false,
      isToken: true,
      ownerUserId: player.userId,
      playmatX: playmat?.playmatX != null ? clampPlaymat(playmat.playmatX) : undefined,
      playmatY: playmat?.playmatY != null ? clampPlaymat(playmat.playmatY) : undefined,
      playmatRow: playmat?.playmatRow || undefined,
    });
  }
  return { ...player, battlefield };
}

function millCards(player: PlayerTableState, count: number): PlayerTableState {
  const n = Math.min(player.library.length, Math.max(0, Math.floor(count)));
  if (n <= 0) return player;
  const milled = player.library.slice(0, n).map((card) => ({
    ...card,
    facedown: false,
    tapped: false,
    attachedTo: undefined,
    playmatRow: undefined,
    playmatX: undefined,
    playmatY: undefined,
  }));
  return {
    ...player,
    library: player.library.slice(n),
    graveyard: [...player.graveyard, ...milled],
    libraryTopRevealedTo: [],
  };
}

function beginTurn(player: PlayerTableState): PlayerTableState {
  const battlefield = player.battlefield.map((card) => {
    if (!card.tapped) return card;
    if (isPlaymatLand(card) || isPlaymatCreature(card)) return { ...card, tapped: false };
    return card;
  });
  return drawOne({ ...player, battlefield });
}

export function isPlaymatCreature(
  card: Pick<TableCard, 'typeLine' | 'transformed' | 'backTypeLine'>,
): boolean {
  const face = visiblePlaymatTypeLine(card);
  return /\bcreature\b/i.test(face) || /\bcréature\b/i.test(face);
}

function removeTokenCard(player: PlayerTableState, instanceId: string): PlayerTableState {
  for (const zone of ZONE_NAMES) {
    const list = cardsOf(player, zone);
    const idx = list.findIndex((card) => card.instanceId === instanceId && card.isToken);
    if (idx >= 0) {
      return withZone(player, zone, [...list.slice(0, idx), ...list.slice(idx + 1)]);
    }
  }
  return player;
}

function setCardCounter(
  player: PlayerTableState,
  instanceId: string,
  counterId: string,
  delta: number,
): PlayerTableState {
  const zones: ZoneName[] = ['battlefield', 'hand', 'graveyard', 'exile', 'command'];
  for (const zone of zones) {
    const list = cardsOf(player, zone);
    const idx = list.findIndex((card) => card.instanceId === instanceId);
    if (idx < 0) continue;
    const card = list[idx];
    if (counterId.trim() === '*') {
      if (!card.counters || Object.keys(card.counters).length === 0) return player;
      return withZone(
        player,
        zone,
        list.map((item, i) => (i === idx ? { ...item, counters: undefined } : item)),
      );
    }
    const id = normalizeCounterId(counterId);
    const step = Math.trunc(delta);
    if (!id || !Number.isFinite(step) || step === 0) return player;
    const current = card.counters?.[id] ?? 0;
    const nextCount = current + step;
    if (nextCount <= 0 && current <= 0) return player;
    const counters = { ...(card.counters || {}) };
    if (nextCount <= 0) delete counters[id];
    else counters[id] = nextCount;
    const nextCard: TableCard = {
      ...card,
      counters: Object.keys(counters).length > 0 ? counters : undefined,
    };
    return withZone(
      player,
      zone,
      list.map((item, i) => (i === idx ? nextCard : item)),
    );
  }
  return player;
}

function setCardFacedown(player: PlayerTableState, instanceId: string, facedown: boolean): PlayerTableState {
  const zones: ZoneName[] = ['graveyard', 'exile'];
  for (const zone of zones) {
    const list = cardsOf(player, zone);
    const idx = list.findIndex((card) => card.instanceId === instanceId);
    if (idx >= 0) {
      return withZone(
        player,
        zone,
        list.map((card, i) => (i === idx ? { ...card, facedown } : card)),
      );
    }
  }
  return player;
}

export function visiblePlaymatTypeLine(card: Pick<TableCard, 'typeLine' | 'transformed' | 'backTypeLine'>): string {
  if (card.transformed) {
    if (card.backTypeLine) return card.backTypeLine.trim();
    const faces = (card.typeLine || '').split('//').map((part) => part.trim()).filter(Boolean);
    if (faces[1]) return faces[1];
  }
  return (card.typeLine || '').split('//')[0].trim();
}

function visiblePlaymatName(card: Pick<TableCard, 'name' | 'transformed' | 'backName'>): string {
  if (card.transformed && card.backName) return card.backName.split('//')[0].trim();
  return (card.name || '').split('//')[0].trim();
}

export function isPlaymatLand(
  card: Pick<TableCard, 'name' | 'typeLine' | 'transformed' | 'backName' | 'backTypeLine' | 'playmatRow'>,
): boolean {
  if (card.playmatRow === 'lands') return true;
  if (card.playmatRow === 'battlefield' || card.playmatRow === 'enchantments') return false;
  const face = visiblePlaymatTypeLine(card);
  if (/\bland\b/i.test(face) || /\bterrain\b/i.test(face)) return true;
  const faceName = visiblePlaymatName(card)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    faceName === 'plains' ||
    faceName === 'plaines' ||
    faceName === 'island' ||
    faceName === 'ile' ||
    faceName === 'swamp' ||
    faceName === 'marais' ||
    faceName === 'mountain' ||
    faceName === 'montagne' ||
    faceName === 'forest' ||
    faceName === 'foret' ||
    faceName === 'wastes' ||
    faceName === 'etendues desolees'
  );
}

export function isPlaymatEnchantment(
  card: Pick<TableCard, 'name' | 'typeLine' | 'transformed' | 'backName' | 'backTypeLine' | 'playmatRow'>,
): boolean {
  if (card.playmatRow === 'enchantments') return true;
  if (card.playmatRow === 'lands' || card.playmatRow === 'battlefield') return false;
  if (isPlaymatLand(card)) return false;
  const face = visiblePlaymatTypeLine(card);
  if (!/\benchantment\b/i.test(face) && !/\benchantement\b/i.test(face)) return false;
  if (/\bcreature\b/i.test(face) || /\bcréature\b/i.test(face)) return false;
  return true;
}

export function isPlaymatAttachable(card: Pick<TableCard, 'typeLine'>): boolean {
  const firstFace = (card.typeLine || '').split('//')[0].trim();
  return /\baura\b/i.test(firstFace) || /\bequipment\b/i.test(firstFace) || /\béquipement\b/i.test(firstFace);
}

export function tableBattlefieldCards(players: PlayerTableState[]): TableCard[] {
  return players.flatMap((player) => player.battlefield);
}

export function attachmentsOn(hostId: string, battlefield: TableCard[]): TableCard[] {
  return battlefield.filter((card) => card.attachedTo === hostId);
}

export function isAttachHostCandidate(card: TableCard, attachingId: string): boolean {
  if (card.instanceId === attachingId) return false;
  if (card.attachedTo) return false;
  return true;
}

function findCardZone(player: PlayerTableState, instanceId: string): ZoneName | undefined {
  return ZONE_NAMES.find((zone) => cardsOf(player, zone).some((card) => card.instanceId === instanceId));
}

function setAttachedTo(player: PlayerTableState, instanceId: string, hostInstanceId: string | undefined): PlayerTableState {
  return {
    ...player,
    battlefield: player.battlefield.map((card) =>
      card.instanceId === instanceId ? { ...card, attachedTo: hostInstanceId } : card,
    ),
  };
}

function pruneTokensOffBattlefield(player: PlayerTableState): PlayerTableState {
  let next = player;
  for (const zone of ZONE_NAMES) {
    if (zone === 'battlefield') continue;
    const list = cardsOf(next, zone);
    const kept = list.filter((card) => !card.isToken);
    if (kept.length !== list.length) next = withZone(next, zone, kept);
  }
  return next;
}

function pruneOrphanAttachments(state: MatchState): MatchState {
  const ids = new Set(tableBattlefieldCards(state.players).map((card) => card.instanceId));
  let changed = false;
  const players = state.players.map((player) => {
    let playerChanged = false;
    const battlefield = player.battlefield.map((card) => {
      if (card.attachedTo && !ids.has(card.attachedTo)) {
        playerChanged = true;
        changed = true;
        return { ...card, attachedTo: undefined };
      }
      return card;
    });
    return playerChanged ? { ...player, battlefield } : player;
  });
  return changed ? { ...state, players } : state;
}

function attachCardToHost(
  state: MatchState,
  action: Extract<PlayAction, { type: 'attachCard' }>,
): MatchState {
  const found = findPlayer(state, action.userId);
  if (!found) return state;
  const player = pruneTokensOffBattlefield(found);
  const zone = findCardZone(player, action.instanceId);
  if (!zone) return state;

  if (action.hostInstanceId) {
    const host = tableBattlefieldCards(state.players).find((card) => card.instanceId === action.hostInstanceId);
    if (!host || !isAttachHostCandidate(host, action.instanceId)) return state;
  } else if (zone !== 'battlefield') {
    return state;
  }

  let nextPlayer = player;
  if (zone !== 'battlefield') {
    nextPlayer = moveCard(player, action.instanceId, zone, 'battlefield');
  }
  nextPlayer = setAttachedTo(nextPlayer, action.instanceId, action.hostInstanceId || undefined);
  return pruneOrphanAttachments(replacePlayer(state, pruneTokensOffBattlefield(nextPlayer)));
}

export function splitBattlefield(cards: TableCard[]): {
  lands: TableCard[];
  enchantments: TableCard[];
  other: TableCard[];
} {
  const lands: TableCard[] = [];
  const enchantments: TableCard[] = [];
  const other: TableCard[] = [];
  for (const card of cards) {
    if (card.attachedTo) continue;
    if (isPlaymatLand(card)) lands.push(card);
    else if (isPlaymatEnchantment(card)) enchantments.push(card);
    else other.push(card);
  }
  return { lands, enchantments, other };
}

export function tokenStackKey(card: TableCard): string {
  if (!card.isToken || card.attachedTo) return `id:${card.instanceId}`;
  const counters = Object.entries(card.counters || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => `${id}:${count}`)
    .join(',');
  const cell = tokenStackCell(card.playmatX, card.playmatY);
  return `tok:${card.scryfallId}:${card.tapped ? 1 : 0}:${card.facedown ? 1 : 0}:${card.playmatRow || ''}:${counters}:${cell}`;
}

export function groupPlaymatCards(cards: TableCard[]): Array<{ lead: TableCard; members: TableCard[] }> {
  const groups: Array<{ lead: TableCard; members: TableCard[] }> = [];
  const index = new Map<string, number>();
  for (const card of cards) {
    const key = tokenStackKey(card);
    const existing = index.get(key);
    if (existing != null && key.startsWith('tok:')) {
      groups[existing].members.push(card);
    } else {
      index.set(key, groups.length);
      groups.push({ lead: card, members: [card] });
    }
  }
  return groups;
}

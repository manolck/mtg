import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import type { PlayerTableState, RevealAudience, TableCard, TokenBlueprint, ZoneName } from '../../types/play';
import { REVEAL_ALL, ZONE_LABELS } from '../../types/play';
import {
  isDoubleFacedCard,
  visibleCardFace,
  canSeeHandCard,
  canSeeLibraryTop,
  attachmentsOn,
  isAttachHostCandidate,
  isPlaymatAttachable,
  tableBattlefieldCards,
  isHandCardChosen,
  groupPlaymatCards,
  offsetOffTokenStack,
  tokenStackCell,
  deckOwnerId,
} from '../../utils/playTable';
import { playDropAt } from '../../utils/playDrop';
import { CardLightbox } from '../Card/CardLightbox';
import { CardHoverPreview } from '../Card/CardHoverPreview';
import { PlayCard, MTG_CARD_BACK_URL } from './PlayCard';
import { LifeVial } from './LifeVial';
import './playerBar.css';
import { CounterPicker } from './CounterPicker';
import { LibrarySearchPanel } from './LibrarySearchPanel';
import { LibraryLookPanel, type LibraryLookMode } from './LibraryLookPanel';
import { TokenSearchPanel } from './TokenSearchPanel';
import { ZoneBrowsePanel } from './ZoneBrowsePanel';
import { useDfcFaces } from '../../hooks/useDfcFaces';
import { useLocalizedTableFaces } from '../../hooks/useLocalizedTableFaces';
import { useProfile } from '../../hooks/useProfile';
import { applyLocalizedTableCard } from '../../utils/localizedTableFaces';

interface PlayerBoardProps {
  player: PlayerTableState;
  isSelf: boolean;
  isTurn: boolean;
  /** Temporary: act on this board even when it is not yours. */
  controlOpponents?: boolean;
  compact?: boolean;
  /** Orient the playmat like sitting at this seat (lands at the bottom). */
  seatHome?: boolean;
  /** Nombre de plateaux visibles, pour la taille de la main. */
  visibleSeats?: number;
  /** PV de départ (20 ou 40) pour la fiole de vie. */
  startingLife?: number;
  /** Nom du deck choisi, affiché sur le HUD. */
  deckName?: string;
  viewerId: string;
  opponents?: Array<{ userId: string; displayName?: string }>;
  onDraw?: () => void;
  onShuffle?: () => void;
  onMulligan?: () => void;
  onPassTurn?: () => void;
  onLife?: (delta: number) => void;
  onPoison?: (delta: number) => void;
  onMove?: (
    instanceId: string,
    from: ZoneName,
    to: ZoneName,
    options?: {
      toTop?: boolean;
      libraryPosition?: number;
      facedown?: boolean;
      playmatX?: number;
      playmatY?: number;
      playmatRow?: 'lands' | 'battlefield' | 'enchantments' | null;
    },
  ) => void;
  onSearchLibrary?: (
    instanceId: string,
    to: ZoneName,
    options?: { toTop?: boolean; libraryPosition?: number; shuffle?: boolean; facedown?: boolean },
  ) => void;
  onTap?: (instanceId: string, instanceIds?: string[]) => void;
  onFlip?: (instanceId: string, faces?: { backImageUrl?: string; backName?: string; backTypeLine?: string }) => void;
  onShowHand?: (viewerIds: RevealAudience) => void;
  onHideHand?: () => void;
  onShowHandCard?: (instanceId: string, viewerIds: RevealAudience) => void;
  onHideHandCard?: (instanceId: string) => void;
  onRevealLibraryTop?: (viewerIds: RevealAudience) => void;
  onHideLibraryTop?: () => void;
  tablePlayers?: PlayerTableState[];
  attachPickId?: string | null;
  onStartAttach?: (instanceId: string) => void;
  onPickAttachHost?: (hostInstanceId: string) => void;
  onDetach?: (instanceId: string) => void;
  onSetFacedown?: (instanceId: string, facedown: boolean) => void;
  onSetCounter?: (instanceId: string, counterId: string, delta: number) => void;
  onSetPlaymatRow?: (instanceId: string, row: 'lands' | 'battlefield' | 'enchantments' | null) => void;
  onSetPlaymatPos?: (
    instanceIds: string[],
    x: number,
    y: number,
    row?: 'lands' | 'battlefield' | 'enchantments' | null,
  ) => void | Promise<unknown>;
  onAddToken?: (card: TokenBlueprint, quantity: number) => void;
  onRemoveToken?: (instanceId: string) => void;
  onScry?: (count: number, onTop: string[], onBottom: string[]) => void;
  onSurveil?: (count: number, onTop: string[], toGraveyard: string[]) => void;
  onMill?: (count: number) => void;
  onReorderHand?: (instanceId: string, toIndex: number) => void;
  onTransferCard?: (
    instanceId: string,
    from: ZoneName,
    toUserId: string,
    to: ZoneName,
    options?: {
      playmatX?: number;
      playmatY?: number;
      playmatRow?: 'lands' | 'battlefield' | 'enchantments' | null;
    },
  ) => void;
  onToggleHandChoice?: (instanceId: string) => void;
  onClearHandChoices?: () => void;
}

type MenuView = 'root' | 'showHand' | 'showCard' | 'revealTop' | 'libraryPos' | 'libraryDrop' | 'sendTo' | 'mill';

interface MenuState {
  card: TableCard | null;
  from: ZoneName | 'libraryPile';
  x: number;
  y: number;
  view: MenuView;
  libraryN: string;
  libraryReturn?: 'sendTo' | 'libraryDrop';
}

function primaryMove(from: ZoneName): ZoneName | null {
  if (from === 'hand' || from === 'command') return 'battlefield';
  if (from === 'battlefield') return 'graveyard';
  if (from === 'graveyard') return 'battlefield';
  if (from === 'exile') return 'battlefield';
  return null;
}

const CARD_ASPECT = 88 / 63;

type MatTheme = 'battlefield' | 'enchant' | 'terrain';

const MAT_THEMES: Array<{ id: MatTheme; label: string; swatch: string; className: string }> = [
  {
    id: 'battlefield',
    label: 'Champ de bataille',
    swatch: 'linear-gradient(160deg, var(--battlefield-a), var(--battlefield-c))',
    className: 'zone--battlefield',
  },
  {
    id: 'enchant',
    label: 'Enchantements',
    swatch: 'linear-gradient(160deg, var(--ench-a), var(--ench-c))',
    className: 'zone--enchant',
  },
  {
    id: 'terrain',
    label: 'Terrains',
    swatch: 'linear-gradient(160deg, var(--terrain-a), var(--terrain-c))',
    className: 'zone--terrain',
  },
];


function cardWidthForSpace(
  width: number,
  height: number,
  kind: 'play' | 'hand',
  compact = false,
): number {
  if (width < 32 || height < 32) return 0;
  const widthDiv = kind === 'hand' ? (compact ? 4.4 : 5.5) : compact ? 5.4 : 6.8;
  const heightFrac = kind === 'hand' ? (compact ? 0.48 : 0.36) : compact ? 0.42 : 0.3;
  const byWidth = width / widthDiv;
  const byHeight = (height * heightFrac) / CARD_ASPECT;
  const min = compact ? (kind === 'hand' ? 26 : 24) : kind === 'hand' ? 44 : 40;
  const max = compact ? (kind === 'hand' ? 72 : 64) : kind === 'hand' ? 160 : 140;
  return Math.round(Math.max(min, Math.min(max, byWidth, byHeight)));
}

export function PlayerBoard({
  player,
  isSelf,
  isTurn,
  controlOpponents = false,
  compact = false,
  seatHome = false,
  visibleSeats = 2,
  startingLife = 20,
  deckName: _deckName,
  viewerId,
  opponents = [],
  onDraw,
  onShuffle,
  onMulligan,
  onPassTurn,
  onLife,
  onPoison,
  onMove,
  onSearchLibrary,
  onTap,
  onFlip,
  onShowHand,
  onHideHand,
  onShowHandCard,
  onHideHandCard,
  onRevealLibraryTop,
  onHideLibraryTop,
  tablePlayers = [],
  attachPickId = null,
  onStartAttach,
  onPickAttachHost,
  onDetach,
  onSetFacedown,
  onSetCounter,
  onSetPlaymatPos,
  onAddToken,
  onRemoveToken,
  onScry,
  onSurveil,
  onMill,
  onReorderHand,
  onTransferCard,
  onToggleHandChoice,
  onClearHandChoices,
}: PlayerBoardProps) {
  const [lightbox, setLightbox] = useState<TableCard | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [hover, setHover] = useState<{ card: TableCard; rect: DOMRect } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [lookMode, setLookMode] = useState<LibraryLookMode | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [browseZone, setBrowseZone] = useState<'graveyard' | 'exile' | null>(null);
  const [counterCardId, setCounterCardId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [matTheme, setMatTheme] = useState<MatTheme>('battlefield');
  const skipClickRef = useRef(false);
  const handFanRef = useRef<HTMLDivElement | null>(null);
  const playmatRef = useRef<HTMLDivElement | null>(null);
  const [playmatBox, setPlaymatBox] = useState({ width: 0, height: 0 });
  const homeMat = isSelf || seatHome;
  const canControl = isSelf || controlOpponents;
  const canUseLibrary = canControl && (isSelf ? isTurn : true);
  const rawPlayPx = cardWidthForSpace(playmatBox.width, playmatBox.height, 'play', compact) || 0;
  // Keep 3 right piles (LIB/CIM/EXL) + Fin de tour inside the board height.
  const rightDockChrome = (homeMat ? 48 : 8) + 3 * 12 + 20;
  const pileStackCap =
    playmatBox.height > 96
      ? Math.floor((playmatBox.height - rightDockChrome) / (3 * CARD_ASPECT))
      : rawPlayPx;
  const playCardPx = rawPlayPx
    ? Math.max(22, Math.min(rawPlayPx, pileStackCap || rawPlayPx))
    : undefined;
  const handCardPx = cardWidthForSpace(playmatBox.width, playmatBox.height, 'hand', compact) || undefined;

  useEffect(() => {
    const el = playmatRef.current;
    if (!el) return;
    const apply = () => {
      setPlaymatBox({ width: el.clientWidth, height: el.clientHeight });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleSeats, compact]);
  const boardCards = useMemo(
    () => player.battlefield.filter((card) => !card.attachedTo),
    [player.battlefield],
  );
  const allBattlefield = useMemo(
    () => tableBattlefieldCards(tablePlayers.length ? tablePlayers : [player]),
    [tablePlayers, player],
  );
  const dfcIds = useMemo(
    () => {
      const local = [...player.hand, ...player.battlefield, ...player.graveyard, ...player.exile, ...player.command, ...player.library];
      const extra = allBattlefield.filter((card) => !local.some((item) => item.instanceId === card.instanceId));
      return [...local, ...extra].map((card) => card.scryfallId);
    },
    [player, allBattlefield],
  );
  const dfcFaces = useDfcFaces(dfcIds);
  const { profile } = useProfile();
  const preferFrench = profile?.preferredLanguage === 'fr';
  const localizedIds = useMemo(() => {
    const visible = [
      ...player.hand,
      ...player.battlefield,
      ...player.graveyard,
      ...player.exile,
      ...player.command,
      ...player.library,
    ];
    const extra = allBattlefield.filter((card) => !visible.some((item) => item.instanceId === card.instanceId));
    return [...visible, ...extra].map((card) => card.scryfallId);
  }, [player, allBattlefield]);
  const localizedFaces = useLocalizedTableFaces(localizedIds, preferFrench);

  const counterCard = useMemo(() => {
    if (!counterCardId) return null;
    const zones: ZoneName[] = ['battlefield', 'hand', 'graveyard', 'exile', 'command'];
    for (const zone of zones) {
      const found = player[zone].find((card) => card.instanceId === counterCardId);
      if (found) return found;
    }
    const extra = allBattlefield.find((card) => card.instanceId === counterCardId);
    return extra || null;
  }, [counterCardId, player, allBattlefield]);

  useEffect(() => {
    if (counterCardId && !counterCard) setCounterCardId(null);
  }, [counterCardId, counterCard]);

  const resolveCard = (card: TableCard): TableCard => {
    const extra = dfcFaces.get(card.scryfallId);
    const loc = localizedFaces.get(card.scryfallId);
    return applyLocalizedTableCard(
      {
        ...card,
        backImageUrl: card.backImageUrl || extra?.backImageUrl,
        backName: card.backName || extra?.backName,
        backTypeLine: card.backTypeLine || extra?.backTypeLine,
      },
      loc,
    );
  };

  const flipCard = (card: TableCard) => {
    const resolved = resolveCard(card);
    if (!isDoubleFacedCard(resolved)) return;
    onFlip?.(resolved.instanceId, {
      backImageUrl: resolved.backImageUrl,
      backName: resolved.backName,
      backTypeLine: resolved.backTypeLine,
    });
  };

  useEffect(() => {
    if (isTurn) return;
    setLibraryOpen(false);
    setLookMode(null);
  }, [isTurn]);

  useEffect(() => {
    if (!isSelf) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'd' || event.key === 'D') {
        if (!isTurn) return;
        event.preventDefault();
        onDraw?.();
      } else if (event.key === '/' || event.key === 'f' || event.key === 'F') {
        if (!isTurn) return;
        event.preventDefault();
        setLibraryOpen(true);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        onLife?.(event.shiftKey ? 5 : 1);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        onLife?.(event.shiftKey ? -5 : -1);
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onPassTurn?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSelf, isTurn, onDraw, onLife, onPassTurn]);

  const showFace = (zone: ZoneName, card: TableCard) => {
    if (zone === 'graveyard' || zone === 'exile') {
      return !card.facedown || canControl || player.userId === viewerId;
    }
    if (card.facedown) return false;
    if (zone === 'battlefield' || zone === 'command') return true;
    if (zone === 'hand') return canControl || canSeeHandCard(player, card, viewerId);
    if (zone === 'library') return canControl || canSeeLibraryTop(player, viewerId);
    return false;
  };

  const openMenu = (event: MouseEvent, card: TableCard | null, from: ZoneName | 'libraryPile') => {
    event.preventDefault();
    event.stopPropagation();
    setHover(null);
    const pad = 8;
    const width = 252;
    const maxH = Math.min(380, window.innerHeight - pad * 2);
    const x = Math.min(event.clientX, window.innerWidth - width - pad);
    const y = Math.min(event.clientY, window.innerHeight - maxH - pad);
    setMenu({
      card,
      from,
      x: Math.max(pad, x),
      y: Math.max(pad, y),
      view: !card && from === 'hand' ? 'showHand' : 'root',
      libraryN: '2',
    });
  };

  const cardOnThisBoard = (card: TableCard) =>
    player.battlefield.some((item) => item.instanceId === card.instanceId) ||
    player.hand.some((item) => item.instanceId === card.instanceId) ||
    player.command.some((item) => item.instanceId === card.instanceId) ||
    player.graveyard.some((item) => item.instanceId === card.instanceId) ||
    player.exile.some((item) => item.instanceId === card.instanceId);

  /** Board controller treats every card here as their own. */
  const canActOn = (card: TableCard) => canControl && cardOnThisBoard(card);
  /** Owner can still drag their card home from an opponent board. */
  const canRetrieveCard = (card: TableCard) =>
    Boolean(viewerId) &&
    player.userId !== viewerId &&
    cardOnThisBoard(card) &&
    deckOwnerId(card) === viewerId;
  const canDragCard = (card: TableCard) => canActOn(card) || canRetrieveCard(card);

  const stackFor = (card: TableCard) => {
    const groups = groupPlaymatCards(player.battlefield.filter((item) => !item.attachedTo));
    return groups.find((group) => group.members.some((item) => item.instanceId === card.instanceId))?.members || [card];
  };

  const handInsertIndex = (clientX: number, clientY: number, draggedId: string): number | null => {
    const fan = handFanRef.current;
    if (!fan) return null;
    const fanRect = fan.getBoundingClientRect();
    const padY = 28;
    const padX = 24;
    if (clientY < fanRect.top - padY || clientY > fanRect.bottom + padY) return null;
    if (clientX < fanRect.left - padX || clientX > fanRect.right + padX) return null;
    const others = [...fan.querySelectorAll<HTMLElement>('[data-hand-card]')].filter(
      (el) => el.dataset.handCard !== draggedId,
    );
    let insertAt = others.length;
    for (let i = 0; i < others.length; i += 1) {
      const rect = others[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        insertAt = i;
        break;
      }
    }
    return insertAt;
  };

  const dropCard = (card: TableCard, from: ZoneName, clientX: number, clientY: number, splitOne = false) => {
    const retrieving = canRetrieveCard(card);
    const stack = from === 'battlefield' && !retrieving ? stackFor(card) : [card];
    const members = splitOne && from === 'battlefield' && !retrieving ? [card] : stack;

    const drop = playDropAt(
      clientX,
      clientY,
      members.map((item) => item.instanceId),
    );
    const targetBoard = drop?.boardUserId || player.userId;
    const crossBoard = Boolean(drop && targetBoard !== player.userId);

    const transferCross = (zone: ZoneName, options?: { playmatX?: number; playmatY?: number; playmatRow?: 'lands' | 'battlefield' | 'enchantments' | null }) => {
      if (retrieving) {
        if (targetBoard !== viewerId) return false;
        onTransferCard?.(card.instanceId, from, targetBoard, zone, options);
        return true;
      }
      if (!canActOn(card)) return false;
      for (const member of members) {
        onTransferCard?.(member.instanceId, from, targetBoard, zone, options);
      }
      return true;
    };

    if (drop && (drop.zone === 'library' || drop.zone === 'graveyard' || drop.zone === 'exile' || drop.zone === 'command')) {
      if (from === drop.zone && members.length === 1 && !crossBoard) return false;
      if (crossBoard) return transferCross(drop.zone);
      if (retrieving) return false;
      if (drop.zone === 'library') {
        const pad = 8;
        const width = 252;
        setMenu({
          card,
          from,
          x: Math.max(pad, Math.min(clientX, window.innerWidth - width - pad)),
          y: Math.max(pad, Math.min(clientY, window.innerHeight - 220)),
          view: 'libraryDrop',
          libraryN: '2',
        });
        return true;
      }
      for (const member of members) {
        onMove?.(member.instanceId, from, drop.zone);
      }
      return true;
    }

    if (drop?.zone === 'battlefield' && drop.x != null && drop.y != null) {
      if (crossBoard) {
        return transferCross('battlefield', {
          playmatX: drop.x,
          playmatY: drop.y,
          playmatRow: 'battlefield',
        });
      }
      if (retrieving) return false;
      const target = drop.cardId
        ? player.battlefield.find((item) => item.instanceId === drop.cardId)
        : undefined;
      const stackTarget =
        Boolean(card.isToken && target?.isToken && target.scryfallId === card.scryfallId) && target
          ? stackFor(target).filter((item) => item.instanceId !== card.instanceId)
          : [];
      let x = stackTarget[0]?.playmatX ?? drop.x;
      let y = stackTarget[0]?.playmatY ?? drop.y;
      if (splitOne && from === 'battlefield' && stackTarget.length === 0) {
        const origin = stack.find((item) => item.instanceId !== card.instanceId);
        if (origin?.playmatX != null && origin.playmatY != null) {
          if (tokenStackCell(origin.playmatX, origin.playmatY) === tokenStackCell(x, y)) {
            const nudged = offsetOffTokenStack(origin.playmatX, origin.playmatY, x, y);
            x = nudged.x;
            y = nudged.y;
          }
        }
      }
      const ids = [...new Set([...members, ...stackTarget].map((item) => item.instanceId))];
      if (from === 'hand' || from === 'command' || from === 'graveyard' || from === 'exile') {
        const played = onMove?.(card.instanceId, from, 'battlefield', {
          playmatX: x,
          playmatY: y,
          playmatRow: 'battlefield',
        });
        if (stackTarget.length > 0) {
          void Promise.resolve(played).then(() => {
            onSetPlaymatPos?.(ids, x, y, 'battlefield');
          });
        }
        return true;
      }
      if (from === 'battlefield') {
        onSetPlaymatPos?.(ids, x, y, 'battlefield');
        return true;
      }
    }

    if (from === 'hand' && canActOn(card)) {
      const insertAt = handInsertIndex(clientX, clientY, card.instanceId);
      if (insertAt != null) {
        onReorderHand?.(card.instanceId, insertAt);
        return true;
      }
    }
    return false;
  };

  const onCardPointerDown = (event: PointerEvent<HTMLElement>, card: TableCard, from: ZoneName) => {
    if (!canDragCard(card) || event.button !== 0 || event.shiftKey) return;
    if (attachPickId) return;
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    const splitOne = event.altKey || event.ctrlKey || event.metaKey;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const onMovePtr = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 8 && !moved) return;
      moved = true;
      setHover(null);
      setDragId(card.instanceId);
      setDragPos({ x: moveEvent.clientX, y: moveEvent.clientY });
    };
    const onUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', onMovePtr);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      try {
        if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      setDragId(null);
      setDragPos(null);
      if (!moved) return;
      skipClickRef.current = true;
      window.setTimeout(() => {
        skipClickRef.current = false;
      }, 0);
      dropCard(
        card,
        from,
        upEvent.clientX,
        upEvent.clientY,
        splitOne || upEvent.altKey || upEvent.ctrlKey || upEvent.metaKey,
      );
    };
    window.addEventListener('pointermove', onMovePtr);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleCardClick = (_event: MouseEvent, card: TableCard, zone: ZoneName) => {
    if (skipClickRef.current) return;
    if (attachPickId && zone === 'battlefield') {
      if (isAttachHostCandidate(card, attachPickId)) onPickAttachHost?.(card.instanceId);
    }
  };

  const setCardHover = (event: MouseEvent<HTMLButtonElement>, card: TableCard, zone: ZoneName) => {
    if (dragId) {
      setHover(null);
      return;
    }
    const resolved = resolveCard(card);
    if (!showFace(zone, resolved)) {
      setHover(null);
      return;
    }
    const face = visibleCardFace(resolved);
    if (!face.imageUrl) {
      setHover(null);
      return;
    }
    setHover({ card: { ...resolved, imageUrl: face.imageUrl, name: face.name }, rect: event.currentTarget.getBoundingClientRect() });
  };

  const renderOne = (
    zone: ZoneName,
    card: TableCard,
    size: 'sm' | 'md' | 'lg',
    extraClass = '',
    widthPx?: number,
    extraStyle?: CSSProperties,
    stackCount = 1,
  ) => {
    const resolved = resolveCard(card);
    const pickingHost = Boolean(attachPickId && zone === 'battlefield' && isAttachHostCandidate(resolved, attachPickId));
    const chosen = zone === 'hand' && isHandCardChosen(player, resolved.instanceId);
    return (
      <PlayCard
        key={card.instanceId}
        card={resolved}
        hideFace={!showFace(zone, resolved)}
        size={size}
        widthPx={widthPx}
        style={extraStyle}
        chosen={chosen}
        title={
          !canControl && zone === 'hand'
            ? chosen
              ? 'Clic droit : retirer du choix'
              : 'Clic droit : choisir cette carte'
            : canControl && zone === 'hand'
              ? 'Glisser pour trier · déposer sur le plateau pour jouer'
              : canControl && zone === 'battlefield' && stackCount > 1
              ? 'Glisser : déplacer la pile · Alt : séparer un jeton'
              : canControl && (zone === 'battlefield' || zone === 'command')
                ? 'Glisser pour déplacer'
                : undefined
        }
        className={`${extraClass} ${pickingHost ? 'ring-2 ring-amber-300' : ''} ${
          dragId === card.instanceId ? 'opacity-60 ring-2 ring-amber-300' : ''
        }`.trim()}
        canTransform={Boolean(canActOn(resolved) && isDoubleFacedCard(resolved))}
        stackCount={stackCount}
        onTransform={() => flipCard(resolved)}
        onClick={(event) => handleCardClick(event, resolved, zone)}
        onContextMenu={(event) => {
          if (canActOn(resolved)) {
            openMenu(event, resolved, zone);
            return;
          }
          event.preventDefault();
          if (zone === 'hand' && !canControl) onToggleHandChoice?.(resolved.instanceId);
        }}
        onMouseEnter={(event) => setCardHover(event, resolved, zone)}
        onMouseLeave={() => setHover(null)}
        onCounterDelta={
          canActOn(resolved) && zone !== 'library'
            ? (counterId, delta) => onSetCounter?.(resolved.instanceId, counterId, delta)
            : undefined
        }
        onOpenCounters={
          canActOn(resolved) && zone !== 'library' ? () => setCounterCardId(resolved.instanceId) : undefined
        }
      />
    );
  };

  const renderPlaymatGroup = (
    group: { lead: TableCard; members: TableCard[] },
    size: 'sm' | 'md' | 'lg',
    widthPx?: number,
    extraStyle?: CSSProperties,
  ) => {
    const attached = attachmentsOn(group.lead.instanceId, allBattlefield);
    const peek = widthPx
      ? Math.round(widthPx * CARD_ASPECT * 0.22)
      : size === 'sm'
        ? 19
        : size === 'lg'
          ? 26
          : 22;
    const dragging = Boolean(dragId && group.members.some((item) => item.instanceId === dragId));
    const card = renderOne(
      'battlefield',
      group.lead,
      size,
      dragging ? 'ring-2 ring-amber-300 shadow-2xl' : '',
      widthPx,
      undefined,
      group.members.length,
    );
    return (
      <div
        key={group.lead.instanceId}
        data-play-card-id={group.lead.instanceId}
        className={`relative shrink-0 ${canDragCard(group.lead) ? 'touch-none' : ''} ${dragging ? 'z-30' : ''}`}
        style={extraStyle}
        onPointerDown={
          canDragCard(group.lead)
            ? (event) => onCardPointerDown(event, group.lead, 'battlefield')
            : undefined
        }
      >
        {attached.length === 0 ? (
          card
        ) : (
          <div className="relative shrink-0" style={{ paddingTop: attached.length * peek }}>
            {attached.map((item, attachIndex) => (
              <div
                key={item.instanceId}
                className="absolute left-1/2 -translate-x-1/2"
                style={{ top: attachIndex * peek, zIndex: attachIndex }}
              >
                {renderOne('battlefield', item, size, '', widthPx)}
              </div>
            ))}
            <div className="relative" style={{ zIndex: attached.length + 1 }}>
              {card}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPlaymatArea = (
    row: 'lands' | 'battlefield' | 'enchantments',
    cards: TableCard[],
    size: 'sm' | 'md' | 'lg',
    empty: string,
    emptyClass: string,
  ) => {
    const groups = groupPlaymatCards(cards);
    const flow = groups.filter((group) => group.lead.playmatX == null || group.lead.playmatY == null);
    const placed = groups.filter((group) => group.lead.playmatX != null && group.lead.playmatY != null);
    const widthPx =
      size === 'sm' ? (playCardPx ? Math.round(playCardPx * 0.78) : undefined) : playCardPx;
    return (
      <div
        className="relative flex-1 min-h-0 min-w-0"
        data-play-drop="battlefield"
        data-play-board-user-id={player.userId}
      >
        <div className="absolute inset-0 overflow-auto flex items-center justify-center py-0.5">
          {flow.length === 0 && placed.length === 0 ? (
            <p className={`text-center italic py-2 pointer-events-none ${emptyClass}`}>{empty}</p>
          ) : (
            <div className="flex flex-wrap items-end gap-1">
              {flow.map((group) => renderPlaymatGroup(group, size, widthPx))}
            </div>
          )}
        </div>
        {placed.map((group) =>
          renderPlaymatGroup(group, size, widthPx, {
            position: 'absolute',
            left: `${group.lead.playmatX}%`,
            top: `${group.lead.playmatY}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: dragId && group.members.some((item) => item.instanceId === dragId) ? 40 : 10,
          }),
        )}
      </div>
    );
  };

  const pile = (zone: 'library' | 'graveyard' | 'exile' | 'command') => {
    const cards = player[zone];
    const top = zone === 'library' ? cards[0] : cards[cards.length - 1];
    const resolvedTop = top ? resolveCard(top) : undefined;
    const canSeeTop =
      zone === 'library'
        ? Boolean(resolvedTop && canSeeLibraryTop(player, viewerId))
        : Boolean(resolvedTop && showFace(zone, resolvedTop));
    const topFace = resolvedTop ? visibleCardFace(resolvedTop) : undefined;
    const widthPx = playCardPx;
    const sizeClass = widthPx ? '' : 'w-[4.2rem] sm:w-[5.4rem]';
    const shortLabel =
      zone === 'command' ? 'CMD' : zone === 'library' ? 'LIB' : zone === 'graveyard' ? 'CIM' : 'EXL';
    const count = cards.length;
    const revealed = zone === 'library' && canSeeLibraryTop(player, viewerId);
    const hiddenInPile = (zone === 'graveyard' || zone === 'exile') && cards.some((card) => card.facedown);
    const dropHint =
      zone === 'library'
        ? ' · glisser une carte : choisir la position'
        : ' · glisser une carte ici';
    return (
      <div
        className="flex flex-col items-center gap-0.5 min-w-0"
        style={widthPx ? { width: widthPx } : undefined}
        data-play-drop={zone}
        data-play-board-user-id={player.userId}
      >
        <p className="text-[8px] sm:text-[9px] font-semibold tracking-[0.06em] text-[var(--gold-1)] uppercase leading-none truncate w-full text-center">
          {shortLabel}
          {revealed ? ' · 👁' : ''}
          {hiddenInPile ? ' · 🂠' : ''}
        </p>
        <button
          type="button"
          data-play-drop={zone}
          data-play-board-user-id={player.userId}
          onPointerDown={
            canControl && resolvedTop && zone !== 'library'
              ? (event) => onCardPointerDown(event, resolvedTop, zone)
              : undefined
          }
          onContextMenu={(event) => {
            if (zone === 'library') {
              if (canUseLibrary) openMenu(event, resolvedTop || null, 'libraryPile');
              else event.preventDefault();
              return;
            }
            if (zone === 'graveyard' || zone === 'exile') {
              event.preventDefault();
              event.stopPropagation();
              setBrowseZone(zone);
              return;
            }
            if (canControl && top) openMenu(event, resolveCard(top), zone);
            else event.preventDefault();
          }}
          onMouseEnter={(event) => {
            if (!canSeeTop || !resolvedTop) {
              setHover(null);
              return;
            }
            setCardHover(event, resolvedTop, zone);
          }}
          onMouseLeave={() => setHover(null)}
          className={`relative ${sizeClass} aspect-[63/88] rounded-md bg-[#241c2c] ring-1 ${
            canSeeTop ? 'ring-sky-300/70' : 'ring-amber-200/25'
          } shadow-[0_0_12px_rgba(212,178,74,0.15)] flex flex-col items-center justify-end pb-1 hover:ring-amber-300/70 shrink-0 ${
            dragId ? 'ring-2 ring-amber-300/80' : ''
          }`}
          style={widthPx ? { width: widthPx } : undefined}
          title={
            zone === 'library' && canControl
              ? canUseLibrary
                ? `Bibliothèque · ${count} cartes · clic droit : piocher, rechercher, regard…${dropHint}`
                : `Bibliothèque · ${count} cartes · disponible pendant votre tour${dropHint}`
              : zone === 'graveyard' || zone === 'exile'
                ? `${ZONE_LABELS[zone]} · ${count} · clic droit : consulter${dropHint}`
                : zone === 'command'
                  ? `${ZONE_LABELS[zone]} · ${count} · glisser pour poser / recevoir`
                  : `${ZONE_LABELS[zone]} · ${count}`
          }
        >
          {canSeeTop && topFace?.imageUrl ? (
            <img src={topFace.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover rounded-md opacity-90" />
          ) : count > 0 ? (
            <img
              src={MTG_CARD_BACK_URL}
              alt=""
              className="absolute inset-0 h-full w-full object-cover rounded-md"
              draggable={false}
            />
          ) : (
            <span className="absolute inset-0 rounded-md bg-[#241c2c]" />
          )}
          <span className="relative z-10 text-[9px] font-semibold bg-black/70 px-1 rounded">{count}</span>
          {(zone === 'library' ? canUseLibrary : canControl) && resolvedTop && isDoubleFacedCard(resolvedTop) && (
            <span
              role="button"
              title={resolvedTop.transformed ? 'Revenir au recto' : 'Voir le verso'}
              className="absolute bottom-0.5 right-0.5 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-black/75 text-[10px] text-amber-100 ring-1 ring-white/30 hover:bg-amber-500 hover:text-black"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                flipCard(resolvedTop);
              }}
            >
              ↻
            </span>
          )}
        </button>
      </div>
    );
  };

  const hudCompact = homeMat ? false : compact || visibleSeats > 3;
  const lifeHud = (
    <div
      data-mat-chrome="true"
      className={`absolute z-50 pointer-events-auto flex flex-col items-start ${
        homeMat ? 'top-2 left-2 sm:top-3 sm:left-3' : 'bottom-2 left-2 sm:bottom-3 sm:left-3'
      }`}
    >
      <LifeVial
        life={player.life}
        maxLife={startingLife}
        compact={hudCompact || (!homeMat && visibleSeats >= 3)}
        isSelf={canControl}
        poison={player.poison}
        controls={canControl ? 'below' : 'none'}
        onLife={onLife}
        onPoison={onPoison}
      />
      {!canControl && player.poison > 0 ? (
        <p className="life-poison mt-0.5">☠ {player.poison}</p>
      ) : null}
    </div>
  );

  const endTurnButton =
    isSelf || seatHome ? (
      <button
        type="button"
        className={`player-bar-end ${isTurn ? '' : 'is-waiting'}`.trim()}
        onClick={onPassTurn}
      >
        Fin de tour
      </button>
    ) : null;

  const rightPilesDock = (
    <div
      data-mat-chrome="true"
      className="absolute z-40 bottom-3 right-3 flex flex-col items-end gap-2 pointer-events-auto"
    >
      <div className="flex flex-col items-end gap-1 rounded-lg bg-black/45 p-1 ring-1 ring-white/15">
        {pile('library')}
        {pile('graveyard')}
        {pile('exile')}
      </div>
      {endTurnButton}
    </div>
  );

  const matThemeClass = MAT_THEMES.find((theme) => theme.id === matTheme)?.className || 'zone--battlefield';

  const matThemeMenuItems = (
    <div className="mt-1 pt-1 border-t border-white/10">
      <p className="px-2 py-1 text-[11px] text-white/55">Couleur du tapis</p>
      {MAT_THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm ${
            matTheme === theme.id ? 'ring-1 ring-amber-300/80 bg-white/5' : ''
          }`}
          onClick={() => {
            setMatTheme(theme.id);
            setMenu(null);
          }}
        >
          <span
            className="h-6 w-6 shrink-0 rounded-md ring-1 ring-white/20"
            style={{ background: theme.swatch }}
            aria-hidden
          />
          <span>{theme.label}</span>
        </button>
      ))}
    </div>
  );

  const battlefieldZone = (
    <div
      className={`${matThemeClass} flex-1 min-h-0 min-w-0 flex flex-col px-1.5 py-1`}
      data-play-drop="battlefield"
      data-play-board-user-id={player.userId}
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget && (event.target as HTMLElement).closest('button')) return;
        if (!canControl) {
          event.preventDefault();
          return;
        }
        openMenu(event, null, 'battlefield');
      }}
    >
      {lifeHud}
      {rightPilesDock}
      <div
        className={`zone-layer flex-1 min-h-0 flex flex-col ${
          homeMat ? 'pt-2' : 'pb-2'
        }`}
      >
        {renderPlaymatArea(
          'battlefield',
          boardCards,
          'md',
          canControl ? 'Glissez une carte pour la poser. Clic droit : jeton / couleur.' : 'Aucun permanent.',
          'text-xs text-[var(--gold-1)]/50',
        )}
      </div>
    </div>
  );

  const renderHeldHand = (anchor: 'top' | 'bottom') => {
    const cards = player.hand;
    const size: 'sm' | 'md' | 'lg' = homeMat
      ? 'lg'
      : compact
        ? 'sm'
        : visibleSeats >= 4
          ? 'sm'
          : visibleSeats >= 3
            ? 'md'
            : 'lg';
    const widthPx = handCardPx;
    const n = cards.length;
    const spread = Math.min(anchor === 'top' ? 5 : 6.5, 32 / Math.max(n - 1, 1));
    const overlap = widthPx
      ? `${-Math.round(widthPx * 0.52)}px`
      : size === 'sm'
        ? '-1.98rem'
        : size === 'md'
          ? '-2.88rem'
          : '-3.42rem';
    const peek = anchor === 'bottom' ? '48%' : '-48%';
    const chosenCount = (player.chosenHandCards || []).length;
    const hoverLiftPx = Math.round((widthPx || (size === 'sm' ? 48 : size === 'md' ? 72 : 96)) * 0.42);
    const hoverLift =
      anchor === 'bottom'
        ? 'hover:-translate-y-[var(--hand-hover-y)] hover:z-50'
        : 'hover:translate-y-[var(--hand-hover-y)] hover:z-50';

    return (
      <>
        <div
          data-mat-chrome="true"
          className={`absolute z-40 flex gap-1.5 ${
            anchor === 'bottom' ? 'bottom-3 left-3 flex-col-reverse items-start' : 'top-3 left-3 flex-col items-start'
          }`}
        >
          <div className="flex items-end gap-1 rounded-lg bg-black/45 p-1 ring-1 ring-white/15">
            {pile('command')}
          </div>
          {chosenCount > 0 && (
            <button
              type="button"
              className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold shadow-lg bg-sky-500 text-white ring-1 ring-sky-200 hover:bg-sky-400"
              onClick={() => onClearHandChoices?.()}
              title="Retirer toutes les cartes choisies dans cette main"
            >
              Effacer les choix ({chosenCount})
            </button>
          )}
        </div>
        {n > 0 && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center ${
              anchor === 'bottom' ? 'bottom-0 items-end' : 'top-0 items-start'
            }`}
            style={{ transform: `translateY(${peek})` }}
          >
            <div
              ref={handFanRef}
              className={`flex pointer-events-auto ${anchor === 'bottom' ? 'items-end' : 'items-start'}`}
              style={{ ['--hand-hover-y' as string]: `${hoverLiftPx}px` }}
            >
              {cards.map((card, index) => {
                const offset = index - (n - 1) / 2;
                const rotate = offset * spread;
                const lift = Math.abs(offset) * Math.max(3, Math.round((widthPx || 72) / 18));
                return (
                  <div
                    key={card.instanceId}
                    data-hand-card={card.instanceId}
                    className={`relative ${canControl ? 'touch-none' : ''}`}
                    style={{
                      marginLeft: index === 0 ? 0 : overlap,
                      zIndex: dragId === card.instanceId ? 80 : index + 1,
                      transform:
                        anchor === 'bottom'
                          ? `translateY(${lift}px) rotate(${rotate}deg)`
                          : `translateY(${-lift}px) rotate(${-rotate}deg)`,
                      transformOrigin: anchor === 'bottom' ? 'bottom center' : 'top center',
                    }}
                    onPointerDown={canControl ? (event) => onCardPointerDown(event, card, 'hand') : undefined}
                    onDragStart={(event) => event.preventDefault()}
                  >
                    {renderOne('hand', card, size, hoverLift, widthPx)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  };

  const draggingCard = dragId
    ? [
        ...player.hand,
        ...player.battlefield,
        ...player.command,
        ...player.graveyard,
        ...player.exile,
      ]
        .map(resolveCard)
        .find((card) => card.instanceId === dragId)
    : undefined;

  return (
    <div
      className={`h-full min-h-0 flex flex-col rounded-xl overflow-hidden text-white ${
        isTurn ? 'ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.25)]' : 'ring-1 ring-amber-200/20'
      }`}
    >
      <div className="relative flex-1 min-h-0 flex bg-[var(--ink)]">
        <div
          ref={playmatRef}
          className={`relative z-10 flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden ${
            dragId ? 'cursor-grabbing' : ''
          }`}
        >
          {battlefieldZone}
          {renderHeldHand(homeMat ? 'bottom' : 'top')}
        </div>
      </div>

      {menu && canControl && (
        <div className="fixed inset-0 z-[95]" onClick={() => setMenu(null)} onContextMenu={(event) => event.preventDefault()}>
          <div
            className="absolute w-[min(252px,calc(100vw-1.5rem))] rounded-xl bg-slate-800 text-white shadow-2xl ring-1 ring-white/15 p-2 max-h-[min(380px,calc(100vh-1rem))] overflow-y-auto"
            style={{
              left: Math.max(8, Math.min(menu.x, window.innerWidth - 268)),
              top: Math.max(8, Math.min(menu.y, window.innerHeight - 16 - Math.min(380, window.innerHeight - 16))),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {menu.view !== 'root' && (
              <button
                type="button"
                className="w-full text-left px-2 py-1 text-[11px] text-white/60 hover:text-white"
                onClick={() => {
                  if (menu.view === 'libraryDrop') {
                    setMenu(null);
                    return;
                  }
                  if (menu.view === 'libraryPos') {
                    setMenu({ ...menu, view: menu.libraryReturn || 'sendTo' });
                    return;
                  }
                  setMenu({ ...menu, view: 'root' });
                }}
              >
                ← Retour
              </button>
            )}
            <p className="px-2 py-1 text-sm font-medium truncate">
              {menu.from === 'libraryPile'
                ? 'Bibliothèque'
                : !menu.card
                  ? menu.from === 'battlefield'
                    ? 'Champ de bataille'
                    : 'Main'
                  : showFace(menu.from, menu.card)
                    ? visibleCardFace(resolveCard(menu.card)).name
                    : menu.card.facedown
                      ? 'Carte'
                      : visibleCardFace(resolveCard(menu.card)).name}
            </p>
            {menu.view === 'showHand' || menu.view === 'showCard' || menu.view === 'revealTop' ? (
              <div className="flex flex-col gap-0.5">
                {menu.view === 'revealTop' && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold"
                    onClick={() => {
                      onRevealLibraryTop?.([viewerId]);
                      setMenu(null);
                    }}
                  >
                    À moi seulement
                  </button>
                )}
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                  onClick={() => {
                    const ids = [REVEAL_ALL];
                    if (menu.view === 'showHand') onShowHand?.(ids);
                    else if (menu.view === 'showCard' && menu.card) onShowHandCard?.(menu.card.instanceId, ids);
                    else onRevealLibraryTop?.(ids);
                    setMenu(null);
                  }}
                >
                  À tout le monde
                </button>
                {opponents.map((opp) => (
                  <button
                    key={opp.userId}
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                    onClick={() => {
                      const ids = [opp.userId];
                      if (menu.view === 'showHand') onShowHand?.(ids);
                      else if (menu.view === 'showCard' && menu.card) onShowHandCard?.(menu.card.instanceId, ids);
                      else onRevealLibraryTop?.(ids);
                      setMenu(null);
                    }}
                  >
                    À {opp.displayName || 'Joueur'}
                  </button>
                ))}
                {menu.view === 'showHand' && (player.shownHandTo?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm text-amber-200"
                    onClick={() => {
                      onHideHand?.();
                      setMenu(null);
                    }}
                  >
                    Cacher la main
                  </button>
                )}
                {menu.view === 'showCard' && menu.card && (player.shownHandCards || []).some((item) => item.instanceId === menu.card?.instanceId) && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm text-amber-200"
                    onClick={() => {
                      onHideHandCard?.(menu.card!.instanceId);
                      setMenu(null);
                    }}
                  >
                    Cacher cette carte
                  </button>
                )}
                {menu.view === 'revealTop' && (player.libraryTopRevealedTo?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm text-amber-200"
                    onClick={() => {
                      onHideLibraryTop?.();
                      setMenu(null);
                    }}
                  >
                    Cacher le dessus
                  </button>
                )}
              </div>
            ) : menu.view === 'sendTo' && menu.card && menu.from !== 'libraryPile' ? (
              <div className="flex flex-col gap-0.5">
                {menu.from !== 'library' && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        onMove?.(menu.card!.instanceId, menu.from as ZoneName, 'library', { toTop: true });
                        setMenu(null);
                      }}
                    >
                      Bibliothèque — dessus
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        onMove?.(menu.card!.instanceId, menu.from as ZoneName, 'library');
                        setMenu(null);
                      }}
                    >
                      Bibliothèque — dessous
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => setMenu({ ...menu, view: 'libraryPos', libraryReturn: 'sendTo' })}
                    >
                      Bibliothèque — N-ième…
                    </button>
                  </>
                )}
                {(['hand', 'graveyard', 'exile', 'battlefield', 'command'] as ZoneName[])
                  .filter((zone) => zone !== menu.from)
                  .map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        onMove?.(menu.card!.instanceId, menu.from as ZoneName, zone);
                        setMenu(null);
                      }}
                    >
                      {ZONE_LABELS[zone]}
                    </button>
                  ))}
                {menu.from !== 'graveyard' && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                    onClick={() => {
                      onMove?.(menu.card!.instanceId, menu.from as ZoneName, 'graveyard', { facedown: true });
                      setMenu(null);
                    }}
                  >
                    Cimetière face cachée
                  </button>
                )}
                {menu.from !== 'exile' && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                    onClick={() => {
                      onMove?.(menu.card!.instanceId, menu.from as ZoneName, 'exile', { facedown: true });
                      setMenu(null);
                    }}
                  >
                    Exil face caché
                  </button>
                )}
              </div>
            ) : menu.view === 'libraryDrop' && menu.card && menu.from !== 'libraryPile' ? (
              <div className="flex flex-col gap-0.5">
                <p className="px-2 py-1 text-[11px] text-white/60">Où placer dans la bibliothèque ?</p>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                  onClick={() => {
                    onMove?.(menu.card!.instanceId, menu.from as ZoneName, 'library', { toTop: true });
                    setMenu(null);
                  }}
                >
                  Dessus
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                  onClick={() => {
                    onMove?.(menu.card!.instanceId, menu.from as ZoneName, 'library');
                    setMenu(null);
                  }}
                >
                  Dessous
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                  onClick={() => setMenu({ ...menu, view: 'libraryPos', libraryReturn: 'libraryDrop' })}
                >
                  N-ième position…
                </button>
              </div>
            ) : menu.view === 'libraryPos' && menu.card && menu.from !== 'libraryPile' ? (
              <form
                className="px-2 py-1 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const n = Number.parseInt(menu.libraryN, 10);
                  if (!Number.isFinite(n) || n < 1) return;
                  onMove?.(menu.card!.instanceId, menu.from as ZoneName, 'library', { libraryPosition: n });
                  setMenu(null);
                }}
              >
                <label className="block text-xs text-white/70">
                  Position depuis le dessus
                  <input
                    type="number"
                    min={1}
                    value={menu.libraryN}
                    onChange={(event) => setMenu({ ...menu, libraryN: event.target.value })}
                    className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-sm"
                  />
                </label>
                <p className="text-[10px] text-white/45">Si N dépasse le nombre de cartes, la carte va en dessous.</p>
                <button type="submit" className="w-full py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold">
                  Placer
                </button>
              </form>
            ) : menu.view === 'mill' && menu.from === 'libraryPile' ? (
              <form
                className="px-2 py-1 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const n = Number.parseInt(menu.libraryN, 10);
                  if (!Number.isFinite(n) || n < 1) return;
                  onMill?.(n);
                  setMenu(null);
                }}
              >
                <label className="block text-xs text-white/70">
                  Cartes du dessus vers le cimetière
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, player.library.length)}
                    value={menu.libraryN}
                    onChange={(event) => setMenu({ ...menu, libraryN: event.target.value })}
                    className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-sm"
                  />
                </label>
                <p className="text-[10px] text-white/45">
                  {player.library.length} carte{player.library.length > 1 ? 's' : ''} dans la bibliothèque.
                </p>
                <button
                  type="submit"
                  className="w-full py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold"
                  disabled={player.library.length === 0}
                >
                  Meule
                </button>
              </form>
            ) : (
              <>
                {menu.from === 'battlefield' && !menu.card && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold mb-1"
                      onClick={() => {
                        setTokenOpen(true);
                        setMenu(null);
                      }}
                    >
                      Ajouter un jeton
                    </button>
                    {matThemeMenuItems}
                  </>
                )}
                {menu.from === 'libraryPile' && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold mb-1"
                      onClick={() => {
                        onDraw?.();
                        setMenu(null);
                      }}
                    >
                      Piocher
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        setLibraryOpen(true);
                        setMenu(null);
                      }}
                    >
                      Rechercher
                    </button>
                    {player.library.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                          onClick={() => {
                            setLookMode('scry');
                            setMenu(null);
                          }}
                        >
                          Regard (Scry)…
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                          onClick={() => {
                            setLookMode('surveil');
                            setMenu(null);
                          }}
                        >
                          Surveillance (Surveil)…
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        onShuffle?.();
                        setMenu(null);
                      }}
                    >
                      Mélanger
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        onMulligan?.();
                        setMenu(null);
                      }}
                    >
                      Mulligan
                    </button>
                    {player.library.length > 0 && (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                        onClick={() => setMenu({ ...menu, view: 'mill', libraryN: '1' })}
                      >
                        Meule (Mill)…
                      </button>
                    )}
                    {player.library.length > 0 && (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                        onClick={() => setMenu({ ...menu, view: 'revealTop' })}
                      >
                        Révéler le dessus…
                      </button>
                    )}
                    {(player.libraryTopRevealedTo?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                        onClick={() => {
                          onHideLibraryTop?.();
                          setMenu(null);
                        }}
                      >
                        Cacher le dessus
                      </button>
                    )}
                  </>
                )}
                {menu.card && menu.from !== 'libraryPile' && primaryMove(menu.from) && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold mb-1"
                    onClick={() => {
                      const dest = primaryMove(menu.from as ZoneName);
                      if (dest) onMove?.(menu.card!.instanceId, menu.from as ZoneName, dest);
                      setMenu(null);
                    }}
                  >
                    {menu.from === 'hand' || menu.from === 'command'
                      ? 'Poser'
                      : menu.card?.isToken && primaryMove(menu.from as ZoneName) === 'graveyard'
                        ? 'Détruire'
                        : `Vers ${ZONE_LABELS[primaryMove(menu.from as ZoneName) as ZoneName]}`}
                  </button>
                )}
                {menu.from === 'battlefield' && menu.card && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        const members = stackFor(menu.card!);
                        onTap?.(
                          menu.card!.instanceId,
                          members.length > 1 ? members.map((item) => item.instanceId) : undefined,
                        );
                        setMenu(null);
                      }}
                    >
                      {menu.card.tapped ? 'Dégager' : 'Engager'}
                      {stackFor(menu.card).length > 1 ? ` (×${stackFor(menu.card).length})` : ''}
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        setTokenOpen(true);
                        setMenu(null);
                      }}
                    >
                      Ajouter un jeton
                    </button>
                    {menu.card.isToken && stackFor(menu.card).length > 1 && (
                      <>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                          onClick={() => {
                            const members = stackFor(menu.card!);
                            const pulled = members[members.length - 1];
                            const origin = members[0];
                            const pos = offsetOffTokenStack(origin.playmatX ?? 50, origin.playmatY ?? 50);
                            onSetPlaymatPos?.([pulled.instanceId], pos.x, pos.y, 'battlefield');
                            setMenu(null);
                          }}
                        >
                          Séparer un jeton
                        </button>
                        {stackFor(menu.card).length > 2 && (
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                            onClick={() => {
                              const members = stackFor(menu.card!);
                              const origin = members[0];
                              const ox = origin.playmatX ?? 50;
                              const oy = origin.playmatY ?? 50;
                              void (async () => {
                                if (origin.playmatX == null || origin.playmatY == null) {
                                  await onSetPlaymatPos?.([origin.instanceId], ox, oy, 'battlefield');
                                }
                                for (let i = 1; i < members.length; i += 1) {
                                  const pos = offsetOffTokenStack(ox, oy, ox + i * 12, oy);
                                  await onSetPlaymatPos?.([members[i].instanceId], pos.x, pos.y, 'battlefield');
                                }
                              })();
                              setMenu(null);
                            }}
                          >
                            Étaler la pile ({stackFor(menu.card).length})
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
                {menu.card?.isToken && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm text-fuchsia-200"
                    onClick={() => {
                      onRemoveToken?.(menu.card!.instanceId);
                      setMenu(null);
                    }}
                  >
                    Retirer le jeton
                  </button>
                )}
                {menu.card && menu.from !== 'libraryPile' && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                    onClick={() => {
                      setCounterCardId(menu.card!.instanceId);
                      setMenu(null);
                    }}
                  >
                    Marqueurs…
                  </button>
                )}
                {menu.card && menu.from !== 'libraryPile' && isPlaymatAttachable(resolveCard(menu.card)) && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        onStartAttach?.(menu.card!.instanceId);
                        setMenu(null);
                      }}
                    >
                      Attacher à…
                    </button>
                    {menu.card.attachedTo && (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                        onClick={() => {
                          onDetach?.(menu.card!.instanceId);
                          setMenu(null);
                        }}
                      >
                        Détacher
                      </button>
                    )}
                  </>
                )}
                {menu.card && menu.from !== 'libraryPile' && isDoubleFacedCard(resolveCard(menu.card)) && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                    onClick={() => {
                      flipCard(menu.card!);
                      setMenu(null);
                    }}
                  >
                    {resolveCard(menu.card).transformed ? 'Revenir au recto' : 'Retourner (verso)'}
                  </button>
                )}
                {menu.card && menu.from !== 'libraryPile' && showFace(menu.from, menu.card) && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                    onClick={() => {
                      setLightbox(menu.card);
                      setMenu(null);
                    }}
                  >
                    Voir en grand
                  </button>
                )}
                {menu.from === 'hand' && menu.card && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => setMenu({ ...menu, view: 'showCard' })}
                    >
                      Montrer cette carte…
                    </button>
                    {(player.shownHandCards || []).some((item) => item.instanceId === menu.card?.instanceId) && (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                        onClick={() => {
                          onHideHandCard?.(menu.card!.instanceId);
                          setMenu(null);
                        }}
                      >
                        Cacher cette carte
                      </button>
                    )}
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => setMenu({ ...menu, view: 'showHand' })}
                    >
                      Montrer la main…
                    </button>
                    {(player.shownHandTo?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                        onClick={() => {
                          onHideHand?.();
                          setMenu(null);
                        }}
                      >
                        Cacher la main
                      </button>
                    )}
                  </>
                )}
                {menu.card && menu.from !== 'libraryPile' && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                    onClick={() => setMenu({ ...menu, view: 'sendTo' })}
                  >
                    Envoyer vers…
                  </button>
                )}
                {menu.card && (menu.from === 'graveyard' || menu.from === 'exile') && (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm mt-1"
                    onClick={() => {
                      onSetFacedown?.(menu.card!.instanceId, !menu.card!.facedown);
                      setMenu(null);
                    }}
                  >
                    {menu.card.facedown ? 'Révéler' : 'Mettre face cachée'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {hover && !menu && (
        <CardHoverPreview
          imageUrl={visibleCardFace(hover.card).imageUrl}
          name={visibleCardFace(hover.card).name}
          anchorRect={hover.rect}
        />
      )}

      {libraryOpen && canUseLibrary && (
        <LibrarySearchPanel
          cards={player.library.map(resolveCard)}
          onClose={() => setLibraryOpen(false)}
          onTake={(card, to, options) => {
            onSearchLibrary?.(card.instanceId, to, options);
            if (options?.shuffle) setLibraryOpen(false);
          }}
        />
      )}

      {lookMode && canUseLibrary && (
        <LibraryLookPanel
          mode={lookMode}
          library={player.library.map(resolveCard)}
          onClose={() => setLookMode(null)}
          onConfirm={(count, onTop, other) => {
            if (lookMode === 'scry') onScry?.(count, onTop, other);
            else onSurveil?.(count, onTop, other);
          }}
        />
      )}

      {tokenOpen && canControl && (
        <TokenSearchPanel
          onClose={() => setTokenOpen(false)}
          onAdd={(card, quantity) => onAddToken?.(card, quantity)}
        />
      )}

      {browseZone && (
        <ZoneBrowsePanel
          zone={browseZone}
          cards={player[browseZone].map(resolveCard)}
          ownerId={player.userId}
          ownerName={player.displayName}
          viewerId={viewerId}
          canAct={canControl}
          onClose={() => setBrowseZone(null)}
          onTake={(card, to, options) => {
            onMove?.(card.instanceId, browseZone, to, options);
          }}
          onSetFacedown={(instanceId, facedown) => onSetFacedown?.(instanceId, facedown)}
          onOpenCounters={(instanceId) => setCounterCardId(instanceId)}
        />
      )}

      {counterCard && canControl && (
        <CounterPicker
          card={resolveCard(counterCard)}
          onClose={() => setCounterCardId(null)}
          onSetCounter={(counterId, delta) => onSetCounter?.(counterCard.instanceId, counterId, delta)}
        />
      )}

      {dragId && dragPos && draggingCard && (
        <div
          className="pointer-events-none fixed z-[220] w-[4.2rem] sm:w-[5.4rem] aspect-[63/88] overflow-hidden rounded-md shadow-2xl ring-2 ring-amber-300"
          style={{ left: dragPos.x, top: dragPos.y, transform: 'translate(-50%, -60%)' }}
        >
          <img
            src={visibleCardFace(draggingCard).imageUrl || MTG_CARD_BACK_URL}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
      )}

      {lightbox && (
        <CardLightbox
          imageUrl={visibleCardFace(resolveCard(lightbox)).imageUrl}
          name={visibleCardFace(resolveCard(lightbox)).name}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

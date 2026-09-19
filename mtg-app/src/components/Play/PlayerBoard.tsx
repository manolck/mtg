import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { PlayerTableState, RevealAudience, TableCard, TokenBlueprint, ZoneName } from '../../types/play';
import { REVEAL_ALL, ZONE_LABELS } from '../../types/play';
import {
  splitBattlefield,
  isDoubleFacedCard,
  visibleCardFace,
  canSeeHandCard,
  canSeeLibraryTop,
  attachmentsOn,
  isAttachHostCandidate,
  isPlaymatAttachable,
  isPlaymatLand,
  tableBattlefieldCards,
  isHandCardChosen,
  groupPlaymatCards,
} from '../../utils/playTable';
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
  ) => void;
  onAddToken?: (card: TokenBlueprint, quantity: number) => void;
  onRemoveToken?: (instanceId: string) => void;
  onScry?: (count: number, onTop: string[], onBottom: string[]) => void;
  onSurveil?: (count: number, onTop: string[], toGraveyard: string[]) => void;
  onMill?: (count: number) => void;
  onReorderHand?: (instanceId: string, toIndex: number) => void;
  onToggleHandChoice?: (instanceId: string) => void;
  onClearHandChoices?: () => void;
}

type MenuView = 'root' | 'showHand' | 'showCard' | 'revealTop' | 'libraryPos' | 'sendTo' | 'mill';

interface MenuState {
  card: TableCard | null;
  from: ZoneName | 'libraryPile';
  x: number;
  y: number;
  view: MenuView;
  libraryN: string;
}

function primaryMove(from: ZoneName): ZoneName | null {
  if (from === 'hand' || from === 'command') return 'battlefield';
  if (from === 'battlefield') return 'graveyard';
  if (from === 'graveyard') return 'battlefield';
  if (from === 'exile') return 'battlefield';
  return null;
}

const CARD_ASPECT = 88 / 63;

function cardWidthForSpace(width: number, height: number, kind: 'play' | 'hand'): number {
  if (width < 48 || height < 48) return 0;
  const byWidth = width / (kind === 'hand' ? 5.5 : 6.8);
  const byHeight =
    kind === 'hand' ? (height * 0.36) / CARD_ASPECT : (height * 0.3) / CARD_ASPECT;
  const min = kind === 'hand' ? 44 : 40;
  const max = kind === 'hand' ? 160 : 140;
  return Math.round(Math.max(min, Math.min(max, byWidth, byHeight)));
}

export function PlayerBoard({
  player,
  isSelf,
  isTurn,
  compact = false,
  seatHome = false,
  visibleSeats = 2,
  startingLife = 20,
  deckName,
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
  onSetPlaymatRow,
  onAddToken,
  onRemoveToken,
  onScry,
  onSurveil,
  onMill,
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
  const [handVisible, setHandVisible] = useState(true);
  const handFanRef = useRef<HTMLDivElement | null>(null);
  const playmatRef = useRef<HTMLDivElement | null>(null);
  const [playmatBox, setPlaymatBox] = useState({ width: 0, height: 0 });
  const homeMat = isSelf || seatHome;
  const canUseLibrary = isSelf && isTurn;
  const playCardPx = cardWidthForSpace(playmatBox.width, playmatBox.height, 'play') || undefined;
  const handCardPx = cardWidthForSpace(playmatBox.width, playmatBox.height, 'hand') || undefined;

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
  }, [visibleSeats]);
  const { lands, enchantments, other } = useMemo(() => splitBattlefield(player.battlefield), [player.battlefield]);
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
      return !card.facedown || player.userId === viewerId;
    }
    if (card.facedown) return false;
    if (zone === 'battlefield' || zone === 'command') return true;
    if (zone === 'hand') return canSeeHandCard(player, card, viewerId);
    if (zone === 'library') return canSeeLibraryTop(player, viewerId);
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

  const cardOwnerId = (card: TableCard) => {
    const players = tablePlayers.length ? tablePlayers : [player];
    for (const seat of players) {
      if (
        seat.battlefield.some((item) => item.instanceId === card.instanceId) ||
        seat.hand.some((item) => item.instanceId === card.instanceId) ||
        seat.command.some((item) => item.instanceId === card.instanceId) ||
        seat.graveyard.some((item) => item.instanceId === card.instanceId) ||
        seat.exile.some((item) => item.instanceId === card.instanceId)
      ) {
        return seat.userId;
      }
    }
    return player.userId;
  };
  const canActOn = (card: TableCard) => cardOwnerId(card) === viewerId;

  const stackFor = (card: TableCard) => {
    const groups = groupPlaymatCards(player.battlefield.filter((item) => !item.attachedTo));
    return groups.find((group) => group.members.some((item) => item.instanceId === card.instanceId))?.members || [card];
  };

  const playFromHand = (card: TableCard) => {
    if (!canActOn(card)) return;
    onMove?.(card.instanceId, 'hand', 'battlefield');
  };

  const handleCardClick = (event: MouseEvent, card: TableCard, zone: ZoneName) => {
    if (attachPickId && zone === 'battlefield') {
      if (isAttachHostCandidate(card, attachPickId)) onPickAttachHost?.(card.instanceId);
      return;
    }
    if (!canActOn(card)) {
      if (showFace(zone, card)) setLightbox(card);
      return;
    }
    if (event.shiftKey) {
      openMenu(event, card, zone);
      return;
    }
    if (zone === 'hand') return;
    if (isPlaymatAttachable(card) && (zone === 'command' || (zone === 'battlefield' && !card.attachedTo))) {
      const hosts = allBattlefield.filter((item) => isAttachHostCandidate(item, card.instanceId));
      if (hosts.length > 0) {
        onStartAttach?.(card.instanceId);
        return;
      }
    }
    if (zone === 'battlefield') {
      const members = stackFor(card);
      onTap?.(card.instanceId, members.length > 1 ? members.map((item) => item.instanceId) : undefined);
      return;
    }
    const dest = primaryMove(zone);
    if (dest) {
      onMove?.(card.instanceId, zone, dest);
      return;
    }
    openMenu(event, card, zone);
  };

  const handleCardDoubleClick = (card: TableCard, zone: ZoneName) => {
    if (zone === 'hand' && canActOn(card)) {
      playFromHand(card);
      return;
    }
    if (showFace(zone, card)) setLightbox(card);
  };

  const setCardHover = (event: MouseEvent<HTMLButtonElement>, card: TableCard, zone: ZoneName) => {
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
          !isSelf && zone === 'hand'
            ? chosen
              ? 'Clic droit : retirer du choix'
              : 'Clic droit : choisir cette carte'
            : isSelf && zone === 'hand'
              ? 'Double-clic : poser'
              : undefined
        }
        className={`${extraClass} ${pickingHost ? 'ring-2 ring-amber-300' : ''}`.trim()}
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
          if (zone === 'hand' && !isSelf) onToggleHandChoice?.(resolved.instanceId);
        }}
        onDoubleClick={() => handleCardDoubleClick(resolved, zone)}
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
    const card = renderOne(
      'battlefield',
      group.lead,
      size,
      '',
      widthPx,
      undefined,
      group.members.length,
    );
    return (
      <div
        key={group.lead.instanceId}
        data-play-card-id={group.lead.instanceId}
        className="relative shrink-0"
        style={extraStyle}
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
      <div className="relative flex-1 min-h-0 min-w-0" data-play-drop={row}>
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
            zIndex: 10,
          }),
        )}
      </div>
    );
  };

  const pile = (zone: 'library' | 'graveyard' | 'exile' | 'command', onPileClick?: () => void) => {
    const cards = player[zone];
    const top = zone === 'library' ? cards[0] : cards[cards.length - 1];
    const resolvedTop = top ? resolveCard(top) : undefined;
    const canSeeTop =
      zone === 'library'
        ? Boolean(resolvedTop && canSeeLibraryTop(player, viewerId))
        : Boolean(resolvedTop && showFace(zone, resolvedTop));
    const topFace = resolvedTop ? visibleCardFace(resolvedTop) : undefined;
    const size = 'w-[2.65rem] sm:w-[2.9rem]';
    const shortLabel =
      zone === 'command' ? 'CMD' : zone === 'library' ? 'LIB' : zone === 'graveyard' ? 'CIM' : 'EXL';
    const count = cards.length;
    const revealed = zone === 'library' && canSeeLibraryTop(player, viewerId);
    const hiddenInPile = (zone === 'graveyard' || zone === 'exile') && cards.some((card) => card.facedown);
    return (
      <div className="flex flex-col items-center gap-px w-[2.65rem] sm:w-[2.9rem] min-w-0">
        <p className="text-[7px] sm:text-[8px] font-semibold tracking-[0.06em] text-[var(--gold-1)] uppercase leading-none truncate w-full text-center">
          {shortLabel}
          {revealed ? ' · 👁' : ''}
          {hiddenInPile ? ' · 🂠' : ''}
        </p>
        <button
          type="button"
          onClick={(event) => {
            if (onPileClick) {
              onPileClick();
              return;
            }
            if (isSelf && top && zone === 'command') {
              handleCardClick(event, resolveCard(top), zone);
            }
          }}
          onContextMenu={(event) => {
            if (zone === 'library') {
              if (canUseLibrary) openMenu(event, resolvedTop || null, 'libraryPile');
              else event.preventDefault();
              return;
            }
            if (isSelf && top) openMenu(event, resolveCard(top), zone);
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
          className={`relative ${size} aspect-[63/88] rounded-md bg-[#241c2c] ring-1 ${
            canSeeTop ? 'ring-sky-300/70' : 'ring-amber-200/25'
          } shadow-[0_0_12px_rgba(212,178,74,0.15)] flex flex-col items-center justify-end pb-1 hover:ring-amber-300/70 shrink-0`}
          title={
            zone === 'library' && isSelf
              ? canUseLibrary
                ? `Bibliothèque · ${count} cartes · clic : piocher · clic droit : rechercher, regard…`
                : `Bibliothèque · ${count} cartes · disponible pendant votre tour`
              : zone === 'graveyard' || zone === 'exile'
                ? `${ZONE_LABELS[zone]} · ${count} · clic : consulter`
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
          {(zone === 'library' ? canUseLibrary : isSelf) && resolvedTop && isDoubleFacedCard(resolvedTop) && (
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

  const commanderLabel = player.command
    .map((card) => visibleCardFace(resolveCard(card)).name)
    .filter(Boolean)
    .join(' · ');
  const deckLabel = deckName || commanderLabel || 'Deck';

  const zoneTitle = (label: string, tone = 'text-[var(--gold-1)]') => (
    <p className={`text-[8px] sm:text-[9px] font-semibold tracking-[0.16em] ${tone} uppercase leading-none px-1 mb-0.5`}>
      {label}
    </p>
  );

  const hudCompact = compact || visibleSeats > 3;
  const combatHud = (
    <div className={`player-bar ${homeMat ? '' : 'player-bar--away'}`.trim()}>
      <div className="player-bar-identity">
        <p className="player-bar-name">{player.displayName || 'Joueur'}</p>
        <div className="player-bar-deck">
          <p className="player-bar-deck-name" title={deckLabel}>
            {deckLabel}
          </p>
          {isTurn ? <span className="player-bar-turn">Tour</span> : null}
        </div>
        {isSelf && (
          <button
            type="button"
            className={`player-bar-end ${isTurn ? '' : 'is-waiting'}`.trim()}
            onClick={onPassTurn}
          >
            Fin de tour
          </button>
        )}
      </div>
      <div className="player-bar-life">
        <LifeVial
          life={player.life}
          maxLife={startingLife}
          compact={hudCompact}
          isSelf={isSelf}
          poison={player.poison}
          controls="below"
          onLife={onLife}
          onPoison={onPoison}
        />
      </div>
    </div>
  );

  const battlefieldZone = (
    <div
      className="zone--battlefield flex-[3] min-h-0 min-w-0 flex flex-col px-1.5 py-1"
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget && (event.target as HTMLElement).closest('button')) return;
        if (!isSelf) {
          event.preventDefault();
          return;
        }
        openMenu(event, null, 'battlefield');
      }}
    >
      {combatHud}
      <div className="zone-layer flex-1 min-h-0 flex flex-col">
        <div
          className={`flex items-center justify-between gap-1 mb-0.5 ${
            homeMat ? 'pt-[5.75rem] sm:pt-[6.5rem]' : 'pb-[4.5rem] sm:pb-20'
          }`}
        >
          {zoneTitle('Champ de bataille')}
        </div>
        {renderPlaymatArea(
          'battlefield',
          other,
          'md',
          isSelf ? 'Double-clic une carte en main pour la poser. Clic droit : jeton.' : 'Aucun permanent.',
          'text-xs text-[var(--gold-1)]/50',
        )}
      </div>
    </div>
  );

  const landZone = (
    <div
      className="zone--terrain flex-[1] min-h-[5.75rem] flex"
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget && (event.target as HTMLElement).closest('button')) return;
        if (!isSelf) {
          event.preventDefault();
          return;
        }
        openMenu(event, null, 'battlefield');
      }}
    >
      <div className="zone-layer flex-1 min-w-0 min-h-0 px-1.5 py-1 flex flex-col">
        {zoneTitle('Terrains')}
        {renderPlaymatArea(
          'lands',
          lands,
          'md',
          isSelf ? 'Posez vos terrains ici.' : '—',
          'text-[11px] text-[var(--gold-1)]/45',
        )}
      </div>
      <div className="zone-layer zone-piles shrink-0 w-[5.85rem] sm:w-[6.35rem] flex items-center justify-center px-0.5">
        <div className="grid grid-cols-[2.65rem_2.65rem] sm:grid-cols-[2.9rem_2.9rem] gap-0.5 py-0.5 place-items-center">
          {pile('library', canUseLibrary ? () => onDraw?.() : undefined)}
          {pile('graveyard', () => setBrowseZone('graveyard'))}
          {pile('exile', () => setBrowseZone('exile'))}
          {pile('command')}
        </div>
      </div>
    </div>
  );

  const renderHeldHand = (anchor: 'top' | 'bottom') => {
    const cards = player.hand;
    const size: 'sm' | 'md' | 'lg' = visibleSeats >= 4 ? 'sm' : visibleSeats >= 3 ? 'md' : 'lg';
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
    const hidden = anchor === 'bottom' ? '108%' : '-108%';
    const showToggle = isSelf || n > 0;
    const chosenCount = (player.chosenHandCards || []).length;
    const hoverLiftPx = Math.round((widthPx || (size === 'sm' ? 48 : size === 'md' ? 72 : 96)) * 0.42);
    const hoverLift =
      anchor === 'bottom'
        ? 'hover:-translate-y-[var(--hand-hover-y)] hover:z-50'
        : 'hover:translate-y-[var(--hand-hover-y)] hover:z-50';

    return (
      <>
        {(showToggle || chosenCount > 0) && (
          <div
            className={`absolute z-40 flex flex-col gap-1 ${
              anchor === 'bottom' ? 'bottom-3 left-3' : 'top-3 left-3'
            }`}
          >
            {showToggle && (
              <button
                type="button"
                className={`min-h-[36px] px-2.5 rounded-lg text-[11px] font-semibold shadow-lg ${
                  handVisible
                    ? 'bg-black/65 text-white ring-1 ring-white/25 hover:bg-black/80'
                    : 'bg-amber-400 text-black ring-2 ring-amber-100 hover:bg-amber-300'
                }`}
                onClick={() => setHandVisible((open) => !open)}
                title={handVisible ? 'Masquer la main pour voir les terrains' : 'Afficher la main'}
              >
                {handVisible ? 'Masquer la main' : `Main${n ? ` (${n})` : ''}`}
              </button>
            )}
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
        )}
        {n > 0 && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center transition-transform duration-300 ease-out ${
              anchor === 'bottom' ? 'bottom-0 items-end' : 'top-0 items-start'
            }`}
            style={{ transform: `translateY(${handVisible ? peek : hidden})` }}
          >
            <div
              ref={handFanRef}
              className={`flex ${anchor === 'bottom' ? 'items-end' : 'items-start'} ${
                handVisible ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
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
                    className="relative"
                    style={{
                      marginLeft: index === 0 ? 0 : overlap,
                      zIndex: index + 1,
                      transform:
                        anchor === 'bottom'
                          ? `translateY(${lift}px) rotate(${rotate}deg)`
                          : `translateY(${-lift}px) rotate(${-rotate}deg)`,
                      transformOrigin: anchor === 'bottom' ? 'bottom center' : 'top center',
                    }}
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

  const enchantZone = (
    <div
      className="zone--enchant flex-[1] min-h-0 min-w-0 px-1 py-0.5 flex flex-col"
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget && (event.target as HTMLElement).closest('button')) return;
        if (!isSelf) {
          event.preventDefault();
          return;
        }
        openMenu(event, null, 'battlefield');
      }}
    >
      <div className="zone-layer flex-1 min-h-0 min-w-0 flex flex-col">
        {zoneTitle('Enchantements')}
        {renderPlaymatArea(
          'enchantments',
          enchantments,
          'sm',
          isSelf ? 'Posez vos enchantements ici.' : '—',
          'text-[10px] text-[var(--gold-1)]/45',
        )}
      </div>
    </div>
  );

  const combatStack = (
    <div className="flex-[3] min-h-0 min-w-0 flex gap-1 overflow-hidden">
      {battlefieldZone}
      {enchantZone}
    </div>
  );

  return (
    <div
      className={`h-full min-h-0 flex flex-col rounded-xl overflow-hidden text-white ${
        isTurn ? 'ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.25)]' : 'ring-1 ring-amber-200/20'
      }`}
    >
      <div className="relative flex-1 min-h-0 flex bg-[var(--ink)]">
        <div ref={playmatRef} className="relative z-10 flex-1 min-w-0 min-h-0 flex flex-col gap-1 overflow-hidden p-1">
          {homeMat ? (
            <>
              {combatStack}
              {landZone}
            </>
          ) : (
            <>
              {landZone}
              {combatStack}
            </>
          )}
          {renderHeldHand(homeMat ? 'bottom' : 'top')}
        </div>
      </div>

      {menu && isSelf && (
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
                onClick={() => setMenu({ ...menu, view: menu.view === 'libraryPos' ? 'sendTo' : 'root' })}
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
                      onClick={() => setMenu({ ...menu, view: 'libraryPos' })}
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
                    {isPlaymatLand(resolveCard(menu.card)) ? (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                        onClick={() => {
                          onSetPlaymatRow?.(menu.card!.instanceId, 'battlefield');
                          setMenu(null);
                        }}
                      >
                        Vers le champ de bataille
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                        onClick={() => {
                          onSetPlaymatRow?.(menu.card!.instanceId, 'lands');
                          setMenu(null);
                        }}
                      >
                        Vers les terrains
                      </button>
                    )}
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                      onClick={() => {
                        onSetPlaymatRow?.(menu.card!.instanceId, 'enchantments');
                        setMenu(null);
                      }}
                    >
                      Vers les enchantements
                    </button>
                    {menu.card.playmatRow && (
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                        onClick={() => {
                          onSetPlaymatRow?.(menu.card!.instanceId, null);
                          setMenu(null);
                        }}
                      >
                        Classification auto
                      </button>
                    )}
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

      {tokenOpen && isSelf && (
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
          canAct={isSelf}
          onClose={() => setBrowseZone(null)}
          onTake={(card, to, options) => {
            onMove?.(card.instanceId, browseZone, to, options);
          }}
          onSetFacedown={(instanceId, facedown) => onSetFacedown?.(instanceId, facedown)}
          onOpenCounters={(instanceId) => setCounterCardId(instanceId)}
        />
      )}

      {counterCard && isSelf && (
        <CounterPicker
          card={resolveCard(counterCard)}
          onClose={() => setCounterCardId(null)}
          onSetCounter={(counterId, delta) => onSetCounter?.(counterCard.instanceId, counterId, delta)}
        />
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

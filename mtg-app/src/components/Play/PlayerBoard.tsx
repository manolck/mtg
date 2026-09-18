import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
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
  tableBattlefieldCards,
} from '../../utils/playTable';
import { CardLightbox } from '../Card/CardLightbox';
import { CardHoverPreview } from '../Card/CardHoverPreview';
import { PlayCard, MTG_CARD_BACK_URL } from './PlayCard';
import { CounterPicker } from './CounterPicker';
import { LibrarySearchPanel } from './LibrarySearchPanel';
import { LibraryLookPanel, type LibraryLookMode } from './LibraryLookPanel';
import { TokenSearchPanel } from './TokenSearchPanel';
import { ZoneBrowsePanel } from './ZoneBrowsePanel';
import { useDfcFaces } from '../../hooks/useDfcFaces';

interface PlayerBoardProps {
  player: PlayerTableState;
  isSelf: boolean;
  isTurn: boolean;
  compact?: boolean;
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
    options?: { toTop?: boolean; libraryPosition?: number; facedown?: boolean },
  ) => void;
  onSearchLibrary?: (
    instanceId: string,
    to: ZoneName,
    options?: { toTop?: boolean; libraryPosition?: number; shuffle?: boolean; facedown?: boolean },
  ) => void;
  onTap?: (instanceId: string) => void;
  onFlip?: (instanceId: string, faces?: { backImageUrl?: string; backName?: string }) => void;
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
  onAddToken?: (card: TokenBlueprint, quantity: number) => void;
  onRemoveToken?: (instanceId: string) => void;
  onScry?: (count: number, onTop: string[], onBottom: string[]) => void;
  onSurveil?: (count: number, onTop: string[], toGraveyard: string[]) => void;
  videoSlot?: ReactNode;
}

const MOVE_TARGETS: ZoneName[] = ['battlefield', 'graveyard', 'exile', 'hand', 'command'];

type MenuView = 'root' | 'showHand' | 'showCard' | 'revealTop' | 'libraryPos';

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

export function PlayerBoard({
  player,
  isSelf,
  isTurn,
  compact = false,
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
  onAddToken,
  onRemoveToken,
  onScry,
  onSurveil,
  videoSlot,
}: PlayerBoardProps) {
  const [lightbox, setLightbox] = useState<TableCard | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [hover, setHover] = useState<{ card: TableCard; rect: DOMRect } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [lookMode, setLookMode] = useState<LibraryLookMode | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [browseZone, setBrowseZone] = useState<'graveyard' | 'exile' | null>(null);
  const [counterCardId, setCounterCardId] = useState<string | null>(null);
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
    return {
      ...card,
      backImageUrl: card.backImageUrl || extra?.backImageUrl,
      backName: card.backName || extra?.backName,
    };
  };

  const flipCard = (card: TableCard) => {
    const resolved = resolveCard(card);
    if (!isDoubleFacedCard(resolved)) return;
    onFlip?.(resolved.instanceId, { backImageUrl: resolved.backImageUrl, backName: resolved.backName });
  };

  useEffect(() => {
    if (!isSelf) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        onDraw?.();
      } else if (event.key === '/' || event.key === 'f' || event.key === 'F') {
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
  }, [isSelf, onDraw, onLife, onPassTurn]);

  const showFace = (zone: ZoneName, card: TableCard) => {
    if (zone === 'graveyard' || zone === 'exile') {
      return !card.facedown || player.userId === viewerId;
    }
    if (card.facedown) return false;
    if (zone === 'battlefield' || zone === 'command') return true;
    if (zone === 'hand') return canSeeHandCard(player, card, viewerId);
    return false;
  };

  const openMenu = (event: MouseEvent, card: TableCard | null, from: ZoneName | 'libraryPile') => {
    event.preventDefault();
    event.stopPropagation();
    setHover(null);
    const pad = 8;
    const width = 252;
    const x = Math.min(event.clientX, window.innerWidth - width - pad);
    const y = Math.min(event.clientY, window.innerHeight - 360);
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
    if (isPlaymatAttachable(card) && (zone === 'hand' || zone === 'command' || (zone === 'battlefield' && !card.attachedTo))) {
      const hosts = allBattlefield.filter((item) => isAttachHostCandidate(item, card.instanceId));
      if (hosts.length > 0) {
        onStartAttach?.(card.instanceId);
        return;
      }
    }
    if (zone === 'battlefield') {
      onTap?.(card.instanceId);
      return;
    }
    const dest = primaryMove(zone);
    if (dest) {
      onMove?.(card.instanceId, zone, dest);
      return;
    }
    openMenu(event, card, zone);
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

  const renderOne = (zone: ZoneName, card: TableCard, size: 'sm' | 'md' | 'lg', extraClass = '') => {
    const resolved = resolveCard(card);
    const pickingHost = Boolean(attachPickId && zone === 'battlefield' && isAttachHostCandidate(resolved, attachPickId));
    return (
      <PlayCard
        key={card.instanceId}
        card={resolved}
        hideFace={!showFace(zone, resolved)}
        size={size}
        className={`${extraClass} ${pickingHost ? 'ring-2 ring-amber-300' : ''}`.trim()}
        canTransform={Boolean(canActOn(resolved) && isDoubleFacedCard(resolved))}
        onTransform={() => flipCard(resolved)}
        onClick={(event) => handleCardClick(event, resolved, zone)}
        onContextMenu={(event) => (canActOn(resolved) ? openMenu(event, resolved, zone) : event.preventDefault())}
        onDoubleClick={() => showFace(zone, resolved) && setLightbox(resolved)}
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

  const renderCards = (zone: ZoneName, cards: TableCard[], size: 'sm' | 'md' | 'lg', overlap = false) => {
    const peek = size === 'sm' ? 16 : size === 'lg' ? 22 : 18;
    const overlapClass =
      size === 'sm'
        ? '-ml-[2.5rem] sm:-ml-[3rem] hover:ml-0'
        : size === 'lg'
          ? '-ml-[5rem] sm:-ml-[6rem] md:-ml-[6.5rem] hover:ml-0'
          : '-ml-[4rem] sm:-ml-[5.25rem] hover:ml-0';
    return (
      <div className={`flex flex-wrap items-end ${overlap ? 'gap-0' : 'gap-1'}`}>
        {cards.map((card, index) => {
          const attached = zone === 'battlefield' ? attachmentsOn(card.instanceId, allBattlefield) : [];
          const extraClass = overlap && index > 0 ? overlapClass : '';
          if (attached.length === 0) {
            return renderOne(zone, card, size, extraClass);
          }
          return (
            <div
              key={card.instanceId}
              className="relative shrink-0"
              style={{ paddingTop: attached.length * peek }}
            >
              {attached.map((item, attachIndex) => (
                <div
                  key={item.instanceId}
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{ top: attachIndex * peek, zIndex: attachIndex }}
                >
                  {renderOne('battlefield', item, size)}
                </div>
              ))}
              <div className="relative" style={{ zIndex: attached.length + 1 }}>
                {renderOne(zone, card, size, extraClass)}
              </div>
            </div>
          );
        })}
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
    const size = compact ? 'w-[3.375rem] sm:w-[4.125rem]' : 'w-[4.125rem] sm:w-[5.025rem]';
    const shortLabel =
      zone === 'command' ? 'CMD' : zone === 'library' ? 'LIB' : zone === 'graveyard' ? 'CIM' : 'EXL';
    const count = cards.length;
    const revealed = zone === 'library' && (player.libraryTopRevealedTo?.length ?? 0) > 0;
    const hiddenInPile = (zone === 'graveyard' || zone === 'exile') && cards.some((card) => card.facedown);
    return (
      <div className="flex flex-col items-center gap-0.5 min-w-0">
        <p className="text-[8px] sm:text-[9px] font-semibold tracking-[0.14em] text-slate-700 uppercase leading-none truncate max-w-full">
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
            if (zone === 'library' && isSelf) {
              openMenu(event, resolvedTop || null, 'libraryPile');
              return;
            }
            if (isSelf && top) openMenu(event, resolveCard(top), zone);
            else event.preventDefault();
          }}
          className={`relative ${size} aspect-[63/88] rounded-md bg-[#241c2c] ring-1 ${
            canSeeTop ? 'ring-sky-300/70' : 'ring-amber-200/25'
          } shadow-[0_0_12px_rgba(212,178,74,0.15)] flex flex-col items-center justify-end pb-1 hover:ring-amber-300/70 shrink-0`}
          title={
            zone === 'library' && isSelf
              ? `Bibliothèque · ${count} cartes · clic : rechercher · clic droit : révéler`
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
          <span className="relative z-10 text-[10px] font-semibold bg-black/70 px-1.5 rounded">{count}</span>
          {isSelf && resolvedTop && isDoubleFacedCard(resolvedTop) && (
            <span
              role="button"
              title={resolvedTop.transformed ? 'Revenir au recto' : 'Voir le verso'}
              className="absolute bottom-0.5 right-0.5 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-[11px] text-amber-100 ring-1 ring-white/30 hover:bg-amber-500 hover:text-black"
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

  const lifeBlock = (
    <div className="flex flex-col items-center">
      {isSelf && (
        <div className="flex gap-0.5 mb-0.5">
          <button type="button" className="h-7 w-8 rounded bg-black/40 text-[10px] hover:bg-white/20" onClick={() => onLife?.(-5)} title="−5 PV (Shift+−)">
            −5
          </button>
          <button type="button" className="h-7 w-8 rounded bg-black/40 text-[10px] hover:bg-white/20" onClick={() => onLife?.(5)} title="+5 PV (Shift++)">
            +5
          </button>
        </div>
      )}
      <p className={`font-black leading-none tabular-nums ${compact ? 'text-2xl' : 'text-4xl'} ${player.life <= 5 ? 'text-red-400' : 'text-amber-50'}`}>
        {player.life}
      </p>
      {isSelf && (
        <div className="flex gap-0.5 mt-0.5">
          <button type="button" className="h-7 w-8 rounded bg-black/40 text-[10px] hover:bg-white/20" onClick={() => onLife?.(-1)} title="−1 PV (−)">
            −1
          </button>
          <button type="button" className="h-7 w-8 rounded bg-black/40 text-[10px] hover:bg-white/20" onClick={() => onLife?.(1)} title="+1 PV (+)">
            +1
          </button>
        </div>
      )}
      {player.poison > 0 && <p className="text-[11px] text-lime-300 mt-0.5">☠ {player.poison}</p>}
    </div>
  );

  const commanderLabel = player.command
    .map((card) => visibleCardFace(resolveCard(card)).name)
    .filter(Boolean)
    .join(' · ');

  const zoneTitle = (label: string, tone = 'text-black/70') => (
    <p className={`text-[8px] sm:text-[9px] font-semibold tracking-[0.16em] ${tone} uppercase leading-none px-1 mb-0.5`}>
      {label}
    </p>
  );

  const battlefieldZone = (
    <div className="flex-1 min-h-0 flex flex-col bg-[#2b4db8] border-y border-blue-900/40 px-1.5 py-1 overflow-hidden">
      <div className="flex items-center justify-between gap-1 mb-0.5">
        {zoneTitle('Champ de bataille', 'text-white/85')}
        {isSelf && (
          <button
            type="button"
            className="px-1.5 py-0.5 rounded bg-black/25 text-white text-[10px] hover:bg-black/40"
            onClick={() => setTokenOpen(true)}
            title="Ajouter un jeton"
          >
            Jeton
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center py-0.5">
        {other.length === 0 ? (
          <p className="text-xs text-white/50 italic py-2 text-center">
            {isSelf ? 'Cliquez une carte en main pour la poser, ou ajoutez un jeton.' : 'Aucun permanent.'}
          </p>
        ) : (
          renderCards('battlefield', other, compact ? 'sm' : 'md')
        )}
      </div>
    </div>
  );

  const landZone = (
    <div className="shrink-0 bg-[#e6b325] border-y border-yellow-700/40 px-1.5 py-1 min-h-[4.65rem]">
      {zoneTitle('Terrains')}
      {lands.length === 0 ? (
        <p className="text-[11px] text-black/40 italic text-center py-1">{isSelf ? 'Posez vos terrains ici.' : '—'}</p>
      ) : (
        <div className="flex justify-center overflow-x-auto">{renderCards('battlefield', lands, compact ? 'sm' : 'md')}</div>
      )}
    </div>
  );

  const handPlaceholders = (
    <div className="flex items-end justify-center gap-1.5 py-0.5">
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className="block w-12 sm:w-[3.75rem] aspect-[63/88] rounded-sm bg-white/90 ring-1 ring-black/20"
          aria-hidden
        />
      ))}
    </div>
  );

  const handZone = (
    <div className="shrink-0 bg-[#2f9a3a] border-y border-emerald-900/40 px-1.5 py-1">
      <div className="flex items-center justify-between gap-1 mb-0.5 min-h-[1.25rem]">
        {zoneTitle('Main')}
        {isSelf && (
          <div className="flex flex-wrap justify-end gap-1">
            <button type="button" className="px-2 py-0.5 rounded bg-amber-500 text-black text-[11px] font-semibold hover:bg-amber-400" onClick={onDraw} title="Piocher (D)">
              Piocher
            </button>
            <button type="button" className="px-1.5 py-0.5 rounded bg-black/25 text-white text-[10px] hover:bg-black/40" onClick={() => setLibraryOpen(true)}>
              Rechercher
            </button>
            <button
              type="button"
              className="px-1.5 py-0.5 rounded bg-black/25 text-white text-[10px] hover:bg-black/40"
              onClick={() => setLookMode('scry')}
              title="Regard (Scry)"
            >
              Regard
            </button>
            <button
              type="button"
              className="px-1.5 py-0.5 rounded bg-black/25 text-white text-[10px] hover:bg-black/40"
              onClick={() => setLookMode('surveil')}
              title="Surveillance (Surveil)"
            >
              Surveil
            </button>
            <button type="button" className="px-1.5 py-0.5 rounded bg-black/25 text-white text-[10px] hover:bg-black/40" onClick={() => setTokenOpen(true)}>
              Jeton
            </button>
            <button type="button" className="px-1.5 py-0.5 rounded bg-black/25 text-white text-[10px] hover:bg-black/40" onClick={onShuffle}>
              Mélanger
            </button>
            <button type="button" className="px-1.5 py-0.5 rounded bg-black/25 text-white text-[10px] hover:bg-black/40" onClick={onMulligan}>
              Mulligan
            </button>
            <button type="button" className="px-1.5 py-0.5 rounded bg-black/25 text-white text-[10px] hover:bg-black/40" onClick={onPassTurn}>
              Fin de tour
            </button>
            <button
              type="button"
              className="px-1.5 py-0.5 rounded bg-black/25 text-white text-[10px] hover:bg-black/40"
              onClick={(event) => openMenu(event, null, 'hand')}
            >
              {player.shownHandTo?.length ? 'Main montrée' : 'Montrer'}
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto min-h-[4.125rem]">
        {player.hand.length === 0 ? handPlaceholders : renderCards('hand', player.hand, compact || !isSelf ? 'sm' : 'lg', true)}
      </div>
    </div>
  );

  const enchantZone = (
    <div className="flex-1 min-h-0 bg-[#f4b6d2] border border-rose-400/60 rounded-sm px-1 py-1 overflow-hidden flex flex-col">
      {zoneTitle('Enchantment Zone')}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {enchantments.length === 0 ? (
          <p className="text-[10px] text-black/35 italic text-center py-3">—</p>
        ) : (
          renderCards('battlefield', enchantments, 'sm')
        )}
      </div>
    </div>
  );

  const pilesRow = (
    <div className="shrink-0 grid grid-cols-2 gap-1 py-1 px-0.5 place-items-center">
      {pile('library', isSelf ? () => setLibraryOpen(true) : undefined)}
      {pile('graveyard', () => setBrowseZone('graveyard'))}
      {pile('exile', () => setBrowseZone('exile'))}
      {pile('command')}
    </div>
  );

  return (
    <div
      className={`h-full min-h-0 flex flex-col rounded-xl overflow-hidden text-white ${
        isTurn ? 'ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.25)]' : 'ring-1 ring-amber-200/20'
      }`}
    >
      <div className="relative flex-1 min-h-0 flex bg-white">
        <aside className="relative z-10 shrink-0 w-[5.75rem] sm:w-[7.75rem] flex flex-col items-center gap-1.5 p-1.5 sm:p-2 border-r border-black/15 bg-white text-slate-900">
          {videoSlot}
          <p className="text-[8px] font-bold tracking-[0.2em] text-slate-500 -mt-1">CAM</p>
          <div className="min-w-0 w-full text-center">
            <p className="font-semibold truncate leading-tight text-xs sm:text-sm">
              {player.displayName || 'Joueur'}
            </p>
            <p className="text-[10px] text-slate-500 truncate" title={commanderLabel || undefined}>
              {commanderLabel || 'Commandant'}
            </p>
            {isTurn ? (
              <p className="text-[9px] font-medium text-amber-700 uppercase tracking-[0.18em] mt-0.5">Tour</p>
            ) : null}
          </div>
          <div className="w-full flex-1 min-h-[5.5rem] rounded-sm bg-[#6b1020] ring-1 ring-red-950 px-1 py-1.5 flex flex-col items-center justify-center text-white">
            <p className="text-[8px] font-semibold tracking-[0.08em] text-red-100/80 uppercase text-center leading-tight mb-1">
              Gestion de la vie
            </p>
            {lifeBlock}
            {isSelf && (
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 mt-1"
                onClick={() => onPoison?.(1)}
                title="Marqueur poison"
              >
                +☠
              </button>
            )}
          </div>
        </aside>

        <div className="relative z-10 flex-1 min-w-0 min-h-0 flex flex-col">
          {isSelf ? (
            <>
              {battlefieldZone}
              {landZone}
              {handZone}
            </>
          ) : (
            <>
              {handZone}
              {landZone}
              {battlefieldZone}
            </>
          )}
        </div>

        <aside className="relative z-10 shrink-0 w-[10rem] sm:w-[12rem] lg:w-[14.5rem] flex flex-col gap-1 p-1 bg-white border-l border-black/15">
          {isSelf ? (
            <>
              {enchantZone}
              {pilesRow}
            </>
          ) : (
            <>
              {pilesRow}
              {enchantZone}
            </>
          )}
        </aside>
      </div>

      {menu && isSelf && (
        <div className="fixed inset-0 z-[95]" onClick={() => setMenu(null)} onContextMenu={(event) => event.preventDefault()}>
          <div
            className="absolute w-[min(252px,calc(100vw-1.5rem))] rounded-xl bg-slate-800 text-white shadow-2xl ring-1 ring-white/15 p-2 max-h-[min(420px,calc(100vh-1rem))] overflow-y-auto"
            style={{
              left: Math.max(8, Math.min(menu.x, window.innerWidth - 268)),
              top: Math.max(8, Math.min(menu.y, window.innerHeight - 360)),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {menu.view !== 'root' && menu.card && (
              <button
                type="button"
                className="w-full text-left px-2 py-1 text-[11px] text-white/60 hover:text-white"
                onClick={() => setMenu({ ...menu, view: 'root' })}
              >
                ← Retour
              </button>
            )}
            <p className="px-2 py-1 text-sm font-medium truncate">
              {menu.from === 'libraryPile'
                ? 'Bibliothèque'
                : !menu.card
                  ? 'Main'
                  : showFace(menu.from, menu.card)
                    ? visibleCardFace(resolveCard(menu.card)).name
                    : menu.card.facedown
                      ? 'Carte'
                      : visibleCardFace(resolveCard(menu.card)).name}
            </p>
            {menu.view === 'showHand' || menu.view === 'showCard' || menu.view === 'revealTop' ? (
              <div className="flex flex-col gap-0.5">
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
            ) : (
              <>
                {menu.from === 'libraryPile' && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold mb-1"
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
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                    onClick={() => {
                      onTap?.(menu.card!.instanceId);
                      setMenu(null);
                    }}
                  >
                    {menu.card.tapped ? 'Dégager' : 'Engager'}
                  </button>
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
                  <div className="mt-1 pt-1 border-t border-white/10 space-y-0.5">
                    <p className="px-2 text-[10px] uppercase tracking-wider text-white/40">Bibliothèque</p>
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
                      onClick={() => setMenu({ ...menu, view: 'libraryPos' })}
                    >
                      N-ième depuis le dessus…
                    </button>
                  </div>
                )}
                {menu.card && menu.from !== 'libraryPile' && (
                  <div className="mt-1 pt-1 border-t border-white/10 grid grid-cols-2 gap-1">
                    {MOVE_TARGETS.filter((zone) => zone !== menu.from && zone !== primaryMove(menu.from as ZoneName)).map((zone) => (
                      <button
                        key={zone}
                        type="button"
                        className="text-left px-2 py-1 rounded hover:bg-white/10 text-[11px] text-white/80"
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
                        className="text-left px-2 py-1 rounded hover:bg-white/10 text-[11px] text-white/80"
                        onClick={() => {
                          onMove?.(menu.card!.instanceId, menu.from as ZoneName, 'graveyard', { facedown: true });
                          setMenu(null);
                        }}
                      >
                        Cimetière caché
                      </button>
                    )}
                    {menu.from !== 'exile' && (
                      <button
                        type="button"
                        className="text-left px-2 py-1 rounded hover:bg-white/10 text-[11px] text-white/80"
                        onClick={() => {
                          onMove?.(menu.card!.instanceId, menu.from as ZoneName, 'exile', { facedown: true });
                          setMenu(null);
                        }}
                      >
                        Exil caché
                      </button>
                    )}
                  </div>
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

      {libraryOpen && isSelf && (
        <LibrarySearchPanel
          cards={player.library}
          onClose={() => setLibraryOpen(false)}
          onTake={(card, to, options) => {
            onSearchLibrary?.(card.instanceId, to, options);
            if (options?.shuffle) setLibraryOpen(false);
          }}
        />
      )}

      {lookMode && isSelf && (
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
          cards={player[browseZone]}
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
          imageUrl={visibleCardFace(lightbox).imageUrl}
          name={visibleCardFace(lightbox).name}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

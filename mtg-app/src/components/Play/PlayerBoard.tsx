import { useEffect, useId, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { PlayerTableState, TableCard, ZoneName } from '../../types/play';
import { ZONE_LABELS } from '../../types/play';
import { splitBattlefield, isDoubleFacedCard, visibleCardFace } from '../../utils/playTable';
import { CardLightbox } from '../Card/CardLightbox';
import { CardHoverPreview } from '../Card/CardHoverPreview';
import { PlayCard, MTG_CARD_BACK_URL } from './PlayCard';
import { LibrarySearchPanel } from './LibrarySearchPanel';
import { useDfcFaces } from '../../hooks/useDfcFaces';

interface PlayerBoardProps {
  player: PlayerTableState;
  isSelf: boolean;
  isTurn: boolean;
  compact?: boolean;
  onDraw?: () => void;
  onShuffle?: () => void;
  onMulligan?: () => void;
  onPassTurn?: () => void;
  onLife?: (delta: number) => void;
  onPoison?: (delta: number) => void;
  onMove?: (instanceId: string, from: ZoneName, to: ZoneName) => void;
  onSearchLibrary?: (instanceId: string, to: ZoneName, options?: { toTop?: boolean; shuffle?: boolean }) => void;
  onTap?: (instanceId: string) => void;
  onFlip?: (instanceId: string, faces?: { backImageUrl?: string; backName?: string }) => void;
  videoSlot?: ReactNode;
}

const MOVE_TARGETS: ZoneName[] = ['battlefield', 'graveyard', 'exile', 'hand', 'library', 'command'];

interface MenuState {
  card: TableCard;
  from: ZoneName;
  x: number;
  y: number;
}

function primaryMove(from: ZoneName): ZoneName | null {
  if (from === 'hand' || from === 'command') return 'battlefield';
  if (from === 'battlefield') return 'graveyard';
  if (from === 'graveyard') return 'battlefield';
  if (from === 'exile') return 'battlefield';
  return null;
}

const MANA_PIPS: Array<{ cx: number; cy: number; fill: string }> = [
  { cx: 400, cy: 78, fill: '#f4f0d8' },
  { cx: 555, cy: 155, fill: '#3b82c4' },
  { cx: 555, cy: 325, fill: '#5b4a62' },
  { cx: 400, cy: 402, fill: '#6ec4c8' },
  { cx: 245, cy: 325, fill: '#c45c32' },
  { cx: 245, cy: 155, fill: '#3f8f4a' },
];

function PlaymatBackdrop() {
  const uid = useId().replace(/:/g, '');
  const feltId = `playmatFelt-${uid}`;
  return (
    <svg
      className="absolute inset-0 h-full w-full pointer-events-none"
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id={feltId} cx="50%" cy="48%" r="72%">
          <stop offset="0%" stopColor="#1a4a52" />
          <stop offset="42%" stopColor="#0e2c38" />
          <stop offset="100%" stopColor="#07141c" />
        </radialGradient>
      </defs>
      <rect width="800" height="500" fill={`url(#${feltId})`} />
      {[88, 132, 176, 222, 268].map((r) => (
        <circle key={r} cx="400" cy="240" r={r} fill="none" stroke="#d4b24a" strokeOpacity="0.28" strokeWidth="1.4" />
      ))}
      {MANA_PIPS.map((pip) => (
        <g key={`${pip.cx}-${pip.cy}`}>
          <circle cx={pip.cx} cy={pip.cy} r="16" fill="#0b1c24" stroke="#d4b24a" strokeOpacity="0.55" strokeWidth="1.2" />
          <circle cx={pip.cx} cy={pip.cy} r="8" fill={pip.fill} opacity="0.85" />
        </g>
      ))}
    </svg>
  );
}

export function PlayerBoard({
  player,
  isSelf,
  isTurn,
  compact = false,
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
  videoSlot,
}: PlayerBoardProps) {
  const [lightbox, setLightbox] = useState<TableCard | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [hover, setHover] = useState<{ card: TableCard; rect: DOMRect } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { lands, other } = useMemo(() => splitBattlefield(player.battlefield), [player.battlefield]);
  const dfcIds = useMemo(
    () =>
      [...player.hand, ...player.battlefield, ...player.graveyard, ...player.exile, ...player.command, ...player.library].map(
        (card) => card.scryfallId,
      ),
    [player],
  );
  const dfcFaces = useDfcFaces(dfcIds);

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

  const showFace = (zone: ZoneName, card: TableCard) =>
    !card.facedown && (isSelf || zone === 'battlefield' || zone === 'command' || zone === 'graveyard' || zone === 'exile');

  const openMenu = (event: MouseEvent, card: TableCard, from: ZoneName) => {
    event.preventDefault();
    event.stopPropagation();
    setHover(null);
    const pad = 8;
    const width = 220;
    const x = Math.min(event.clientX, window.innerWidth - width - pad);
    const y = Math.min(event.clientY, window.innerHeight - 280);
    setMenu({ card, from, x: Math.max(pad, x), y: Math.max(pad, y) });
  };

  const handleCardClick = (event: MouseEvent, card: TableCard, zone: ZoneName) => {
    if (!isSelf) {
      if (showFace(zone, card)) setLightbox(card);
      return;
    }
    if (event.shiftKey) {
      openMenu(event, card, zone);
      return;
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

  const renderCards = (zone: ZoneName, cards: TableCard[], size: 'sm' | 'md' | 'lg', overlap = false) => (
    <div className={`flex flex-wrap items-end ${overlap ? 'gap-0' : 'gap-1.5'}`}>
      {cards.map((card, index) => {
        const resolved = resolveCard(card);
        return (
          <PlayCard
            key={card.instanceId}
            card={resolved}
            hideFace={!showFace(zone, resolved)}
            size={size}
            className={overlap && index > 0 ? '-ml-5 sm:-ml-6 hover:ml-0' : ''}
            canTransform={Boolean(isSelf && isDoubleFacedCard(resolved))}
            onTransform={() => flipCard(resolved)}
            onClick={(event) => handleCardClick(event, resolved, zone)}
            onContextMenu={(event) => (isSelf ? openMenu(event, resolved, zone) : event.preventDefault())}
            onDoubleClick={() => showFace(zone, resolved) && setLightbox(resolved)}
            onMouseEnter={(event) => setCardHover(event, resolved, zone)}
            onMouseLeave={() => setHover(null)}
          />
        );
      })}
    </div>
  );

  const pile = (zone: 'library' | 'graveyard' | 'exile' | 'command', onPileClick?: () => void) => {
    const cards = player[zone];
    const top = zone === 'library' ? undefined : cards[cards.length - 1];
    const resolvedTop = top ? resolveCard(top) : undefined;
    const canSeeTop = resolvedTop && showFace(zone, resolvedTop);
    const topFace = resolvedTop ? visibleCardFace(resolvedTop) : undefined;
    const size = compact ? 'w-11 sm:w-12' : 'w-12 sm:w-[3.75rem]';
    const shortLabel =
      zone === 'command' ? 'Cmd' : zone === 'library' ? 'Lib' : zone === 'graveyard' ? 'Cim' : 'Exil';
    const count = cards.length;
    return (
      <div className="flex flex-col items-center gap-0.5 min-w-0">
        <p className="text-[8px] sm:text-[9px] font-semibold tracking-[0.14em] text-amber-200/80 uppercase leading-none truncate max-w-full">
          {shortLabel}
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
              event.preventDefault();
              setLibraryOpen(true);
              return;
            }
            if (isSelf && top) openMenu(event, resolveCard(top), zone);
            else event.preventDefault();
          }}
          className={`relative ${size} aspect-[63/88] rounded-md bg-[#241c2c] ring-1 ring-amber-200/25 shadow-[0_0_12px_rgba(212,178,74,0.15)] flex flex-col items-center justify-end pb-1 hover:ring-amber-300/70 shrink-0`}
          title={
            zone === 'library' && isSelf
              ? `Rechercher dans la bibliothèque (/) · ${count} cartes`
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

  return (
    <div
      className={`h-full min-h-0 flex flex-col rounded-xl overflow-hidden text-white ${
        isTurn ? 'ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.25)]' : 'ring-1 ring-amber-200/20'
      }`}
    >
      <div className="relative flex-1 min-h-0 flex">
        <PlaymatBackdrop />
        <div className="relative z-10 flex-1 min-w-0 min-h-0 flex flex-col px-2 pt-2 pb-1">
          <div className="shrink-0 flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0 flex items-center gap-2">
              {videoSlot}
              <div className="min-w-0">
                <p className="font-semibold truncate leading-tight text-sm drop-shadow">
                  {player.displayName || 'Joueur'}
                  {isSelf ? ' · vous' : ''}
                </p>
                {isTurn ? (
                  <p className="text-[10px] font-medium text-amber-300 uppercase tracking-[0.2em]">Tour</p>
                ) : !isSelf ? (
                  <p className="text-[11px] text-white/60">Main {player.hand.length}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-start gap-1 shrink-0">
              <div className="flex flex-col items-center">
                <p className="text-[8px] sm:text-[9px] font-semibold tracking-[0.22em] text-amber-200/80 uppercase">PV</p>
                {lifeBlock}
              </div>
              {isSelf && (
                <button
                  type="button"
                  className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 mt-4"
                  onClick={() => onPoison?.(1)}
                  title="Marqueur poison"
                >
                  +☠
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-y-auto py-1">
            <p className="text-[8px] sm:text-[9px] font-semibold tracking-[0.22em] text-amber-200/70 uppercase mb-1">
              Champ de bataille
            </p>
            {other.length === 0 ? (
              <p className="text-xs text-white/35 italic py-4 text-center">
                {isSelf ? 'Cliquez une carte en main pour la poser.' : 'Aucun permanent.'}
              </p>
            ) : (
              renderCards('battlefield', other, compact ? 'sm' : 'md')
            )}
          </div>

          <div className="shrink-0 min-h-[3.5rem] border-t border-amber-200/15 pt-1">
            <p className="text-[8px] sm:text-[9px] font-semibold tracking-[0.22em] text-amber-200/70 uppercase mb-1 text-center">
              Terrains
            </p>
            {lands.length === 0 ? (
              <p className="text-[11px] text-white/30 italic text-center py-2">
                {isSelf ? 'Posez vos terrains ici.' : '—'}
              </p>
            ) : (
              <div className="flex justify-center overflow-x-auto">{renderCards('battlefield', lands, compact ? 'sm' : 'md')}</div>
            )}
          </div>
        </div>

        <div className="relative z-10 shrink-0 w-[6.75rem] sm:w-[8.25rem] flex flex-col justify-center gap-2 py-2 pr-1.5 pl-1 bg-black/25 border-l border-amber-200/15">
          <div className="grid grid-cols-2 gap-x-1.5 gap-y-2 place-items-center">
            {pile('command')}
            {pile('exile')}
            {pile('library', isSelf ? () => setLibraryOpen(true) : undefined)}
            {pile('graveyard')}
          </div>
        </div>
      </div>

      {isSelf && (
        <div className="shrink-0 border-t border-amber-200/20 bg-black/55 px-2 pt-2 pb-2">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <button type="button" className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400" onClick={onDraw} title="Piocher (D)">
              Piocher
            </button>
            <button
              type="button"
              className="px-2 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20"
              onClick={() => setLibraryOpen(true)}
              title="Rechercher dans la bibliothèque (/)"
            >
              Rechercher
            </button>
            <button type="button" className="px-2 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20" onClick={onShuffle}>
              Mélanger
            </button>
            <button type="button" className="px-2 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20" onClick={onMulligan}>
              Mulligan
            </button>
            <button type="button" className="px-2 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20" onClick={onPassTurn} title="Passer le tour (Ctrl+Entrée)">
              Fin de tour
            </button>
            <span className="ml-auto text-[11px] text-white/40 hidden md:inline">
              Clic : poser / engager · Clic droit : déplacer · Survol : aperçu
            </span>
          </div>
          <div className="overflow-x-auto pb-1">
            {player.hand.length === 0 ? (
              <p className="text-xs text-white/40 px-1">Main vide</p>
            ) : (
              renderCards('hand', player.hand, compact ? 'md' : 'lg', true)
            )}
          </div>
        </div>
      )}

      {menu && isSelf && (
        <div className="fixed inset-0 z-[95]" onClick={() => setMenu(null)} onContextMenu={(event) => event.preventDefault()}>
          <div
            className="absolute w-[min(220px,calc(100vw-1.5rem))] rounded-xl bg-slate-800 text-white shadow-2xl ring-1 ring-white/15 p-2"
            style={{
              left: Math.max(8, Math.min(menu.x, window.innerWidth - 236)),
              top: Math.max(8, Math.min(menu.y, window.innerHeight - 280)),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="px-2 py-1 text-sm font-medium truncate">
              {menu.card.facedown ? 'Carte' : visibleCardFace(resolveCard(menu.card)).name}
            </p>
            {primaryMove(menu.from) && (
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold mb-1"
                onClick={() => {
                  const dest = primaryMove(menu.from);
                  if (dest) onMove?.(menu.card.instanceId, menu.from, dest);
                  setMenu(null);
                }}
              >
                {menu.from === 'hand' || menu.from === 'command' ? 'Poser' : `Vers ${ZONE_LABELS[primaryMove(menu.from) as ZoneName]}`}
              </button>
            )}
            {menu.from === 'battlefield' && (
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                onClick={() => {
                  onTap?.(menu.card.instanceId);
                  setMenu(null);
                }}
              >
                {menu.card.tapped ? 'Dégager' : 'Engager'}
              </button>
            )}
            {isDoubleFacedCard(resolveCard(menu.card)) && (
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm"
                onClick={() => {
                  flipCard(menu.card);
                  setMenu(null);
                }}
              >
                {resolveCard(menu.card).transformed ? 'Revenir au recto' : 'Retourner (verso)'}
              </button>
            )}
            {showFace(menu.from, menu.card) && (
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
            <div className="mt-1 pt-1 border-t border-white/10 grid grid-cols-2 gap-1">
              {MOVE_TARGETS.filter((zone) => zone !== menu.from && zone !== primaryMove(menu.from)).map((zone) => (
                <button
                  key={zone}
                  type="button"
                  className="text-left px-2 py-1 rounded hover:bg-white/10 text-[11px] text-white/80"
                  onClick={() => {
                    onMove?.(menu.card.instanceId, menu.from, zone);
                    setMenu(null);
                  }}
                >
                  {ZONE_LABELS[zone]}
                </button>
              ))}
            </div>
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

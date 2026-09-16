import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDecks } from '../hooks/useDecks';
import { useCollection } from '../hooks/useCollection';
import { useAuth } from '../hooks/useAuth';
import { useWishlist } from '../hooks/useWishlist';
import { useDeckOwnership } from '../hooks/useDeckOwnership';
import { useToast } from '../context/ToastContext';
import { errorHandler } from '../services/errorHandler';
import { validateDeck, canPublish } from '../services/deckFormatRules';
import { parseDecklistText, exportDecklistText } from '../services/decklistParser';
import { searchCardByName, searchCards } from '../services/scryfallSearchService';
import { getCardPriceFromMTGJSON } from '../services/mtgjsonPriceServiceAPI';
import { mtgCardToDeckEntry } from '../utils/deckEntry';
import { Button } from '../components/UI/Button';
import { Spinner } from '../components/UI/Spinner';
import { Modal } from '../components/UI/Modal';
import { ManaCostDisplay } from '../components/UI/ManaCostDisplay';
import { LazyImage } from '../components/UI/LazyImage';
import { DeckCardGrid, type DeckViewMode } from '../components/Deck/DeckCardGrid';
import { SampleHandModal } from '../components/Deck/SampleHandModal';
import { groupDeckEntries } from '../utils/deckGrouping';
import {
  DECK_FORMAT_LABELS,
  countEntries,
  type DeckEntry,
  type DeckZone,
} from '../types/deck';
import type { MTGCard } from '../types/card';
import * as deckService from '../services/deckService';

type BuilderTab = DeckZone;

const VIEW_MODE_KEY = 'deck-builder-view-mode';

function loadViewMode(): DeckViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === 'list' || v === 'grid') return v;
  } catch {
    /* ignore */
  }
  return 'grid';
}

export function DeckBuilder() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const {
    decks,
    loading: decksLoading,
    removeCardFromDeck,
    updateCardQuantity,
    addCardToDeck,
    updateDeck,
    setVisibility,
    forkDeck,
    refresh,
  } = useDecks();
  const { cards: collectionCards } = useCollection();
  const { addItem, items: wishlistItems } = useWishlist(currentUser?.uid);
  const { showSuccess, showError } = useToast();

  const [remoteDeck, setRemoteDeck] = useState<Awaited<
    ReturnType<typeof deckService.getDeckById>
  > | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<BuilderTab>('mainboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MTGCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [addingMissing, setAddingMissing] = useState(false);
  const [viewMode, setViewMode] = useState<DeckViewMode>(loadViewMode);
  const [showSampleHand, setShowSampleHand] = useState(false);

  const ownedDeck = decks.find((d) => d.id === deckId);
  const deck = ownedDeck || remoteDeck;
  const isOwner = Boolean(ownedDeck && currentUser && ownedDeck.userId === currentUser.uid);
  const readOnly = Boolean(deck && !isOwner);

  useEffect(() => {
    if (ownedDeck || !deckId) {
      setRemoteDeck(null);
      return;
    }
    let cancelled = false;
    setRemoteLoading(true);
    deckService
      .getDeckById(deckId)
      .then((d) => {
        if (!cancelled) setRemoteDeck(d);
      })
      .catch(() => {
        if (!cancelled) setRemoteDeck(null);
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, ownedDeck]);

  useEffect(() => {
    if (deck) {
      setDescriptionDraft(deck.description || '');
      setTagsDraft((deck.tags || []).join(', '));
    }
  }, [deck?.id, deck?.description, deck?.tags]);

  const ownership = useDeckOwnership(deck, collectionCards);

  const validation = useMemo(
    () => (deck ? validateDeck(deck, 'draft') : null),
    [deck]
  );

  const entriesForTab = useMemo((): DeckEntry[] => {
    if (!deck) return [];
    if (activeTab === 'commanders') return deck.commanders;
    return deck.cards[activeTab] || [];
  }, [deck, activeTab]);

  const mainCount = deck ? countEntries(deck.cards.mainboard) + countEntries(deck.commanders) : 0;
  const sideCount = deck ? countEntries(deck.cards.sideboard) : 0;

  const manaCurve = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0, 0, 0]; // 0..5, 6+
    if (!deck) return buckets;
    for (const e of [...deck.cards.mainboard, ...deck.commanders]) {
      const cmc = Math.floor(e.cmc ?? 0);
      const idx = cmc >= 6 ? 6 : Math.max(0, cmc);
      buckets[idx] += e.quantity;
    }
    return buckets;
  }, [deck]);

  const typeBreakdown = useMemo(() => {
    if (!deck) return [];
    return groupDeckEntries(deck.cards.mainboard);
  }, [deck]);

  useEffect(() => {
    if (!deck) {
      setEstimatedPrice(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let total = 0;
      let any = false;
      const list = [
        ...deck.commanders,
        ...deck.cards.mainboard,
        ...deck.cards.sideboard,
      ];
      for (const e of list) {
        try {
          const p = await getCardPriceFromMTGJSON(e.name, e.setCode);
          const usd = p?.usd ? parseFloat(p.usd) : NaN;
          if (!Number.isNaN(usd)) {
            total += usd * e.quantity;
            any = true;
          }
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setEstimatedPrice(any ? Math.round(total * 100) / 100 : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [deck]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchCards(searchQuery.trim(), 12);
        if (!cancelled) setSearchResults(results);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery]);

  const handleAddCard = useCallback(
    async (card: MTGCard, zone: DeckZone = activeTab) => {
      if (!deckId || !isOwner) return;
      try {
        const entry = mtgCardToDeckEntry(card, zone === 'commanders' ? 1 : 1);
        await addCardToDeck(deckId, entry, entry.quantity, zone);
        showSuccess(`${card.name} ajoutée`);
        setSearchQuery('');
        setSearchResults([]);
      } catch (err) {
        errorHandler.handleAndShowError(err);
      }
    },
    [deckId, isOwner, activeTab, addCardToDeck, showSuccess]
  );

  const handleImport = async () => {
    if (!deckId || !isOwner) return;
    const lines = parseDecklistText(importText);
    if (!lines.length) {
      showError('Aucune ligne valide détectée');
      return;
    }
    setImporting(true);
    try {
      let ok = 0;
      let fail = 0;
      for (const line of lines) {
        try {
          let card: MTGCard | null = null;
          if (line.setCode && line.collectorNumber) {
            const results = await searchCards(
              `!"${line.name}" set:${line.setCode} cn:${line.collectorNumber}`,
              1
            );
            card = results[0] || null;
          }
          if (!card) {
            card = await searchCardByName(line.name);
          }
          if (!card?.id) {
            fail++;
            continue;
          }
          const entry = mtgCardToDeckEntry(card, line.quantity);
          await addCardToDeck(deckId, entry, line.quantity, line.zone);
          ok++;
        } catch {
          fail++;
        }
      }
      await refresh();
      setShowImport(false);
      setImportText('');
      showSuccess(`Import : ${ok} ok${fail ? `, ${fail} échecs` : ''}`);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    if (!deck) return;
    const text = exportDecklistText({
      commanders: deck.commanders,
      mainboard: deck.cards.mainboard,
      sideboard: deck.cards.sideboard,
      maybeboard: deck.cards.maybeboard,
    });
    void navigator.clipboard.writeText(text).then(
      () => showSuccess('Decklist copiée dans le presse-papiers'),
      () => {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${deck.name.replace(/\s+/g, '_')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    );
  };

  const handlePublish = async () => {
    if (!deck || !deckId || !isOwner) return;
    const result = canPublish(deck);
    if (!result.ok) {
      showError(result.errors[0]?.message || 'Deck non valide pour le partage');
      return;
    }
    setPublishing(true);
    try {
      await setVisibility(deckId, 'public', true);
      showSuccess('Deck publié dans la communauté');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!deckId || !isOwner) return;
    try {
      await setVisibility(deckId, 'private', false);
      showSuccess('Deck rendu privé');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const handleShareUnlisted = async () => {
    if (!deckId || !isOwner) return;
    try {
      await setVisibility(deckId, 'unlisted', false);
      const url = `${window.location.origin}/decks/${deckId}`;
      await navigator.clipboard.writeText(url);
      showSuccess('Lien unlisted copié');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const handleSaveMeta = async () => {
    if (!deckId || !isOwner) return;
    try {
      const tags = tagsDraft
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20);
      await updateDeck(deckId, {
        description: descriptionDraft.trim(),
        tags,
      });
      showSuccess('Métadonnées enregistrées');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const handleFork = async () => {
    if (!deckId) return;
    try {
      const newId = await forkDeck(deckId);
      showSuccess('Deck copié dans votre espace');
      navigate(`/decks/${newId}`);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  };

  const handleAddMissingToWishlist = async () => {
    if (!currentUser || ownership.missing.length === 0) return;
    setAddingMissing(true);
    try {
      let added = 0;
      for (const row of ownership.missing) {
        const e = row.entry;
        const already = wishlistItems.some(
          (w) =>
            (e.scryfallId && w.scryfallId === e.scryfallId) ||
            (w.name.toLowerCase() === e.name.toLowerCase() &&
              (w.setCode || '').toLowerCase() === (e.setCode || '').toLowerCase())
        );
        if (already) continue;
        await addItem(
          e.name,
          row.missingQty,
          undefined,
          e.setCode,
          e.collectorNumber,
          e.rarity,
          'en',
          `Manquant du deck « ${deck?.name} »`
        );
        added++;
      }
      showSuccess(
        added > 0
          ? `${added} carte(s) ajoutée(s) à la wishlist`
          : 'Tous les manquants sont déjà dans la wishlist'
      );
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setAddingMissing(false);
    }
  };

  if (decksLoading || remoteLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">Deck introuvable</p>
        <Button onClick={() => navigate('/decks')}>Retour aux decks</Button>
      </div>
    );
  }

  const tabs: { id: BuilderTab; label: string; show: boolean }[] = [
    { id: 'commanders', label: 'Commanders', show: deck.format === 'commander' || deck.commanders.length > 0 },
    { id: 'mainboard', label: `Main (${countEntries(deck.cards.mainboard)})`, show: true },
    { id: 'sideboard', label: `Side (${countEntries(deck.cards.sideboard)})`, show: deck.format !== 'commander' },
    { id: 'maybeboard', label: `Maybe (${countEntries(deck.cards.maybeboard)})`, show: true },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="secondary" onClick={() => navigate(isOwner ? '/decks' : '/community/decks')} className="mb-4">
          ← Retour
        </Button>
        <div className="flex flex-wrap justify-between gap-4 items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{deck.name}</h1>
              <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {DECK_FORMAT_LABELS[deck.format]}
              </span>
              <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                {deck.visibility}
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Main {mainCount}
              {deck.format !== 'commander' ? ` · Side ${sideCount}` : ''}
              {estimatedPrice != null ? ` · ~$${estimatedPrice}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowSampleHand(true)}>
              Sample hand
            </Button>
            <Button variant="secondary" onClick={handleExport}>
              Exporter
            </Button>
            {isOwner && (
              <>
                <Button variant="secondary" onClick={() => setShowImport(true)}>
                  Importer liste
                </Button>
                {deck.visibility === 'public' ? (
                  <Button variant="secondary" onClick={handleUnpublish}>
                    Rendre privé
                  </Button>
                ) : (
                  <Button onClick={handlePublish} loading={publishing}>
                    Publier
                  </Button>
                )}
                <Button variant="secondary" onClick={handleShareUnlisted}>
                  Lien unlisted
                </Button>
              </>
            )}
            {readOnly && (
              <Button onClick={handleFork}>Copier dans mes decks</Button>
            )}
          </div>
        </div>
      </div>

      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="mb-4 space-y-1">
          {validation.errors.map((i) => (
            <div key={i.code + i.message} className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded">
              {i.message}
            </div>
          ))}
          {validation.warnings.slice(0, 5).map((i) => (
            <div key={i.code + i.message} className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 rounded">
              {i.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {!readOnly && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Ajouter une carte ({activeTab})
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher sur Scryfall…"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              {searching && (
                <div className="py-2">
                  <Spinner size="sm" />
                </div>
              )}
              {searchResults.length > 0 && (
                <ul className="mt-2 max-h-64 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
                  {searchResults.map((card) => (
                    <li key={card.id}>
                      <button
                        type="button"
                        onClick={() => handleAddCard(card)}
                        className="w-full flex items-center gap-3 px-2 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                      >
                        {card.imageUrl && (
                          <LazyImage src={card.imageUrl} alt={card.name} className="w-10 h-14 object-cover rounded" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-900 dark:text-white truncate">{card.name}</div>
                          <div className="text-xs text-gray-500">
                            {card.set?.toUpperCase()} · {card.rarity}
                          </div>
                        </div>
                        {card.manaCost && <ManaCostDisplay manaCost={card.manaCost} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <div className="flex flex-wrap gap-2">
              {tabs
                .filter((t) => t.show)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      activeTab === t.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
            </div>
            <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setViewMode('grid');
                  try {
                    localStorage.setItem(VIEW_MODE_KEY, 'grid');
                  } catch {
                    /* ignore */
                  }
                }}
                className={`px-3 py-1 text-sm rounded-md ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                Grille
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('list');
                  try {
                    localStorage.setItem(VIEW_MODE_KEY, 'list');
                  } catch {
                    /* ignore */
                  }
                }}
                className={`px-3 py-1 text-sm rounded-md ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                Liste
              </button>
            </div>
          </div>

          {entriesForTab.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {readOnly ? 'Aucune carte dans cette zone.' : 'Ajoutez des cartes via la recherche ou importez une liste.'}
              {isOwner && (
                <div className="mt-4">
                  <Link to="/collection" className="text-blue-600 hover:underline">
                    Ou depuis votre collection
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <DeckCardGrid
              entries={entriesForTab}
              zone={activeTab}
              readOnly={readOnly}
              viewMode={viewMode}
              onIncrement={(entry) =>
                updateCardQuantity(deck.id, entry.scryfallId, entry.quantity + 1, activeTab)
              }
              onDecrement={(entry) =>
                updateCardQuantity(deck.id, entry.scryfallId, entry.quantity - 1, activeTab)
              }
              onRemove={(entry) => removeCardFromDeck(deck.id, entry.scryfallId, activeTab)}
            />
          )}
        </div>

        <aside className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Possession</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {ownership.totalOwned} / {ownership.totalNeeded}
            </p>
            <p className="text-sm text-gray-500 mb-2">{ownership.completionPercent}% de la decklist</p>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden mb-3">
              <div
                className="h-full bg-green-500"
                style={{ width: `${ownership.completionPercent}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Manquantes : {ownership.totalMissing}
            </p>
            {isOwner && ownership.missing.length > 0 && (
              <Button
                className="w-full"
                loading={addingMissing}
                onClick={handleAddMissingToWishlist}
              >
                Ajouter manquants à la wishlist
              </Button>
            )}
            {ownership.missing.length > 0 && (
              <ul className="mt-3 max-h-48 overflow-y-auto text-sm space-y-1">
                {ownership.missing.slice(0, 40).map((row) => (
                  <li key={row.entry.scryfallId} className="text-gray-700 dark:text-gray-300">
                    {row.missingQty}× {row.entry.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Courbe de mana</h3>
            <div className="flex items-end gap-1 h-24">
              {manaCurve.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div
                    className="w-full bg-blue-500 rounded-t min-h-[2px]"
                    style={{ height: `${Math.max(4, (v / Math.max(...manaCurve, 1)) * 100)}%` }}
                    title={`${i === 6 ? '6+' : i}: ${v}`}
                  />
                  <span className="text-[10px] text-gray-500 mt-1">{i === 6 ? '6+' : i}</span>
                </div>
              ))}
            </div>
          </div>

          {typeBreakdown.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Répartition (main)</h3>
              <ul className="space-y-1 text-sm">
                {typeBreakdown.map((g) => (
                  <li
                    key={g.id}
                    className="flex justify-between text-gray-700 dark:text-gray-300"
                  >
                    <span>{g.label}</span>
                    <span className="font-medium tabular-nums">{g.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isOwner && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Description & tags</h3>
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <input
                type="text"
                value={tagsDraft}
                onChange={(e) => setTagsDraft(e.target.value)}
                placeholder="tags, séparés, par, virgules"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <Button variant="secondary" className="w-full" onClick={handleSaveMeta}>
                Enregistrer
              </Button>
            </div>
          )}

          {!isOwner && deck.description && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">Description</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{deck.description}</p>
            </div>
          )}
        </aside>
      </div>

      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Importer une decklist" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Formats supportés : Moxfield / Arena / MTGO (`4 Lightning Bolt`, sections Deck / Sideboard /
            Commander).
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={14}
            className="w-full px-3 py-2 font-mono text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder={`4 Lightning Bolt\n1 Sol Ring (C21) 7\n\nSideboard\n2 Rest in Peace`}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowImport(false)}>
              Annuler
            </Button>
            <Button onClick={handleImport} loading={importing} disabled={!importText.trim()}>
              Importer
            </Button>
          </div>
        </div>
      </Modal>

      <SampleHandModal
        isOpen={showSampleHand}
        onClose={() => setShowSampleHand(false)}
        mainboard={deck.cards.mainboard}
        deckName={deck.name}
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDecks } from '../hooks/useDecks';
import { useCollection } from '../hooks/useCollection';
import { useUserCollections } from '../hooks/useUserCollections';
import { useAuth } from '../hooks/useAuth';
import { useWishlist } from '../hooks/useWishlist';
import { useDeckOwnership } from '../hooks/useDeckOwnership';
import { useToast } from '../context/ToastContext';
import { errorHandler } from '../services/errorHandler';
import { validateDeck, canPublish, formatIssuesByCardId } from '../services/deckFormatRules';
import { parseDecklistText, exportDecklistText } from '../services/decklistParser';
import { useProfile } from '../hooks/useProfile';
import { searchCardByName, searchCards } from '../services/scryfallSearchService';
import { fetchSetsWithIcons } from '../services/scryfallSetIconsService';
import { getCardPriceFromMTGJSON } from '../services/mtgjsonPriceServiceAPI';
import { mtgCardToDeckEntry, userCardToMtgCard } from '../utils/deckEntry';
import { suggestBasicLands } from '../utils/autoLands';
import {
  EMPTY_CARD_SEARCH_FILTERS,
  hasActiveCardSearchFilters,
  userCardMatchesSearch,
  type CardSearchFilters,
} from '../utils/cardSearchFilters';
import { Button } from '../components/UI/Button';
import { Spinner } from '../components/UI/Spinner';
import { Modal } from '../components/UI/Modal';
import { ManaCostDisplay } from '../components/UI/ManaCostDisplay';
import { LazyImage } from '../components/UI/LazyImage';
import { SearchInput } from '../components/UI/SearchInput';
import { CardSearchFilterBar } from '../components/Card/CardSearchFilterBar';
import { CardHoverPreview } from '../components/Card/CardHoverPreview';
import { CardLightbox } from '../components/Card/CardLightbox';
import { DeckCardGrid, type DeckViewMode } from '../components/Deck/DeckCardGrid';
import { DeckCoverCard } from '../components/Deck/DeckCoverCard';
import { SampleHandModal } from '../components/Deck/SampleHandModal';
import { ShoppingListModal, deckEntryAsMtgCard } from '../components/Deck/ShoppingListModal';
import { SwapPrintModal } from '../components/Deck/SwapPrintModal';
import { groupDeckEntries } from '../utils/deckGrouping';
import { findSwappableEntries } from '../utils/deckPrintSwap';
import type { OwnershipRow } from '../hooks/useDeckOwnership';
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
    replaceEntry,
    refresh,
  } = useDecks();
  const { cards: collectionCards, allCards } = useCollection();
  const { collections: userCollections } = useUserCollections(currentUser?.uid);
  const { profile } = useProfile();
  const { addItem, items: wishlistItems } = useWishlist(currentUser?.uid);
  const { showSuccess, showError } = useToast();
  const preferredLanguage = profile?.preferredLanguage === 'fr' ? 'fr' : 'en';

  const [remoteDeck, setRemoteDeck] = useState<Awaited<
    ReturnType<typeof deckService.getDeckById>
  > | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<BuilderTab>('mainboard');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<CardSearchFilters>(EMPTY_CARD_SEARCH_FILTERS);
  const [searchSets, setSearchSets] = useState<Array<{ code: string; name: string }>>([]);
  const [searchResults, setSearchResults] = useState<MTGCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchInCollectionOnly, setSearchInCollectionOnly] = useState(false);
  const [searchCollectionId, setSearchCollectionId] = useState<string | null>(null);
  const [searchQtyById, setSearchQtyById] = useState<Record<string, number>>({});
  const [searchSelectedIds, setSearchSelectedIds] = useState<string[]>([]);
  const [addingSearch, setAddingSearch] = useState(false);
  const [searchHover, setSearchHover] = useState<{
    name: string;
    imageUrl?: string;
    rect: DOMRect;
  } | null>(null);
  const [searchLightbox, setSearchLightbox] = useState<{
    name: string;
    imageUrl?: string;
  } | null>(null);
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
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [swapTarget, setSwapTarget] = useState<DeckEntry | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [addingLands, setAddingLands] = useState(false);

  const ownedDeck = decks.find((d) => d.id === deckId);
  const deck = ownedDeck || remoteDeck;
  const isOwner = Boolean(ownedDeck && currentUser && ownedDeck.userId === currentUser.uid);
  const readOnly = Boolean(deck && !isOwner);

  useEffect(() => {
    if (!deckId || ownedDeck) {
      setRemoteDeck(null);
      setRemoteLoading(false);
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
  }, [deckId, ownedDeck?.id]);

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
  const formatIssues = useMemo(
    () => (validation ? formatIssuesByCardId(validation) : new Map()),
    [validation]
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

  const landSuggestion = useMemo(
    () => (deck ? suggestBasicLands(deck) : null),
    [deck]
  );

  const typeBreakdown = useMemo(() => {
    if (!deck) return [];
    return groupDeckEntries(deck.cards.mainboard);
  }, [deck]);

  const swappableIds = useMemo(() => {
    if (!deck || readOnly) return new Set<string>();
    const entries =
      activeTab === 'commanders' ? deck.commanders : deck.cards[activeTab] || [];
    return new Set(findSwappableEntries(entries, collectionCards).map((e) => e.scryfallId));
  }, [deck, activeTab, collectionCards, readOnly]);

  const collectionSearchSets = useMemo(() => {
    const map = new Map<string, string>();
    const pool = allCards.length > 0 ? allCards : collectionCards;
    for (const card of pool) {
      const code = card.setCode || card.set || card.mtgData?.set;
      if (!code) continue;
      map.set(code, card.mtgData?.setName || code);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([code, name]) => ({ code, name }));
  }, [allCards, collectionCards]);

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
    let cancelled = false;
    fetchSetsWithIcons()
      .then((sets) => {
        if (cancelled) return;
        const preferred = new Set([
          'core',
          'expansion',
          'commander',
          'masters',
          'draft_innovation',
          'funny',
          'starter',
        ]);
        setSearchSets(
          sets
            .filter((s) => preferred.has(s.set_type))
            .map((s) => ({ code: s.code, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const hasFilters = hasActiveCardSearchFilters(searchFilters);
    const hasQuery = searchQuery.trim().length >= 2;
    if (!hasQuery && !hasFilters) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    if (searchInCollectionOnly) {
      const pool = (allCards.length > 0 ? allCards : collectionCards).filter((card) =>
        searchCollectionId ? card.collectionId === searchCollectionId : true
      );
      const seen = new Set<string>();
      const results: MTGCard[] = [];
      for (const card of pool) {
        if (!userCardMatchesSearch(card, searchQuery, searchFilters)) continue;
        const mtg = userCardToMtgCard(card);
        if (!mtg?.id || seen.has(mtg.id)) continue;
        seen.add(mtg.id);
        results.push(mtg);
        if (results.length >= 40) break;
      }
      setSearchResults(results);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchCards(
          searchQuery.trim(),
          20,
          preferredLanguage,
          searchFilters
        );
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
  }, [
    searchQuery,
    searchFilters,
    preferredLanguage,
    searchInCollectionOnly,
    searchCollectionId,
    allCards,
    collectionCards,
  ]);

  const handleAddCards = useCallback(
    async (items: Array<{ card: MTGCard; quantity: number }>) => {
      if (!deckId || !isOwner || items.length === 0) return;
      const isCommanderZone = activeTab === 'commanders';
      setAddingSearch(true);
      try {
        let ok = 0;
        for (const { card, quantity } of items) {
          const qty = isCommanderZone ? 1 : Math.max(1, quantity);
          const entry = mtgCardToDeckEntry(card, qty);
          await deckService.addEntryToDeck(deckId, entry, activeTab);
          ok++;
        }
        await refresh();
        if (ok === 1) {
          const only = items[0];
          const qty = isCommanderZone ? 1 : Math.max(1, only.quantity);
          showSuccess(qty > 1 ? `${only.card.name} ×${qty} ajoutée` : `${only.card.name} ajoutée`);
        } else {
          const totalQty = items.reduce(
            (sum, item) => sum + (isCommanderZone ? 1 : Math.max(1, item.quantity)),
            0
          );
          showSuccess(`${totalQty} cartes ajoutées`);
        }
        setSearchSelectedIds([]);
      } catch (err) {
        errorHandler.handleAndShowError(err);
      } finally {
        setAddingSearch(false);
      }
    },
    [deckId, isOwner, activeTab, refresh, showSuccess]
  );

  const handleAddCard = useCallback(
    async (card: MTGCard, quantity = 1) => {
      await handleAddCards([{ card, quantity }]);
    },
    [handleAddCards]
  );

  const handleAddAutoLands = useCallback(async () => {
    if (!deckId || !isOwner || !deck) return;
    const suggestion = suggestBasicLands(deck);
    if (suggestion.reason === 'no_spells') {
      showError('Ajoutez d’abord des sorts pour estimer les terrains.');
      return;
    }
    if (suggestion.reason === 'already_enough') {
      showError(
        `Le deck a déjà ${suggestion.currentLands} terrains (cible ${suggestion.targetLands}).`
      );
      return;
    }
    if (suggestion.reason === 'deck_full' || suggestion.toAdd <= 0) {
      showError('Plus de place pour des terrains dans ce format.');
      return;
    }
    setAddingLands(true);
    try {
      let added = 0;
      const parts: string[] = [];
      for (const basic of suggestion.basics) {
        const card = await searchCardByName(basic.name);
        if (!card?.id) continue;
        const entry = mtgCardToDeckEntry(card, basic.quantity);
        await deckService.addEntryToDeck(deckId, entry, 'mainboard');
        added += basic.quantity;
        parts.push(`${basic.quantity} ${card.name}`);
      }
      await refresh();
      setActiveTab('mainboard');
      if (added === 0) {
        showError('Impossible de récupérer les terrains de base.');
        return;
      }
      showSuccess(`${added} terrains ajoutés : ${parts.join(', ')}`);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setAddingLands(false);
    }
  }, [deckId, isOwner, deck, refresh, showSuccess, showError]);

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

  const handleAddMissingToWishlist = async (rows?: OwnershipRow[]) => {
    const missingRows = rows ?? ownership.missing;
    if (!currentUser || missingRows.length === 0) return;
    setAddingMissing(true);
    try {
      let added = 0;
      for (const row of missingRows) {
        const e = row.entry;
        const already = wishlistItems.some(
          (w) =>
            (e.scryfallId && w.scryfallId === e.scryfallId) ||
            (w.name.toLowerCase() === e.name.toLowerCase() &&
              (w.setCode || '').toLowerCase() === (e.setCode || '').toLowerCase())
        );
        if (already) continue;
        const mtg = deckEntryAsMtgCard(e);
        await addItem(
          e.name,
          row.missingQty,
          mtg,
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
      setShowShoppingList(false);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setAddingMissing(false);
    }
  };

  const handleSwapPrint = async (
    oldScryfallId: string,
    newEntry: DeckEntry,
    zone: DeckZone
  ) => {
    if (!deckId) return;
    setSwapBusy(true);
    try {
      await replaceEntry(deckId, zone, oldScryfallId, newEntry);
      showSuccess(`Impression remplacée : ${newEntry.setCode?.toUpperCase() || newEntry.name}`);
      setSwapTarget(null);
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setSwapBusy(false);
    }
  };

  if ((decksLoading || remoteLoading) && !deck) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="page-shell text-center">
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
    <div className="page-shell">
      <div className="mb-6">
        <Button variant="secondary" onClick={() => navigate(isOwner ? '/decks' : '/community/decks')} className="mb-4">
          ← Retour
        </Button>
        <DeckCoverCard deck={deck} className="mb-2">
          <div className="flex flex-col lg:flex-row lg:flex-wrap justify-between gap-4 items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="page-title text-white drop-shadow">{deck.name}</h1>
                <span className="text-xs px-2 py-1 rounded bg-white/20 text-white backdrop-blur-sm">
                  {DECK_FORMAT_LABELS[deck.format]}
                </span>
                <span className="text-xs px-2 py-1 rounded bg-white/15 text-white/90">
                  {deck.visibility}
                </span>
              </div>
              <p className="text-white/80 mt-2">
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
        </DeckCoverCard>
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
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ajouter une carte ({activeTab})
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={searchInCollectionOnly}
                  onClick={() => setSearchInCollectionOnly((v) => !v)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    searchInCollectionOnly
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600'
                  }`}
                  title="Limiter la recherche aux cartes que vous possédez"
                >
                  <span
                    className={`inline-block w-8 h-4 rounded-full relative ${
                      searchInCollectionOnly ? 'bg-white/30' : 'bg-gray-400 dark:bg-gray-500'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                        searchInCollectionOnly ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </span>
                  Collection uniquement
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <SearchInput
                    type="text"
                    placeholder={
                      searchInCollectionOnly
                        ? 'Rechercher dans votre collection (nom, mot-clé, type…)'
                        : 'Rechercher une carte ou un mot-clé (ex: Flying, Vol, Trample…) — Entrée pour lancer'
                    }
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      setSearchQuery(e.target.value);
                    }}
                    onSuggestionSelect={(suggestion) => {
                      setSearchInput(suggestion);
                      setSearchQuery(suggestion);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setSearchQuery(searchInput);
                      }
                    }}
                    showKeywordSuggestions={true}
                    className="pl-10"
                  />
                  <svg
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                {(searchQuery || searchInput || hasActiveCardSearchFilters(searchFilters)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSearchQuery('');
                      setSearchFilters(EMPTY_CARD_SEARCH_FILTERS);
                      setSearchResults([]);
                    }}
                    className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                    title="Effacer la recherche"
                  >
                    ✕
                  </button>
                )}
              </div>
              {searchInCollectionOnly && userCollections.length > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Quelle collection ?
                  </label>
                  <select
                    value={searchCollectionId || ''}
                    onChange={(e) => setSearchCollectionId(e.target.value || null)}
                    className="field-control sm:max-w-xs"
                  >
                    <option value="">Toutes mes collections</option>
                    {userCollections.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <CardSearchFilterBar
                filters={searchFilters}
                onChange={setSearchFilters}
                sets={searchInCollectionOnly ? collectionSearchSets : searchSets}
              />
              {searching && (
                <div className="py-2">
                  <Spinner size="sm" />
                </div>
              )}
              {!searching &&
                searchResults.length === 0 &&
                (searchQuery.trim().length >= 2 || hasActiveCardSearchFilters(searchFilters)) && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {searchInCollectionOnly
                      ? 'Aucune carte de la collection ne correspond.'
                      : 'Aucun résultat Scryfall.'}
                  </p>
                )}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <ul
                    className="max-h-72 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-100 dark:border-gray-700"
                    onScroll={() => setSearchHover(null)}
                  >
                    {searchResults.map((card) => {
                      const cardId = card.id || card.name;
                      const selected = searchSelectedIds.includes(cardId);
                      const qty = searchQtyById[cardId] || 1;
                      const commanderZone = activeTab === 'commanders';
                      return (
                        <li key={cardId} className={selected ? 'bg-blue-50 dark:bg-blue-950/30' : ''}>
                          <div className="flex flex-wrap items-center gap-2 px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selected}
                              aria-label={`Sélectionner ${card.name}`}
                              onChange={(e) => {
                                setSearchSelectedIds((prev) =>
                                  e.target.checked
                                    ? [...prev, cardId]
                                    : prev.filter((id) => id !== cardId)
                                );
                              }}
                              className="w-4 h-4 flex-shrink-0 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                            />
                            {card.imageUrl && (
                              <button
                                type="button"
                                className="flex-shrink-0 rounded cursor-zoom-in border-0 bg-transparent p-0"
                                title="Survolez pour agrandir"
                                aria-label={`Voir ${card.name} en grand`}
                                onMouseEnter={(e) => {
                                  setSearchHover({
                                    name: card.name,
                                    imageUrl: card.imageUrl,
                                    rect: e.currentTarget.getBoundingClientRect(),
                                  });
                                }}
                                onMouseLeave={() => setSearchHover(null)}
                                onClick={() =>
                                  setSearchLightbox({
                                    name: card.name,
                                    imageUrl: card.imageUrl,
                                  })
                                }
                              >
                                <LazyImage
                                  src={card.imageUrl}
                                  alt=""
                                  className="w-10 h-14 object-cover rounded pointer-events-none"
                                />
                              </button>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-900 dark:text-white truncate">
                                {card.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {card.set?.toUpperCase()} · {card.rarity}
                                {card.type ? ` · ${card.type}` : ''}
                                {searchInCollectionOnly ? ' · collection' : ''}
                              </div>
                            </div>
                            {card.manaCost && <ManaCostDisplay manaCost={card.manaCost} />}
                            {!commanderZone && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-40"
                                  disabled={qty <= 1}
                                  onClick={() =>
                                    setSearchQtyById((prev) => ({
                                      ...prev,
                                      [cardId]: Math.max(1, qty - 1),
                                    }))
                                  }
                                >
                                  −
                                </button>
                                <span className="w-6 text-center text-sm text-gray-900 dark:text-white">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-40"
                                  disabled={qty >= 99}
                                  onClick={() =>
                                    setSearchQtyById((prev) => ({
                                      ...prev,
                                      [cardId]: Math.min(99, qty + 1),
                                    }))
                                  }
                                >
                                  +
                                </button>
                              </div>
                            )}
                            <Button
                              type="button"
                              className="flex-shrink-0"
                              size="sm"
                              disabled={addingSearch}
                              onClick={() => handleAddCard(card, commanderZone ? 1 : qty)}
                            >
                              Ajouter
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={() => {
                        const ids = searchResults
                          .map((c) => c.id || c.name)
                          .filter(Boolean);
                        setSearchSelectedIds((prev) =>
                          prev.length === ids.length ? [] : ids
                        );
                      }}
                    >
                      {searchSelectedIds.length === searchResults.length
                        ? 'Tout désélectionner'
                        : 'Tout sélectionner'}
                    </button>
                    <Button
                      type="button"
                      disabled={addingSearch || searchSelectedIds.length === 0}
                      onClick={() => {
                        const items = searchResults
                          .filter((card) => searchSelectedIds.includes(card.id || card.name))
                          .map((card) => ({
                            card,
                            quantity: searchQtyById[card.id || card.name] || 1,
                          }));
                        void handleAddCards(items);
                      }}
                    >
                      {addingSearch
                        ? 'Ajout…'
                        : searchSelectedIds.length === 0
                          ? 'Ajouter la sélection'
                          : `Ajouter la sélection (${searchSelectedIds.length})`}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 overflow-x-auto">
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
              swappableIds={swappableIds}
              formatIssues={formatIssues}
              onSwapPrint={(entry) => setSwapTarget(entry)}
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
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
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
            {isOwner && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setShowShoppingList(true)}
                  disabled={ownership.missing.length === 0}
                >
                  Liste d&apos;achats
                </Button>
                {ownership.missing.length > 0 && (
                  <Button
                    className="w-full"
                    loading={addingMissing}
                    onClick={() => void handleAddMissingToWishlist()}
                  >
                    Ajouter manquants à la wishlist
                  </Button>
                )}
              </div>
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

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
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
            {isOwner && landSuggestion && (
              <div className="mt-3 space-y-2">
                <Button
                  className="w-full"
                  loading={addingLands}
                  disabled={addingLands}
                  onClick={() => void handleAddAutoLands()}
                >
                  Ajouter les terrains
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {landSuggestion.reason === 'ok'
                    ? `Cible ${landSuggestion.targetLands} (courbe ${landSuggestion.avgCmc.toFixed(1)}) · +${landSuggestion.toAdd} : ${landSuggestion.basics.map((b) => `${b.quantity} ${b.name}`).join(', ')}`
                    : landSuggestion.reason === 'already_enough'
                      ? `Déjà ${landSuggestion.currentLands} terrains (cible ${landSuggestion.targetLands}).`
                      : landSuggestion.reason === 'no_spells'
                        ? 'Ajoutez des sorts pour estimer la base.'
                        : 'Plus de place pour des terrains.'}
                </p>
              </div>
            )}
          </div>

          {typeBreakdown.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
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
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
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
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
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
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
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

      <ShoppingListModal
        isOpen={showShoppingList}
        onClose={() => setShowShoppingList(false)}
        deckName={deck.name}
        missing={ownership.missing}
        onAddToWishlist={handleAddMissingToWishlist}
        wishlistBusy={addingMissing}
      />

      {searchHover && !searchLightbox && (
        <CardHoverPreview
          name={searchHover.name}
          imageUrl={searchHover.imageUrl}
          anchorRect={searchHover.rect}
        />
      )}

      {searchLightbox && (
        <CardLightbox
          name={searchLightbox.name}
          imageUrl={searchLightbox.imageUrl}
          onClose={() => setSearchLightbox(null)}
        />
      )}

      <SwapPrintModal
        isOpen={!!swapTarget}
        onClose={() => setSwapTarget(null)}
        entry={swapTarget}
        zone={activeTab}
        collectionCards={collectionCards}
        onSwap={handleSwapPrint}
        busy={swapBusy}
      />
    </div>
  );
}

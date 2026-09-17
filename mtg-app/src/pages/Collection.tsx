import { useState, useRef, useMemo, useDeferredValue, startTransition, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useCollection } from '../hooks/useCollection';
import { useAllCollections } from '../hooks/useAllCollections';
import { useUserCollections } from '../hooks/useUserCollections';
import { useDecks } from '../hooks/useDecks';
import { useWishlist } from '../hooks/useWishlist';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import { errorHandler } from '../services/errorHandler';
import { CardDisplay } from '../components/Card/CardDisplay';
import { VirtualizedCardGrid } from '../components/Card/VirtualizedCardGrid';
import { Button } from '../components/UI/Button';
import { SearchInput } from '../components/UI/SearchInput';
import { findKeyword, findKeywordAction, findAbilityWord, cardHasKeyword } from '../utils/keywordSearch';
import { normalizeSearchQueryToEnglish } from '../services/searchQueryNormalizer';
import { searchMatchesText } from '../utils/fuzzyMatch';
import { Modal } from '../components/UI/Modal';
import { AvatarDisplay } from '../components/UI/AvatarDisplay';
import { ManaSymbol } from '../components/UI/ManaSymbol';
import { ExportModal } from '../components/Export/ExportModal';
import { ImportModal } from '../components/Import/ImportModal';
import { ProgressBar } from '../components/UI/ProgressBar';
import { Spinner } from '../components/UI/Spinner';
import { userCardToDeckEntry } from '../utils/deckEntry';
import { rarityLabel, sortRarities } from '../utils/cardSearchFilters';
import { DECK_FORMATS, DECK_FORMAT_LABELS, type DeckFormat } from '../types/deck';
import { getDeckBackdropUrl } from '../utils/deckArt';
import { getFormatSummary } from '../services/deckFormatRules';

export function Collection() {
  const { currentUser } = useAuth();
  const { owners, loading: loadingOwners } = useAllCollections();
  const { collections: userCollections, loading: loadingUserCollections, createCollection, refresh: refreshUserCollections } = useUserCollections(currentUser?.uid ?? undefined);
  const { showSuccess } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  
  const isViewingOwnCollection = !selectedUserId || selectedUserId === currentUser?.uid;
  const effectiveCollectionId = isViewingOwnCollection ? selectedCollectionId : undefined;
  
  const { 
    cards, 
    allCards,
    loading,
    loadingMore,
    error, 
    deleteCard,
    updateCardQuantity,
    updateCard,
    canModify,
    loadMoreCards,
    hasMoreCards,
    importCSV,
    importProgress,
    pauseImport,
    resumeImport,
    cancelImport,
    isImportPaused,
  } = useCollection(
    selectedUserId === 'all' ? 'all' : (selectedUserId || undefined),
    effectiveCollectionId ?? undefined
  );
  const { decks, createDeck, addCardToDeck } = useDecks();
  
  const { addItem: addToWishlist, removeItem: removeFromWishlist, checkIfInWishlist, items: wishlistItems } = useWishlist(
    isViewingOwnCollection ? currentUser?.uid : undefined
  );
  
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showDeckModal, setShowDeckModal] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // États pour la recherche et les filtres
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [exclusiveColors, setExclusiveColors] = useState(false);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedCreatureType, setSelectedCreatureType] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<DeckFormat>('modern');
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [cardToMove, setCardToMove] = useState<import('../types/card').UserCard | null>(null);
  const [moveTargetCollectionId, setMoveTargetCollectionId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const isViewingAllCollections = selectedUserId === 'all';
  const currentOwner = owners.find(o => o.userId === (selectedUserId || currentUser?.uid));
  const myOwner = owners.find(o => o.userId === currentUser?.uid);
  const [userSelectOpen, setUserSelectOpen] = useState(false);
  const userSelectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userSelectRef.current && !userSelectRef.current.contains(event.target as Node)) {
        setUserSelectOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddToDeck = useCallback((cardId: string) => {
    setSelectedCardId(cardId);
    setShowDeckModal(true);
  }, []);

  const handleMoveToCollection = useCallback((card: import('../types/card').UserCard) => {
    setCardToMove(card);
    setMoveTargetCollectionId(null);
  }, []);

  const handleConfirmMoveToCollection = useCallback(async () => {
    if (!cardToMove || !moveTargetCollectionId || !canModify) return;
    try {
      setMoving(true);
      await updateCard(cardToMove.id, { collectionId: moveTargetCollectionId });
      setCardToMove(null);
      setMoveTargetCollectionId(null);
      showSuccess('Carte déplacée dans l\'autre collection');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setMoving(false);
    }
  }, [cardToMove, moveTargetCollectionId, canModify, updateCard, showSuccess]);

  const handleToggleWishlist = useCallback(async (card: import('../types/card').UserCard) => {
    if (!isViewingOwnCollection) return;
    
    try {
      const alreadyInWishlist = await checkIfInWishlist(
        card.name,
        card.setCode || card.set,
        card.collectorNumber
      );
      
      if (alreadyInWishlist) {
        // Retirer de la wishlist
        const wishlistItem = wishlistItems.find(item => 
          item.name.toLowerCase() === card.name.toLowerCase() &&
          (item.setCode || item.set || '').toLowerCase() === (card.setCode || card.set || '').toLowerCase() &&
          (item.collectorNumber || '') === (card.collectorNumber || '')
        );
        
        if (wishlistItem) {
          await removeFromWishlist(wishlistItem.id);
          showSuccess(`${card.name} a été retirée de votre wishlist`);
        }
      } else {
        // Ajouter à la wishlist
        await addToWishlist(
          card.name,
          1,
          card.mtgData,
          card.setCode || card.set,
          card.collectorNumber,
          card.rarity,
          card.language
        );
        
        showSuccess(`${card.name} a été ajoutée à votre wishlist`);
      }
    } catch (error) {
      errorHandler.handleAndShowError(error);
    }
  }, [isViewingOwnCollection, addToWishlist, removeFromWishlist, checkIfInWishlist, wishlistItems, showSuccess]);

  const handleSelectDeck = useCallback(async (deckId: string) => {
    if (!selectedCardId) return;
    const card = cards.find((c) => c.id === selectedCardId) || allCards.find((c) => c.id === selectedCardId);
    if (!card) {
      errorHandler.handleAndShowError(new Error('Carte introuvable'));
      return;
    }

    try {
      const entry = userCardToDeckEntry(card, 1);
      await addCardToDeck(deckId, entry, 1, 'mainboard');
      setShowDeckModal(false);
      setSelectedCardId(null);
      showSuccess('Carte ajoutée au deck');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  }, [selectedCardId, cards, allCards, addCardToDeck, showSuccess]);

  const handleCreateDeck = useCallback(async () => {
    if (!newDeckName.trim() || !selectedCardId) return;
    const card = cards.find((c) => c.id === selectedCardId) || allCards.find((c) => c.id === selectedCardId);
    if (!card) return;

    try {
      setIsCreatingDeck(true);
      const deckId = await createDeck({
        name: newDeckName.trim(),
        format: newDeckFormat,
      });
      const entry = userCardToDeckEntry(card, 1);
      await addCardToDeck(deckId, entry, 1, 'mainboard');
      setShowDeckModal(false);
      setSelectedCardId(null);
      setNewDeckName('');
      setNewDeckFormat('modern');
      showSuccess('Deck créé et carte ajoutée');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setIsCreatingDeck(false);
    }
  }, [newDeckName, newDeckFormat, selectedCardId, cards, allCards, createDeck, addCardToDeck, showSuccess]);

  // Créer un Set des cartes dans la wishlist pour vérification rapide
  const wishlistCardSet = useMemo(() => {
    const set = new Set<string>();
    wishlistItems.forEach(item => {
      // Utiliser la même logique de clé que dans isCardInWishlist
      const setCode = (item.setCode || item.set || '').toLowerCase();
      const key = `${item.name.toLowerCase()}_${setCode}_${item.collectorNumber || ''}`;
      set.add(key);
    });
    return set;
  }, [wishlistItems]);

  // Fonction pour vérifier si une carte est dans la wishlist
  const isCardInWishlist = useCallback((card: import('../types/card').UserCard): boolean => {
    if (!isViewingOwnCollection) {
      return false;
    }
    const setCode = (card.setCode || card.set || '').toLowerCase();
    const key = `${card.name.toLowerCase()}_${setCode}_${card.collectorNumber || ''}`;
    return wishlistCardSet.has(key);
  }, [isViewingOwnCollection, wishlistCardSet]);

  // Différer les valeurs des filtres
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredSelectedColors = useDeferredValue(selectedColors);
  const deferredExclusiveColors = useDeferredValue(exclusiveColors);
  const deferredSelectedRarities = useDeferredValue(selectedRarities);
  const deferredSelectedType = useDeferredValue(selectedType);
  const deferredSelectedCreatureType = useDeferredValue(selectedCreatureType);
  const deferredSelectedSet = useDeferredValue(selectedSet);

  // Filtrer les cartes
  const filteredCards = useMemo(() => {
    let filtered = [...allCards];

    // Filtre par nom (recherche) et/ou mots-clés — même résultats en français ou anglais (ex. "bâton" = "staff")
    if (deferredSearchQuery.trim()) {
      const query = deferredSearchQuery.toLowerCase();
      const normalizedQuery = normalizeSearchQueryToEnglish(deferredSearchQuery).toLowerCase();
      const queryVariants = [query];
      if (normalizedQuery !== query) queryVariants.push(normalizedQuery);

      const keyword = findKeyword(deferredSearchQuery);
      const keywordAction = findKeywordAction(deferredSearchQuery);
      const abilityWord = findAbilityWord(deferredSearchQuery);

      filtered = filtered.filter(card => {
        const cardName = card.name || '';
        const cardText = card.mtgData?.text || '';
        const cardType = card.mtgData?.type || '';
        const subtypes = card.mtgData?.subtypes || [];
        const fullText = `${cardName} ${cardText} ${cardType} ${subtypes.join(' ')}`;

        const nameMatch =
          queryVariants.some(q => cardName.toLowerCase().includes(q)) ||
          queryVariants.some(q => searchMatchesText(cardName, q));

        const creatureTypeMatch = subtypes.some(subtype => {
          const st = subtype.toLowerCase();
          return (
            queryVariants.some(q => st.includes(q.toLowerCase())) ||
            queryVariants.some(q => searchMatchesText(subtype, q))
          );
        });

        let keywordMatch = false;
        if (keyword || keywordAction || abilityWord) {
          const fullTextLower = fullText.toLowerCase();
          if (keyword) {
            keywordMatch = cardHasKeyword(fullTextLower, keyword);
          } else if (keywordAction) {
            keywordMatch = fullTextLower.includes(keywordAction.en.toLowerCase()) ||
                          fullTextLower.includes(keywordAction.fr.toLowerCase());
          } else if (abilityWord) {
            keywordMatch = fullTextLower.includes(abilityWord.en.toLowerCase()) ||
                          fullTextLower.includes(abilityWord.fr.toLowerCase());
          }
        }

        const exactTextMatch = queryVariants.some(q => fullText.toLowerCase().includes(q));
        const fuzzyTextMatch = queryVariants.some(q => searchMatchesText(fullText, q));

        return nameMatch || creatureTypeMatch || keywordMatch || exactTextMatch || fuzzyTextMatch;
      });
    }

    // Filtre par couleur
    if (deferredSelectedColors.length > 0) {
      filtered = filtered.filter(card => {
        const cardColors = card.mtgData?.colors || [];
        const normalizedCardColors = cardColors.map(c => c.toUpperCase());
        const normalizedSelectedColors = deferredSelectedColors.map(c => c.toUpperCase());
        
        if (normalizedSelectedColors.includes('COLORLESS')) {
          const otherColors = normalizedSelectedColors.filter(c => c !== 'COLORLESS');
          if (otherColors.length === 0) {
            return normalizedCardColors.length === 0;
          }
          const colorsToMatch = otherColors;
          
          if (deferredExclusiveColors) {
            return normalizedCardColors.length === colorsToMatch.length &&
                   colorsToMatch.every(color => normalizedCardColors.includes(color));
          } else {
            return colorsToMatch.some(color => normalizedCardColors.includes(color));
          }
        }
        
        if (deferredExclusiveColors) {
          return normalizedCardColors.length === normalizedSelectedColors.length &&
                 normalizedSelectedColors.every(color => normalizedCardColors.includes(color));
        } else {
          return normalizedSelectedColors.some(color => normalizedCardColors.includes(color));
        }
      });
    }

    // Filtre par rareté (OU : une des raretés cochées)
    if (deferredSelectedRarities.length > 0) {
      const selected = new Set(deferredSelectedRarities.map((rarity) => rarity.toLowerCase()));
      filtered = filtered.filter((card) => {
        const mtgRarity = (card.mtgData?.rarity || '').toLowerCase();
        const cardRarity = (card.rarity || '').toLowerCase();
        return selected.has(mtgRarity) || selected.has(cardRarity);
      });
    }

    // Filtre par type
    if (deferredSelectedType) {
      filtered = filtered.filter(card => {
        const types = card.mtgData?.types || [];
        return types.some(t => t.toLowerCase() === deferredSelectedType.toLowerCase());
      });
    }

    // Filtre par type de créature
    if (deferredSelectedCreatureType) {
      filtered = filtered.filter(card => {
        const subtypes = card.mtgData?.subtypes || [];
        return subtypes.some(subtype => 
          subtype.toLowerCase() === deferredSelectedCreatureType.toLowerCase()
        );
      });
    }

    // Filtre par édition
    if (deferredSelectedSet) {
      filtered = filtered.filter(card => {
        const cardSet = card.set || card.setCode || card.mtgData?.set || '';
        return cardSet.toLowerCase() === deferredSelectedSet.toLowerCase();
      });
    }

    return filtered;
  }, [allCards, deferredSearchQuery, deferredSelectedColors, deferredExclusiveColors, deferredSelectedRarities, deferredSelectedType, deferredSelectedCreatureType, deferredSelectedSet]);

  // Pré-calculer le Map des cartes par nom
  const cardsByNameMap = useMemo(() => {
    const uniqueCards = new Map<string, typeof filteredCards[0]>();
    filteredCards.forEach(card => {
      if (!uniqueCards.has(card.id)) {
        uniqueCards.set(card.id, card);
      }
    });
    const deduplicatedCards = Array.from(uniqueCards.values());
    
    const map = new Map<string, typeof filteredCards[0][]>();
    deduplicatedCards.forEach(card => {
      if (!map.has(card.name)) {
        map.set(card.name, []);
      }
      map.get(card.name)!.push(card);
    });
    return { deduplicatedCards, map };
  }, [filteredCards]);

  const availableRarities = useMemo(() => {
    const rarities = new Set<string>();
    allCards.forEach((card) => {
      const rarity = (card.mtgData?.rarity || card.rarity || '').toLowerCase();
      if (rarity) rarities.add(rarity);
    });
    return sortRarities(Array.from(rarities));
  }, [allCards]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    allCards.forEach(card => {
      card.mtgData?.types?.forEach(type => types.add(type));
    });
    return Array.from(types).sort();
  }, [allCards]);

  const availableCreatureTypes = useMemo(() => {
    const creatureTypes = new Set<string>();
    allCards.forEach(card => {
      if (card.mtgData?.subtypes && card.mtgData.subtypes.length > 0) {
        card.mtgData.subtypes.forEach(subtype => creatureTypes.add(subtype));
      }
    });
    return Array.from(creatureTypes).sort();
  }, [allCards]);

  const availableSets = useMemo(() => {
    const sets = new Map<string, string>();
    allCards.forEach(card => {
      const setCode = card.set || card.setCode || card.mtgData?.set;
      const setName = card.mtgData?.setName;
      if (setCode) {
        sets.set(setCode, setName || setCode);
      }
    });
    return Array.from(sets.entries())
      .sort((a, b) => {
        const nameA = a[1].toLowerCase();
        const nameB = b[1].toLowerCase();
        if (nameA !== nameB) {
          return nameA.localeCompare(nameB);
        }
        return a[0].localeCompare(b[0]);
      });
  }, [allCards]);

  // IntersectionObserver pour charger plus de cartes
  useEffect(() => {
    if (!hasMoreCards || loadingMore) return;

    let observer: IntersectionObserver | null = null;
    let rafId: number | null = null;
    let cancelled = false;

    const checkAndSetup = () => {
      if (cancelled) return;
      if (!loadMoreRef.current) {
        rafId = requestAnimationFrame(checkAndSetup);
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          if (cancelled) return;
          if (entries[0].isIntersecting && hasMoreCards && !loadingMore && loadMoreCards) {
            loadMoreCards();
          }
        },
        { rootMargin: '200px' }
      );

      observer.observe(loadMoreRef.current);
    };

    rafId = requestAnimationFrame(checkAndSetup);

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (observer && loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
        observer.disconnect();
      }
    };
  }, [hasMoreCards, loadingMore, loadMoreCards]);

  const showLoadingMore = loadingMore && cards.length > 0;
  const useVirtualGrid = Boolean(cardsByNameMap && cardsByNameMap.deduplicatedCards.length > 100);

  if (loading || loadingOwners) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="page-shell bg-gray-50 dark:bg-gray-900 flex flex-col h-full min-h-0 overflow-hidden !py-3">
      {/* 1. Menu en haut avec select pour choisir la collection */}
      <div className="mb-4 shrink-0">
        <h1 className="sr-only">Collection</h1>
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1 min-w-0" ref={userSelectRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Utilisateur :
            </label>
            <div className="relative w-full">
              <button
                type="button"
                onClick={() => setUserSelectOpen((o) => !o)}
                className="w-full flex items-center gap-3 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left min-h-[44px]"
              >
                {selectedUserId === 'all' ? (
                  <>
                    <span className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-lg" aria-hidden>📚</span>
                    <span className="flex-1 min-w-0 truncate">Toutes les Collections</span>
                  </>
                ) : (
                  <>
                    {currentOwner?.profile?.avatarId ? (
                      <AvatarDisplay avatarId={currentOwner.profile.avatarId} size="md" />
                    ) : (
                      <span className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-sm" aria-hidden>?</span>
                    )}
                    <span className="flex-1 min-w-0 truncate">
                      {currentOwner?.profile?.pseudonym || currentOwner?.profile?.email || currentUser?.email || 'Moi'}
                      {currentOwner?.cardCount != null && ` (${currentOwner.cardCount} cartes)`}
                    </span>
                  </>
                )}
                <svg className={`w-5 h-5 text-gray-500 transition-transform ${userSelectOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {userSelectOpen && (
                <ul
                  className="absolute z-20 mt-1 w-full py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-lg max-h-60 overflow-auto"
                  role="listbox"
                >
                  <li
                    role="option"
                    aria-selected={(selectedUserId || currentUser?.uid) === currentUser?.uid}
                    onClick={() => {
                      setSelectedUserId(null);
                      setUserSelectOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {myOwner?.profile?.avatarId ? (
                      <AvatarDisplay avatarId={myOwner.profile.avatarId} size="sm" />
                    ) : (
                      <span className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-sm" aria-hidden>?</span>
                    )}
                    <span>{myOwner?.profile?.pseudonym || myOwner?.profile?.email || currentUser?.email || 'Moi'}</span>
                    {myOwner?.cardCount != null && <span className="text-gray-500 dark:text-gray-400 text-sm">({myOwner.cardCount} cartes)</span>}
                  </li>
                  <li
                    role="option"
                    aria-selected={selectedUserId === 'all'}
                    onClick={() => {
                      setSelectedUserId('all');
                      setUserSelectOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <span className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-sm" aria-hidden>📚</span>
                    <span>Toutes les Collections</span>
                  </li>
                  {owners
                    .filter((o) => o.userId !== currentUser?.uid)
                    .map((owner) => (
                      <li
                        key={owner.userId}
                        role="option"
                        aria-selected={selectedUserId === owner.userId}
                        onClick={() => {
                          setSelectedUserId(owner.userId);
                          setSelectedCollectionId(null);
                          setUserSelectOpen(false);
                        }}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {owner.profile?.avatarId ? (
                          <AvatarDisplay avatarId={owner.profile.avatarId} size="sm" />
                        ) : (
                          <span className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-sm" aria-hidden>?</span>
                        )}
                        <span>{owner.profile?.pseudonym || owner.profile?.email || 'Utilisateur'}</span>
                        <span className="text-gray-500 dark:text-gray-400 text-sm">({owner.cardCount} cartes)</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          {isViewingOwnCollection && !isViewingAllCollections && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Quelle collection ?
                </label>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="secondary"
                    onClick={() => setShowImportModal(true)}
                  >
                    Importer une collection
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setShowExportModal(true)}
                    disabled={cards.length === 0}
                  >
                    Exporter la collection
                  </Button>
                </div>
              </div>
              <select
                value={selectedCollectionId ?? ''}
                onChange={(e) => setSelectedCollectionId(e.target.value === '' ? null : e.target.value)}
                className="field-control w-full"
              >
                <option value="">Toutes mes collections</option>
                {loadingUserCollections ? (
                  <option disabled>Chargement...</option>
                ) : (
                  userCollections.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 3. Zones de recherche */}
      <div className="mb-3 space-y-3 shrink-0">
        {/* Barre de recherche */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <SearchInput
              type="text"
              placeholder="Rechercher une carte ou un mot-clé (ex: Flying, Vol, Trample...) - Appuyez sur Entrée pour rechercher"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {(searchQuery || searchInput) && (
            <button
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
              }}
              className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
              title="Effacer la recherche"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-3 items-start">
          {/* Filtre par couleur */}
          <div className="filter-chip sm:min-w-0">
            <label>Couleur</label>
            <div className="grid grid-cols-3 gap-1 w-max">
              {(['W', 'U', 'B', 'R', 'G', 'Colorless'] as const).map(color => (
                <button
                  key={color}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const newColors = selectedColors.includes(color)
                      ? selectedColors.filter(c => c !== color)
                      : [...selectedColors, color];
                    flushSync(() => {
                      setSelectedColors(newColors);
                    });
                    startTransition(() => {});
                  }}
                  className={`p-1.5 rounded-lg transition-all min-h-[36px] min-w-[36px] inline-flex items-center justify-center ${
                    selectedColors.includes(color)
                      ? 'bg-blue-600 dark:bg-blue-500 ring-2 ring-blue-400 dark:ring-blue-300'
                      : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                  title={
                    color === 'W' ? 'White' :
                    color === 'U' ? 'Blue' :
                    color === 'B' ? 'Black' :
                    color === 'R' ? 'Red' :
                    color === 'G' ? 'Green' :
                    color
                  }
                >
                  <ManaSymbol color={color} size={20} />
                </button>
              ))}
            </div>
            {selectedColors.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer mt-0.5">
                <input
                  type="checkbox"
                  checked={exclusiveColors}
                  onChange={(e) => {
                    flushSync(() => {
                      setExclusiveColors(e.target.checked);
                    });
                    startTransition(() => {});
                  }}
                  className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  Exclusif
                </span>
              </label>
            )}
          </div>

          {/* Filtre par rareté */}
          {availableRarities.length > 0 && (
            <div className="filter-chip sm:min-w-0">
              <label>Rareté</label>
              <div className="grid grid-cols-2 gap-1 w-max">
                {availableRarities.map((rarity) => {
                  const selected = selectedRarities.includes(rarity);
                  return (
                    <button
                      key={rarity}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        flushSync(() => {
                          setSelectedRarities((current) =>
                            current.includes(rarity)
                              ? current.filter((value) => value !== rarity)
                              : [...current, rarity]
                          );
                        });
                        startTransition(() => {});
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium min-h-[36px] min-w-[4.75rem] inline-flex items-center justify-center transition-all ${
                        selected
                          ? 'bg-blue-600 dark:bg-blue-500 ring-2 ring-blue-400 dark:ring-blue-300 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {rarityLabel(rarity)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filtre par type */}
          {availableTypes.length > 0 && (
            <div className="filter-chip">
              <label>Type</label>
              <select
                value={selectedType || ''}
                onChange={(e) => {
                  setSelectedType(e.target.value || null);
                  startTransition(() => {});
                }}
                className="field-control"
              >
                <option value="">Tous</option>
                {availableTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          )}

          {/* Filtre par type de créature */}
          {availableCreatureTypes.length > 0 && (
            <div className="filter-chip">
              <label>Type de créature</label>
              <select
                value={selectedCreatureType || ''}
                onChange={(e) => {
                  setSelectedCreatureType(e.target.value || null);
                  startTransition(() => {});
                }}
                className="field-control"
              >
                <option value="">Tous</option>
                {availableCreatureTypes.map(creatureType => (
                  <option key={creatureType} value={creatureType}>{creatureType}</option>
                ))}
              </select>
            </div>
          )}

          {/* Filtre par édition */}
          {availableSets.length > 0 && (
            <div className="filter-chip sm:min-w-[12rem] sm:max-w-xs">
              <label>Édition</label>
              <select
                value={selectedSet || ''}
                onChange={(e) => {
                  setSelectedSet(e.target.value || null);
                  startTransition(() => {});
                }}
                className="field-control"
              >
                <option value="">Toutes</option>
                {availableSets.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name} ({code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Bouton réinitialiser les filtres */}
          {(searchQuery || selectedColors.length > 0 || selectedRarities.length > 0 || selectedType || selectedCreatureType || selectedSet) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchInput('');
                setSelectedColors([]);
                setSelectedRarities([]);
                setSelectedType(null);
                setSelectedCreatureType(null);
                setSelectedSet(null);
              }}
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Messages d'erreur et de progression */}
      {error && (
        <div className="mb-4 shrink-0 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {importProgress && (
        <div className="mb-4 shrink-0 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Import en cours...
            </h3>
            <div className="flex gap-2 flex-wrap">
              {isImportPaused ? (
                <Button variant="primary" onClick={() => resumeImport()} className="text-sm px-2 py-1">
                  Reprendre
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => pauseImport()} className="text-sm px-2 py-1">
                  Pause
                </Button>
              )}
              <Button variant="danger" onClick={() => cancelImport()} className="text-sm px-2 py-1">
                Annuler
              </Button>
            </div>
          </div>
          <ProgressBar
            current={importProgress.current}
            total={importProgress.total}
            label={importProgress.currentCard || (isImportPaused ? 'En pause...' : 'Traitement...')}
          />
        </div>
      )}

      {showLoadingMore && (
        <div className="mb-4 shrink-0 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center justify-center gap-3">
          <Spinner size="md" />
          <p className="text-sm text-blue-600 dark:text-blue-400">
            Chargement des cartes restantes... ({cards.length} cartes chargées)
          </p>
        </div>
      )}

      {/* 4. Affichage des cartes */}
      {cards.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            {isViewingOwnCollection ? 'Votre collection est vide.' : 'Cette collection est vide.'}
          </p>
          {isViewingOwnCollection && (
            <p className="text-gray-500 dark:text-gray-500 text-sm mb-4">
              Utilisez <button type="button" onClick={() => setShowImportModal(true)} className="text-blue-600 dark:text-blue-400 hover:underline">Importer une collection</button> pour charger un CSV ou un JSON.
            </p>
          )}
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            Aucune carte ne correspond aux critères de recherche.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSearchInput('');
              setSelectedColors([]);
              setSelectedRarities([]);
              setSelectedType(null);
              setSelectedCreatureType(null);
              setSelectedSet(null);
            }}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : cardsByNameMap ? (
        (cardsByNameMap.deduplicatedCards.length > 100 ? (
          <div className="flex-1 min-h-0 w-full overflow-hidden bg-gray-50 dark:bg-gray-900">
            <VirtualizedCardGrid
              cards={cardsByNameMap.deduplicatedCards}
              cardsByNameMap={cardsByNameMap}
              onAddToDeck={isViewingOwnCollection ? handleAddToDeck : undefined}
              onAddToWishlist={isViewingOwnCollection ? handleToggleWishlist : undefined}
              isInWishlist={isCardInWishlist}
              onDelete={canModify ? deleteCard : undefined}
              onUpdateQuantity={canModify ? updateCardQuantity : undefined}
              onMoveToCollection={canModify && userCollections.length >= 2 ? handleMoveToCollection : undefined}
              showActions={true}
              gap={24}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 w-full overflow-y-auto collection-card-scroll">
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
            {(cardsByNameMap?.deduplicatedCards || []).map((card, index) => {
              const cardsWithSameName = cardsByNameMap.map.get(card.name) || [card];
              return (
                <CardDisplay
                  key={card.id}
                  card={card}
                  allCardsWithSameName={cardsWithSameName}
                  onAddToDeck={isViewingOwnCollection ? handleAddToDeck : undefined}
                  onAddToWishlist={isViewingOwnCollection ? handleToggleWishlist : undefined}
                  isInWishlist={isCardInWishlist(card)}
                  onDelete={canModify ? deleteCard : undefined}
                  onUpdateQuantity={canModify ? updateCardQuantity : undefined}
                  onMoveToCollection={canModify && userCollections.length >= 2 ? handleMoveToCollection : undefined}
                  showActions={true}
                  imagePriority={index < 5 ? 'high' : 'low'}
                />
              );
            })}
            </div>
          </div>
        ))
      ) : null}

      {/* IntersectionObserver trigger pour charger plus de cartes */}
      {hasMoreCards && (
        <div ref={loadMoreRef} className="h-px w-full shrink-0 overflow-hidden" aria-hidden>
          {loadingMore && <Spinner size="md" />}
        </div>
      )}

      {/* Modal d'export */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        cards={filteredCards}
      />

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        collections={userCollections}
        defaultCollectionId={selectedCollectionId}
        importing={importing}
        onCreateDefaultCollection={async () => {
          const created = await createCollection('Ma collection');
          await refreshUserCollections();
          return created;
        }}
        onImport={async (content, updateMode, collectionId) => {
          setShowImportModal(false);
          try {
            setImporting(true);
            await importCSV(content, updateMode, undefined, collectionId ?? undefined);
            showSuccess('Import terminé avec succès');
            await refreshUserCollections();
          } catch (err) {
            errorHandler.handleAndShowError(err);
          } finally {
            setImporting(false);
          }
        }}
      />

      {/* Modal déplacer la carte vers une autre collection */}
      <Modal
        isOpen={!!cardToMove}
        onClose={() => {
          setCardToMove(null);
          setMoveTargetCollectionId(null);
        }}
        title="Déplacer la carte"
      >
        {cardToMove && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choisissez la collection de destination pour <strong className="text-gray-900 dark:text-white">{cardToMove.name}</strong>.
            </p>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Collection de destination
              </label>
              <select
                value={moveTargetCollectionId ?? ''}
                onChange={(e) => setMoveTargetCollectionId(e.target.value === '' ? null : e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="">Choisir une collection</option>
                {userCollections
                  .filter((col) => col.id !== cardToMove.collectionId)
                  .map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                onClick={handleConfirmMoveToCollection}
                disabled={!moveTargetCollectionId || moving}
                loading={moving}
              >
                Déplacer
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCardToMove(null);
                  setMoveTargetCollectionId(null);
                }}
                disabled={moving}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal pour ajouter au deck */}
      <Modal
        isOpen={showDeckModal}
        onClose={() => {
          setShowDeckModal(false);
          setSelectedCardId(null);
          setNewDeckName('');
        }}
        title="Ajouter au deck"
      >
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">
              Créer un nouveau deck
            </h3>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Nom du deck"
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <select
                value={newDeckFormat}
                onChange={(e) => setNewDeckFormat(e.target.value as DeckFormat)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {DECK_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {DECK_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">{getFormatSummary(newDeckFormat)}</p>
              <Button
                onClick={handleCreateDeck}
                disabled={!newDeckName.trim() || isCreatingDeck}
                loading={isCreatingDeck}
              >
                Créer
              </Button>
            </div>
          </div>

          {decks.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">
                Ou sélectionner un deck existant
              </h3>
              <div className="space-y-2">
                {decks.map((deck) => {
                  const backdrop = getDeckBackdropUrl(deck);
                  return (
                    <button
                      key={deck.id}
                      onClick={() => handleSelectDeck(deck.id)}
                      className="relative overflow-hidden w-full text-left px-4 py-3 rounded-lg min-h-[52px] transition-colors"
                    >
                      {backdrop ? (
                        <>
                          <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 hover:bg-black/50" />
                        </>
                      ) : (
                        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700" />
                      )}
                      <span className={`relative z-10 font-medium ${backdrop ? 'text-white drop-shadow' : 'text-gray-900 dark:text-white'}`}>
                        {deck.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

    </div>
  );
}

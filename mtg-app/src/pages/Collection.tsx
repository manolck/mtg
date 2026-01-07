import { useState, useRef, useMemo, useDeferredValue, startTransition, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useCollection } from '../hooks/useCollection';
import { useAllCollections } from '../hooks/useAllCollections';
import { useDecks } from '../hooks/useDecks';
import { useWishlist } from '../hooks/useWishlist';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useToast } from '../context/ToastContext';
import { errorHandler } from '../services/errorHandler';
import { CardDisplay } from '../components/Card/CardDisplay';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { SearchInput } from '../components/UI/SearchInput';
import { findKeyword, findKeywordAction, findAbilityWord, cardHasKeyword } from '../utils/keywordSearch';
import { Modal } from '../components/UI/Modal';
import { ProgressBar } from '../components/UI/ProgressBar';
import { AvatarDisplay } from '../components/UI/AvatarDisplay';
import { CollectionSelector } from '../components/UI/CollectionSelector';
import { ManaSymbol } from '../components/UI/ManaSymbol';
import { ExportModal } from '../components/Export/ExportModal';
import { Spinner } from '../components/UI/Spinner';
import { ConfirmDialog } from '../components/UI/ConfirmDialog';

export function Collection() {
  const { currentUser } = useAuth();
  const { profile: currentUserProfile } = useProfile();
  const { owners, loading: loadingOwners } = useAllCollections();
  const { showSuccess, showError } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  const { 
    cards, 
    allCards, // Toutes les cartes chargées (pour la recherche)
    loading,
    loadingMore,
    error, 
    importCSV, 
    deleteCard, 
    deleteAllCards, 
    updateCardQuantity,
    importProgress,
    canModify,
    pauseImport,
    resumeImport,
    cancelImport,
    isImportPaused,
    loadMoreCards,
    hasMoreCards
  } = useCollection(selectedUserId === 'all' ? 'all' : (selectedUserId || undefined));
  const { decks, createDeck, addCardToDeck } = useDecks();
  
  // Déterminer si on regarde sa propre collection
  const isViewingOwnCollection = !selectedUserId || selectedUserId === currentUser?.uid;
  
  const { addItem: addToWishlist, checkIfInWishlist } = useWishlist(
    isViewingOwnCollection ? currentUser?.uid : undefined
  );
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showUpdateModeConfirm, setShowUpdateModeConfirm] = useState(false);
  const pendingImportTextRef = useRef<string | null>(null);
  
  // États pour la recherche et les filtres
  const [searchInput, setSearchInput] = useState(''); // Ce qui est tapé dans l'input
  const [searchQuery, setSearchQuery] = useState(''); // La requête de recherche active (après Entrée)
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [exclusiveColors, setExclusiveColors] = useState(false); // Mode exclusif pour les couleurs
  const [selectedRarity, setSelectedRarity] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedCreatureType, setSelectedCreatureType] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setImportSuccess(false);
      const text = await file.text();
      const updateMode = importMode === 'update';
      
      if (updateMode && cards.length > 0) {
        pendingImportTextRef.current = text;
        setShowUpdateModeConfirm(true);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setImporting(false);
        return;
      }
      
      // Fermer la modal dès que l'import commence
      setShowImportModal(false);
      
      await importCSV(text, updateMode);
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setImporting(false);
    }
  }, [importMode, cards.length, importCSV]);

  const handleDeleteAll = useCallback(() => {
    setShowDeleteAllConfirm(true);
  }, []);

  const confirmDeleteAll = useCallback(async () => {
    try {
      await deleteAllCards();
      showSuccess('Collection supprimée');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  }, [deleteAllCards, showSuccess]);

  const confirmUpdateModeImport = useCallback(async () => {
    if (!pendingImportTextRef.current) return;
    
    try {
      setImporting(true);
      await importCSV(pendingImportTextRef.current, true);
      pendingImportTextRef.current = null;
      setShowUpdateModeConfirm(false);
    } catch (err) {
      errorHandler.handleAndShowError(err);
      setImporting(false);
    }
  }, [importCSV]);

  const handleAddToDeck = useCallback((cardId: string) => {
    setSelectedCardId(cardId);
    setShowDeckModal(true);
  }, []);

  const handleAddToWishlist = useCallback(async (card: import('../types/card').UserCard) => {
    if (!isViewingOwnCollection) return;
    
    try {
      const alreadyInWishlist = await checkIfInWishlist(
        card.name,
        card.setCode || card.set,
        card.collectorNumber
      );
      
      if (alreadyInWishlist) {
        showError(`${card.name} est déjà dans votre wishlist`);
        return;
      }
      
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
    } catch (error) {
      errorHandler.handleAndShowError(error);
    }
  }, [isViewingOwnCollection, addToWishlist, checkIfInWishlist]);

  const handleSelectDeck = useCallback(async (deckId: string) => {
    if (!selectedCardId) return;

    try {
      await addCardToDeck(deckId, selectedCardId, 1);
      setShowDeckModal(false);
      setSelectedCardId(null);
      showSuccess('Carte ajoutée au deck');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    }
  }, [selectedCardId, addCardToDeck]);

  const handleCreateDeck = useCallback(async () => {
    if (!newDeckName.trim() || !selectedCardId) return;

    try {
      setIsCreatingDeck(true);
      const deckId = await createDeck(newDeckName.trim());
      await addCardToDeck(deckId, selectedCardId, 1);
      setShowDeckModal(false);
      setSelectedCardId(null);
      setNewDeckName('');
      showSuccess('Deck créé et carte ajoutée');
    } catch (err) {
      errorHandler.handleAndShowError(err);
    } finally {
      setIsCreatingDeck(false);
    }
  }, [newDeckName, selectedCardId, createDeck, addCardToDeck]);

  const isViewingAllCollections = selectedUserId === 'all';
  const currentOwner = owners.find(o => o.userId === (selectedUserId || currentUser?.uid));

  // Différer les valeurs des filtres pour permettre à l'UI de se mettre à jour d'abord
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredSelectedColors = useDeferredValue(selectedColors);
  const deferredExclusiveColors = useDeferredValue(exclusiveColors);
  const deferredSelectedRarity = useDeferredValue(selectedRarity);
  const deferredSelectedType = useDeferredValue(selectedType);
  const deferredSelectedCreatureType = useDeferredValue(selectedCreatureType);
  const deferredSelectedLanguage = useDeferredValue(selectedLanguage);
  const deferredSelectedSet = useDeferredValue(selectedSet);

  // Filtrer les cartes selon les critères de recherche et filtres
  // Utiliser allCards pour la recherche afin de chercher dans toutes les cartes, pas seulement celles affichées
  const filteredCards = useMemo(() => {
    let filtered = [...allCards];

    // Filtre par nom (recherche) et/ou mots-clés
    if (deferredSearchQuery.trim()) {
      const query = deferredSearchQuery.toLowerCase();
      
      // Vérifier si c'est une recherche par mot-clé, action ou ability word
      const keyword = findKeyword(deferredSearchQuery);
      const keywordAction = findKeywordAction(deferredSearchQuery);
      const abilityWord = findAbilityWord(deferredSearchQuery);
      
      filtered = filtered.filter(card => {
        // Recherche par nom
        const nameMatch = card.name.toLowerCase().includes(query);
        
        // Recherche par type de créature (subtypes)
        const subtypes = card.mtgData?.subtypes || [];
        const creatureTypeMatch = subtypes.some(subtype => 
          subtype.toLowerCase().includes(query)
        );
        
        // Recherche par mot-clé, action ou ability word dans le texte de la carte
        let keywordMatch = false;
        if (keyword || keywordAction || abilityWord) {
          const cardText = card.mtgData?.text || '';
          const cardType = card.mtgData?.type || '';
          const cardName = card.name || '';
          // Inclure aussi les sous-types qui peuvent contenir des mots-clés
          const fullText = `${cardName} ${cardText} ${cardType} ${subtypes.join(' ')}`.toLowerCase();
          
          if (keyword) {
            keywordMatch = cardHasKeyword(fullText, keyword);
          } else if (keywordAction) {
            keywordMatch = fullText.includes(keywordAction.en.toLowerCase()) || 
                          fullText.includes(keywordAction.fr.toLowerCase());
          } else if (abilityWord) {
            // Les ability words sont généralement en italique dans le texte
            keywordMatch = fullText.includes(abilityWord.en.toLowerCase()) || 
                          fullText.includes(abilityWord.fr.toLowerCase());
          }
        }
        
        // Recherche dans le texte de la carte (pour les mots-clés partiels)
        const cardText = card.mtgData?.text || '';
        const cardType = card.mtgData?.type || '';
        const cardName = card.name || '';
        const fullText = `${cardName} ${cardText} ${cardType} ${subtypes.join(' ')}`.toLowerCase();
        const textMatch = fullText.includes(query);
        
        // Retourner true si au moins une condition est remplie
        return nameMatch || creatureTypeMatch || keywordMatch || textMatch;
      });
    }

    // Filtre par couleur
    if (deferredSelectedColors.length > 0) {
      filtered = filtered.filter(card => {
        const cardColors = card.mtgData?.colors || [];
        const normalizedCardColors = cardColors.map(c => c.toUpperCase());
        const normalizedSelectedColors = deferredSelectedColors.map(c => c.toUpperCase());
        
        // Cas spécial : Colorless
        if (normalizedSelectedColors.includes('COLORLESS')) {
          const otherColors = normalizedSelectedColors.filter(c => c !== 'COLORLESS');
          if (otherColors.length === 0) {
            // Seulement Colorless sélectionné : afficher uniquement les cartes sans couleur
            return normalizedCardColors.length === 0;
          }
          // Colorless + autres couleurs : ignorer Colorless, utiliser les autres couleurs
          const colorsToMatch = otherColors;
          
          if (deferredExclusiveColors) {
            // Mode exclusif : exactement ces couleurs
            return normalizedCardColors.length === colorsToMatch.length &&
                   colorsToMatch.every(color => normalizedCardColors.includes(color));
          } else {
            // Mode non exclusif : au moins une de ces couleurs
            return colorsToMatch.some(color => normalizedCardColors.includes(color));
          }
        }
        
        if (deferredExclusiveColors) {
          // Mode exclusif : la carte doit avoir exactement les couleurs sélectionnées
          return normalizedCardColors.length === normalizedSelectedColors.length &&
                 normalizedSelectedColors.every(color => normalizedCardColors.includes(color));
        } else {
          // Mode non exclusif : la carte doit avoir au moins une des couleurs sélectionnées
          return normalizedSelectedColors.some(color => normalizedCardColors.includes(color));
        }
      });
    }

    // Filtre par rareté
    if (deferredSelectedRarity) {
      filtered = filtered.filter(card => 
        card.mtgData?.rarity === deferredSelectedRarity || card.rarity === deferredSelectedRarity
      );
    }

    // Filtre par type
    if (deferredSelectedType) {
      filtered = filtered.filter(card => {
        const types = card.mtgData?.types || [];
        return types.some(t => t.toLowerCase() === deferredSelectedType.toLowerCase());
      });
    }

    // Filtre par type de créature (subtypes)
    if (deferredSelectedCreatureType) {
      filtered = filtered.filter(card => {
        const subtypes = card.mtgData?.subtypes || [];
        return subtypes.some(subtype => 
          subtype.toLowerCase() === deferredSelectedCreatureType.toLowerCase()
        );
      });
    }

    // Filtre par langue
    if (deferredSelectedLanguage) {
      filtered = filtered.filter(card => 
        (card.language || 'en').toLowerCase() === deferredSelectedLanguage.toLowerCase()
      );
    }

    // Filtre par édition (set)
    if (deferredSelectedSet) {
      filtered = filtered.filter(card => {
        const cardSet = card.set || card.setCode || card.mtgData?.set || '';
        return cardSet.toLowerCase() === deferredSelectedSet.toLowerCase();
      });
    }

    return filtered;
  }, [allCards, deferredSearchQuery, deferredSelectedColors, deferredExclusiveColors, deferredSelectedRarity, deferredSelectedType, deferredSelectedCreatureType, deferredSelectedLanguage, deferredSelectedSet]);

  // OPTIMISATION : Pré-calculer le Map des cartes par nom pour éviter les recalculs
  const cardsByNameMap = useMemo(() => {
    // Dédupliquer d'abord
    const uniqueCards = new Map<string, typeof filteredCards[0]>();
    filteredCards.forEach(card => {
      if (!uniqueCards.has(card.id)) {
        uniqueCards.set(card.id, card);
      }
    });
    const deduplicatedCards = Array.from(uniqueCards.values());
    
    // Créer le Map des cartes par nom
    const map = new Map<string, typeof filteredCards[0][]>();
    deduplicatedCards.forEach(card => {
      if (!map.has(card.name)) {
        map.set(card.name, []);
      }
      map.get(card.name)!.push(card);
    });
    return { deduplicatedCards, map };
  }, [filteredCards]);

  // Extraire les valeurs uniques pour les filtres
  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    allCards.forEach(card => {
      if (card.language) {
        langs.add(card.language);
      }
    });
    return Array.from(langs).sort();
  }, [allCards]);

  const availableRarities = useMemo(() => {
    const rarities = new Set<string>();
    allCards.forEach(card => {
      if (card.mtgData?.rarity) {
        rarities.add(card.mtgData.rarity);
      }
      if (card.rarity) {
        rarities.add(card.rarity);
      }
    });
    return Array.from(rarities).sort();
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
      // Récupérer les sous-types de créature (subtypes)
      if (card.mtgData?.subtypes && card.mtgData.subtypes.length > 0) {
        card.mtgData.subtypes.forEach(subtype => creatureTypes.add(subtype));
      }
    });
    return Array.from(creatureTypes).sort();
  }, [allCards]);

  const availableSets = useMemo(() => {
    const sets = new Map<string, string>(); // Map<code, name>
    allCards.forEach(card => {
      const setCode = card.set || card.setCode || card.mtgData?.set;
      const setName = card.mtgData?.setName;
      if (setCode) {
        sets.set(setCode, setName || setCode);
      }
    });
    // Trier par nom d'édition, puis par code
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

  // IntersectionObserver pour charger plus de cartes au défilement
  useEffect(() => {
    if (!hasMoreCards || loadingMore) {
      return;
    }

    let observer: IntersectionObserver | null = null;
    let rafId: number | null = null;
    let cancelled = false;

    // Attendre que l'élément soit monté dans le DOM
    const checkAndSetup = () => {
      if (cancelled) return;
      
      if (!loadMoreRef.current) {
        // Réessayer au prochain frame
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
        { rootMargin: '200px' } // Déclencher 200px avant d'atteindre l'élément
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

  if (loading || loadingOwners) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  // Afficher un indicateur si on charge plus de cartes en arrière-plan
  const showLoadingMore = loadingMore && cards.length > 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex justify-between items-start flex-wrap gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            {currentOwner?.profile?.avatarId && (
              <AvatarDisplay avatarId={currentOwner.profile.avatarId} size="md" />
            )}
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {isViewingAllCollections 
                ? 'Toutes les Collections' 
                : isViewingOwnCollection 
                  ? 'Ma Collection' 
                  : `Collection de ${currentOwner?.profile?.pseudonym || 'Utilisateur'}`}
              {filteredCards.length > 0 && ` (${filteredCards.length}${filteredCards.length !== allCards.length ? ` / ${allCards.length}` : ''})`}
            </h1>
          </div>
          
          {/* Sélecteur de collection et recherche/filtres */}
          <div className="mt-2 space-y-3">
            <CollectionSelector
              owners={owners}
              currentUserId={currentUser?.uid || null}
              selectedUserId={selectedUserId === 'all' ? 'all' : selectedUserId}
              onSelect={(userId) => setSelectedUserId(userId === 'all' ? 'all' : userId)}
              currentUserProfile={currentUserProfile}
            />
            
            {/* Barre de recherche avec autocomplétion */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <SearchInput
                  type="text"
                  placeholder="Rechercher une carte ou un mot-clé (ex: Flying, Vol, Trample...) - Appuyez sur Entrée pour rechercher"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onSuggestionSelect={(suggestion) => {
                    setSearchInput(suggestion);
                    setSearchQuery(suggestion); // Déclencher la recherche immédiatement quand on sélectionne une suggestion
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setSearchQuery(searchInput); // Déclencher la recherche sur Entrée
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
                <div className="flex gap-2">
                  {searchInput !== searchQuery && (
                    <button
                      onClick={() => setSearchQuery(searchInput)}
                      className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                      title="Rechercher (ou appuyez sur Entrée)"
                    >
                      🔍
                    </button>
                  )}
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
                </div>
              )}
            </div>

            {/* Filtres */}
            <div className="flex flex-wrap gap-3 items-center">
              {/* Filtre par couleur */}
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Couleur:</label>
                <div className="flex gap-1">
                  {(['W', 'U', 'B', 'R', 'G', 'Colorless'] as const).map(color => (
                    <button
                      key={color}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Mise à jour immédiate et synchrone de l'état pour le feedback visuel
                        const newColors = selectedColors.includes(color)
                          ? selectedColors.filter(c => c !== color)
                          : [...selectedColors, color];
                        flushSync(() => {
                          setSelectedColors(newColors);
                        });
                        // Différer le filtrage avec startTransition
                        startTransition(() => {
                          // Le filtrage se fera automatiquement via useDeferredValue
                        });
                      }}
                      className={`p-1.5 rounded transition-all ${
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
                {/* Switch pour mode exclusif */}
                {selectedColors.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exclusiveColors}
                        onChange={(e) => {
                          // Mise à jour immédiate et synchrone pour le feedback visuel
                          flushSync(() => {
                            setExclusiveColors(e.target.checked);
                          });
                          // Différer le filtrage
                          startTransition(() => {
                            // Le filtrage se fera automatiquement via useDeferredValue
                          });
                        }}
                        className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        Exclusif
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Filtre par rareté */}
              {availableRarities.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rareté:</label>
                  <select
                    value={selectedRarity || ''}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      setSelectedRarity(value);
                      startTransition(() => {
                        // Le filtrage se fera automatiquement via useDeferredValue
                      });
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Toutes</option>
                    {availableRarities.map(rarity => (
                      <option key={rarity} value={rarity}>{rarity}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtre par type */}
              {availableTypes.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type:</label>
                  <select
                    value={selectedType || ''}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      setSelectedType(value);
                      startTransition(() => {
                        // Le filtrage se fera automatiquement via useDeferredValue
                      });
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type de créature:</label>
                  <select
                    value={selectedCreatureType || ''}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      setSelectedCreatureType(value);
                      startTransition(() => {
                        // Le filtrage se fera automatiquement via useDeferredValue
                      });
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Tous</option>
                    {availableCreatureTypes.map(creatureType => (
                      <option key={creatureType} value={creatureType}>{creatureType}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtre par langue */}
              {availableLanguages.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Langue:</label>
                  <select
                    value={selectedLanguage || ''}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      setSelectedLanguage(value);
                      startTransition(() => {
                        // Le filtrage se fera automatiquement via useDeferredValue
                      });
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Toutes</option>
                    {availableLanguages.map(lang => (
                      <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtre par édition */}
              {availableSets.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Édition:</label>
                  <select
                    value={selectedSet || ''}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      setSelectedSet(value);
                      startTransition(() => {
                        // Le filtrage se fera automatiquement via useDeferredValue
                      });
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]"
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
              {(searchQuery || selectedColors.length > 0 || selectedRarity || selectedType || selectedCreatureType || selectedLanguage || selectedSet) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedColors([]);
                    setSelectedRarity(null);
                    setSelectedType(null);
                    setSelectedCreatureType(null);
                    setSelectedLanguage(null);
                    setSelectedSet(null);
                  }}
                  className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>
        </div>
        
        {isViewingOwnCollection && !isViewingAllCollections && (
          <div className="flex gap-2">
            {cards.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setShowExportModal(true)}
                >
                  Exporter
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDeleteAll}
                >
                  Supprimer toute la collection
                </Button>
              </>
            )}
            <Button
              variant="primary"
              onClick={() => setShowImportModal(true)}
            >
              Importer CSV
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {importSuccess && !importProgress && (
        <div className="mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          ✓ Import terminé avec succès !
        </div>
      )}

      {importProgress && (
        <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Import en cours...
              </h3>
              <div className="flex gap-2">
                {isImportPaused ? (
                  <Button
                    variant="primary"
                    onClick={() => resumeImport()}
                    className="text-sm px-2 py-1"
                  >
                    Reprendre
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => pauseImport()}
                    className="text-sm px-2 py-1"
                  >
                    Pause
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => cancelImport()}
                  className="text-sm px-2 py-1"
                >
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
          
          <div className="grid grid-cols-3 gap-4 text-sm mb-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {importProgress.success}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Succès</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {importProgress.errors}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Erreurs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                {importProgress.skipped}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Ignorées</div>
            </div>
          </div>

          {importProgress.details.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                Voir les détails ({importProgress.details.length} cartes traitées)
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1 text-xs">
                {importProgress.details.slice(-20).map((detail, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded ${
                      detail.status === 'success'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                        : detail.status === 'error'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <div className="font-medium">{detail.cardName}</div>
                    {detail.message && (
                      <div className="text-xs opacity-75">{detail.message}</div>
                    )}
                  </div>
                ))}
                {importProgress.details.length > 20 && (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-2">
                    ... et {importProgress.details.length - 20} autres
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {importing && !importProgress && (
        <div className="mb-4 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
          Préparation de l'import...
        </div>
      )}

      {showLoadingMore && (
        <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center justify-center gap-3">
          <Spinner size="md" />
          <p className="text-sm text-blue-600 dark:text-blue-400">
            Chargement des cartes restantes... ({cards.length} cartes chargées)
          </p>
        </div>
      )}

      {/* Afficher les cartes même pendant l'import */}
      {cards.length === 0 && !importing && !importProgress ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            {isViewingOwnCollection ? 'Votre collection est vide.' : 'Cette collection est vide.'}
          </p>
          {isViewingOwnCollection && (
            <>
              <p className="text-gray-500 dark:text-gray-500 text-sm mb-4">
                Importez un fichier CSV pour commencer.
              </p>
              <p className="text-gray-400 dark:text-gray-600 text-xs">
                Formats supportés : Nom seul, Nom + Quantité, ou Nom + Quantité + Édition
              </p>
            </>
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
              setSelectedColors([]);
              setSelectedRarity(null);
              setSelectedType(null);
              setSelectedLanguage(null);
              setSelectedSet(null);
            }}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : cardsByNameMap ? (
        // Grille normale pour les petites collections
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {(cardsByNameMap?.deduplicatedCards || []).map((card) => {
            // Utiliser le Map pré-calculé au lieu de filter à chaque fois
            const cardsWithSameName = cardsByNameMap.map.get(card.name) || [card];
            
            return (
              <CardDisplay
                key={card.id}
                card={card}
                allCardsWithSameName={cardsWithSameName}
                onAddToDeck={handleAddToDeck}
                onAddToWishlist={isViewingOwnCollection ? handleAddToWishlist : undefined}
                onDelete={canModify ? deleteCard : undefined}
                onUpdateQuantity={canModify ? updateCardQuantity : undefined}
                showActions={true}
              />
            );
          })}
        </div>
      ) : null}

      {/* IntersectionObserver trigger pour charger plus de cartes au défilement */}
      {hasMoreCards && (
        <div ref={loadMoreRef} className="flex justify-center items-center py-8">
          {loadingMore && <Spinner size="md" />}
        </div>
      )}

      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        title="Importer un fichier CSV"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Mode d'import
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="add"
                  checked={importMode === 'add'}
                  onChange={(e) => setImportMode(e.target.value as 'add' | 'update')}
                  className="text-blue-600"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  Ajouter à la collection existante
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="update"
                  checked={importMode === 'update'}
                  onChange={(e) => setImportMode(e.target.value as 'add' | 'update')}
                  className="text-blue-600"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  Mettre à jour la collection
                </span>
              </label>
            </div>
            {importMode === 'update' && cards.length > 0 && (
              <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                ℹ️ Les cartes seront comparées et mises à jour. Les cartes absentes du CSV seront supprimées.
              </p>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload-modal"
            />
            <label htmlFor="csv-upload-modal" className="cursor-pointer">
              <span className="inline-block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                {importing ? 'Import en cours...' : 'Sélectionner un fichier CSV'}
              </span>
            </label>
          </div>
        </div>
      </Modal>

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
            <div className="flex gap-2">
              <Input
                placeholder="Nom du deck"
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                className="flex-1"
              />
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
                {decks.map((deck) => (
                  <button
                    key={deck.id}
                    onClick={() => handleSelectDeck(deck.id)}
                    className="w-full text-left px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {deck.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        cards={filteredCards}
      />

      {/* Dialog de confirmation de suppression de toute la collection */}
      <ConfirmDialog
        isOpen={showDeleteAllConfirm}
        title="Supprimer toute la collection"
        message="⚠️ Êtes-vous sûr de vouloir supprimer TOUTE votre collection ? Cette action est irréversible."
        confirmText="Supprimer tout"
        cancelText="Annuler"
        variant="danger"
        onConfirm={confirmDeleteAll}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />

      {/* Dialog de confirmation pour le mode mise à jour */}
      <ConfirmDialog
        isOpen={showUpdateModeConfirm}
        title="Mode Mise à jour"
        message="⚠️ Mode Mise à jour : Les cartes existantes seront mises à jour si elles diffèrent, les nouvelles seront ajoutées, et les cartes absentes du CSV seront supprimées. Êtes-vous sûr de vouloir continuer ?"
        confirmText="Continuer"
        cancelText="Annuler"
        variant="danger"
        onConfirm={confirmUpdateModeImport}
        onCancel={() => {
          setShowUpdateModeConfirm(false);
          pendingImportTextRef.current = null;
        }}
      />
    </div>
  );
}


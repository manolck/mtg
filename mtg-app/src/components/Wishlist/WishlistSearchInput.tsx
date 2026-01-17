import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { searchCardNames, searchCards } from '../../services/scryfallSearchService';
import { enrichCardWithFrenchData } from '../../services/magicCorporationService';
import { ManaCostDisplay } from '../UI/ManaCostDisplay';
import { Spinner } from '../UI/Spinner';
import { LazyImage } from '../UI/LazyImage';
import { useProfile } from '../../hooks/useProfile';
import type { MTGCard, UserCard } from '../../types/card';

interface CardWithOwner extends MTGCard {
  ownerId?: string;
  ownerName?: string;
  ownerAvatar?: string;
  ownerProfile?: {
    pseudonym?: string;
    avatarId?: string;
  };
}

interface WishlistSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectCard: (card: MTGCard) => void;
  collectionCards?: UserCard[]; // Cartes de toutes les collections de la communauté
  placeholder?: string;
}

interface CardSuggestion {
  name: string;
  language: 'en' | 'fr';
}

export function WishlistSearchInput({
  value,
  onChange,
  onSelectCard,
  collectionCards = [],
  placeholder = 'Rechercher dans la wishlist ou sur Scryfall...',
}: WishlistSearchInputProps) {
  const { profile } = useProfile();
  const preferredLanguage = profile?.preferredLanguage;
  const [scryfallSuggestions, setScryfallSuggestions] = useState<CardSuggestion[]>([]);
  const [collectionResults, setCollectionResults] = useState<CardWithOwner[]>([]);
  const [scryfallResults, setScryfallResults] = useState<MTGCard[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchingScryfall, setSearchingScryfall] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchOnScryfall, setSearchOnScryfall] = useState(true); // Switch pour activer/désactiver la recherche Scryfall
  const [displayedCollectionCount, setDisplayedCollectionCount] = useState(50);
  const [displayedScryfallCount, setDisplayedScryfallCount] = useState(50);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreCollectionRef = useRef<HTMLDivElement>(null);
  const loadMoreScryfallRef = useRef<HTMLDivElement>(null);

  // Recherche dans toutes les collections de la communauté
  const localSearchResults = useMemo(() => {
    if (!value || value.length < 2) {
      return [];
    }

    const searchLower = value.toLowerCase();
    const results: CardWithOwner[] = [];
    const seenCards = new Map<string, CardWithOwner>(); // Pour éviter les doublons (même carte, différents propriétaires)
    
    // Utiliser la langue préférée du profil au lieu de détecter automatiquement
    const isFrenchSearch = preferredLanguage === 'fr';

    for (const card of collectionCards) {
      const cardName = card.name?.toLowerCase() || '';
      const cardType = card.mtgData?.type?.toLowerCase() || '';
      const cardSubtypes = card.mtgData?.subtypes?.join(' ')?.toLowerCase() || '';
      const cardText = card.mtgData?.text?.toLowerCase() || '';
      
      // Rechercher aussi dans les noms français depuis foreignNames
      let frenchNames = '';
      let frenchTypes = '';
      let frenchTexts = '';
      
      if (card.mtgData?.foreignNames) {
        const frenchData = card.mtgData.foreignNames.filter(
          fn => fn.language === 'French' || fn.language === 'fr'
        );
        frenchNames = frenchData.map(fn => fn.name?.toLowerCase() || '').join(' ') || '';
        frenchTypes = frenchData.map(fn => fn.type?.toLowerCase() || '').join(' ') || '';
        frenchTexts = frenchData.map(fn => fn.text?.toLowerCase() || '').join(' ') || '';
      }
      
      // Si la carte a un nom qui semble français (contient des accents ou mots français),
      // considérer que c'est peut-être déjà le nom français
      const cardNameSeemsFrench = /[àâäéèêëïîôùûüÿç]/.test(card.name) || 
                                   cardName.includes('guivre') ||
                                   cardName.includes('créature') ||
                                   cardName.includes('sorcierie');
      
      // Rechercher dans le nom (anglais et français), type, subtypes et texte
      // Si recherche en français, prioriser les correspondances françaises
      const matchesEnglish = cardName.includes(searchLower) || 
                            cardType.includes(searchLower) ||
                            cardSubtypes.includes(searchLower) ||
                            cardText.includes(searchLower);
      
      // Rechercher dans les données françaises ET dans le nom si il semble français
      const matchesFrench = frenchNames.includes(searchLower) ||
                           frenchTypes.includes(searchLower) ||
                           frenchTexts.includes(searchLower) ||
                           (cardNameSeemsFrench && cardName.includes(searchLower));
      
      // Mots-clés de traduction courants (français -> anglais)
      // Si on cherche un mot français, chercher aussi dans les équivalents anglais
      const translationMap: Record<string, string[]> = {
        'guivre': ['wurm'],
        'créature': ['creature'],
        'sorcierie': ['sorcery'],
        'enchantement': ['enchantment'],
        'artefact': ['artifact'],
        'terrain': ['land'],
        'instantané': ['instant'],
        'éphémère': ['flash'],
        'planeswalker': ['planeswalker'],
        'légendaire': ['legendary'],
      };
      
      // Si recherche en français, chercher aussi les équivalents anglais
      let matchesTranslation = false;
      if (isFrenchSearch) {
        for (const [frenchWord, englishWords] of Object.entries(translationMap)) {
          if (searchLower.includes(frenchWord)) {
            matchesTranslation = englishWords.some(englishWord => 
              cardName.includes(englishWord) ||
              cardType.includes(englishWord) ||
              cardSubtypes.includes(englishWord) ||
              cardText.includes(englishWord)
            );
            if (matchesTranslation) break;
          }
        }
      }
      
      // Si recherche en français, on accepte aussi les correspondances anglaises (au cas où)
      // mais on priorisera l'affichage français
      if (matchesEnglish || matchesFrench || matchesTranslation) {
        // Convertir UserCard en MTGCard avec informations du propriétaire
        if (card.mtgData) {
          const cardKey = `${card.mtgData.name}-${card.mtgData.set}-${card.mtgData.number}`;
          
          // Si on a déjà cette carte, ignorer (on garde juste le premier propriétaire)
          if (!seenCards.has(cardKey)) {
            // L'enrichissement avec les données françaises sera fait dans le useEffect
            // Ici, on garde les données originales (anglais)
            const cardWithOwner: CardWithOwner = {
              ...card.mtgData,
              ownerId: card.ownerId || card.userId,
              ownerName: card.ownerProfile?.pseudonym || card.ownerId || card.userId,
              ownerProfile: card.ownerProfile,
            };
            seenCards.set(cardKey, cardWithOwner);
            results.push(cardWithOwner);
          }
        }
      }
    }

    return results.slice(0, 20); // Limiter à 20 résultats pour la communauté
  }, [value, collectionCards, preferredLanguage]);

  const handleSearchScryfall = useCallback(async () => {
    if (!value.trim() || !searchOnScryfall) {
      return;
    }

    setSearchingScryfall(true);
    setScryfallResults([]);
    setShowResults(true);

    try {
      // Rechercher dans Scryfall seulement si on n'a pas assez de résultats locaux
      // Utiliser la langue préférée du profil
      const results = await searchCards(value.trim(), 10, preferredLanguage);
      setScryfallResults(results);
    } catch (error) {
      console.error('Error searching cards:', error);
      setScryfallResults([]);
    } finally {
      setSearchingScryfall(false);
    }
  }, [value, preferredLanguage, searchOnScryfall]);

  // Autocomplétion Scryfall (seulement si searchOnScryfall est activé)
  useEffect(() => {
    if (!value || value.length < 2 || !searchOnScryfall) {
      setScryfallSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        // Utiliser la langue préférée du profil
        const suggestions = await searchCardNames(value, preferredLanguage);
        setScryfallSuggestions(suggestions);
      } catch (error) {
        console.error('Error fetching autocomplete:', error);
        setScryfallSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [value, preferredLanguage, searchOnScryfall]);

  // Fermer les résultats quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
        setScryfallResults([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Chargement progressif des images au défilement (style TikTok)
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    // Observer pour la collection
    if (loadMoreCollectionRef.current && collectionResults.length > displayedCollectionCount) {
      const collectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setDisplayedCollectionCount((prev) => Math.min(prev + 50, collectionResults.length));
            }
          });
        },
        {
          rootMargin: '200px', // Commencer à charger 200px avant d'atteindre le trigger
          threshold: 0.1,
        }
      );
      collectionObserver.observe(loadMoreCollectionRef.current);
      observers.push(collectionObserver);
    }

    // Observer pour Scryfall
    if (loadMoreScryfallRef.current && scryfallResults.length > displayedScryfallCount) {
      const scryfallObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setDisplayedScryfallCount((prev) => Math.min(prev + 50, scryfallResults.length));
            }
          });
        },
        {
          rootMargin: '200px', // Commencer à charger 200px avant d'atteindre le trigger
          threshold: 0.1,
        }
      );
      scryfallObserver.observe(loadMoreScryfallRef.current);
      observers.push(scryfallObserver);
    }

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [collectionResults.length, scryfallResults.length, displayedCollectionCount, displayedScryfallCount]);

  // Réinitialiser les compteurs quand les résultats changent
  useEffect(() => {
    setDisplayedCollectionCount(50);
    setDisplayedScryfallCount(50);
  }, [collectionResults.length, scryfallResults.length]);


  // Les cartes sont déjà enrichies avec les données françaises via le service MagicCorporation
  // Plus besoin d'enrichissement supplémentaire ici

  // Enrichir les cartes de la collection avec les données françaises si nécessaire
  useEffect(() => {
    if (localSearchResults.length === 0 || preferredLanguage !== 'fr') {
      setCollectionResults(localSearchResults);
      return;
    }

    // Enrichir les cartes avec les données françaises depuis MagicCorporation
    const enrichCards = async () => {
      const enriched = await Promise.all(
        localSearchResults.map(async (card) => {
          // Enrichir la carte avec les données françaises
          const enrichedCard = await enrichCardWithFrenchData(card, true);
          
          // Remplacer le nom par la version française si disponible
          const frenchName = enrichedCard.foreignNames?.find(
            fn => fn.language === 'French' || fn.language === 'fr'
          );
          
          if (frenchName && frenchName.name) {
            return {
              ...enrichedCard,
              name: frenchName.name,
              type: frenchName.type || enrichedCard.type,
              text: frenchName.text || enrichedCard.text,
            };
          }
          
          return enrichedCard;
        })
      );
      
      setCollectionResults(enriched);
    };

    enrichCards();
  }, [localSearchResults, preferredLanguage]);

  // Mettre à jour les résultats de la collection quand la recherche change
  useEffect(() => {
    if (value && value.length >= 2) {
      setShowResults(true);
      
      // Rechercher automatiquement sur Scryfall après un délai si on a peu de résultats locaux ET si searchOnScryfall est activé
      if (searchOnScryfall) {
        const timeoutId = setTimeout(() => {
          if (localSearchResults.length < 5) {
            handleSearchScryfall();
          }
        }, 500); // Délai de 500ms après la dernière frappe
        
        return () => clearTimeout(timeoutId);
      } else {
        // Si Scryfall est désactivé, vider les résultats Scryfall
        setScryfallResults([]);
        setScryfallSuggestions([]);
      }
    } else {
      setCollectionResults([]);
      setScryfallResults([]);
      setShowResults(false);
    }
  }, [localSearchResults, value, handleSearchScryfall, searchOnScryfall]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scryfallSuggestions.length > 0 && selectedIndex >= 0) {
        // Si une suggestion est sélectionnée, l'utiliser
        onChange(scryfallSuggestions[selectedIndex].name);
        setScryfallSuggestions([]);
        if (searchOnScryfall) {
          handleSearchScryfall();
        }
      } else {
        // Sinon, rechercher avec la valeur actuelle (seulement si Scryfall est activé)
        if (searchOnScryfall) {
          handleSearchScryfall();
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (scryfallSuggestions.length > 0) {
        setSelectedIndex(prev => (prev < scryfallSuggestions.length - 1 ? prev + 1 : prev));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Escape') {
      setShowResults(false);
      setScryfallResults([]);
      setCollectionResults([]);
      setScryfallSuggestions([]);
    }
  };

  const handleSelectSuggestion = (suggestion: CardSuggestion) => {
    onChange(suggestion.name);
    setScryfallSuggestions([]);
    if (searchOnScryfall) {
      handleSearchScryfall();
    }
  };

  const handleAddCard = async (card: MTGCard) => {
    onSelectCard(card);
    setShowResults(false);
    setScryfallResults([]);
    setCollectionResults([]);
    setScryfallSuggestions([]);
    onChange('');
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Switch pour activer/désactiver la recherche externe */}
      <div className="flex items-center justify-end gap-3 mb-2">
        <label className="flex items-center gap-3 cursor-pointer group">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
            Recherche externe
          </span>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={searchOnScryfall}
              onChange={(e) => {
                setSearchOnScryfall(e.target.checked);
                if (!e.target.checked) {
                  // Si on désactive, vider les résultats Scryfall
                  setScryfallResults([]);
                  setScryfallSuggestions([]);
                }
              }}
              className="sr-only"
            />
            <div
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ease-in-out focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${
                searchOnScryfall
                  ? 'bg-blue-600 dark:bg-blue-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-300 ease-in-out ${
                  searchOnScryfall ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </div>
        </label>
      </div>
      
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (collectionResults.length > 0 || scryfallResults.length > 0) {
              setShowResults(true);
            }
          }}
          placeholder={placeholder}
          className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
        <svg
          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {value && (
          <button
            onClick={() => {
              onChange('');
              setScryfallSuggestions([]);
              setScryfallResults([]);
              setCollectionResults([]);
              setShowResults(false);
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Panneau de résultats avec colonnes : Suggestions à gauche, Résultats à droite - EN DROPDOWN */}
      {(scryfallSuggestions.length > 0 || showResults) && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-96 overflow-hidden flex">
          {/* Colonne gauche : Suggestions d'autocomplétion */}
          {scryfallSuggestions.length > 0 && (
            <div className="w-1/2 border-r border-gray-300 dark:border-gray-600 overflow-y-auto max-h-96">
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  Suggestions ({scryfallSuggestions.length})
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Sélectionnez ou appuyez sur Entrée
                </div>
              </div>
              {scryfallSuggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.name}-${suggestion.language}-${index}`}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white ${
                    selectedIndex === index ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span className="flex-1 truncate">{suggestion.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                      suggestion.language === 'fr' 
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}>
                      {suggestion.language === 'fr' ? 'FR' : 'EN'}
                    </span>
                  </div>
                </button>
              ))}
              <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
                Appuyez sur Entrée pour rechercher
              </div>
            </div>
          )}

          {/* Colonne droite : Résultats de recherche */}
          {showResults && (collectionResults.length > 0 || scryfallResults.length > 0 || searchingScryfall) && (
            <div className={`${scryfallSuggestions.length > 0 ? 'w-1/2' : 'w-full'} overflow-y-auto max-h-96`}>
              {/* Résultats de la collection locale */}
              {collectionResults.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 border-b border-gray-200 dark:border-gray-700">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Dans les collections de la communauté ({collectionResults.length})
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Cliquez sur une carte pour l'ajouter à votre wishlist et contacter le propriétaire
                    </div>
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {collectionResults.slice(0, displayedCollectionCount).map((card) => {
                      // Déterminer l'image à afficher selon la langue préférée
                      let displayImageUrl = card.imageUrl;
                      let displayName = card.name;
                      
                      if (preferredLanguage === 'fr' && card.foreignNames) {
                        const frenchName = card.foreignNames.find(
                          fn => fn.language === 'French' || fn.language === 'fr'
                        );
                        if (frenchName) {
                          if (frenchName.imageUrl) {
                            displayImageUrl = frenchName.imageUrl;
                          }
                          if (frenchName.name) {
                            displayName = frenchName.name;
                          }
                        }
                      }
                      
                      return (
                      <button
                        key={card.id || `collection-${card.name}`}
                        onClick={() => handleAddCard(card)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {displayImageUrl && (
                            <LazyImage
                              src={displayImageUrl}
                              alt={displayName}
                              className="w-12 h-16 object-cover rounded flex-shrink-0"
                              priority="low"
                              showPlaceholder={false}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 dark:text-white truncate">
                              {displayName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {preferredLanguage === 'fr' && card.foreignNames ? 
                                (card.foreignNames.find(fn => fn.language === 'French' || fn.language === 'fr')?.type || card.type) :
                                card.type
                              }
                            </div>
                            {card.manaCost && (
                              <div className="mt-1">
                                <ManaCostDisplay manaCost={card.manaCost} size={16} />
                              </div>
                            )}
                            {card.set && (
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                {card.setName || card.set} ({card.set})
                              </div>
                            )}
                            {(card as CardWithOwner).ownerName && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {(card as CardWithOwner).ownerName}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                        </div>
                      </button>
                    ))}
                    {/* Trigger pour charger plus de cartes de la collection */}
                    {collectionResults.length > displayedCollectionCount && (
                      <div 
                        ref={loadMoreCollectionRef} 
                        className="w-full flex justify-center items-center py-4"
                        style={{ minHeight: '60px' }}
                      >
                        <Spinner size="md" />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Résultats Scryfall */}
              {searchingScryfall && (
                <div className="px-4 py-8 text-center text-gray-600 dark:text-gray-400">
                  Recherche sur Scryfall en cours...
                </div>
              )}
              {!searchingScryfall && scryfallResults.length > 0 && (
                <>
                  <div className={`px-4 py-2 bg-blue-50 dark:bg-blue-900/20 ${collectionResults.length > 0 ? 'border-t border-b' : 'border-b'} border-gray-200 dark:border-gray-700`}>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Résultats Scryfall ({scryfallResults.length})
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Recherche dans: nom, type, type de créature, description
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Cliquez sur une carte pour l'ajouter à votre wishlist
                    </div>
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {scryfallResults.slice(0, displayedScryfallCount).map((card) => {
                      // Déterminer l'image à afficher selon la langue préférée
                      let displayImageUrl = card.imageUrl;
                      let displayName = card.name;
                      
                      if (preferredLanguage === 'fr' && card.foreignNames) {
                        const frenchName = card.foreignNames.find(
                          fn => fn.language === 'French' || fn.language === 'fr'
                        );
                        if (frenchName) {
                          if (frenchName.imageUrl) {
                            displayImageUrl = frenchName.imageUrl;
                          }
                          if (frenchName.name) {
                            displayName = frenchName.name;
                          }
                        }
                      }
                      
                      return (
                      <button
                        key={card.id}
                        onClick={() => handleAddCard(card)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {displayImageUrl && (
                            <LazyImage
                              src={displayImageUrl}
                              alt={displayName}
                              className="w-12 h-16 object-cover rounded flex-shrink-0"
                              priority="low"
                              showPlaceholder={false}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 dark:text-white truncate">
                              {displayName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {preferredLanguage === 'fr' && card.foreignNames ? 
                                (card.foreignNames.find(fn => fn.language === 'French' || fn.language === 'fr')?.type || card.type) :
                                card.type
                              }
                            </div>
                            {card.manaCost && (
                              <div className="mt-1">
                                <ManaCostDisplay manaCost={card.manaCost} size={16} />
                              </div>
                            )}
                            {card.set && (
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                {card.setName || card.set} ({card.set})
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                        </div>
                      </button>
                    ))}
                    {/* Trigger pour charger plus de cartes Scryfall */}
                    {scryfallResults.length > displayedScryfallCount && (
                      <div 
                        ref={loadMoreScryfallRef} 
                        className="w-full flex justify-center items-center py-4"
                        style={{ minHeight: '60px' }}
                      >
                        <Spinner size="md" />
                      </div>
                    )}
                  </div>
                </>
              )}
              {!searchingScryfall && collectionResults.length === 0 && scryfallResults.length === 0 && value.length >= 2 && (
                <div className="px-4 py-8 text-center text-gray-600 dark:text-gray-400">
                  Aucun résultat trouvé. Appuyez sur Entrée pour rechercher sur Scryfall.
                </div>
              )}
            </div>
          )}

          {/* Si seulement des suggestions sans résultats, afficher un message */}
          {scryfallSuggestions.length > 0 && !showResults && (
            <div className="w-1/2 border-l border-gray-300 dark:border-gray-600 flex items-center justify-center">
              <div className="px-4 py-8 text-center text-gray-600 dark:text-gray-400">
                <p className="text-sm">Appuyez sur Entrée pour rechercher</p>
                <p className="text-xs mt-2">Les résultats apparaîtront ici</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


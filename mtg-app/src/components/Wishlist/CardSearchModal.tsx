import { useState, useEffect } from 'react';
import { Modal } from '../UI/Modal';
import { Input } from '../UI/Input';
import { Button } from '../UI/Button';
import { searchCardNames, searchCards } from '../../services/scryfallSearchService';
import { useProfile } from '../../hooks/useProfile';
import type { MTGCard } from '../../types/card';

interface CardSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCard: (card: MTGCard) => void;
}

export function CardSearchModal({ isOpen, onClose, onSelectCard }: CardSearchModalProps) {
  const { profile } = useProfile();
  const preferredLanguage = profile?.preferredLanguage;
  const [searchQuery, setSearchQuery] = useState('');
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<MTGCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCard, setSelectedCard] = useState<MTGCard | null>(null);

  // Debounce pour l'autocomplétion
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setAutocompleteSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const suggestions = await searchCardNames(searchQuery, preferredLanguage);
        // Extraire les noms des suggestions (qui sont des objets { name, language })
        setAutocompleteSuggestions(suggestions.slice(0, 10).map(s => s.name)); // Limiter à 10 suggestions
      } catch (error) {
        console.error('Error fetching autocomplete:', error);
        setAutocompleteSuggestions([]);
      }
    }, 300); // Attendre 300ms après la dernière frappe

    return () => clearTimeout(timeoutId);
  }, [searchQuery, preferredLanguage]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    setSearching(true);
    setSearchResults([]);
    setSelectedCard(null);

    try {
      const results = await searchCards(searchQuery.trim(), 20, preferredLanguage);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching cards:', error);
      alert('Erreur lors de la recherche. Veuillez réessayer.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setSearchQuery(suggestion);
    setAutocompleteSuggestions([]);
    handleSearch();
  };

  const handleSelectCard = (card: MTGCard) => {
    setSelectedCard(card);
  };

  const handleAddToWishlist = () => {
    if (selectedCard) {
      onSelectCard(selectedCard);
      setSelectedCard(null);
      setSearchQuery('');
      setSearchResults([]);
      setAutocompleteSuggestions([]);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rechercher une carte (Scryfall)">
      <div className="space-y-4">
        {/* Barre de recherche */}
        <div className="relative">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tapez le nom d'une carte (ex: Lightning Bolt)..."
            className="w-full pr-10"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Suggestions d'autocomplétion */}
          {autocompleteSuggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {autocompleteSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Résultats de recherche */}
        {searching && (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">
            Recherche en cours...
          </div>
        )}

        {!searching && searchResults.length > 0 && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {searchResults.length} résultat(s) trouvé(s)
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {searchResults.map((card) => (
                <div
                  key={card.id}
                  onClick={() => handleSelectCard(card)}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedCard?.id === card.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {card.imageUrl && (
                      <img
                        src={card.imageUrl}
                        alt={card.name}
                        className="w-16 h-22 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {card.name}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {card.type}
                      </div>
                      {card.manaCost && (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Coût: {card.manaCost}
                        </div>
                      )}
                      {card.set && (
                        <div className="text-xs text-gray-500 dark:text-gray-500">
                          {card.setName || card.set} ({card.set})
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!searching && searchQuery && searchResults.length === 0 && (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">
            Aucun résultat trouvé. Essayez avec un autre nom de carte.
          </div>
        )}

        {/* Bouton d'ajout */}
        {selectedCard && (
          <div className="flex gap-2 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleAddToWishlist}>
              Ajouter à la wishlist
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}


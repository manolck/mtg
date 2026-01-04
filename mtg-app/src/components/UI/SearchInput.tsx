import { useState, useRef, useEffect } from 'react';
import { searchKeywords, searchKeywordActions, searchAbilityWords, type Keyword, type KeywordAction, type AbilityWord } from '../../utils/keywordSearch';

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  onSuggestionSelect?: (suggestion: string) => void;
  showKeywordSuggestions?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function SearchInput({ 
  label, 
  error, 
  className = '', 
  value,
  onChange,
  onSuggestionSelect,
  showKeywordSuggestions = true,
  onKeyDown,
  ...props 
}: SearchInputProps) {
  const [suggestions, setSuggestions] = useState<Array<{ text: string; type: 'keyword' | 'action' | 'ability_word'; en: string; fr: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const searchValue = typeof value === 'string' ? value : '';

  useEffect(() => {
    if (!showKeywordSuggestions || !searchValue.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const query = searchValue.toLowerCase().trim();
    
    // Rechercher dans les mots-clés, actions et ability words
    const keywordResults = searchKeywords(query);
    const actionResults = searchKeywordActions(query);
    const abilityWordResults = searchAbilityWords(query);

    // Combiner et limiter à 8 suggestions
    const combined: Array<{ text: string; type: 'keyword' | 'action' | 'ability_word'; en: string; fr: string }> = [];

    // Ajouter les mots-clés (priorité aux correspondances exactes)
    keywordResults.forEach((keyword: Keyword) => {
      const exactMatch = keyword.en.toLowerCase() === query || keyword.fr.toLowerCase() === query;
      combined.push({
        text: exactMatch ? keyword.en : (keyword.en.toLowerCase().includes(query) ? keyword.en : keyword.fr),
        type: 'keyword',
        en: keyword.en,
        fr: keyword.fr,
      });
    });

    // Ajouter les actions
    actionResults.forEach((action: KeywordAction) => {
      const exactMatch = action.en.toLowerCase() === query || action.fr.toLowerCase() === query;
      combined.push({
        text: exactMatch ? action.en : (action.en.toLowerCase().includes(query) ? action.en : action.fr),
        type: 'action',
        en: action.en,
        fr: action.fr,
      });
    });

    // Ajouter les ability words
    abilityWordResults.forEach((abilityWord: AbilityWord) => {
      const exactMatch = abilityWord.en.toLowerCase() === query || abilityWord.fr.toLowerCase() === query;
      combined.push({
        text: exactMatch ? abilityWord.en : (abilityWord.en.toLowerCase().includes(query) ? abilityWord.en : abilityWord.fr),
        type: 'ability_word',
        en: abilityWord.en,
        fr: abilityWord.fr,
      });
    });

    // Trier : correspondances exactes d'abord, puis par longueur
    combined.sort((a, b) => {
      const aExact = a.en.toLowerCase() === query || a.fr.toLowerCase() === query;
      const bExact = b.en.toLowerCase() === query || b.fr.toLowerCase() === query;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.text.length - b.text.length;
    });

    // Limiter à 8 suggestions
    const limited = combined.slice(0, 8);

    setSuggestions(limited);
    setShowSuggestions(limited.length > 0);
    setSelectedIndex(-1);
  }, [searchValue, showKeywordSuggestions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e);
    }
  };

  const handleSuggestionClick = (suggestion: { text: string; en: string; fr: string }) => {
    // Utiliser la langue qui correspond le mieux à la recherche
    const query = searchValue.toLowerCase().trim();
    const selectedText = suggestion.en.toLowerCase().includes(query) ? suggestion.en : suggestion.fr;
    
    if (onSuggestionSelect) {
      onSuggestionSelect(selectedText);
    } else if (onChange && inputRef.current) {
      // Simuler un changement d'input
      const syntheticEvent = {
        target: { value: selectedText },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
    
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
          return;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            handleSuggestionClick(suggestions[selectedIndex]);
            return;
          }
          // Si aucune suggestion n'est sélectionnée, laisser passer l'événement Enter
          break;
        case 'Escape':
          e.preventDefault();
          setShowSuggestions(false);
          setSelectedIndex(-1);
          return;
        default:
          break;
      }
    }
    
    // Appeler le handler personnalisé si fourni
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div className="relative w-full">
      {label && (
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          } dark:bg-gray-800 dark:text-white ${className}`}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          {...props}
        />
        
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.en}-${index}`}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  index === selectedIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
                } ${
                  index === 0 ? 'rounded-t-lg' : ''
                } ${
                  index === suggestions.length - 1 ? 'rounded-b-lg' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {suggestion.text}
                  </span>
                  <div className="flex items-center gap-2">
                    {suggestion.type === 'keyword' && (
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                        Mot-clé
                      </span>
                    )}
                    {suggestion.type === 'action' && (
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                        Action
                      </span>
                    )}
                    {suggestion.type === 'ability_word' && (
                      <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                        Aptitude
                      </span>
                    )}
                    {suggestion.en !== suggestion.text && suggestion.fr !== suggestion.text && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {suggestion.en === suggestion.text ? suggestion.fr : suggestion.en}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}


import { ManaSymbol } from '../UI/ManaSymbol';
import {
  CARD_SEARCH_COLORS,
  CARD_SEARCH_CREATURE_TYPES,
  CARD_SEARCH_LANGUAGES,
  CARD_SEARCH_RARITIES,
  CARD_SEARCH_TYPES,
  hasActiveCardSearchFilters,
  type CardSearchFilters,
} from '../../utils/cardSearchFilters';

const selectClass =
  'px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white';

interface CardSearchFilterBarProps {
  filters: CardSearchFilters;
  onChange: (next: CardSearchFilters) => void;
  sets?: Array<{ code: string; name: string }>;
}

export function CardSearchFilterBar({ filters, onChange, sets = [] }: CardSearchFilterBarProps) {
  const patch = (partial: Partial<CardSearchFilters>) => onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Couleur:</label>
        <div className="flex gap-1">
          {CARD_SEARCH_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                const selected = filters.colors.includes(color)
                  ? filters.colors.filter((c) => c !== color)
                  : [...filters.colors, color];
                patch({
                  colors: selected,
                  exclusiveColors: selected.length === 0 ? false : filters.exclusiveColors,
                });
              }}
              className={`p-1.5 rounded transition-all ${
                filters.colors.includes(color)
                  ? 'bg-blue-600 dark:bg-blue-500 ring-2 ring-blue-400 dark:ring-blue-300'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              title={
                color === 'W'
                  ? 'White'
                  : color === 'U'
                    ? 'Blue'
                    : color === 'B'
                      ? 'Black'
                      : color === 'R'
                        ? 'Red'
                        : color === 'G'
                          ? 'Green'
                          : color
              }
            >
              <ManaSymbol color={color} size={20} />
            </button>
          ))}
        </div>
        {filters.colors.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.exclusiveColors}
                onChange={(e) => patch({ exclusiveColors: e.target.checked })}
                className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                Exclusif
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rareté:</label>
        <select
          value={filters.rarity || ''}
          onChange={(e) => patch({ rarity: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Toutes</option>
          {CARD_SEARCH_RARITIES.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarity}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type:</label>
        <select
          value={filters.type || ''}
          onChange={(e) => patch({ type: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Tous</option>
          {CARD_SEARCH_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type de créature:</label>
        <select
          value={filters.creatureType || ''}
          onChange={(e) => patch({ creatureType: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Tous</option>
          {CARD_SEARCH_CREATURE_TYPES.map((creatureType) => (
            <option key={creatureType} value={creatureType}>
              {creatureType}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Langue:</label>
        <select
          value={filters.language || ''}
          onChange={(e) => patch({ language: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Toutes</option>
          {CARD_SEARCH_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Édition:</label>
        {sets.length > 0 ? (
          <select
            value={filters.set || ''}
            onChange={(e) => patch({ set: e.target.value || null })}
            className={`${selectClass} min-w-[150px] max-w-[220px]`}
          >
            <option value="">Toutes</option>
            {sets.map((set) => (
              <option key={set.code} value={set.code}>
                {set.name} ({set.code})
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={filters.set || ''}
            onChange={(e) => patch({ set: e.target.value.trim() || null })}
            placeholder="mh3, ltr…"
            className={`${selectClass} w-28 uppercase`}
          />
        )}
      </div>

      {hasActiveCardSearchFilters(filters) && (
        <button
          type="button"
          onClick={() =>
            onChange({
              colors: [],
              exclusiveColors: false,
              rarity: null,
              type: null,
              creatureType: null,
              language: null,
              set: null,
            })
          }
          className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline"
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}

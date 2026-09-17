import { ManaSymbol } from '../UI/ManaSymbol';
import {
  CARD_SEARCH_COLORS,
  CARD_SEARCH_CREATURE_TYPES,
  CARD_SEARCH_RARITIES,
  CARD_SEARCH_TYPES,
  hasActiveCardSearchFilters,
  rarityLabel,
  type CardSearchFilters,
} from '../../utils/cardSearchFilters';

const selectClass = 'field-control';

interface CardSearchFilterBarProps {
  filters: CardSearchFilters;
  onChange: (next: CardSearchFilters) => void;
  sets?: Array<{ code: string; name: string }>;
}

export function CardSearchFilterBar({ filters, onChange, sets = [] }: CardSearchFilterBarProps) {
  const patch = (partial: Partial<CardSearchFilters>) => onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap gap-3 items-start">
      <div className="filter-chip sm:min-w-0">
        <label>Couleur</label>
        <div className="grid grid-cols-3 gap-1 w-max">
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
              className={`p-1.5 rounded-lg transition-all min-h-[36px] min-w-[36px] inline-flex items-center justify-center ${
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
          <label className="flex items-center gap-2 cursor-pointer mt-0.5">
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
        )}
      </div>

      <div className="filter-chip sm:min-w-0">
        <label>Rareté</label>
        <div className="grid grid-cols-2 gap-1 w-max">
          {CARD_SEARCH_RARITIES.map((rarity) => {
            const selected = filters.rarities.includes(rarity);
            return (
              <button
                key={rarity}
                type="button"
                onClick={() => {
                  const next = selected
                    ? filters.rarities.filter((value) => value !== rarity)
                    : [...filters.rarities, rarity];
                  patch({ rarities: next });
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

      <div className="filter-chip">
        <label>Type</label>
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

      <div className="filter-chip">
        <label>Type de créature</label>
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

      <div className="filter-chip sm:min-w-[12rem] sm:max-w-xs">
        <label>Édition</label>
        {sets.length > 0 ? (
          <select
            value={filters.set || ''}
            onChange={(e) => patch({ set: e.target.value || null })}
            className={selectClass}
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
            className={`${selectClass} uppercase`}
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
              rarities: [],
              type: null,
              creatureType: null,
              language: null,
              set: null,
            })
          }
          className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline"
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}

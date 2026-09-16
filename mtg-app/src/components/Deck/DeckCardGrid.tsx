import type { DeckEntry, DeckZone } from '../../types/deck';
import { groupDeckEntries } from '../../utils/deckGrouping';
import { LazyImage } from '../UI/LazyImage';
import { ManaCostDisplay } from '../UI/ManaCostDisplay';
import { Button } from '../UI/Button';

export type DeckViewMode = 'list' | 'grid';

interface DeckCardGridProps {
  entries: DeckEntry[];
  zone: DeckZone;
  readOnly: boolean;
  viewMode: DeckViewMode;
  onIncrement?: (entry: DeckEntry) => void;
  onDecrement?: (entry: DeckEntry) => void;
  onRemove?: (entry: DeckEntry) => void;
}

function QtyControls({
  entry,
  readOnly,
  isCommander,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  entry: DeckEntry;
  readOnly: boolean;
  isCommander: boolean;
  onIncrement?: (entry: DeckEntry) => void;
  onDecrement?: (entry: DeckEntry) => void;
  onRemove?: (entry: DeckEntry) => void;
}) {
  if (readOnly) {
    return (
      <span className="font-medium text-gray-700 dark:text-gray-200">×{entry.quantity}</span>
    );
  }
  if (isCommander) {
    return (
      <Button variant="danger" className="!px-2 !py-1" onClick={() => onRemove?.(entry)}>
        Retirer
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="secondary"
        className="!px-2 !py-1"
        onClick={() => onDecrement?.(entry)}
        disabled={entry.quantity <= 1}
      >
        −
      </Button>
      <span className="w-8 text-center text-sm">{entry.quantity}</span>
      <Button variant="secondary" className="!px-2 !py-1" onClick={() => onIncrement?.(entry)}>
        +
      </Button>
      <Button variant="danger" className="!px-2 !py-1" onClick={() => onRemove?.(entry)}>
        ×
      </Button>
    </div>
  );
}

export function DeckCardGrid({
  entries,
  zone,
  readOnly,
  viewMode,
  onIncrement,
  onDecrement,
  onRemove,
}: DeckCardGridProps) {
  const isCommander = zone === 'commanders';
  const groups = groupDeckEntries(entries, { isCommanderZone: isCommander });

  if (entries.length === 0) return null;

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.id}>
          <div className="flex items-baseline justify-between mb-3 border-b border-gray-200 dark:border-gray-700 pb-1">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
              {group.label}
            </h3>
            <span className="text-xs text-gray-500">
              {group.count} carte{group.count !== 1 ? 's' : ''}
            </span>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {group.entries.map((entry) => (
                <div
                  key={`${zone}-${entry.scryfallId}`}
                  className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col"
                >
                  <div className="aspect-[5/7] bg-gray-200 dark:bg-gray-700 relative">
                    {entry.imageUrl ? (
                      <LazyImage
                        src={entry.imageUrl}
                        alt={entry.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        priority="low"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 p-2 text-center">
                        {entry.name}
                      </div>
                    )}
                    <span className="absolute top-1.5 right-1.5 min-w-[1.5rem] text-center text-xs font-bold bg-black/75 text-white rounded px-1.5 py-0.5">
                      ×{entry.quantity}
                    </span>
                  </div>
                  <div className="p-2 flex-1 flex flex-col gap-1">
                    <div className="text-xs font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug">
                      {entry.name}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-auto">
                      {entry.manaCost ? (
                        <ManaCostDisplay manaCost={entry.manaCost} size={14} />
                      ) : (
                        <span />
                      )}
                    </div>
                    <div className="flex justify-center pt-1">
                      <QtyControls
                        entry={entry}
                        readOnly={readOnly}
                        isCommander={isCommander}
                        onIncrement={onIncrement}
                        onDecrement={onDecrement}
                        onRemove={onRemove}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {group.entries.map((entry) => (
                <div
                  key={`${zone}-${entry.scryfallId}`}
                  className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm"
                >
                  {entry.imageUrl ? (
                    <LazyImage
                      src={entry.imageUrl}
                      alt={entry.name}
                      className="w-12 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-gray-200 dark:bg-gray-700 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {entry.name}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      <span>
                        {entry.setCode?.toUpperCase()} {entry.collectorNumber || ''}
                      </span>
                      {entry.manaCost ? <ManaCostDisplay manaCost={entry.manaCost} /> : null}
                    </div>
                  </div>
                  <QtyControls
                    entry={entry}
                    readOnly={readOnly}
                    isCommander={isCommander}
                    onIncrement={onIncrement}
                    onDecrement={onDecrement}
                    onRemove={onRemove}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

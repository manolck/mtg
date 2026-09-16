import { useMemo, useState } from 'react';
import type { DeckEntry, DeckZone } from '../../types/deck';
import { countEntries } from '../../types/deck';
import { groupDeckEntries } from '../../utils/deckGrouping';
import type { ValidationIssue } from '../../services/deckFormatRules';
import { CardLightbox } from '../Card/CardLightbox';
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
  /** Show "swap print" when entry has owned alternatives */
  swappableIds?: Set<string>;
  onSwapPrint?: (entry: DeckEntry) => void;
  formatIssues?: Map<string, ValidationIssue[]>;
}

function formatIssueLabel(code: string): string {
  switch (code) {
    case 'color_identity':
      return 'Identité';
    case 'singleton':
      return 'Singleton';
    case 'copy_limit':
      return 'Copies';
    case 'illegal':
    case 'pauper_illegal':
      return 'Illégale';
    case 'unresolved_card':
      return 'Incomplète';
    case 'pauper_rarity':
      return 'Rareté';
    case 'legality_unknown':
      return 'Légalité';
    default:
      return 'Format';
  }
}

function FormatIssueBadges({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return null;
  const title = issues.map((issue) => issue.message).join('\n');
  return (
    <div className="flex flex-wrap gap-1" title={title}>
      {issues.map((issue) => (
        <span
          key={`${issue.code}-${issue.scryfallId || issue.message}`}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white"
        >
          {formatIssueLabel(issue.code)}
        </span>
      ))}
    </div>
  );
}

function QtyControls({
  entry,
  readOnly,
  isCommander,
  canSwap,
  onIncrement,
  onDecrement,
  onRemove,
  onSwapPrint,
}: {
  entry: DeckEntry;
  readOnly: boolean;
  isCommander: boolean;
  canSwap?: boolean;
  onIncrement?: (entry: DeckEntry) => void;
  onDecrement?: (entry: DeckEntry) => void;
  onRemove?: (entry: DeckEntry) => void;
  onSwapPrint?: (entry: DeckEntry) => void;
}) {
  if (readOnly) {
    return (
      <span className="font-medium text-gray-700 dark:text-gray-200">×{entry.quantity}</span>
    );
  }
  if (isCommander) {
    return (
      <div className="flex items-center gap-1">
        {canSwap && (
          <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => onSwapPrint?.(entry)}>
            Print
          </Button>
        )}
        <Button variant="danger" className="!px-2 !py-1" onClick={() => onRemove?.(entry)}>
          Retirer
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 flex-wrap justify-center">
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
      {canSwap && (
        <Button
          variant="secondary"
          className="!px-2 !py-1 text-xs"
          title="Changer d'impression (collection)"
          onClick={() => onSwapPrint?.(entry)}
        >
          Print
        </Button>
      )}
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
  swappableIds,
  onSwapPrint,
  formatIssues,
}: DeckCardGridProps) {
  const isCommander = zone === 'commanders';
  const [enlarged, setEnlarged] = useState<DeckEntry | null>(null);

  const groups = useMemo(() => {
    const problemEntries = formatIssues?.size
      ? entries.filter((entry) => formatIssues.has(entry.scryfallId))
      : [];
    const rest = formatIssues?.size
      ? entries.filter((entry) => !formatIssues.has(entry.scryfallId))
      : entries;
    const typeGroups = groupDeckEntries(rest, { isCommanderZone: isCommander });
    if (!problemEntries.length) return typeGroups;
    return [
      {
        id: 'format-issues',
        label: 'Problèmes de format',
        entries: [...problemEntries].sort((a, b) =>
          a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
        ),
        count: countEntries(problemEntries),
      },
      ...typeGroups,
    ];
  }, [entries, formatIssues, isCommander]);

  if (entries.length === 0) return null;

  const renderCard = (entry: DeckEntry) => {
    const issues = formatIssues?.get(entry.scryfallId) || [];
    const hasIssue = issues.length > 0;
    const issueTitle = issues.map((issue) => issue.message).join('\n');

    if (viewMode === 'grid') {
      return (
        <div
          key={`${zone}-${entry.scryfallId}`}
          className={`rounded-lg overflow-hidden shadow-sm flex flex-col ${
            hasIssue
              ? 'bg-red-50 dark:bg-red-950/40 ring-2 ring-red-500 border border-red-400 dark:border-red-500'
              : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700'
          }`}
        >
          <div
            role="button"
            tabIndex={0}
            title={hasIssue ? issueTitle : 'Voir la carte en grand'}
            aria-label={`Voir ${entry.name} en grand`}
            aria-invalid={hasIssue || undefined}
            className="aspect-[63/88] bg-gray-200 dark:bg-gray-700 relative cursor-zoom-in"
            onClick={() => setEnlarged(entry)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setEnlarged(entry);
              }
            }}
          >
            {entry.imageUrl ? (
              <LazyImage
                src={entry.imageUrl}
                alt={entry.name}
                className="absolute inset-0 w-full h-full object-contain"
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
            {hasIssue && (
              <div className="absolute top-1.5 left-1.5">
                <FormatIssueBadges issues={issues} />
              </div>
            )}
          </div>
          <div className="p-2 flex-1 flex flex-col gap-1">
            <div className="text-xs font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug">
              {entry.name}
            </div>
            {hasIssue && (
              <p className="text-[11px] text-red-700 dark:text-red-300 leading-snug line-clamp-2">
                {issues[0].message}
              </p>
            )}
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
                canSwap={swappableIds?.has(entry.scryfallId)}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
                onRemove={onRemove}
                onSwapPrint={onSwapPrint}
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={`${zone}-${entry.scryfallId}`}
        className={`flex items-center gap-3 rounded-lg p-3 shadow-sm ${
          hasIssue
            ? 'bg-red-50 dark:bg-red-950/40 ring-2 ring-red-500'
            : 'bg-white dark:bg-gray-800'
        }`}
        title={hasIssue ? issueTitle : undefined}
        aria-invalid={hasIssue || undefined}
      >
        {entry.imageUrl ? (
          <button
            type="button"
            title="Voir la carte en grand"
            className="flex-shrink-0 cursor-zoom-in"
            onClick={() => setEnlarged(entry)}
          >
            <LazyImage
              src={entry.imageUrl}
              alt={entry.name}
              className="w-12 h-16 object-cover rounded"
            />
          </button>
        ) : (
          <div className="w-12 h-16 bg-gray-200 dark:bg-gray-700 rounded" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium text-gray-900 dark:text-white truncate">
              {entry.name}
            </div>
            <FormatIssueBadges issues={issues} />
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
            <span>
              {entry.setCode?.toUpperCase()} {entry.collectorNumber || ''}
            </span>
            {entry.manaCost ? <ManaCostDisplay manaCost={entry.manaCost} /> : null}
          </div>
          {hasIssue && (
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              {issues.map((issue) => issue.message).join(' · ')}
            </p>
          )}
        </div>
        <QtyControls
          entry={entry}
          readOnly={readOnly}
          isCommander={isCommander}
          canSwap={swappableIds?.has(entry.scryfallId)}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          onRemove={onRemove}
          onSwapPrint={onSwapPrint}
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.id}>
          <div
            className={`flex items-baseline justify-between mb-3 border-b pb-1 ${
              group.id === 'format-issues'
                ? 'border-red-300 dark:border-red-700'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <h3
              className={`text-sm font-semibold uppercase tracking-wide ${
                group.id === 'format-issues'
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {group.label}
            </h3>
            <span className={`text-xs ${group.id === 'format-issues' ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
              {group.count} carte{group.count !== 1 ? 's' : ''}
            </span>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {group.entries.map(renderCard)}
            </div>
          ) : (
            <div className="space-y-2">{group.entries.map(renderCard)}</div>
          )}
        </section>
      ))}
      {enlarged && (
        <CardLightbox
          imageUrl={enlarged.imageUrl}
          name={enlarged.name}
          onClose={() => setEnlarged(null)}
        />
      )}
    </div>
  );
}

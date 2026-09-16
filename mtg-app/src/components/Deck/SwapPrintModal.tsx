import { useMemo } from 'react';
import type { DeckEntry, DeckZone } from '../../types/deck';
import type { UserCard } from '../../types/card';
import { findOwnedPrintAlternatives } from '../../utils/deckPrintSwap';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { LazyImage } from '../UI/LazyImage';

interface SwapPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: DeckEntry | null;
  zone: DeckZone;
  collectionCards: UserCard[];
  onSwap: (oldScryfallId: string, newEntry: DeckEntry, zone: DeckZone) => Promise<void>;
  busy?: boolean;
}

export function SwapPrintModal({
  isOpen,
  onClose,
  entry,
  zone,
  collectionCards,
  onSwap,
  busy,
}: SwapPrintModalProps) {
  const alternatives = useMemo(() => {
    if (!entry) return [];
    return findOwnedPrintAlternatives(entry, collectionCards);
  }, [entry, collectionCards]);

  const others = alternatives.filter((a) => !a.isCurrentPrint);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={entry ? `Changer l'impression — ${entry.name}` : 'Changer l\'impression'}
      size="lg"
    >
      <div className="space-y-4">
        {entry && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Impression actuelle :{' '}
            <strong>
              {entry.setCode?.toUpperCase() || '?'} {entry.collectorNumber || ''}
            </strong>{' '}
            · choisissez une version que vous possédez déjà.
          </p>
        )}

        {!entry || alternatives.length === 0 ? (
          <p className="text-sm text-center text-gray-500 py-8">
            Aucune impression de cette carte dans votre collection.
          </p>
        ) : others.length === 0 ? (
          <p className="text-sm text-center text-gray-500 py-8">
            Vous ne possédez que l&apos;impression déjà dans le deck.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto space-y-2">
            {alternatives.map((alt) => (
              <li
                key={alt.entry.scryfallId || alt.card.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  alt.isCurrentPrint
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                {alt.entry.imageUrl || alt.card.mtgData?.imageUrl ? (
                  <LazyImage
                    src={alt.entry.imageUrl || alt.card.mtgData!.imageUrl!}
                    alt={alt.entry.name}
                    className="w-12 h-16 object-cover rounded"
                  />
                ) : (
                  <div className="w-12 h-16 bg-gray-200 dark:bg-gray-700 rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {alt.entry.setCode?.toUpperCase()} {alt.entry.collectorNumber}
                  </div>
                  <div className="text-xs text-gray-500">
                    ×{alt.card.quantity} en collection
                    {alt.isCurrentPrint ? ' · actuelle' : ''}
                  </div>
                </div>
                {!alt.isCurrentPrint && entry && (
                  <Button
                    loading={busy}
                    disabled={busy}
                    onClick={() =>
                      void onSwap(entry.scryfallId, { ...alt.entry, quantity: entry.quantity }, zone)
                    }
                  >
                    Utiliser
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

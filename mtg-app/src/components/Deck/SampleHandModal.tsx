import { useEffect, useState } from 'react';
import type { DeckEntry } from '../../types/deck';
import {
  createSampleHand,
  drawSampleCard,
  mulliganSampleHand,
  redrawSampleHand,
  type SampleHandState,
} from '../../utils/sampleHand';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { LazyImage } from '../UI/LazyImage';
import { ManaCostDisplay } from '../UI/ManaCostDisplay';

interface SampleHandModalProps {
  isOpen: boolean;
  onClose: () => void;
  mainboard: DeckEntry[];
  deckName: string;
}

export function SampleHandModal({
  isOpen,
  onClose,
  mainboard,
  deckName,
}: SampleHandModalProps) {
  const [state, setState] = useState<SampleHandState | null>(null);

  useEffect(() => {
    if (isOpen) {
      setState(createSampleHand(mainboard));
    } else {
      setState(null);
    }
  }, [isOpen, mainboard]);

  const totalCards = mainboard.reduce((s, e) => s + e.quantity, 0);
  const canPlay = totalCards >= 7;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Sample hand — ${deckName}`} size="lg">
      <div className="space-y-4">
        {!canPlay ? (
          <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 rounded">
            Il faut au moins 7 cartes en mainboard pour tirer une main (actuel : {totalCards}).
          </p>
        ) : null}

        {state && (
          <>
            <div className="flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span>
                Main : <strong className="text-gray-900 dark:text-white">{state.hand.length}</strong>
              </span>
              <span>·</span>
              <span>
                Bibliothèque :{' '}
                <strong className="text-gray-900 dark:text-white">{state.library.length}</strong>
              </span>
              <span>·</span>
              <span>
                Mulligans :{' '}
                <strong className="text-gray-900 dark:text-white">{state.mulliganCount}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {state.hand.map((card, idx) => (
                <div
                  key={`${card.scryfallId}-${idx}`}
                  className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
                >
                  <div className="aspect-[5/7] bg-gray-200 dark:bg-gray-700 relative">
                    {card.imageUrl ? (
                      <LazyImage
                        src={card.imageUrl}
                        alt={card.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        priority="high"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs p-2 text-center text-gray-500">
                        {card.name}
                      </div>
                    )}
                  </div>
                  <div className="p-1.5">
                    <div className="text-[11px] font-medium truncate text-gray-900 dark:text-white">
                      {card.name}
                    </div>
                    {card.manaCost ? (
                      <ManaCostDisplay manaCost={card.manaCost} size={12} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {state.hand.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-6">Main vide.</p>
            )}
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button
            variant="secondary"
            disabled={!canPlay}
            onClick={() => setState(redrawSampleHand(mainboard))}
          >
            Nouvelle main
          </Button>
          <Button
            variant="secondary"
            disabled={!state || state.hand.length === 0}
            onClick={() => state && setState(mulliganSampleHand(state))}
          >
            Mulligan
          </Button>
          <Button
            disabled={!state || state.library.length === 0}
            onClick={() => state && setState(drawSampleCard(state))}
          >
            Piocher
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Mulligan façon Londres : après chaque mulligan, une carte (CMC le plus élevé) part
          automatiquement sous la bibliothèque.
        </p>
      </div>
    </Modal>
  );
}

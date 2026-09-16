import { useEffect, useState } from 'react';
import type { OwnershipRow } from '../../hooks/useDeckOwnership';
import type { MTGCard } from '../../types/card';
import {
  buildShoppingListRows,
  exportShoppingListCsv,
  exportShoppingListText,
  priceShoppingList,
  type ShoppingList,
} from '../../utils/deckShoppingList';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { Spinner } from '../UI/Spinner';
import { LazyImage } from '../UI/LazyImage';

interface ShoppingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckName: string;
  missing: OwnershipRow[];
  onAddToWishlist: (rows: OwnershipRow[]) => Promise<void>;
  wishlistBusy?: boolean;
}

export function ShoppingListModal({
  isOpen,
  onClose,
  deckName,
  missing,
  onAddToWishlist,
  wishlistBusy,
}: ShoppingListModalProps) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setList(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const rows = buildShoppingListRows(missing);
    priceShoppingList(rows)
      .then((priced) => {
        if (!cancelled) setList(priced);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, missing]);

  const copyText = async () => {
    if (!list) return;
    const text = exportShoppingListText(list, deckName);
    await navigator.clipboard.writeText(text);
  };

  const downloadCsv = () => {
    if (!list) return;
    const csv = exportShoppingListCsv(list);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName.replace(/\s+/g, '_')}_shopping.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Liste d'achats — ${deckName}`} size="lg">
      <div className="space-y-4">
        {loading || !list ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : list.items.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center py-8">
            Aucune carte manquante — deck complet par rapport à votre collection.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {list.totalMissing} exemplaire(s) à acquérir
              {list.estimatedTotalUsd != null
                ? ` · estimation ~$${list.estimatedTotalUsd} (${list.pricedCount}/${list.items.length} prixés)`
                : ' · prix indisponibles'}
            </p>
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
              {list.items.map((item) => (
                <li
                  key={item.entry.scryfallId}
                  className="flex items-center gap-3 py-2"
                >
                  {item.entry.imageUrl ? (
                    <LazyImage
                      src={item.entry.imageUrl}
                      alt={item.entry.name}
                      className="w-10 h-14 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-gray-200 dark:bg-gray-700 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {item.missingQty}× {item.entry.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.entry.setCode?.toUpperCase()} {item.entry.collectorNumber || ''}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {item.totalPriceUsd != null ? `~$${item.totalPriceUsd}` : '—'}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button variant="secondary" disabled={!list?.items.length} onClick={() => void copyText()}>
            Copier
          </Button>
          <Button variant="secondary" disabled={!list?.items.length} onClick={downloadCsv}>
            CSV
          </Button>
          <Button
            disabled={!missing.length}
            loading={wishlistBusy}
            onClick={() => void onAddToWishlist(missing)}
          >
            → Wishlist
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Build a minimal MTGCard from a deck entry for wishlist enrichment. */
export function deckEntryAsMtgCard(entry: {
  scryfallId: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  rarity?: string;
  imageUrl?: string;
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  colors?: string[];
}): MTGCard {
  return {
    id: entry.scryfallId.startsWith('legacy:') ? undefined : entry.scryfallId,
    name: entry.name,
    set: entry.setCode,
    number: entry.collectorNumber,
    rarity: entry.rarity,
    imageUrl: entry.imageUrl,
    manaCost: entry.manaCost,
    cmc: entry.cmc,
    type: entry.typeLine,
    colors: entry.colors,
  };
}

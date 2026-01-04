import { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';
import type { UserCard } from '../../types/card';

interface CardMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: UserCard;
  allCardsWithSameName: UserCard[];
  onUpdateQuantity?: (cardId: string, quantity: number) => void;
  onDelete?: (cardId: string) => void;
}

interface CardGroup {
  language: string;
  quantity: number;
  cardIds: string[];
}

export function CardMenuModal({
  isOpen,
  onClose,
  card,
  allCardsWithSameName,
  onUpdateQuantity,
  onDelete,
}: CardMenuModalProps) {
  const [newQuantity, setNewQuantity] = useState(card.quantity.toString());

  // Grouper les cartes par langue
  const cardGroups = useMemo(() => {
    const groups = new Map<string, CardGroup>();
    let totalQuantity = 0;

    allCardsWithSameName.forEach((c) => {
      const lang = c.language || 'en';
      const key = lang;
      
      if (!groups.has(key)) {
        groups.set(key, {
          language: lang,
          quantity: 0,
          cardIds: [],
        });
      }
      
      const group = groups.get(key)!;
      group.quantity += c.quantity;
      group.cardIds.push(c.id);
      totalQuantity += c.quantity;
    });

    return {
      groups: Array.from(groups.values()).sort((a, b) => {
        return a.language.localeCompare(b.language);
      }),
      totalQuantity,
    };
  }, [allCardsWithSameName]);

  const handleUpdateQuantity = () => {
    const qty = parseInt(newQuantity);
    if (!isNaN(qty) && qty > 0 && onUpdateQuantity) {
      onUpdateQuantity(card.id, qty);
      onClose();
    }
  };

  const handleDelete = () => {
    if (confirm(`Supprimer "${card.name}" de votre collection ?`)) {
      onDelete?.(card.id);
      onClose();
    }
  };

  const getLanguageCode = (code: string): string => {
    return code.toUpperCase();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Détails - ${card.name}`}>
      <div className="space-y-4">
        {/* Total de cartes */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
            Total dans la collection
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {cardGroups.totalQuantity} {cardGroups.totalQuantity > 1 ? 'cartes' : 'carte'}
          </div>
        </div>

        {/* Détail par langue */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Détail par langue
          </h3>
          <div className="space-y-2">
            {cardGroups.groups.map((group, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {getLanguageCode(group.language)}
                    </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {group.quantity}
                  </span>
                  {onDelete && group.cardIds.length === 1 && (
                    <button
                      onClick={() => {
                        if (confirm(`Supprimer cette instance de "${card.name}" ?`)) {
                          onDelete(group.cardIds[0]);
                          onClose();
                        }
                      }}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      title="Supprimer cette instance"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modifier la quantité de cette instance */}
        {onUpdateQuantity && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Modifier la quantité de cette instance
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleUpdateQuantity}>
                Modifier
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Quantité actuelle: {card.quantity} ({getLanguageCode(card.language || 'en')})
            </p>
          </div>
        )}

        {/* Supprimer toutes les instances */}
        {onDelete && allCardsWithSameName.length > 1 && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(`Supprimer TOUTES les instances de "${card.name}" (${cardGroups.totalQuantity} cartes) ?`)) {
                  allCardsWithSameName.forEach((c) => onDelete?.(c.id));
                  onClose();
                }
              }}
              className="w-full"
            >
              Supprimer toutes les instances ({cardGroups.totalQuantity} cartes)
            </Button>
          </div>
        )}

        {/* Supprimer cette instance uniquement */}
        {onDelete && allCardsWithSameName.length === 1 && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <Button
              variant="danger"
              onClick={handleDelete}
              className="w-full"
            >
              Supprimer de la collection
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}


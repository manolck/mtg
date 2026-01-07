import { useState } from 'react';
import { Modal } from '../UI/Modal';
import { Input } from '../UI/Input';
import { Button } from '../UI/Button';
import type { WishlistItem } from '../../types/card';

interface WishlistCardMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: WishlistItem;
  onUpdate?: (itemId: string, updates: { quantity: number; notes?: string; targetPrice?: number }) => void;
  onDelete?: (itemId: string) => void;
}

export function WishlistCardMenuModal({
  isOpen,
  onClose,
  item,
  onUpdate,
  onDelete,
}: WishlistCardMenuModalProps) {
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [notes, setNotes] = useState(item.notes || '');
  const [targetPrice, setTargetPrice] = useState(item.targetPrice?.toString() || '');

  const handleUpdate = () => {
    const qty = parseInt(quantity);
    if (!isNaN(qty) && qty > 0 && onUpdate) {
      onUpdate(item.id, {
        quantity: qty,
        notes: notes.trim() || undefined,
        targetPrice: targetPrice ? parseFloat(targetPrice) : undefined,
      });
      onClose();
    }
  };

  const handleDelete = () => {
    if (confirm(`Supprimer "${item.name}" de votre wishlist ?`)) {
      onDelete?.(item.id);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Détails - ${item.name}`}>
      <div className="space-y-4">
        {/* Informations de la carte */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
            Carte
          </div>
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {item.name}
          </div>
          {item.set && (
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {item.mtgData?.setName || item.set} ({item.setCode || item.set})
            </div>
          )}
        </div>

        {/* Modifier la quantité */}
        {onUpdate && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Quantité désirée
            </label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full"
            />
          </div>
        )}

        {/* Notes */}
        {onUpdate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notes (optionnel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              rows={3}
              placeholder="Ajoutez des notes sur cette carte..."
            />
          </div>
        )}

        {/* Prix cible */}
        {onUpdate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Prix cible (€) - optionnel
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Définissez un prix maximum pour cette carte (pour notifications futures)
            </p>
          </div>
        )}

        {/* Boutons d'action */}
        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          {onUpdate && (
            <Button variant="primary" onClick={handleUpdate}>
              Enregistrer
            </Button>
          )}
          {onDelete && (
            <Button variant="danger" onClick={handleDelete}>
              Supprimer
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}


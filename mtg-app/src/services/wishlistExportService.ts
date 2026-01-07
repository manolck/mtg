import type { WishlistItem } from '../types/card';
import { downloadFile } from './exportService';

/**
 * Échappe une valeur pour CSV
 */
function escapeCSV(value: string | number | undefined | null): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  
  // Si la valeur contient une virgule, guillemet ou saut de ligne, l'entourer de guillemets
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Exporte une wishlist en CSV
 */
export function exportWishlistToCSV(items: WishlistItem[]): string {
  const headers = [
    'Name',
    'Quantity',
    'Set code',
    'Set name',
    'Collector number',
    'Rarity',
    'Language',
    'Notes',
    'Target Price',
    'Scryfall ID',
    'Created At',
    'Updated At',
  ];

  const rows = items.map((item) => {
    const row = [
      escapeCSV(item.name),
      item.quantity.toString(),
      escapeCSV(item.setCode || item.set),
      escapeCSV(item.mtgData?.setName),
      escapeCSV(item.collectorNumber),
      escapeCSV(item.rarity),
      escapeCSV(item.language || 'en'),
      escapeCSV(item.notes),
      escapeCSV(item.targetPrice),
      escapeCSV(item.scryfallId),
      escapeCSV(item.createdAt?.toISOString()),
      escapeCSV(item.updatedAt?.toISOString()),
    ];

    return row.join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Exporte une wishlist en JSON
 */
export function exportWishlistToJSON(items: WishlistItem[]): string {
  const data = items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    setCode: item.setCode || item.set,
    setName: item.mtgData?.setName,
    collectorNumber: item.collectorNumber,
    rarity: item.rarity,
    language: item.language || 'en',
    notes: item.notes,
    targetPrice: item.targetPrice,
    scryfallId: item.scryfallId,
    createdAt: item.createdAt?.toISOString(),
    updatedAt: item.updatedAt?.toISOString(),
    mtgData: item.mtgData,
  }));

  return JSON.stringify(data, null, 2);
}

/**
 * Exporte une wishlist dans le format spécifié
 */
export function exportWishlist(
  items: WishlistItem[],
  format: 'csv' | 'json'
): string {
  switch (format) {
    case 'csv':
      return exportWishlistToCSV(items);
    case 'json':
      return exportWishlistToJSON(items);
    default:
      throw new Error(`Format d'export non supporté: ${format}`);
  }
}

/**
 * Télécharge la wishlist exportée
 */
export function downloadWishlist(items: WishlistItem[], format: 'csv' | 'json'): void {
  const content = exportWishlist(items, format);
  const extension = format === 'csv' ? 'csv' : 'json';
  const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
  const filename = `mtg-wishlist-${new Date().toISOString().split('T')[0]}.${extension}`;
  
  downloadFile(content, filename, mimeType);
}



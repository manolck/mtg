import type { UserCard } from '../types/card';

/**
 * Service d'export de collections
 * Supporte CSV, JSON et formats tiers (Deckbox, Moxfield)
 */

export type ExportFormat = 'csv' | 'json' | 'deckbox' | 'moxfield';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  includeImages?: boolean;
}

/**
 * Exporte une collection en CSV
 */
export function exportToCSV(cards: UserCard[], options: ExportOptions = { format: 'csv' }): string {
  const headers = [
    'Name',
    'Quantity',
    'Set code',
    'Set name',
    'Collector number',
    'Foil',
    'Rarity',
    'Condition',
    'Language',
  ];

  if (options.includeMetadata) {
    headers.push('Created At', 'Card ID');
  }

  const rows = cards.map((card) => {
    const row = [
      escapeCSV(card.name),
      card.quantity.toString(),
      card.setCode || card.set || '',
      card.mtgData?.setName || '',
      card.collectorNumber || '',
      '', // Foil - pas stocké actuellement
      card.rarity || card.mtgData?.rarity || '',
      card.condition || '',
      card.language || 'en',
    ];

    if (options.includeMetadata) {
      row.push(
        card.createdAt?.toISOString() || '',
        card.id
      );
    }

    return row.map(escapeCSV).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Exporte une collection en JSON
 */
export function exportToJSON(cards: UserCard[], options: ExportOptions = { format: 'json' }): string {
  const data = cards.map((card) => {
    const cardData: any = {
      name: card.name,
      quantity: card.quantity,
    };

    if (card.setCode || card.set) {
      cardData.setCode = card.setCode || card.set;
    }

    if (card.mtgData?.setName) {
      cardData.setName = card.mtgData.setName;
    }

    if (card.collectorNumber) {
      cardData.collectorNumber = card.collectorNumber;
    }

    if (card.rarity || card.mtgData?.rarity) {
      cardData.rarity = card.rarity || card.mtgData.rarity;
    }

    if (card.condition) {
      cardData.condition = card.condition;
    }

    if (card.language) {
      cardData.language = card.language;
    }

    if (options.includeMetadata) {
      cardData.id = card.id;
      cardData.createdAt = card.createdAt?.toISOString();
      if (card.mtgData) {
        cardData.mtgData = card.mtgData;
      }
    }

    return cardData;
  });

  return JSON.stringify(data, null, 2);
}

/**
 * Exporte une collection au format Deckbox
 * Format: Name,Count,Edition,Card Number,Condition,Language,Foil,Signed,Artist Proof,Altered Art,Misprint,Promo,Textless,My Price
 */
export function exportToDeckbox(cards: UserCard[]): string {
  const headers = [
    'Name',
    'Count',
    'Edition',
    'Card Number',
    'Condition',
    'Language',
    'Foil',
    'Signed',
    'Artist Proof',
    'Altered Art',
    'Misprint',
    'Promo',
    'Textless',
    'My Price',
  ];

  const rows = cards.map((card) => {
    return [
      escapeCSV(card.name),
      card.quantity.toString(),
      card.setCode || card.set || '',
      card.collectorNumber || '',
      card.condition || 'Near Mint',
      card.language || 'English',
      '', // Foil
      '', // Signed
      '', // Artist Proof
      '', // Altered Art
      '', // Misprint
      '', // Promo
      '', // Textless
      '', // My Price
    ].map(escapeCSV).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Exporte une collection au format Moxfield
 * Format JSON spécifique à Moxfield
 */
export function exportToMoxfield(cards: UserCard[]): string {
  const moxfieldCards: Record<string, number> = {};

  cards.forEach((card) => {
    // Format Moxfield: "setCode:collectorNumber" ou "name"
    const key = card.setCode && card.collectorNumber
      ? `${card.setCode}:${card.collectorNumber}`
      : card.name;

    moxfieldCards[key] = (moxfieldCards[key] || 0) + card.quantity;
  });

  const deck = {
    name: 'Exported Collection',
    format: 'commander',
    mainboard: Object.entries(moxfieldCards).map(([name, quantity]) => ({
      card: name,
      quantity,
    })),
    sideboard: [],
    commanders: [],
  };

  return JSON.stringify(deck, null, 2);
}

/**
 * Exporte une collection dans le format spécifié
 */
export function exportCollection(
  cards: UserCard[],
  format: ExportFormat,
  options: Omit<ExportOptions, 'format'> = {}
): string {
  switch (format) {
    case 'csv':
      return exportToCSV(cards, { ...options, format });
    case 'json':
      return exportToJSON(cards, { ...options, format });
    case 'deckbox':
      return exportToDeckbox(cards);
    case 'moxfield':
      return exportToMoxfield(cards);
    default:
      throw new Error(`Format d'export non supporté: ${format}`);
  }
}

/**
 * Télécharge un fichier
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Échappe une valeur pour CSV
 */
function escapeCSV(value: string | number): string {
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


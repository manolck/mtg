import type { ParsedCard } from '../types/card';

interface CSVHeader {
  name?: number;
  quantity?: number;
  set?: number;
  setCode?: number;
  collectorNumber?: number;
  rarity?: number;
  condition?: number;
  language?: number;
  multiverseid?: number;
  scryfallId?: number;
}

function detectSeparator(line: string): string {
  const separators = ['\t', ',', ';'];
  for (const sep of separators) {
    if (line.includes(sep)) {
      return sep;
    }
  }
  return ',';
}

function parseCSVLine(line: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  
  return parts;
}

function detectHeaders(headerLine: string, separator: string): CSVHeader {
  const headers = parseCSVLine(headerLine, separator).map(h => h.toLowerCase().trim());
  const headerMap: CSVHeader = {};

  headers.forEach((header, index) => {
    const normalized = header.toLowerCase();
    if (normalized.includes('name') && !normalized.includes('set')) {
      headerMap.name = index;
    } else if (normalized.includes('quantity') || normalized.includes('qty')) {
      headerMap.quantity = index;
    } else if (normalized.includes('set code') || normalized === 'set code') {
      headerMap.setCode = index;
    } else if ((normalized.includes('set name') || normalized === 'set name') && !headerMap.setCode) {
      headerMap.set = index;
    } else if (normalized.includes('collector number') || normalized === 'collector number') {
      headerMap.collectorNumber = index;
    } else if (normalized === 'rarity') {
      headerMap.rarity = index;
    } else if (normalized === 'condition') {
      headerMap.condition = index;
    } else if (normalized === 'language') {
      headerMap.language = index;
    } else if (normalized === 'multiverseid' || normalized === 'multiverse id' || normalized === 'multiverse_id') {
      headerMap.multiverseid = index;
    } else if (normalized === 'scryfallid' || normalized === 'scryfall id' || normalized === 'scryfall_id' || normalized === 'scryfallid') {
      headerMap.scryfallId = index;
    }
  });

  return headerMap;
}

export function parseCSV(content: string): ParsedCard[] {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const parsedCards: ParsedCard[] = [];
  const separator = detectSeparator(lines[0]);
  let headerMap: CSVHeader | null = null;
  let startIndex = 0;

  // Détecter si la première ligne est un en-tête
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('name') && 
                   (firstLine.includes('quantity') || firstLine.includes('set') || firstLine.includes('qty'));

  if (hasHeader) {
    headerMap = detectHeaders(lines[0], separator);
    startIndex = 1;
  }

  // Parser les lignes de données
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    
    // Ignorer les lignes de commentaire
    if (line.startsWith('#') || line.length === 0) {
      continue;
    }

    const parts = parseCSVLine(line, separator);

    if (headerMap) {
      // Format avec en-têtes (format ManaBox/export standard)
      const nameIndex = headerMap.name ?? 0;
      const quantityIndex = headerMap.quantity;
      const setCodeIndex = headerMap.setCode ?? headerMap.set;
      const collectorNumberIndex = headerMap.collectorNumber;
      const rarityIndex = headerMap.rarity;
      const conditionIndex = headerMap.condition;
      const languageIndex = headerMap.language;
      const multiverseidIndex = headerMap.multiverseid;
      const scryfallIdIndex = headerMap.scryfallId;

      const name = parts[nameIndex]?.trim() || '';
      if (!name) continue;

      const card: ParsedCard = { name };

      if (quantityIndex !== undefined && parts[quantityIndex]) {
        const quantity = parseInt(parts[quantityIndex], 10);
        if (!isNaN(quantity) && quantity > 0) {
          card.quantity = quantity;
        }
      }

      if (setCodeIndex !== undefined && parts[setCodeIndex]) {
        card.setCode = parts[setCodeIndex].trim();
        card.set = card.setCode; // Compatibilité avec l'ancien format
      }

      if (collectorNumberIndex !== undefined && parts[collectorNumberIndex]) {
        card.collectorNumber = parts[collectorNumberIndex].trim();
      }

      if (rarityIndex !== undefined && parts[rarityIndex]) {
        card.rarity = parts[rarityIndex].trim();
      }

      if (conditionIndex !== undefined && parts[conditionIndex]) {
        card.condition = parts[conditionIndex].trim();
      }

      if (languageIndex !== undefined && parts[languageIndex]) {
        card.language = parts[languageIndex].trim();
      }

      if (multiverseidIndex !== undefined && parts[multiverseidIndex]) {
        const multiverseid = parseInt(parts[multiverseidIndex], 10);
        if (!isNaN(multiverseid) && multiverseid > 0) {
          card.multiverseid = multiverseid;
        }
      }

      if (scryfallIdIndex !== undefined && parts[scryfallIdIndex]) {
        card.scryfallId = parts[scryfallIdIndex].trim();
      }

      parsedCards.push(card);
    } else {
      // Format simple sans en-têtes (ancien format)
      const card: ParsedCard = {
        name: parts[0] || '',
      };

      // Format 2 : nom, quantité
      if (parts.length >= 2) {
        const quantity = parseInt(parts[1], 10);
        if (!isNaN(quantity) && quantity > 0) {
          card.quantity = quantity;
        }
      }

      // Format 3 : nom, quantité, set
      if (parts.length >= 3) {
        card.set = parts[2].trim();
        card.setCode = parts[2].trim();
      }

      // Validation : le nom ne doit pas être vide
      if (card.name.length > 0) {
        parsedCards.push(card);
      }
    }
  }

  return parsedCards;
}


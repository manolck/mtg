import type { ParsedCard } from '../types/card';
import { validateParsedCard } from '../utils/validationSchemas';

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
    const normalized = header.toLowerCase().replace(/[_-]+/g, ' ').trim();
    if (
      headerMap.name === undefined &&
      (normalized === 'name' ||
        normalized === 'card name' ||
        (normalized.includes('name') && !normalized.includes('set') && !normalized.includes('edition')))
    ) {
      headerMap.name = index;
    } else if (
      normalized.includes('quantity') ||
      normalized.includes('qty') ||
      normalized === 'count' ||
      normalized === 'copies'
    ) {
      headerMap.quantity = index;
    } else if (
      normalized.includes('set code') ||
      normalized === 'edition' ||
      normalized === 'set'
    ) {
      headerMap.setCode = index;
    } else if (normalized.includes('set name')) {
      headerMap.set = index;
    } else if (
      normalized.includes('collector number') ||
      normalized === 'card number' ||
      normalized === 'cn' ||
      normalized === 'number'
    ) {
      headerMap.collectorNumber = index;
    } else if (normalized === 'rarity') {
      headerMap.rarity = index;
    } else if (normalized === 'condition') {
      headerMap.condition = index;
    } else if (normalized === 'language') {
      headerMap.language = index;
    } else if (normalized === 'multiverseid' || normalized === 'multiverse id') {
      headerMap.multiverseid = index;
    } else if (normalized === 'scryfallid' || normalized === 'scryfall id') {
      headerMap.scryfallId = index;
    }
  });

  return headerMap;
}

function toParsedCard(raw: {
  name?: string;
  quantity?: number;
  set?: string;
  setCode?: string;
  collectorNumber?: string;
  rarity?: string;
  condition?: string;
  language?: string;
  multiverseid?: number;
  scryfallId?: string;
}): ParsedCard | null {
  const name = raw.name?.trim() || '';
  if (!name) return null;
  const card: ParsedCard = {
    name,
    quantity: raw.quantity && raw.quantity > 0 ? raw.quantity : 1,
  };
  if (raw.setCode) {
    card.setCode = raw.setCode;
    card.set = raw.setCode;
  } else if (raw.set) {
    card.set = raw.set;
    card.setCode = raw.set;
  }
  if (raw.collectorNumber) card.collectorNumber = String(raw.collectorNumber);
  if (raw.rarity) card.rarity = raw.rarity;
  if (raw.condition) card.condition = raw.condition;
  if (raw.language) card.language = raw.language;
  if (raw.multiverseid && raw.multiverseid > 0) card.multiverseid = raw.multiverseid;
  if (raw.scryfallId) card.scryfallId = raw.scryfallId;
  const validation = validateParsedCard(card);
  if (validation.success) return validation.data;
  return null;
}

function parseJSONImport(raw: string): ParsedCard[] {
  const data = JSON.parse(raw) as unknown;
  const items: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { mainboard?: unknown[] }).mainboard)
      ? (data as { mainboard: unknown[] }).mainboard
      : [];

  if (items.length === 0) {
    throw new Error('Aucune carte valide trouvée dans le fichier');
  }

  const parsedCards: ParsedCard[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const quantityRaw = row.quantity ?? row.count;
    const quantity = typeof quantityRaw === 'number' ? quantityRaw : parseInt(String(quantityRaw ?? '1'), 10);
    const name = String(row.name ?? row.card ?? '').trim();
    let setCode = String(row.setCode ?? row.set ?? row.edition ?? '').trim() || undefined;
    let collectorNumber = row.collectorNumber != null ? String(row.collectorNumber).trim() : undefined;

    if (!row.name && typeof row.card === 'string' && row.card.includes(':')) {
      const [code, number] = row.card.split(':');
      if (code && number) {
        setCode = code;
        collectorNumber = number;
      }
    }

    const card = toParsedCard({
      name,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      setCode,
      set: typeof row.setName === 'string' ? row.setName : undefined,
      collectorNumber,
      rarity: typeof row.rarity === 'string' ? row.rarity : undefined,
      condition: typeof row.condition === 'string' ? row.condition : undefined,
      language: typeof row.language === 'string' ? row.language : undefined,
      scryfallId: typeof row.scryfallId === 'string' ? row.scryfallId : undefined,
    });
    if (card) parsedCards.push(card);
  }

  if (parsedCards.length === 0) {
    throw new Error('Aucune carte valide trouvée dans le fichier');
  }
  if (parsedCards.length > 10000) {
    throw new Error(`L'import contient trop de cartes (${parsedCards.length}). Maximum autorisé : 10000 cartes`);
  }
  return parsedCards;
}

/** Parse un export CSV ou JSON de collection (y compris Deckbox / export app). */
export function parseCollectionImport(content: string): ParsedCard[] {
  const trimmed = content.replace(/^\uFEFF/, '').trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return parseJSONImport(trimmed);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return parseCSV(trimmed);
      }
      throw err;
    }
  }
  return parseCSV(trimmed);
}

export function parseCSV(content: string): ParsedCard[] {
  const lines = content
    .replace(/^\uFEFF/, '')
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
                   (firstLine.includes('quantity') || firstLine.includes('set') || firstLine.includes('qty') || firstLine.includes('count') || firstLine.includes('edition'));

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

      const card: ParsedCard = { 
        name,
        quantity: 1, // Par défaut, quantité = 1
      };

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

      // Valider la carte avant de l'ajouter
      const validation = validateParsedCard(card);
      if (validation.success) {
        parsedCards.push(validation.data);
      } else {
        // Log l'erreur mais continue le parsing (on ne bloque pas tout l'import pour une carte invalide)
        const errorMessage = 'error' in validation ? validation.error : 'Erreur de validation inconnue';
        console.warn(`Carte invalide à la ligne ${i + 1}: ${errorMessage}`, card);
      }
    } else {
      // Format simple sans en-têtes (ancien format)
      const card: ParsedCard = {
        name: parts[0] || '',
        quantity: 1, // Par défaut, quantité = 1
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

      // Valider la carte avant de l'ajouter
      const validation = validateParsedCard(card);
      if (validation.success) {
        parsedCards.push(validation.data);
      } else {
        // Log l'erreur mais continue le parsing
        const errorMessage = 'error' in validation ? validation.error : 'Erreur de validation inconnue';
        console.warn(`Carte invalide à la ligne ${i + 1}: ${errorMessage}`, card);
      }
    }
  }

  // Validation finale : vérifier qu'on a au moins une carte valide
  if (parsedCards.length === 0) {
    throw new Error('Aucune carte valide trouvée dans le fichier CSV');
  }

  // Limiter à 10000 cartes pour éviter les imports trop volumineux
  if (parsedCards.length > 10000) {
    throw new Error(`L'import contient trop de cartes (${parsedCards.length}). Maximum autorisé : 10000 cartes`);
  }

  return parsedCards;
}



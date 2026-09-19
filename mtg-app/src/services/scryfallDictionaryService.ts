/**
 * Service de dictionnaire Scryfall : résout un texte OCR vers le nom de carte
 * le plus proche dans la liste unifiée (toutes langues), garantissant une
 * correspondance toujours dans le dictionnaire.
 */

import {
  cleanOcrKey,
  expandOcrCandidates,
  normalizeAccents,
  resolveBestOf,
  tokenize,
} from '../utils/ocrMatch';

export interface ScryfallDictionaryEntry {
  oracle_id: string;
  lang: string;
  name: string;
}

const DICTIONARY_URL = '/scryfall-card-dictionary.json';

let dictionary: ScryfallDictionaryEntry[] | null = null;
/** oracle_id -> nom anglais, pour la recherche Scryfall */
let englishNameByOracleId: Map<string, string> | null = null;

async function loadDictionary(): Promise<ScryfallDictionaryEntry[]> {
  if (dictionary !== null) return dictionary;
  const response = await fetch(DICTIONARY_URL);
  if (!response.ok) {
    throw new Error('Dictionnaire Scryfall indisponible');
  }
  const raw = (await response.json()) as ScryfallDictionaryEntry[];
  if (!Array.isArray(raw)) {
    throw new Error('Format dictionnaire invalide');
  }
  dictionary = raw.filter(
    (e) => (e.lang === 'fr' || e.lang === 'en') && e.name
  );
  englishNameByOracleId = new Map();
  for (let i = 0; i < dictionary.length; i++) {
    const e = dictionary[i];
    if (e.lang === 'en' && e.name) {
      if (!englishNameByOracleId.has(e.oracle_id)) {
        englishNameByOracleId.set(e.oracle_id, e.name);
      }
    }
  }
  return dictionary;
}

/**
 * À partir du texte OCR, retourne l’entrée du dictionnaire la plus proche.
 */
export async function resolveOcrToDictionary(
  ocrText: string
): Promise<ScryfallDictionaryEntry | null> {
  const key = cleanOcrKey(ocrText ?? '');
  if (!key || key.length < 2) return null;
  const entries = await loadDictionary();
  if (!entries.length) return null;
  const best = resolveBestOf([key], entries);
  return best?.entry ?? null;
}

/**
 * Parmi plusieurs chaînes OCR (ex. auto + inversé), retourne l’entrée du dictionnaire
 * qui a le meilleur score multi-signal sur l’une des chaînes.
 */
export async function resolveOcrToDictionaryBestOf(
  candidates: string[]
): Promise<ScryfallDictionaryEntry | null> {
  if (!candidates.length) return null;
  const entries = await loadDictionary();
  if (!entries.length) return null;
  const best = resolveBestOf(candidates, entries);
  return best?.entry ?? null;
}

/**
 * Retourne le nom anglais de la carte pour un oracle_id (pour la recherche Scryfall).
 */
export function getEnglishNameForOracleId(oracleId: string): string | null {
  if (!englishNameByOracleId) return null;
  return englishNameByOracleId.get(oracleId) ?? null;
}

/**
 * Indique si le dictionnaire est chargé (pour affichage / fallback).
 */
export function isDictionaryLoaded(): boolean {
  return dictionary !== null && dictionary.length > 0;
}

/**
 * Précharge le dictionnaire en arrière-plan (à appeler au montage de la page Scan).
 */
export function preloadDictionary(): Promise<void> {
  return loadDictionary().then(() => {});
}

/**
 * Recherche par préfixe pour l’autocomplétion (saisie manuelle du nom).
 * Déduplique par oracle_id (une suggestion par carte).
 */
export async function searchCardNamesForAutocomplete(
  prefix: string,
  limit: number = 15
): Promise<ScryfallDictionaryEntry[]> {
  const key = (prefix ?? '').trim().toLowerCase();
  if (!key) return [];

  const entries = await loadDictionary();
  if (!entries.length) return [];

  const keyNorm = normalizeAccents(key);
  const seen = new Set<string>();
  const out: ScryfallDictionaryEntry[] = [];
  for (const e of entries) {
    if (!e.name) continue;
    const nameLower = e.name.toLowerCase();
    if (
      !nameLower.startsWith(key) &&
      !normalizeAccents(nameLower).startsWith(keyNorm)
    ) {
      continue;
    }
    if (seen.has(e.oracle_id)) continue;
    seen.add(e.oracle_id);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

// Re-export helpers used by UI / tests
export { cleanOcrKey, expandOcrCandidates, tokenize, normalizeAccents };

/**
 * Service de dictionnaire Scryfall : résout un texte OCR vers le nom de carte
 * le plus proche dans la liste unifiée (toutes langues), garantissant une
 * correspondance toujours dans le dictionnaire.
 */

export interface ScryfallDictionaryEntry {
  oracle_id: string;
  lang: string;
  name: string;
}

const DICTIONARY_URL = '/scryfall-card-dictionary.json';

let dictionary: ScryfallDictionaryEntry[] | null = null;
/** oracle_id -> nom anglais, pour la recherche Scryfall */
let englishNameByOracleId: Map<string, string> | null = null;
/** Entrées indexées par longueur pour réduire les candidats (longueur -> indices) */
let byLength: Map<number, number[]> | null = null;

/** Remove accents for comparison (é → e, à → a, etc.). */
function normalizeAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Nettoie artefacts OCR avant matching. */
function cleanOcrKey(s: string): string {
  return (s ?? '')
    .replace(/[|\[\](){}«»<>]/g, ' ')
    .replace(/[^\p{L}\p{N}\s'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  const matchWindow = Math.max(len1, len2) / 2 - 1;
  const matchWindowInt = Math.max(0, Math.floor(matchWindow));
  const s1Match: boolean[] = new Array(len1).fill(false);
  const s2Match: boolean[] = new Array(len2).fill(false);
  let matches = 0;
  let transpositions = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindowInt);
    const end = Math.min(i + matchWindowInt + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Match[j] || s1[i] !== s2[j]) continue;
      s1Match[i] = true;
      s2Match[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Match[i]) continue;
    while (!s2Match[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  let prefixLen = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }
  const winkler = jaro + prefixLen * 0.1 * (1 - jaro);
  return Math.min(1, winkler);
}

function tokenize(s: string): string[] {
  return normalizeAccents(s.toLowerCase())
    .split(/[\s'\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/** Score multi-signal : Jaro-Winkler + chevauchement de mots + ratio de longueur. */
function scoreNameMatch(ocrText: string, cardName: string, lang?: string): number {
  const ocr = cleanOcrKey(ocrText);
  if (!ocr || !cardName) return 0;
  const oNorm = normalizeAccents(ocr.toLowerCase());
  const nNorm = normalizeAccents(cardName.toLowerCase());
  if (oNorm === nNorm) return 1;

  const jw = Math.max(
    jaroWinkler(oNorm, nNorm),
    jaroWinkler(ocr.toLowerCase(), cardName.toLowerCase())
  );

  const oTokens = tokenize(ocr);
  const nTokens = tokenize(cardName);
  let tokenHits = 0;
  const significantO = oTokens.filter((t) => t.length >= 3);
  for (const ot of significantO) {
    const hit = nTokens.some(
      (nt) =>
        nt === ot ||
        (ot.length >= 4 && (nt.includes(ot) || ot.includes(nt))) ||
        jaroWinkler(ot, nt) >= 0.88
    );
    if (hit) tokenHits++;
  }
  const tokenDenom = Math.max(significantO.length, nTokens.filter((t) => t.length >= 3).length, 1);
  const tokenScore = tokenHits / tokenDenom;

  const lenRatio =
    Math.min(oNorm.length, nNorm.length) / Math.max(oNorm.length, nNorm.length, 1);

  // Pénalité si le nom dictionnaire est beaucoup plus court que l'OCR multi-mots
  const wordCountPenalty =
    oTokens.length >= 3 && nTokens.length === 1 && tokenScore < 0.5 ? 0.15 : 0;

  let score = 0.4 * jw + 0.5 * tokenScore + 0.1 * lenRatio - wordCountPenalty;

  // Légère préférence FR quand l'OCR contient des accents ou des mots FR typiques
  if (lang === 'fr' && (/[àâäéèêëïîôùûüçœæ]/i.test(ocr) || /\b(des|de|la|le|du)\b/i.test(ocr))) {
    score += 0.03;
  }

  // Préserve la structure "X à Y" fréquente en FR (évite Cache elfique vs Golem à relique)
  const ocrHasA = /\bà\b/i.test(ocr) || /(^|\s)a(\s|$)/i.test(normalizeAccents(ocr));
  const nameHasA = /\bà\b/i.test(cardName);
  if (ocrHasA && nameHasA) score += 0.1;
  if (ocrHasA && !nameHasA) score -= 0.1;

  // Bonus si un long token OCR est contenu dans un token du nom (lique ⊂ relique)
  let containmentBonus = 0;
  for (const ot of significantO) {
    if (ot.length < 4) continue;
    for (const nt of nTokens) {
      if (nt.length > ot.length && nt.includes(ot)) {
        containmentBonus = Math.max(containmentBonus, 0.08 * (ot.length / nt.length));
      }
    }
  }
  score += containmentBonus;

  return Math.max(0, Math.min(1, score));
}

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
  dictionary = raw;
  englishNameByOracleId = new Map();
  byLength = new Map();
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i];
    if (e.lang === 'en' && e.name) {
      if (!englishNameByOracleId.has(e.oracle_id)) {
        englishNameByOracleId.set(e.oracle_id, e.name);
      }
    }
    const len = (e.name ?? '').length;
    if (!byLength!.has(len)) byLength!.set(len, []);
    byLength!.get(len)!.push(i);
  }
  return dictionary;
}

/**
 * Réduit les candidats aux noms dont la longueur est proche de keyLen (évite de scorer 278k entrées).
 * Pour un OCR très court (keyLen <= 6), on inclut aussi les noms plus longs (mal reconnus).
 */
function getCandidateIndices(keyLen: number, wordCount: number = 1): number[] {
  if (!dictionary || !byLength) return [];
  let maxLen: number;
  let minLen: number;
  if (keyLen <= 6) {
    minLen = 0;
    maxLen = Math.min(60, keyLen + 25);
  } else {
    // OCR bruité peut être plus court que le vrai nom (lettres manquantes)
    const maxLenDiff = Math.max(12, Math.floor(keyLen * 0.7));
    minLen = Math.max(0, keyLen - maxLenDiff);
    maxLen = keyLen + maxLenDiff + (wordCount >= 3 ? 10 : 0);
  }
  const indices: number[] = [];
  for (let len = minLen; len <= maxLen; len++) {
    const bucket = byLength.get(len);
    if (bucket) indices.push(...bucket);
  }
  return indices;
}

/**
 * À partir du texte OCR, retourne l’entrée du dictionnaire la plus proche (toujours une correspondance).
 * Garantit que le nom retourné est un nom de carte existant dans le dictionnaire.
 */
export async function resolveOcrToDictionary(
  ocrText: string
): Promise<ScryfallDictionaryEntry | null> {
  const key = cleanOcrKey(ocrText ?? '');
  if (!key || key.length < 2) return null;

  const entries = await loadDictionary();
  if (!entries.length) return null;

  const keyLower = key.toLowerCase();
  const keyNorm = normalizeAccents(keyLower);
  const wordCount = tokenize(key).length;

  // Correspondance exacte (insensible à la casse et aux accents)
  for (const e of entries) {
    if (!e.name) continue;
    const nameLower = e.name.toLowerCase();
    if (nameLower === keyLower) return e;
    if (normalizeAccents(nameLower) === keyNorm) return e;
  }

  const candidateIndices = getCandidateIndices(key.length, wordCount);
  let best: { entry: ScryfallDictionaryEntry; score: number } | null = null;

  for (const i of candidateIndices) {
    const e = entries[i];
    if (!e.name) continue;
    const score = scoreNameMatch(key, e.name, e.lang);
    if (best === null || score > best.score) {
      best = { entry: e, score };
    }
  }

  // Si aucun candidat dans la fenêtre de longueur, parcourir tout le dictionnaire (plus lent)
  if (best === null) {
    for (const e of entries) {
      if (!e.name) continue;
      const score = scoreNameMatch(key, e.name, e.lang);
      if (best === null || score > best.score) {
        best = { entry: e, score };
      }
    }
  }

  return best ? best.entry : null;
}

/**
 * Parmi plusieurs chaînes OCR (ex. auto + inversé), retourne l’entrée du dictionnaire
 * qui a le meilleur score multi-signal sur l’une des chaînes.
 */
export async function resolveOcrToDictionaryBestOf(
  candidates: string[]
): Promise<ScryfallDictionaryEntry | null> {
  if (!candidates.length) return null;
  await loadDictionary();
  let globalBest: { entry: ScryfallDictionaryEntry; score: number } | null = null;

  // Aussi scorér la concaténation des meilleurs tokens des candidats
  const cleaned = candidates.map(cleanOcrKey).filter((c) => c.length >= 2);
  const allCandidates = [...new Set(cleaned)];

  for (const ocrText of allCandidates) {
    const entry = await resolveOcrToDictionary(ocrText);
    if (!entry) continue;
    const score = scoreNameMatch(ocrText, entry.name, entry.lang);
    if (globalBest === null || score > globalBest.score) {
      globalBest = { entry, score };
    }
  }
  return globalBest ? globalBest.entry : null;
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
 * @param prefix - Texte saisi par l’utilisateur
 * @param limit - Nombre max de suggestions (défaut 15)
 */
export async function searchCardNamesForAutocomplete(
  prefix: string,
  limit: number = 15
): Promise<ScryfallDictionaryEntry[]> {
  const key = (prefix ?? '').trim().toLowerCase();
  if (!key) return [];

  const entries = await loadDictionary();
  if (!entries.length) return [];

  const seen = new Set<string>();
  const results: ScryfallDictionaryEntry[] = [];
  for (const e of entries) {
    const name = (e.name ?? '').toLowerCase();
    if (!name || !name.startsWith(key)) continue;
    if (seen.has(e.oracle_id)) continue;
    seen.add(e.oracle_id);
    results.push(e);
    if (results.length >= limit) break;
  }
  return results;
}

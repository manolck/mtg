/**
 * Recherche floue (tolérance aux fautes de frappe) via la distance de Levenshtein.
 * Utilisée pour assouplir la recherche en collection et wishlist.
 *
 * Référence : Levenshtein distance = nombre minimal d'éditions (insertion, suppression, substitution)
 * pour transformer une chaîne en une autre.
 */

/**
 * Calcule la distance de Levenshtein entre deux chaînes (algorithme de Wagner-Fischer).
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Deux lignes suffisent pour le calcul (optimisation mémoire)
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insertion
        prev[j] + 1,          // suppression
        prev[j - 1] + cost    // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Nombre max d'éditions autorisées selon la longueur du mot (pour tolérer les typos).
 * - 1–4 caractères : 1 faute
 * - 5–8 caractères : 2 fautes
 * - 9+ caractères : 3 fautes
 */
export function maxEditsForWordLength(len: number): number {
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

/**
 * Retourne true si `word` correspond à au moins un mot de `candidates`
 * (égalité exacte ou distance de Levenshtein <= seuil selon la longueur).
 */
export function wordMatchesFuzzy(
  word: string,
  candidates: string[],
  maxEdits?: number
): boolean {
  const w = word.toLowerCase().trim();
  if (!w) return false;
  const limit = maxEdits ?? maxEditsForWordLength(w.length);

  for (const c of candidates) {
    const cLower = c.toLowerCase().trim();
    if (!cLower) continue;
    if (w === cLower) return true;
    if (Math.abs(w.length - cLower.length) > limit) continue;
    if (levenshteinDistance(w, cLower) <= limit) return true;
  }
  return false;
}

/**
 * Sépare le texte en mots (espaces, ponctuation ignorée pour la recherche).
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((s) => s.length > 0);
}

/**
 * Retourne true si tous les mots de la requête ont au moins une correspondance floue
 * dans le texte (chaque mot de la requête doit matcher un mot du texte).
 */
export function textMatchesFuzzy(
  searchText: string,
  query: string,
  options?: { maxEditsPerWord?: number }
): boolean {
  const queryWords = tokenize(query);
  if (queryWords.length === 0) return false;

  const textWords = tokenize(searchText);
  if (textWords.length === 0) return false;

  for (const qw of queryWords) {
    const limit = options?.maxEditsPerWord ?? maxEditsForWordLength(qw.length);
    if (!wordMatchesFuzzy(qw, textWords, limit)) return false;
  }
  return true;
}

/**
 * Retourne true si la requête correspond au texte : soit une sous-chaîne exacte,
 * soit une correspondance floue mot à mot.
 */
export function searchMatchesText(
  text: string,
  query: string,
  options?: { maxEditsPerWord?: number }
): boolean {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase().trim();
  if (textLower.includes(queryLower)) return true;
  return textMatchesFuzzy(text, query, options);
}

/** OCR↔dictionary matching — keep in sync with scripts/ocr-match-lib.mjs */

export interface OcrMatchEntry {
  oracle_id: string;
  lang: string;
  name: string;
}

export function normalizeAccents(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function cleanOcrKey(s: string) {
  return (s ?? '')
    .replace(/[|\[\](){}«»<>]/g, ' ')
    .replace(/[^\p{L}\p{N}\s'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaroWinkler(s1: string, s2: string) {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  const matchWindowInt = Math.max(0, Math.floor(Math.max(len1, len2) / 2 - 1));
  const s1Match = new Array(len1).fill(false);
  const s2Match = new Array(len2).fill(false);
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
  if (!matches) return 0;
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
  return Math.min(1, jaro + prefixLen * 0.1 * (1 - jaro));
}

export function tokenize(s: string) {
  return normalizeAccents(s.toLowerCase())
    .split(/[\s'\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function tokensFuzzyEqual(a: string, b: string) {
  if (a === b) return true;
  // Containment : ≥85% + même initiale (évite ombre ⊂ nombre)
  if (a.length >= 4 && b.length >= 4) {
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (
      longer.includes(shorter) &&
      shorter.length / longer.length >= 0.85 &&
      shorter[0] === longer[0]
    ) {
      return true;
    }
  }
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  if (lenRatio < 0.65) return false;
  const lenDiff = Math.abs(a.length - b.length);
  const thr = lenDiff >= 2 ? 0.88 : 0.82;
  const jw = jaroWinkler(a, b);
  if (jw >= thr) {
    if (a[0] === b[0]) {
      // Évite atavres≈athreos (JW moyen sans préfixe/suffixe commun)
      if (jw < 0.92) {
        let pref = 0;
        while (pref < Math.min(a.length, b.length) && a[pref] === b[pref]) pref++;
        let suf = 0;
        while (
          suf < Math.min(a.length, b.length) &&
          a[a.length - 1 - suf] === b[b.length - 1 - suf]
        ) {
          suf++;
        }
        if (pref < 3 && suf < 3) {
          // laisser le fallback suffixe décider
        } else if (lenDiff === 1 && jw < 0.95) {
          const longer = a.length > b.length ? a : b;
          const shorter = a.length > b.length ? b : a;
          if (
            longer.slice(1) === shorter ||
            longer.slice(0, -1) === shorter ||
            longer.startsWith(shorter) ||
            longer.endsWith(shorter)
          ) {
            return true;
          }
          let p2 = 0;
          while (p2 < shorter.length && longer[p2] === shorter[p2]) p2++;
          if (p2 >= 4 && jw >= 0.85) return true;
          // sinon fallback suffixe
        } else {
          return true;
        }
      } else if (lenDiff === 1 && jw < 0.95) {
        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;
        if (
          longer.slice(1) === shorter ||
          longer.slice(0, -1) === shorter ||
          longer.startsWith(shorter) ||
          longer.endsWith(shorter)
        ) {
          return true;
        }
        let pref = 0;
        while (pref < shorter.length && longer[pref] === shorter[pref]) pref++;
        if (pref >= 4 && jw >= 0.85) return true;
      } else {
        return true;
      }
    }
    // initiale différente : uniquement via fallback suffixe (atavres≈cadavres)
  }
  if (
    a.length >= 6 &&
    b.length >= 6 &&
    lenRatio >= 0.75 &&
    a.slice(-4) === b.slice(-4)
  ) {
    if (jw >= 0.82) return true;
    // reineur≈faconneur (suffix -neur) sans rouvrir livres≈atavres
    if (jw >= 0.65 && /(?:neur|eur)$/.test(a) && /(?:neur|eur)$/.test(b)) return true;
  }
  return false;
}

const TYPE_LINE_WORD =
  /^(creature|creatures|cr[eé]ature|enchantment|enchantement|instant|instantan[eé]|sorcery|rituel|artifact|artefact|land|terrain|planeswalker|legendary)$/i;

/** OCR qui ressemble à une type line (ex. "Creature ombre") — à ignorer. */
export function looksLikeTypeLine(ocr: string) {
  const sig = tokenize(ocr).filter((t) => t.length >= 3);
  if (!sig.length) return true;
  if (sig.some((t) => TYPE_LINE_WORD.test(t)) && sig.length <= 3) return true;
  // "humain et gredin" / "zombie knight" sans nom de carte
  if (
    sig.length <= 3 &&
    sig.some((t) =>
      /^(humain|gredin|zombie|guerrier|insecte|shamane|soldat|sorcier|knight|wizard|elf|goblin)$/i.test(
        t
      )
    )
  ) {
    return true;
  }
  return false;
}

export function expandOcrCandidates(raw: string) {
  const key = cleanOcrKey(raw);
  if (!key) return [];
  const out = new Set([key]);
  // Mana collé au nom : "MOmbre" → "Ombre" (uniquement si majuscule après la lettre mana)
  const unglued = key.replace(/\b[WUBRGCMwubrgcm](?=\p{Lu}[\p{L}]{3,})/gu, '');
  if (unglued !== key && unglued.trim().length >= 4) out.add(unglued.replace(/\s+/g, ' ').trim());

  // Retire les mots de type de carte (fuite OCR type line)
  const withoutCreatureType = key
    .replace(/\b(creature|cr[eé]ature|enchantement|instantan[eé]|rituel)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (withoutCreatureType.length >= 5) {
    const sigLeft = tokenize(withoutCreatureType).filter((t) => t.length >= 3);
    if (sigLeft.length >= 2 || (sigLeft.length === 1 && (sigLeft[0]?.length ?? 0) >= 10)) {
      out.add(withoutCreatureType);
    }
  }

  const tokens = key.split(/\s+/).filter(Boolean);
  const lastLong = [...tokens]
    .reverse()
    .find((t) => t.length >= 5 && !/^\d+$/.test(t) && !TYPE_LINE_WORD.test(t));
  const firstLong = tokens.find(
    (t) => t.length >= 5 && !/^\d+$/.test(t) && !TYPE_LINE_WORD.test(t)
  );
  const isJunk = (t: string) =>
    /^\d+$/.test(t) || (t.length <= 2 && !/^(de|du|la|le|en|et|d)$/i.test(t));
  let start = 0;
  let end = tokens.length;
  while (start < end && isJunk(tokens[start])) start++;
  while (end > start && isJunk(tokens[end - 1])) end--;
  if (end > start) out.add(tokens.slice(start, end).join(' '));
  let windowCount = 0;
  for (let len = Math.min(5, tokens.length); len >= 2 && windowCount < 12; len--) {
    for (let i = 0; i + len <= tokens.length && windowCount < 12; i++) {
      const slice = tokens.slice(i, i + len);
      const significant = slice.filter((t) => t.length >= 3 && !/^\d+$/.test(t));
      if (significant.length < 2) continue;
      // Ignore fenêtres type line / qui abandonnent un token distinctif
      if (significant.some((t) => TYPE_LINE_WORD.test(t))) continue;
      if (lastLong && !slice.includes(lastLong)) continue;
      if (firstLong && tokens.indexOf(firstLong) <= 1 && !slice.includes(firstLong)) continue;
      const s = slice.filter((t) => !/^\d+$/.test(t)).join(' ');
      if (s.length >= 5) {
        out.add(s);
        windowCount++;
      }
    }
  }
  return [...out].filter((c) => !looksLikeTypeLine(c));
}

export function scoreNameMatch(ocrText: string, cardName: string, lang?: string) {
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
  const significantO = oTokens.filter((t) => t.length >= 3);
  const significantN = nTokens.filter((t) => t.length >= 3);
  let nameHits = 0;
  const usedO = new Set();
  for (const nt of significantN) {
    let bestI = -1;
    let bestJw = -1;
    for (let i = 0; i < significantO.length; i++) {
      if (usedO.has(i)) continue;
      if (!tokensFuzzyEqual(significantO[i], nt)) continue;
      const tj = jaroWinkler(significantO[i], nt);
      if (tj > bestJw) {
        bestJw = tj;
        bestI = i;
      }
    }
    if (bestI >= 0) {
      usedO.add(bestI);
      nameHits++;
    }
  }
  const nameCoverage = significantN.length ? nameHits / significantN.length : 0;
  let ocrHits = 0;
  const usedN = new Set();
  for (const ot of significantO) {
    let bestI = -1;
    let bestJw = -1;
    for (let i = 0; i < significantN.length; i++) {
      if (usedN.has(i)) continue;
      if (!tokensFuzzyEqual(ot, significantN[i])) continue;
      const tj = jaroWinkler(ot, significantN[i]);
      if (tj > bestJw) {
        bestJw = tj;
        bestI = i;
      }
    }
    if (bestI >= 0) {
      usedN.add(bestI);
      ocrHits++;
    }
  }
  const ocrPrecision = significantO.length ? ocrHits / significantO.length : 0;
  const lenRatio =
    Math.min(oNorm.length, nNorm.length) / Math.max(oNorm.length, nNorm.length, 1);
  const wordCountPenalty =
    oTokens.length >= 3 && nTokens.length === 1 && nameCoverage < 0.5 ? 0.18 : 0;
  const singleTokenPenalty =
    significantO.length === 1 && significantN.length >= 2 && (significantO[0]?.length ?? 0) < 12
      ? 0.35
      : significantO.length === 1 && significantN.length >= 2
        ? 0.2
        : 0;
  const shortOcrLongName =
    significantO.length <= 2 && significantN.length >= 3 && nameCoverage < 0.45 ? 0.1 : 0;
  const tokenCountGap = Math.abs(significantO.length - significantN.length);
  const tokenGapPenalty = tokenCountGap >= 3 ? 0.06 * (tokenCountGap - 2) : 0;
  // OCR mono-mot court vs nom mono-mot : exiger quasi-égalité (évite droites→Droiture)
  const shortSinglePenalty =
    significantO.length === 1 &&
    significantN.length === 1 &&
    oNorm.length < 12 &&
    jw < 0.96
      ? 0.45
      : 0;

  // Nom mono-token : exiger JW élevé sur le token (évite reineur→Retisser)
  const monoNamePenalty =
    significantN.length === 1 && significantO.length >= 1
      ? Math.max(0, ...significantO.map((ot) => jaroWinkler(ot, significantN[0]))) < 0.9
        ? 0.35
        : 0
      : 0;

  // OCR bruité (plein de tokens) vs nom d'un seul mot
  const noisyVsShortName =
    significantN.length === 1 && significantO.length >= 3 && ocrPrecision < 0.45 ? 0.35 : 0;

  let score =
    0.28 * jw +
    0.42 * nameCoverage +
    0.2 * ocrPrecision +
    0.1 * lenRatio -
    wordCountPenalty -
    shortOcrLongName -
    singleTokenPenalty -
    tokenGapPenalty -
    shortSinglePenalty -
    monoNamePenalty -
    noisyVsShortName;
  if (lang === 'fr') {
    score += 0.08;
    if (/[àâäéèêëïîôùûüçœæ]/i.test(ocr) || /\b(des|de|la|le|du|en)\b/i.test(ocr)) score += 0.03;
  } else if (lang && lang !== 'en') score -= 0.05;
  const ocrDTail = ocr.match(/d['']([\p{L}]{4,})/iu);
  const nameDTail = cardName.match(/d['']([\p{L}]{4,})/iu);
  if (ocrDTail && nameDTail) {
    const tailJw = jaroWinkler(
      normalizeAccents(ocrDTail[1].toLowerCase()),
      normalizeAccents(nameDTail[1].toLowerCase())
    );
    // Exiger un très bon suffixe (évite ailemauit→ailevague)
    if (tailJw >= 0.9) score += 0.14 + 0.12 * tailJw;
    else if (tailJw >= 0.8) score += 0.06;
    else if (tailJw >= 0.75) score += 0.02;
    else score -= 0.1;
  } else if (ocrDTail && !nameDTail) score -= 0.12;
  else if (!ocrDTail && nameDTail) score -= 0.08;
  const ocrHasA = /\bà\b/i.test(ocr) || /(^|\s)a(\s|$)/i.test(normalizeAccents(ocr));
  const nameHasA = /\bà\b/i.test(cardName);
  if (ocrHasA && nameHasA) score += 0.1;
  if (ocrHasA && !nameHasA) score -= 0.1;
  // "ve" OCR ≈ "en" (Négociants en cadavres) — départage les "X de cadavres"
  const ocrHasVeEn = /\b(ve|en)\b/i.test(ocr);
  const nameHasEn = /\ben\b/i.test(cardName);
  const nameHasDe = /\bde\b/i.test(cardName);
  if (ocrHasVeEn && nameHasEn) score += 0.16;
  else if (ocrHasVeEn && nameHasDe && !nameHasEn) score -= 0.08;
  // "… de pos" ≈ "… de peste"
  if (/\bde\b/i.test(ocr) && /\bde\b/i.test(cardName)) {
    const lo = significantO[significantO.length - 1];
    const ln = significantN[significantN.length - 1];
    if (lo && ln && ln.length >= 4 && lo[0] === ln[0]) {
      const pj = jaroWinkler(lo, ln);
      if (pj >= 0.7 || ln.startsWith(lo) || lo.startsWith(ln.slice(0, 3))) score += 0.12;
    }
  }
  let distinctiveBonus = 0;
  for (const ot of significantO) {
    if (ot.length < 6) continue;
    for (const nt of significantN) {
      if (nt.length < 6) continue;
      if (jaroWinkler(ot, nt) >= 0.9) distinctiveBonus = Math.max(distinctiveBonus, 0.12);
    }
  }
  score += distinctiveBonus;
  // Bonus containment — et pénalité si "peste" seul match un nom long "X de peste"
  let containmentBonus = 0;
  for (const ot of significantO) {
    if (ot.length < 4) continue;
    for (const nt of significantN) {
      if (nt.includes(ot) || ot.includes(nt)) {
        containmentBonus = Math.max(
          containmentBonus,
          0.12 * (Math.min(ot.length, nt.length) / Math.max(ot.length, nt.length))
        );
      }
    }
  }
  score += containmentBonus;

  // Tokens OCR longs non couverts → faux positif (ex. "Cavalier cruel" → "Marche cruel")
  let unmatchedLongO = 0;
  for (const ot of significantO) {
    if (ot.length < 5) continue;
    if (!significantN.some((nt) => tokensFuzzyEqual(ot, nt))) unmatchedLongO++;
  }
  if (unmatchedLongO >= 1) score -= 0.32 * unmatchedLongO;

  // OCR multi-mots : exiger que la plupart des tokens OCR collent au nom
  if (significantO.length >= 2 && ocrPrecision < 0.75) {
    score -= 0.35 * (0.75 - ocrPrecision);
  }

  // Premier token OCR distinctif absent du nom
  const firstO = significantO[0];
  const firstN = significantN[0];
  if (firstO && firstN && firstO.length >= 5) {
    const firstCovered = significantN.some((nt) => tokensFuzzyEqual(firstO, nt));
    if (!firstCovered) score -= 0.24;
    else if (!tokensFuzzyEqual(firstO, firstN) && firstO.length >= 7) {
      // "Cavalier …" matché ailleurs seulement : OK léger, sinon déjà covered
    }
  }

  // "eeneur de peste" ne doit pas matcher juste "Peste"
  if (
    significantN.length === 1 &&
    significantO.length >= 2 &&
    significantO.some((ot) => tokensFuzzyEqual(ot, significantN[0]))
  ) {
    const otherO = significantO.filter((ot) => !tokensFuzzyEqual(ot, significantN[0]));
    if (otherO.some((ot) => ot.length >= 5)) score -= 0.25;
  }
  if (oNorm.includes(nNorm) && nNorm.length >= 8) score += 0.15;
  if (nNorm.includes(oNorm) && oNorm.length >= 10) score += 0.1;

  // Désambiguïsation : le DERNIER token OCR vs dernier token du nom (pas n'importe quel token)
  const lastN = significantN[significantN.length - 1];
  const lastO = significantO[significantO.length - 1];
  if (lastN && lastN.length >= 4) {
    let lastHit = false;
    if (lastO && lastO.length >= 4) {
      lastHit = tokensFuzzyEqual(lastO, lastN);
      if (!lastHit && lastO[0] === lastN[0] && jaroWinkler(lastO, lastN) >= 0.7) {
        lastHit = true;
      }
    } else {
      lastHit = significantO.some((ot) => tokensFuzzyEqual(ot, lastN));
    }
    if (lastHit) score += 0.14;
    else score -= 0.22;
    if (lastHit && lastO && lastO.length >= 5 && significantO.length >= 2) {
      const endJw = jaroWinkler(lastO, lastN);
      if (endJw >= 0.8) {
        score += 0.18;
        if (lastN.length + 1 < lastO.length) score -= 0.1;
        else if (lastN.length >= lastO.length) score += 0.06;
      }
    } else if (
      !lastHit &&
      lastO &&
      lastO.length >= 5 &&
      significantO.length >= 2 &&
      jaroWinkler(lastO, lastN) < 0.55
    ) {
      score -= 0.25;
    }
  }

  return Math.max(0, Math.min(1, score));
}

/** Hint langue OCR (FR accents / articles vs EN the/of). */
export function detectOcrLangHint(ocr: string): "fr" | "en" | null {
  const s = ocr ?? '';
  if (/[àâäéèêëïîôùûüçœæ]/i.test(s)) return 'fr';
  if (/\b(des|du|les|une|aux|dans|pour)\b/i.test(s)) return 'fr';
  if (/\b(the|of|and|from|into|with)\b/i.test(s)) return 'en';
  return null;
}

const indexCache = new WeakMap();

/** Index FR+EN pour exact lookup + narrowing par tokens. */
export function buildMatchIndex(entries: OcrMatchEntry[]) {
  const pool = entries.filter((e) => (e.lang === 'fr' || e.lang === 'en') && e.name);
  const byExact = new Map();
  const byNorm = new Map();
  const byToken = new Map();
  const byPrefix = new Map();
  const push = (map, key, e) => {
    if (!key) return;
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(e);
  };
  for (const e of pool) {
    const lower = e.name.toLowerCase();
    const norm = normalizeAccents(lower);
    push(byExact, lower, e);
    push(byNorm, norm, e);
    const base = lower.split(/\s*\/\/\s*/)[0].trim();
    if (base && base !== lower) {
      push(byExact, base, e);
      push(byNorm, normalizeAccents(base), e);
    }
    for (const t of tokenize(e.name)) {
      if (t.length >= 4) push(byToken, t, e);
      if (t.length >= 3) push(byPrefix, t.slice(0, 3), e);
    }
  }
  return { pool, byExact, byNorm, byToken, byPrefix };
}

function getMatchIndex(entries) {
  let idx = indexCache.get(entries);
  if (!idx) {
    idx = buildMatchIndex(entries);
    indexCache.set(entries, idx);
  }
  return idx;
}

function pickExact(list, langHint) {
  if (!list?.length) return null;
  const ok = list.filter((e) => (e.name?.length ?? 0) >= 8 || tokenize(e.name).length >= 2);
  if (!ok.length) return null;
  if (langHint) {
    const pref = ok.find((e) => e.lang === langHint);
    if (pref) return pref;
  }
  return ok[0];
}

function narrowEntries(ocrText, index) {
  const tokens = tokenize(ocrText).filter((t) => t.length >= 3);
  if (!tokens.length) return index.pool;
  const scored = new Map();
  for (const t of tokens) {
    if (t.length >= 4) {
      for (const e of index.byToken.get(t) || []) {
        scored.set(e, (scored.get(e) || 0) + 3);
      }
    }
    for (const e of index.byPrefix.get(t.slice(0, 3)) || []) {
      scored.set(e, (scored.get(e) || 0) + 1);
    }
  }
  if (!scored.size) return index.pool;
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 450)
    .map(([e]) => e);
}

/** Resolve OCR candidates against FR + EN dictionary entries. */
export function resolveBestOf(candidates: string[], entries: OcrMatchEntry[]) {
  const index = getMatchIndex(entries);
  const cleaned = candidates
    .map(cleanOcrKey)
    .filter((c) => {
      const letters = (c.match(/\p{L}/gu) || []).length;
      const words = c.split(/\s+/).filter((w) => /[\p{L}]{3,}/u.test(w)).length;
      if (letters + words * 4 < 10) return false;
      if (words < 2 && letters < 12) return false;
      if (looksLikeTypeLine(c)) return false;
      return true;
    });
  const expanded = [...new Set(cleaned.flatMap((c) => expandOcrCandidates(c)))];
  let best: { entry: OcrMatchEntry; score: number; ocr: string; coverage: number } | null = null;
  const MIN = 0.55;
  for (const ocrText of expanded) {
    if (ocrText.length < 12 && tokenize(ocrText).filter((t) => t.length >= 3).length < 2) {
      continue;
    }
    const keyLower = ocrText.toLowerCase();
    const keyNorm = normalizeAccents(keyLower);
    const langHint = detectOcrLangHint(ocrText);
    const exact = pickExact(
      [
        ...(index.byExact.get(keyLower) || []),
        ...(index.byNorm.get(keyNorm) || []),
      ],
      langHint
    );
    if (exact) {
      return { entry: exact, score: 1, ocr: ocrText, coverage: 1, ocrPrecision: 1 };
    }

    const pool = narrowEntries(ocrText, index);
    for (const e of pool) {
      let score = scoreNameMatch(ocrText, e.name, e.lang);
      if (langHint === 'fr' && e.lang === 'en') score -= 0.04;
      if (langHint === 'en' && e.lang === 'fr') score -= 0.04;
      if (score < MIN) continue;
      const nTokens = tokenize(e.name).filter((t) => t.length >= 3);
      const oTokens = tokenize(ocrText).filter((t) => t.length >= 3);
      let hits = 0;
      for (const nt of nTokens) {
        if (oTokens.some((ot) => tokensFuzzyEqual(ot, nt))) hits++;
      }
      const coverage = nTokens.length ? hits / nTokens.length : 0;
      if (score < 0.95 && coverage < 0.45) continue;
      let oHits = 0;
      for (const ot of oTokens) {
        if (nTokens.some((nt) => tokensFuzzyEqual(ot, nt))) oHits++;
      }
      const ocrPrecision = oTokens.length ? oHits / oTokens.length : 0;
      if (oTokens.length >= 2 && ocrPrecision < 0.6) {
        // Autoriser si le dernier token colle fort (OCR bruité en tête : "Crmtyre d'ailemauit")
        const lastO = oTokens[oTokens.length - 1];
        const lastN = nTokens[nTokens.length - 1];
        const lastOk =
          lastO &&
          lastN &&
          lastO.length >= 5 &&
          lastN.length >= 5 &&
          (tokensFuzzyEqual(lastO, lastN) || jaroWinkler(lastO, lastN) >= 0.88);
        if (!lastOk) continue;
      }
      if (nTokens.length === 1 && oTokens.length >= 2 && (nTokens[0]?.length ?? 0) < 10) {
        continue;
      }

      const candidate = { entry: e, score, ocr: ocrText, coverage, ocrPrecision };
      if (!best) {
        best = candidate;
        continue;
      }
      if (score > best.score + 0.002) {
        best = candidate;
        continue;
      }
      if (score < best.score - 0.002) continue;
      if (langHint && e.lang === langHint && best.entry.lang !== langHint) {
        best = candidate;
        continue;
      }
      if (langHint && best.entry.lang === langHint && e.lang !== langHint) continue;
      if (ocrPrecision > (best.ocrPrecision ?? 0) + 0.08) {
        best = candidate;
        continue;
      }
      if ((best.ocrPrecision ?? 0) > ocrPrecision + 0.08) continue;
      if (ocrText.length > best.ocr.length + 4) {
        best = candidate;
        continue;
      }
      if (best.ocr.length > ocrText.length + 4) continue;
      if (coverage > best.coverage + 0.05) {
        best = candidate;
        continue;
      }
      if (coverage < best.coverage - 0.05) continue;
      const lastJwFor = (name: string, ocr: string) => {
        const nToks = tokenize(name).filter((t) => t.length >= 3);
        const last = nToks[nToks.length - 1];
        if (!last) return 0;
        const oToks = tokenize(ocr).filter((t) => t.length >= 3);
        if (!oToks.length) return 0;
        return Math.max(0, ...oToks.map((ot) => jaroWinkler(ot, last)));
      };
      const lj = lastJwFor(e.name, ocrText);
      const blj = lastJwFor(best.entry.name, best.ocr);
      if (lj > blj + 0.03) {
        best = candidate;
        continue;
      }
      if (lj < blj - 0.03) continue;
      const firstJwFor = (name: string, ocr: string) => {
        const nToks = tokenize(name).filter((t) => t.length >= 3);
        const oToks = tokenize(ocr).filter((t) => t.length >= 3);
        if (!nToks.length || !oToks.length) return 0;
        return Math.max(0, ...oToks.map((ot) => jaroWinkler(ot, nToks[0])));
      };
      const fj = firstJwFor(e.name, ocrText);
      const bfj = firstJwFor(best.entry.name, best.ocr);
      if (fj > bfj + 0.12) {
        best = candidate;
        continue;
      }
      if (fj < bfj - 0.12) continue;
      const ocrHasD = /d['']/i.test(ocrText);
      const bestOcrHasD = /d['']/i.test(best.ocr);
      const nameHasD = /d['']/i.test(e.name);
      const bestNameHasD = /d['']/i.test(best.entry.name);
      if (nameHasD && ocrHasD && !(bestNameHasD && bestOcrHasD)) {
        best = candidate;
        continue;
      }
      if (bestNameHasD && bestOcrHasD && !(nameHasD && ocrHasD)) continue;
      const enScore = (name: string, ocr: string) => {
        const hasVe = /\b(ve|en)\b/i.test(ocr);
        if (hasVe && /\ben\b/i.test(name)) return 2;
        if (hasVe && /\bde\b/i.test(name)) return 0;
        return 1;
      };
      const es = enScore(e.name, ocrText);
      const bes = enScore(best.entry.name, best.ocr);
      if (es > bes) {
        best = candidate;
        continue;
      }
      if (es < bes) continue;
      if (ocrText.length > best.ocr.length + 2) {
        best = candidate;
        continue;
      }
      if (ocrText.length + 2 < best.ocr.length) continue;
      const gJw = (name: string, ocr: string) =>
        jaroWinkler(normalizeAccents(ocr.toLowerCase()), normalizeAccents(name.toLowerCase()));
      if (gJw(e.name, ocrText) > gJw(best.entry.name, best.ocr) + 0.02) {
        best = candidate;
        continue;
      }
      const ocrLen = ocrText.length;
      const dist = Math.abs(e.name.length - ocrLen);
      const bestDist = Math.abs(best.entry.name.length - ocrLen);
      if (dist < bestDist) best = candidate;
      else if (dist === bestDist && e.name.length > best.entry.name.length) best = candidate;
    }
    if (best && best.score >= 0.985 && (best.coverage ?? 0) >= 0.6) return best;
  }
  return best;
}

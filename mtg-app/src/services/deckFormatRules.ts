import type { Deck, DeckEntry, DeckFormat } from '../types/deck';
import { countEntries, DECK_FORMAT_LABELS } from '../types/deck';
import {
  formatCopyLimitLabel,
  isBasicLandEntry,
  maxCopiesForEntry,
} from '../utils/deckCopyLimits';

export type ValidationMode = 'draft' | 'share';

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  /** Present when the issue is tied to a specific catalog card */
  scryfallId?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function legalityKey(format: DeckFormat): string {
  return format;
}

function isLegal(entry: DeckEntry, format: DeckFormat): boolean | null {
  const legalities = entry.legalities;
  if (!legalities) return null;
  const status = legalities[legalityKey(format)] || legalities[format];
  if (!status) return null;
  return status === 'legal' || status === 'restricted';
}

function aggregateByName(entries: DeckEntry[]): Map<string, { qty: number; samples: DeckEntry[] }> {
  const map = new Map<string, { qty: number; samples: DeckEntry[] }>();
  for (const e of entries) {
    const key = e.name.trim().toLowerCase();
    const cur = map.get(key);
    if (cur) {
      cur.qty += e.quantity;
      cur.samples.push(e);
    } else {
      map.set(key, { qty: e.quantity, samples: [e] });
    }
  }
  return map;
}

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

/** Color identity uses only WUBRG. {C} / colorless is not a color and is legal in any deck. */
function normalizeColorIdentity(values?: string[]): string[] {
  if (!values?.length) return [];
  const present = new Set<string>();
  for (const raw of values) {
    const color = raw.trim().toUpperCase();
    if (color === 'C' || color === 'COLORLESS') continue;
    if ((WUBRG as readonly string[]).includes(color)) present.add(color);
  }
  return WUBRG.filter((color) => present.has(color));
}

function commanderColorIdentity(commanders: DeckEntry[]): Set<string> | null {
  if (!commanders.length) return null;
  const set = new Set<string>();
  for (const c of commanders) {
    for (const color of normalizeColorIdentity(c.colorIdentity ?? c.colors)) {
      set.add(color);
    }
  }
  return set;
}

function entryViolatesColorIdentity(entry: DeckEntry, allowed: Set<string>): boolean {
  const identity = normalizeColorIdentity(entry.colorIdentity ?? entry.colors);
  if (identity.length === 0) return false;
  return identity.some((color) => !allowed.has(color));
}

/** Prefer an entry that carries Oracle text when resolving copy limits. */
function representativeEntry(samples: DeckEntry[]): DeckEntry {
  return samples.find((s) => !!s.oracleText?.trim()) || samples[0];
}

function assertCopyLimits(
  entries: DeckEntry[],
  format: DeckFormat,
  hard: (code: string, message: string, scryfallId?: string) => void
): void {
  const byName = aggregateByName(entries);
  for (const [, { qty, samples }] of byName) {
    const sample = representativeEntry(samples);
    if (isBasicLandEntry(sample)) continue;
    const max = maxCopiesForEntry(sample, format);
    if (qty <= max) continue;

    const label = formatCopyLimitLabel(max);
    const msg =
      format === 'commander' && max === 1
        ? `Singleton Commander : plus d’un exemplaire de « ${sample.name} » (${qty}).`
        : `${label} copie(s) de « ${sample.name} » (deck + sideboard/commanders) : ${qty}.`;

    for (const s of samples) {
      hard('copy_limit', msg, s.scryfallId);
    }
  }
}

export function getFormatSummary(format: DeckFormat): string {
  switch (format) {
    case 'commander':
      return '100 cartes exactes (commander inclus), singleton sauf terrains de base et cartes dont le texte Oracle autorise plus de copies.';
    case 'pauper':
      return '≥ 60 cartes, ≤ 15 sideboard, ≤ 4 copies (sauf exceptions Oracle), uniquement communes (légalité Pauper).';
    default:
      return '≥ 60 cartes, ≤ 15 sideboard, ≤ 4 copies deck+sideboard (sauf exceptions Oracle), légalité Scryfall du format.';
  }
}

/**
 * Validate deck structure and (when available) Scryfall legalities.
 * draft → warnings for soft failures; share → errors for hard failures.
 */
export function validateDeck(deck: Deck, mode: ValidationMode = 'draft'): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const push = (issue: ValidationIssue) => {
    if (issue.severity === 'error') errors.push(issue);
    else warnings.push(issue);
  };
  const hard = (code: string, message: string, scryfallId?: string) => {
    push({ code, message, severity: mode === 'share' ? 'error' : 'warning', scryfallId });
  };
  const soft = (code: string, message: string, scryfallId?: string) => {
    push({ code, message, severity: 'warning', scryfallId });
  };

  const main = deck.cards?.mainboard || [];
  const side = deck.cards?.sideboard || [];
  const commanders = deck.commanders || [];
  const mainCount = countEntries(main);
  const sideCount = countEntries(side);
  const commanderCount = countEntries(commanders);
  const formatLabel = DECK_FORMAT_LABELS[deck.format];

  if (deck.format === 'commander') {
    const totalWithCmd = mainCount + commanderCount;
    if (commanderCount < 1) {
      hard('commander_required', 'Un deck Commander doit avoir au moins un commander.');
    }
    if (commanderCount > 2) {
      hard('commander_max', 'Maximum 2 commanders (partenaires).');
    }
    if (sideCount > 0) {
      soft('commander_sideboard', 'Commander n’utilise généralement pas de sideboard.');
    }
    if (totalWithCmd !== 100) {
      hard(
        'commander_size',
        `Commander exige exactement 100 cartes (commander inclus). Actuel : ${totalWithCmd}.`
      );
    }

    const allowed = commanderColorIdentity(commanders);
    if (allowed) {
      const commanderIdentity = WUBRG.filter((color) => allowed.has(color)).join('') || 'incolore';
      for (const entry of [...main, ...commanders]) {
        if (entryViolatesColorIdentity(entry, allowed)) {
          const identity = normalizeColorIdentity(entry.colorIdentity ?? entry.colors).join('');
          hard(
            'color_identity',
            `${entry.name} (identité ${identity}) dépasse l’identité de couleur du commander (${commanderIdentity}).`,
            entry.scryfallId
          );
        }
      }
    }

    assertCopyLimits([...main, ...commanders], 'commander', hard);
  } else {
    if (mainCount < 60) {
      hard('min_size', `${formatLabel} exige au moins 60 cartes en main. Actuel : ${mainCount}.`);
    }
    if (sideCount > 15) {
      hard('sideboard_max', `Sideboard max 15 cartes. Actuel : ${sideCount}.`);
    }
    if (commanderCount > 0) {
      soft('unexpected_commander', 'Des commanders sont définis hors format Commander.');
    }

    assertCopyLimits([...main, ...side], deck.format, hard);
  }

  const checkPool = deck.format === 'commander' ? [...main, ...commanders] : [...main, ...side];
  for (const entry of checkPool) {
    if (entry.scryfallId.startsWith('legacy:')) {
      hard(
        'unresolved_card',
        `Carte non migrée : ${entry.name}. Remplacez-la via la recherche.`,
        entry.scryfallId
      );
      continue;
    }
    const legal = isLegal(entry, deck.format);
    if (legal === false) {
      hard(
        'illegal',
        `${entry.name} n’est pas légale en ${formatLabel}.`,
        entry.scryfallId
      );
    } else if (legal === null && mode === 'share') {
      soft(
        'legality_unknown',
        `Légalité Scryfall inconnue pour ${entry.name} — vérifiez avant tournoi.`,
        entry.scryfallId
      );
    }

    if (deck.format === 'pauper') {
      const rarity = (entry.rarity || '').toLowerCase();
      const pauperLegal = entry.legalities?.pauper;
      if (pauperLegal === 'not_legal' || pauperLegal === 'banned') {
        hard('pauper_illegal', `${entry.name} n’est pas légale en Pauper.`, entry.scryfallId);
      } else if (rarity && rarity !== 'common' && pauperLegal !== 'legal') {
        soft('pauper_rarity', `${entry.name} n’est pas marquée common (${rarity}).`, entry.scryfallId);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function canPublish(deck: Deck): ValidationResult {
  return validateDeck(deck, 'share');
}

export function formatIssuesByCardId(result: ValidationResult): Map<string, ValidationIssue[]> {
  const map = new Map<string, ValidationIssue[]>();
  for (const issue of [...result.errors, ...result.warnings]) {
    if (!issue.scryfallId) continue;
    const list = map.get(issue.scryfallId) || [];
    list.push(issue);
    map.set(issue.scryfallId, list);
  }
  return map;
}

import type { Deck, DeckEntry, DeckFormat } from '../types/deck';
import { countEntries, DECK_FORMAT_LABELS } from '../types/deck';

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

const BASIC_LAND_NAMES = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
  'snow-covered plains',
  'snow-covered island',
  'snow-covered swamp',
  'snow-covered mountain',
  'snow-covered forest',
]);

function isBasicLand(entry: DeckEntry): boolean {
  const name = entry.name.trim().toLowerCase();
  if (BASIC_LAND_NAMES.has(name)) return true;
  const type = (entry.typeLine || '').toLowerCase();
  return type.includes('basic') && type.includes('land');
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

function aggregateByName(entries: DeckEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const key = e.name.trim().toLowerCase();
    map.set(key, (map.get(key) || 0) + e.quantity);
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

export function getFormatSummary(format: DeckFormat): string {
  switch (format) {
    case 'commander':
      return '100 cartes exactes (commander inclus), singleton sauf terrains de base, identité de couleur du commander.';
    case 'pauper':
      return '≥ 60 cartes, ≤ 15 sideboard, ≤ 4 copies, uniquement communes (légalité Pauper).';
    default:
      return '≥ 60 cartes, ≤ 15 sideboard, ≤ 4 copies (deck + sideboard), légalité Scryfall du format.';
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

    const byName = aggregateByName([...main, ...commanders]);
    for (const [name, qty] of byName) {
      if (qty > 1 && !BASIC_LAND_NAMES.has(name)) {
        const samples = [...main, ...commanders].filter((e) => e.name.toLowerCase() === name);
        if (samples[0] && !isBasicLand(samples[0])) {
          for (const sample of samples) {
            hard(
              'singleton',
              `Singleton Commander : plus d’un exemplaire de « ${samples[0].name} » (${qty}).`,
              sample.scryfallId
            );
          }
        }
      }
    }
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

    const byName = aggregateByName([...main, ...side]);
    for (const [name, qty] of byName) {
      if (qty > 4 && !BASIC_LAND_NAMES.has(name)) {
        const samples = [...main, ...side].filter((e) => e.name.toLowerCase() === name);
        if (samples[0] && !isBasicLand(samples[0])) {
          for (const sample of samples) {
            hard(
              'copy_limit',
              `Maximum 4 copies de « ${samples[0].name} » (deck + sideboard) : ${qty}.`,
              sample.scryfallId
            );
          }
        }
      }
    }
  }

  // Legality checks when data present
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

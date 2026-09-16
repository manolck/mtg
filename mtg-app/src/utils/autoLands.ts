import type { Deck, DeckEntry, DeckFormat } from '../types/deck';
import { countEntries } from '../types/deck';

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';

export const BASIC_LAND_BY_COLOR: Record<ManaColor, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

export const COLORLESS_BASIC_LAND = 'Wastes';

const WUBRG: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

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

export interface AutoLandBasic {
  color: ManaColor | 'C';
  name: string;
  quantity: number;
}

export interface AutoLandSuggestion {
  targetLands: number;
  currentLands: number;
  toAdd: number;
  avgCmc: number;
  basics: AutoLandBasic[];
  reason: 'ok' | 'already_enough' | 'no_spells' | 'deck_full';
}

export function isLandEntry(entry: Pick<DeckEntry, 'name' | 'typeLine'>): boolean {
  const type = (entry.typeLine || '').toLowerCase();
  if (/\bland\b/.test(type)) return true;
  return BASIC_LAND_NAMES.has(entry.name.trim().toLowerCase());
}

export function parseColoredPips(manaCost?: string): Record<ManaColor, number> {
  const pips: Record<ManaColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (!manaCost) return pips;

  const tokens = manaCost.match(/\{[^}]+\}/g);
  const inners = tokens
    ? tokens.map((token) => token.slice(1, -1))
    : manaCost.match(/[WUBRG]/gi) || [];

  for (const raw of inners) {
    const inner = raw.toUpperCase();
    if (/^\d+$/.test(inner) || inner === 'X' || inner === 'Y' || inner === 'Z' || inner === 'C' || inner === 'S') {
      continue;
    }
    const parts = inner.split('/');
    const colors = parts.filter((part): part is ManaColor =>
      (WUBRG as string[]).includes(part)
    );
    if (colors.length === 0) continue;
    if (colors.length === 1) {
      pips[colors[0]] += 1;
    } else {
      const weight = 1 / colors.length;
      for (const color of colors) pips[color] += weight;
    }
  }
  return pips;
}

export function recommendLandCount(format: DeckFormat, avgCmc: number): number {
  if (format === 'commander') {
    return clamp(Math.round(36 + (avgCmc - 3) * 4), 30, 43);
  }
  return clamp(Math.round(24 + (avgCmc - 3) * 3), 18, 28);
}

export function distributeCounts(
  total: number,
  weights: Record<string, number>
): Record<string, number> {
  const keys = Object.keys(weights).filter((key) => weights[key] > 0);
  if (total <= 0 || keys.length === 0) return {};
  const sum = keys.reduce((acc, key) => acc + weights[key], 0);
  const parts = keys.map((key) => {
    const exact = (weights[key] / sum) * total;
    return { key, n: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remaining = total - parts.reduce((acc, part) => acc + part.n, 0);
  parts.sort((a, b) => b.frac - a.frac || a.key.localeCompare(b.key));
  for (let i = 0; i < remaining; i++) {
    parts[i % parts.length].n += 1;
  }
  return Object.fromEntries(parts.map((part) => [part.key, part.n]));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function identityColors(entries: DeckEntry[]): ManaColor[] {
  const present = new Set<ManaColor>();
  for (const entry of entries) {
    const values = entry.colorIdentity ?? entry.colors ?? [];
    for (const raw of values) {
      const color = raw.trim().toUpperCase();
      if ((WUBRG as string[]).includes(color)) present.add(color as ManaColor);
    }
  }
  return WUBRG.filter((color) => present.has(color));
}

function emptyPips(): Record<ManaColor, number> {
  return { W: 0, U: 0, B: 0, R: 0, G: 0 };
}

function addPips(into: Record<ManaColor, number>, add: Record<ManaColor, number>, times: number) {
  for (const color of WUBRG) {
    into[color] += add[color] * times;
  }
}

export function suggestBasicLands(deck: Pick<Deck, 'format' | 'commanders' | 'cards'>): AutoLandSuggestion {
  const main = deck.cards?.mainboard || [];
  const commanders = deck.commanders || [];
  const pool = deck.format === 'commander' ? [...main, ...commanders] : main;
  const lands = main.filter(isLandEntry);
  const spells = pool.filter((entry) => !isLandEntry(entry));
  const currentLands = countEntries(lands);
  const spellCount = countEntries(spells);

  if (spellCount === 0) {
    return {
      targetLands: 0,
      currentLands,
      toAdd: 0,
      avgCmc: 0,
      basics: [],
      reason: 'no_spells',
    };
  }

  const cmcSum = spells.reduce((sum, entry) => sum + (entry.cmc ?? 0) * entry.quantity, 0);
  const avgCmc = cmcSum / spellCount;
  const deckSize = deck.format === 'commander' ? 100 : 60;
  let targetLands = recommendLandCount(deck.format, avgCmc);
  const maxLands = Math.max(0, deckSize - spellCount);
  targetLands = Math.min(targetLands, maxLands);

  if (targetLands <= 0) {
    return {
      targetLands,
      currentLands,
      toAdd: 0,
      avgCmc,
      basics: [],
      reason: 'deck_full',
    };
  }

  const toAdd = targetLands - currentLands;
  if (toAdd <= 0) {
    return {
      targetLands,
      currentLands,
      toAdd: 0,
      avgCmc,
      basics: [],
      reason: 'already_enough',
    };
  }

  const allowed =
    deck.format === 'commander' && commanders.length > 0
      ? identityColors(commanders)
      : identityColors(spells);

  if (allowed.length === 0) {
    return {
      targetLands,
      currentLands,
      toAdd,
      avgCmc,
      basics: [{ color: 'C', name: COLORLESS_BASIC_LAND, quantity: toAdd }],
      reason: 'ok',
    };
  }

  const pips = emptyPips();
  for (const spell of spells) {
    const fromCost = parseColoredPips(spell.manaCost);
    const hasAny = WUBRG.some((color) => fromCost[color] > 0);
    if (hasAny) {
      addPips(pips, fromCost, spell.quantity);
    } else {
      for (const color of identityColors([spell])) {
        pips[color] += spell.quantity;
      }
    }
  }

  const weights: Record<string, number> = {};
  for (const color of allowed) {
    weights[color] = pips[color] + 1;
  }

  const split = distributeCounts(toAdd, weights);
  const basics: AutoLandBasic[] = allowed
    .map((color) => ({
      color,
      name: BASIC_LAND_BY_COLOR[color],
      quantity: split[color] || 0,
    }))
    .filter((basic) => basic.quantity > 0);

  return {
    targetLands,
    currentLands,
    toAdd,
    avgCmc,
    basics,
    reason: 'ok',
  };
}

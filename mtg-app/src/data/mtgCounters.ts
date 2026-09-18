import countersData from './mtgCounters.json';

export interface CounterType {
  id: string;
  name: string;
  common?: boolean;
}

function loadCounterList(raw: unknown): CounterType[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as { counters?: CounterType[]; default?: { counters?: CounterType[] } };
  if (Array.isArray(obj.counters)) return obj.counters;
  if (Array.isArray(obj.default?.counters)) return obj.default.counters;
  return [];
}

const dataCounters = loadCounterList(countersData);

export const MTG_COUNTERS: CounterType[] = dataCounters;
export const COMMON_COUNTERS: CounterType[] = MTG_COUNTERS.filter((item) => item.common);

export interface ListedCounter {
  id: string;
  name: string;
  count: number;
  common?: boolean;
}

function fold(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const BY_FOLD = new Map<string, CounterType>();
for (const item of MTG_COUNTERS) {
  BY_FOLD.set(fold(item.id), item);
  BY_FOLD.set(fold(item.name), item);
}

export function normalizeCounterId(raw: string): string {
  const trimmed = raw.replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const known = BY_FOLD.get(fold(trimmed));
  if (known) return known.id;
  return trimmed.slice(0, 40);
}

export function counterLabel(id: string): string {
  const known = BY_FOLD.get(fold(id));
  return known?.name ?? id;
}

export function findCounterTypes(query: string): CounterType[] {
  const q = fold(query);
  if (!q) return MTG_COUNTERS;
  return MTG_COUNTERS.filter((item) => fold(item.id).includes(q) || fold(item.name).includes(q));
}

export function listedCounterCounts(counters?: Record<string, number>): ListedCounter[] {
  if (!counters) return [];
  return Object.entries(counters)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([id, count]) => {
      const known = BY_FOLD.get(fold(id));
      return { id, name: known?.name ?? id, count, common: known?.common };
    })
    .sort((a, b) => {
      if (a.common && !b.common) return -1;
      if (!a.common && b.common) return 1;
      return a.name.localeCompare(b.name, 'en');
    });
}

export function counterTone(id: string): 'plus' | 'minus' | 'loyalty' | 'keyword' | 'neutral' {
  const key = fold(id);
  if (key.startsWith('+')) return 'plus';
  if (key.startsWith('-')) return 'minus';
  if (key === 'loyalty') return 'loyalty';
  if (
    key === 'flying' ||
    key === 'trample' ||
    key === 'haste' ||
    key === 'lifelink' ||
    key === 'deathtouch' ||
    key === 'first strike' ||
    key === 'double strike' ||
    key === 'vigilance' ||
    key === 'hexproof' ||
    key === 'indestructible' ||
    key === 'menace' ||
    key === 'reach' ||
    key === 'shadow'
  ) {
    return 'keyword';
  }
  return 'neutral';
}

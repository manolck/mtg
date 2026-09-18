import { COMMON_COUNTERS, MTG_COUNTERS, findCounterTypes, listedCounterCounts, normalizeCounterId } from '../mtgCounters';

describe('mtgCounters', () => {
  it('loads the wiki list and pins common types', () => {
    expect(MTG_COUNTERS.length).toBeGreaterThan(200);
    expect(COMMON_COUNTERS.map((item) => item.id)).toEqual(
      expect.arrayContaining(['+1/+1', '-1/-1', 'Loyalty', 'Charge', 'flying']),
    );
  });

  it('normalizes unicode minus and case to official ids', () => {
    expect(normalizeCounterId('−1/−1')).toBe('-1/-1');
    expect(normalizeCounterId('charge')).toBe('Charge');
    expect(normalizeCounterId('Flying')).toBe('flying');
    expect(normalizeCounterId('  Widget-X  ')).toBe('Widget-X');
  });

  it('searches types and lists positive counts', () => {
    expect(findCounterTypes('oil').some((item) => item.id === 'Oil')).toBe(true);
    expect(listedCounterCounts({ '+1/+1': 3, Charge: 0, lore: 2 })).toEqual([
      { id: '+1/+1', name: '+1/+1', count: 3, common: true },
      { id: 'lore', name: 'Lore', count: 2, common: true },
    ]);
  });
});

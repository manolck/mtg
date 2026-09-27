import { applyLocalizedTableCard, collectVisibleLocalizationIds } from '../localizedTableFaces';
import type { TableCard } from '../../types/play';

const forest: TableCard = {
  instanceId: '1',
  scryfallId: 'forest',
  name: 'Forest',
  typeLine: 'Basic Land — Forest',
  imageUrl: 'https://en.example/forest.jpg',
  tapped: false,
  facedown: false,
};

function card(partial: Partial<TableCard> & Pick<TableCard, 'instanceId' | 'scryfallId' | 'name'>): TableCard {
  return {
    typeLine: 'Creature',
    imageUrl: 'https://en.example/card.jpg',
    tapped: false,
    facedown: false,
    ...partial,
  };
}

describe('applyLocalizedTableCard', () => {
  it('overlays French name and image while keeping the oracle name for search', () => {
    const next = applyLocalizedTableCard(forest, {
      name: 'Forêt',
      imageUrl: 'https://fr.example/foret.jpg',
      typeLine: 'Terrain de base — Forêt',
    });
    expect(next.name).toBe('Forêt');
    expect(next.oracleName).toBe('Forest');
    expect(next.imageUrl).toBe('https://fr.example/foret.jpg');
    expect(next.typeLine).toBe('Terrain de base — Forêt');
  });

  it('leaves the card unchanged when no translation exists', () => {
    expect(applyLocalizedTableCard(forest, null)).toEqual(forest);
    expect(applyLocalizedTableCard(forest)).toEqual(forest);
  });
});

describe('collectVisibleLocalizationIds', () => {
  const library = Array.from({ length: 40 }, (_, i) =>
    card({ instanceId: `lib-${i}`, scryfallId: `lib-id-${i}`, name: `Lib ${i}` }),
  );
  const graveyard = [
    card({ instanceId: 'gy-1', scryfallId: 'gy-old', name: 'Old' }),
    card({ instanceId: 'gy-2', scryfallId: 'gy-top', name: 'Top' }),
  ];
  const base = {
    hand: [card({ instanceId: 'h1', scryfallId: 'hand-1', name: 'Bolt' })],
    battlefield: [card({ instanceId: 'b1', scryfallId: 'bf-1', name: 'Bear' })],
    command: [card({ instanceId: 'c1', scryfallId: 'cmd-1', name: 'Commander' })],
    graveyard,
    exile: [card({ instanceId: 'e1', scryfallId: 'ex-1', name: 'Exile', facedown: true })],
    library,
    browseZone: null as 'graveyard' | 'exile' | null,
    libraryOpen: false,
    lookMode: false,
    revealLibraryTop: false,
  };

  it('skips the full library when no library panel is open', () => {
    const ids = collectVisibleLocalizationIds(base);
    expect(ids).toEqual(expect.arrayContaining(['hand-1', 'bf-1', 'cmd-1', 'gy-top']));
    expect(ids).not.toContain('lib-id-0');
    expect(ids).not.toContain('lib-id-39');
    expect(ids).not.toContain('ex-1');
    expect(ids).not.toContain('gy-old');
  });

  it('prefetches only the top library cards while looking', () => {
    const ids = collectVisibleLocalizationIds({ ...base, lookMode: true });
    expect(ids).toContain('lib-id-0');
    expect(ids).toContain('lib-id-6');
    expect(ids).not.toContain('lib-id-7');
  });

  it('loads the whole library when searching it', () => {
    const ids = collectVisibleLocalizationIds({ ...base, libraryOpen: true });
    expect(ids.filter((id) => id.startsWith('lib-id-'))).toHaveLength(40);
  });

  it('includes revealed library top and browsed graveyard faces', () => {
    expect(collectVisibleLocalizationIds({ ...base, revealLibraryTop: true })).toContain('lib-id-0');
    const browsed = collectVisibleLocalizationIds({ ...base, browseZone: 'graveyard' });
    expect(browsed).toEqual(expect.arrayContaining(['gy-old', 'gy-top']));
  });
});

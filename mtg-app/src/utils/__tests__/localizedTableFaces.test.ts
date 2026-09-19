import { applyLocalizedTableCard } from '../localizedTableFaces';
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
